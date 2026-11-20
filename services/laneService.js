const { db } = require('../config/database');

/**
 * Resolves the distance (and base rate, when known) for a warehouse -> hub lane.
 *
 * Priority chain (first match wins) and the `source` label returned with it:
 *   1. 'route'    exact origin/dest city pair in carriers_routes (carrier-specific
 *                 when a carrier is given and has that lane, otherwise cheapest rate)
 *   2. 'history'  average distance of past shipments between the same city pair
 *   3. 'estimate' network-wide average distance and rate (clearly labelled, never silent)
 */
function getNetworkAverages() {
  const row = db.prepare(`
    SELECT AVG(distance_km) AS distance_km, AVG(base_rate_per_km) AS base_rate_per_km
    FROM carriers_routes
  `).get();
  return {
    distance_km: row && row.distance_km ? row.distance_km : null,
    base_rate_per_km: row && row.base_rate_per_km ? row.base_rate_per_km : null
  };
}

function getLane({ originCity, destCity, carrierName }) {
  let exact = null;

  if (carrierName) {
    exact = db.prepare(`
      SELECT distance_km, base_rate_per_km
      FROM carriers_routes
      WHERE origin_city = ? AND dest_city = ? AND carrier_name = ?
      ORDER BY base_rate_per_km ASC LIMIT 1
    `).get(originCity, destCity, carrierName);
  }
  if (!exact) {
    exact = db.prepare(`
      SELECT distance_km, base_rate_per_km
      FROM carriers_routes
      WHERE origin_city = ? AND dest_city = ?
      ORDER BY base_rate_per_km ASC LIMIT 1
    `).get(originCity, destCity);
  }
  if (exact) {
    return { distance_km: exact.distance_km, base_rate_per_km: exact.base_rate_per_km, source: 'route' };
  }

  const hist = db.prepare(`
    SELECT AVG(s.distance_km) AS distance_km
    FROM shipment_transactions s
    JOIN warehouses w ON w.warehouse_id = s.origin_warehouse_id
    JOIN customer_hubs h ON h.hub_id = s.destination_hub_id
    WHERE w.city = ? AND h.city = ?
  `).get(originCity, destCity);
  if (hist && hist.distance_km) {
    return {
      distance_km: hist.distance_km,
      base_rate_per_km: getNetworkAverages().base_rate_per_km,
      source: 'history'
    };
  }

  const avg = getNetworkAverages();
  return { distance_km: avg.distance_km, base_rate_per_km: avg.base_rate_per_km, source: 'estimate' };
}

module.exports = { getLane };
