const { db } = require('../config/database');
const { getLane } = require('./laneService');

// Solve A x = b by Gaussian elimination with partial pivoting.
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Regression matrix is singular (collinear predictors).');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// Ordinary least squares via the normal equations: beta = (X'X)^-1 X'y
function fitOLS(X, y) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, n) => s + r[i] * y[n], 0));
  return solveLinearSystem(XtX, Xty);
}

// Design row: [1, weight, distance, ...carrier dummies]. The first carrier
// (alphabetical) is the baseline category, so it has no dummy column.
function buildRow(carriers, weightKg, distanceKm, carrierName) {
  return [1, weightKg, distanceKm, ...carriers.slice(1).map(c => (carrierName === c ? 1 : 0))];
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Deterministic shuffle so the hold-out split is reproducible between runs
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEST_FRACTION = 0.2;
const SPLIT_SEED = 42;

function splitTrainTest(rows, carriers) {
  // Retry seeds until every carrier appears in the training part (otherwise its dummy is unidentifiable)
  for (let seed = SPLIT_SEED; seed < SPLIT_SEED + 100; seed++) {
    const rand = mulberry32(seed);
    const idx = rows.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const nTest = Math.max(1, Math.round(rows.length * TEST_FRACTION));
    const test = idx.slice(0, nTest).map(i => rows[i]);
    const train = idx.slice(nTest).map(i => rows[i]);
    if (carriers.every(c => train.some(r => r.carrier_name === c))) return { train, test, seed };
  }
  throw new Error('Could not build a train/test split that covers every carrier.');
}

function metrics(beta, X, y, numParams) {
  const n = y.length;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0, ssRes = 0, abs = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i] - dot(beta, X[i]);
    ssTot += Math.pow(y[i] - meanY, 2);
    ssRes += e * e;
    abs += Math.abs(e);
  }
  const r2 = 1 - ssRes / ssTot;
  const adjR2 = n - numParams > 0 ? 1 - (1 - r2) * (n - 1) / (n - numParams) : null;
  return { n, r2, adjR2, mae: abs / n, rmse: Math.sqrt(ssRes / n) };
}

// Transit days regressed on distance plus carrier dummies (same OLS machinery)
function fitTransitModel(rows, carriers) {
  const X = rows.map(r => [1, r.distance_km, ...carriers.slice(1).map(c => (r.carrier_name === c ? 1 : 0))]);
  const y = rows.map(r => r.transit_days);
  const beta = fitOLS(X, y);
  return { beta, ...metrics(beta, X, y, X[0].length) };
}

function trainRegressionModel() {
  const rows = db.prepare(`
    SELECT s.freight_cost_usd, s.total_weight_kg, s.distance_km, s.carrier_name, s.transit_days, s.delay_flag
    FROM shipment_transactions s
  `).all();
  const carriers = db.prepare(
    'SELECT DISTINCT carrier_name FROM shipment_transactions ORDER BY carrier_name'
  ).all().map(r => r.carrier_name);

  const toXY = (set) => ({
    X: set.map(r => buildRow(carriers, r.total_weight_kg, r.distance_km, r.carrier_name)),
    y: set.map(r => r.freight_cost_usd)
  });
  const k = 3 + carriers.length - 1; // intercept + weight + distance + carrier dummies

  // --- Hold-out validation (#9): fit on 80%, score on the unseen 20% ---
  const { train, test, seed } = splitTrainTest(rows, carriers);
  const tr = toXY(train);
  const te = toXY(test);
  const betaTrain = fitOLS(tr.X, tr.y);
  const trainM = metrics(betaTrain, tr.X, tr.y, k);
  const testM = metrics(betaTrain, te.X, te.y, k);

  // --- Production model: refit on all rows once the validation above is done ---
  const all = toXY(rows);
  const beta = fitOLS(all.X, all.y);
  const fullM = metrics(beta, all.X, all.y, k);

  const carrierEffects = { [carriers[0]]: 0 };
  carriers.slice(1).forEach((c, i) => { carrierEffects[c] = beta[3 + i]; });

  // --- Delay risk and transit days from data (#8) ---
  const delayStats = {};
  for (const c of carriers) {
    const r = db.prepare(
      'SELECT AVG(delay_flag) * 100 AS pct, COUNT(*) AS n FROM shipment_transactions WHERE carrier_name = ?'
    ).get(c);
    delayStats[c] = { pct: r.pct, n: r.n };
  }
  const transit = fitTransitModel(rows, carriers);

  return {
    beta, carriers, carrierEffects,
    b0: beta[0], bWeight: beta[1], bDist: beta[2],
    // Headline numbers are the HELD-OUT ones
    rSquared: testM.r2, mae: testM.mae, sampleCount: rows.length,
    validation: {
      split: `${Math.round((1 - TEST_FRACTION) * 100)}/${Math.round(TEST_FRACTION * 100)}`,
      seed,
      train_n: trainM.n, test_n: testM.n, params: k,
      train: trainM, test: testM,
      full_fit: fullM
    },
    delayStats,
    transit
  };
}

const trainedModel = trainRegressionModel();

function predictFreightCost({ warehouseId, hubId, productId, units, carrierName }) {
  const wh = db.prepare('SELECT warehouse_id, warehouse_name, city, handling_fee_per_unit FROM warehouses WHERE warehouse_id = ?').get(warehouseId);
  const hub = db.prepare('SELECT hub_id, hub_name, city FROM customer_hubs WHERE hub_id = ?').get(hubId);
  const prod = db.prepare('SELECT product_id, model_name, motor_type, weight_kg, unit_value_usd FROM motor_products WHERE product_id = ?').get(productId);

  if (!wh || !hub || !prod) {
    throw new Error('Invalid Warehouse, Customer Hub, or Motor Product ID.');
  }

  const unitsCount = Math.max(1, parseInt(units) || 10);
  const totalWeight = parseFloat((unitsCount * prod.weight_kg).toFixed(1));

  const lane = getLane({ originCity: wh.city, destCity: hub.city, carrierName });
  if (!lane.distance_km) {
    throw new Error(`No distance data available for lane ${wh.city} -> ${hub.city}.`);
  }
  const distanceKm = lane.distance_km;

  const predictedBaseCost = dot(trainedModel.beta, buildRow(trainedModel.carriers, totalWeight, distanceKm, carrierName));
  const handlingFee = unitsCount * wh.handling_fee_per_unit;
  const predictedTotalCost = parseFloat((predictedBaseCost + handlingFee).toFixed(2));
  const costPerMotor = parseFloat((predictedTotalCost / unitsCount).toFixed(2));
  const costPerKg = parseFloat((predictedTotalCost / totalWeight).toFixed(3));

  // Transit days: regression on distance + carrier, floored at 1 day
  const t = trainedModel.transit.beta;
  const ci = trainedModel.carriers.indexOf(carrierName);
  const transitRaw = t[0] + t[1] * distanceKm + (ci > 0 ? t[1 + ci] : 0);
  const estimatedTransitDays = Math.max(1, Math.round(transitRaw));
  // Delay risk: the carrier's historical late-shipment rate
  const ds = trainedModel.delayStats[carrierName];
  const delayRiskPct = ds ? Math.round(ds.pct * 10) / 10 : null;

  return {
    inputs: {
      warehouse: wh.warehouse_name,
      hub: hub.hub_name,
      product: prod.model_name,
      units: unitsCount,
      carrier: carrierName
    },
    prediction: {
      total_weight_kg: totalWeight,
      estimated_distance_km: distanceKm,
      distance_source: lane.source,
      predicted_freight_cost: predictedTotalCost,
      handling_fee_usd: handlingFee,
      cost_per_motor: costPerMotor,
      cost_per_kg: costPerKg,
      estimated_transit_days: estimatedTransitDays,
      delay_risk_pct: delayRiskPct,
      delay_risk_basis_n: ds ? ds.n : 0
    },
    model_metrics: {
      r_squared: trainedModel.rSquared.toFixed(3),
      mean_abs_error_usd: trainedModel.mae.toFixed(2),
      metrics_basis: `held-out ${trainedModel.validation.test_n} of ${trainedModel.sampleCount} records`,
      training_records: trainedModel.sampleCount,
      formula: `Cost = ${trainedModel.b0.toFixed(2)} + ${trainedModel.bWeight.toFixed(4)}*Weight + ${trainedModel.bDist.toFixed(4)}*Distance + CarrierEffect + HandlingFee`
    }
  };
}

module.exports = {
  predictFreightCost,
  trainedModel
};
