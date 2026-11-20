const { db } = require('../config/database');
const { getLane } = require('./laneService');
const { solveTransportation } = require('./transportSolver');

// Size of the transportation problem (first N warehouses x first M hubs).
const NUM_WAREHOUSES = 3;
const NUM_HUBS = 5;

/**
 * Historical baseline: how TitanMotor actually dispatched, scaled to today's demand.
 *
 * For each hub j the split across warehouses uses, in order of preference:
 *   'lane'      - units shipped on that exact warehouse->hub pair in shipment_transactions
 *   'origin'    - if the hub has no history with these warehouses, each warehouse's overall
 *                 historical share of units shipped (across all hubs)
 *   'inventory' - last resort when the warehouses have no history at all: share of inventory
 * Rows are capped at each warehouse's current_inventory; overflow is re-spread over warehouses
 * that still have stock (same weights), so the baseline is always a feasible plan.
 */
function buildHistoricalBaseline(origins, destinations) {
  const m = origins.length;
  const n = destinations.length;
  const oIds = origins.map(o => o.id);
  const dIds = destinations.map(d => d.id);

  const rows = db.prepare(`
    SELECT origin_warehouse_id AS o, destination_hub_id AS d, SUM(units_shipped) AS units
    FROM shipment_transactions
    GROUP BY origin_warehouse_id, destination_hub_id
  `).all();
  const pairUnits = Array.from({ length: m }, () => Array(n).fill(0));
  const originUnits = Array(m).fill(0);
  for (const r of rows) {
    const i = oIds.indexOf(r.o);
    if (i === -1) continue;
    originUnits[i] += r.units;
    const j = dIds.indexOf(r.d);
    if (j !== -1) pairUnits[i][j] += r.units;
  }

  const totalSupply = origins.reduce((a, o) => a + o.supply, 0);
  const totalDemand = destinations.reduce((a, d) => a + d.demand, 0);
  const fill = Math.min(1, totalSupply / totalDemand); // if inventory is short, only ship what exists
  const target = destinations.map(d => d.demand * fill);

  const coverage = { lane: 0, origin: 0, inventory: 0 };
  const basis = Array(n).fill(null);
  const weightsFor = (j, open) => {
    const pair = open.map(i => pairUnits[i][j]);
    if (pair.some(w => w > 0)) { basis[j] = 'lane'; return pair; }
    const org = open.map(i => originUnits[i]);
    if (org.some(w => w > 0)) { basis[j] = 'origin'; return org; }
    basis[j] = 'inventory';
    return open.map(i => origins[i].supply);
  };

  // Fractional allocation with inventory caps (water-filling)
  const frac = Array.from({ length: m }, () => Array(n).fill(0));
  const remaining = target.slice();
  let open = origins.map((_, i) => i);
  while (open.length) {
    const prop = open.map(() => Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      if (remaining[j] <= 1e-9) continue;
      const w = weightsFor(j, open);
      const sum = w.reduce((a, b) => a + b, 0);
      open.forEach((i, k) => { prop[k][j] = sum > 0 ? remaining[j] * w[k] / sum : remaining[j] / open.length; });
    }
    let worst = -1;
    let worstOver = 1e-9;
    open.forEach((i, k) => {
      const over = prop[k].reduce((a, b) => a + b, 0) - origins[i].supply;
      if (over > worstOver) { worstOver = over; worst = k; }
    });
    if (worst === -1) {
      open.forEach((i, k) => { for (let j = 0; j < n; j++) frac[i][j] += prop[k][j]; });
      break;
    }
    // Fill the most over-subscribed warehouse to its inventory, then re-spread what is left
    const i = open[worst];
    const rowTotal = prop[worst].reduce((a, b) => a + b, 0);
    for (let j = 0; j < n; j++) {
      const q = prop[worst][j] * origins[i].supply / rowTotal;
      frac[i][j] += q;
      remaining[j] -= q;
    }
    open = open.filter(x => x !== i);
  }
  for (let j = 0; j < n; j++) if (basis[j]) coverage[basis[j]]++;

  // Integerize: largest remainder per hub, never exceeding a warehouse's inventory
  const allocation = frac.map(r => r.map(Math.floor));
  const used = allocation.map(r => r.reduce((a, b) => a + b, 0));
  for (let j = 0; j < n; j++) {
    let need = Math.round(target[j]) - allocation.reduce((a, r) => a + r[j], 0);
    const order = frac.map((r, i) => ({ i, f: r[j] - Math.floor(r[j]) })).sort((a, b) => b.f - a.f);
    for (const { i } of order) {
      if (need <= 0) break;
      if (used[i] < origins[i].supply) { allocation[i][j]++; used[i]++; need--; }
    }
  }

  const method = 'Historical dispatch mix from shipment_transactions, scaled to current demand and capped at current inventory';
  return { allocation, method, coverage };
}

/**
 * Solves the Transportation Problem Linear Program directly using database entities.
 * Minimizes total motor freight cost from warehouses to client assembly hubs.
 */
function solveTransportationProblem() {
  // 1. Fetch 3 primary manufacturing warehouses directly from SQLite
  const origins = db.prepare(`
    SELECT 
      warehouse_id as id, 
      warehouse_name as name, 
      city, 
      state,
      current_inventory as supply,
      handling_fee_per_unit
    FROM warehouses 
    ORDER BY warehouse_id ASC 
    LIMIT ${NUM_WAREHOUSES}
  `).all();

  // 2. Fetch 5 primary regional assembly hubs directly from SQLite
  const destinations = db.prepare(`
    SELECT 
      hub_id as id, 
      hub_name as name, 
      city, 
      state,
      monthly_demand_units as demand,
      priority_level
    FROM customer_hubs 
    ORDER BY hub_id ASC 
    LIMIT ${NUM_HUBS}
  `).all();

  // 3. Compute Unit Shipping Costs ($/motor) based on route distances in SQLite
  const unitCosts = [];
  const laneSources = [];
  const laneCoverage = { route: 0, history: 0, estimate: 0 };
  for (let i = 0; i < origins.length; i++) {
    unitCosts[i] = [];
    laneSources[i] = [];
    for (let j = 0; j < destinations.length; j++) {
      const o = origins[i];
      const d = destinations[j];

      // Exact lane -> shipment history -> labelled network-average estimate
      const lane = getLane({ originCity: o.city, destCity: d.city });
      if (!lane.distance_km || !lane.base_rate_per_km) {
        throw new Error(`No distance/rate data available for lane ${o.city} -> ${d.city}.`);
      }
      laneSources[i][j] = lane.source;
      laneCoverage[lane.source]++;

      // Unit freight cost per heavy industrial motor
      const costPerUnit = Math.round((lane.distance_km * 0.038) + (lane.base_rate_per_km * 6) + (o.handling_fee_per_unit * 0.5));
      unitCosts[i][j] = Math.max(16, costPerUnit);
    }
  }

  // Total demand and REAL supply (current_inventory from the warehouses table)
  const totalDemand = destinations.reduce((sum, d) => sum + d.demand, 0);
  const originsWithQuota = origins.map(o => ({ ...o, supply: o.supply }));
  const totalSupply = originsWithQuota.reduce((sum, o) => sum + o.supply, 0);

  // 4. Baseline = TitanMotor's HISTORICAL dispatch pattern (from shipment_transactions),
  // scaled to current demand and costed with the same unit-cost matrix as the optimum.
  const baseline = buildHistoricalBaseline(originsWithQuota, destinations);
  const baselineAllocation = baseline.allocation;
  let baselineTotalCost = 0;
  for (let i = 0; i < originsWithQuota.length; i++) {
    for (let j = 0; j < destinations.length; j++) {
      baselineTotalCost += baselineAllocation[i][j] * unitCosts[i][j];
    }
  }

  // 5. Exact transportation solver: Vogel's Approximation start + MODI (u-v) optimality iterations.
  // Guaranteed global minimum for the model below (supply <= inventory, demand met where inventory allows).
  const solved = solveTransportation(
    originsWithQuota.map(o => o.supply),
    destinations.map(d => d.demand),
    unitCosts
  );
  const optimalAllocation = solved.allocation;

  // Whatever demand cannot be met from real inventory is unmet (supply shortfall)
  const demandRemaining = solved.unmet;
  const unmetByHub = destinations.map((d, j) => ({ hub: d.name, units: demandRemaining[j] })).filter(u => u.units > 0);
  const unmetDemandUnits = demandRemaining.reduce((a, b) => a + b, 0);

  // Calculate Optimal Total Cost
  let optimalTotalCost = 0;
  for (let i = 0; i < originsWithQuota.length; i++) {
    for (let j = 0; j < destinations.length; j++) {
      optimalTotalCost += optimalAllocation[i][j] * unitCosts[i][j];
    }
  }

  const dollarSavings = Math.max(0, baselineTotalCost - optimalTotalCost);
  const pctSavings = baselineTotalCost > 0 
    ? parseFloat(((dollarSavings / baselineTotalCost) * 100).toFixed(2)) 
    : 0;

  // 6. Generate Actionable Dispatch Directives
  const scheduledRoutes = [];
  for (let i = 0; i < originsWithQuota.length; i++) {
    for (let j = 0; j < destinations.length; j++) {
      const units = optimalAllocation[i][j];
      if (units > 0) {
        scheduledRoutes.push({
          origin: originsWithQuota[i].name,
          origin_city: originsWithQuota[i].city,
          destination: destinations[j].name,
          dest_city: destinations[j].city,
          units_shipped: units,
          unit_cost: unitCosts[i][j],
          total_route_cost: units * unitCosts[i][j],
          status: 'Optimal Route'
        });
      }
    }
  }

  return {
    origins: originsWithQuota,
    destinations,
    unitCosts,
    laneSources,
    laneCoverage,
    totalDemand,
    totalSupply,
    unmetDemandUnits,
    unmetByHub,
    baselineTotalCost,
    baselineAllocation,
    baselineMethod: baseline.method,
    baselineCoverage: baseline.coverage,
    solver: {
      method: "Vogel's Approximation Method (initial solution) + MODI u-v optimality test",
      exact: true,
      initialCost: solved.initialCost,
      modiIterations: solved.iterations
    },
    optimalTotalCost,
    dollarSavings,
    pctSavings,
    optimalAllocation,
    scheduledRoutes,
    mathematical_formulation: {
      objective: `Minimize Z = sum_{i=1}^{${NUM_WAREHOUSES}} sum_{j=1}^{${NUM_HUBS}} (c_ij * x_ij)`,
      constraints: [
        `Warehouse Supply Constraints: units shipped from each warehouse <= its current_inventory (Total inventory = ${totalSupply} units)`,
        `Client Hub Demand Constraints: units received by each hub = its monthly demand (Total = ${totalDemand} units)${unmetDemandUnits > 0 ? `; ${unmetDemandUnits} units unmet because inventory is insufficient` : ''}`,
        `Non-negativity & Route Matching: x_ij >= 0 for all lanes`
      ]
    }
  };
}

module.exports = {
  solveTransportationProblem
};
