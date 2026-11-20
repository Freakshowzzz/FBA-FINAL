const { db } = require('../config/database');
const regressionService = require('../services/regressionService');

exports.getOptions = (req, res) => {
  try {
    const warehouses = db.prepare('SELECT warehouse_id, warehouse_name, city, state, handling_fee_per_unit FROM warehouses ORDER BY warehouse_id ASC LIMIT 50').all();
    const hubs = db.prepare('SELECT hub_id, hub_name, city, state FROM customer_hubs ORDER BY hub_id ASC LIMIT 50').all();
    const products = db.prepare('SELECT product_id, model_name, motor_type, weight_kg, power_rating_kw FROM motor_products ORDER BY product_id ASC LIMIT 50').all();
    const carriers = db.prepare('SELECT DISTINCT carrier_name FROM carriers_routes ORDER BY carrier_name ASC').all();

    res.json({
      success: true,
      warehouses,
      hubs,
      products,
      carriers: carriers.map(c => c.carrier_name)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.estimateCost = (req, res) => {
  try {
    const { origin_warehouse_id, destination_hub_id, product_id, units, carrier_name } = req.body;

    const result = regressionService.predictFreightCost({
      warehouseId: origin_warehouse_id,
      hubId: destination_hub_id,
      productId: product_id,
      units,
      carrierName: carrier_name
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.getMetrics = (req, res) => {
  try {
    const m = regressionService.trainedModel;
    res.json({
      success: true,
      // Headline R^2 / MAE are measured on held-out rows the model was NOT fitted on
      r_squared: +m.rSquared.toFixed(3),
      mae: +m.mae.toFixed(2),
      n: m.sampleCount,
      validation: {
        split: m.validation.split,
        train_n: m.validation.train_n,
        test_n: m.validation.test_n,
        predictors: m.validation.params - 1,
        train_r_squared: +m.validation.train.r2.toFixed(3),
        train_adjusted_r_squared: +m.validation.train.adjR2.toFixed(3),
        train_mae: +m.validation.train.mae.toFixed(2),
        test_r_squared: +m.validation.test.r2.toFixed(3),
        test_mae: +m.validation.test.mae.toFixed(2),
        test_rmse: +m.validation.test.rmse.toFixed(2),
        full_fit_r_squared: +m.validation.full_fit.r2.toFixed(3),
        full_fit_adjusted_r_squared: +m.validation.full_fit.adjR2.toFixed(3)
      },
      transit_model: {
        r_squared: +m.transit.r2.toFixed(3),
        mae_days: +m.transit.mae.toFixed(2)
      },
      delay_rates: Object.fromEntries(Object.entries(m.delayStats).map(([c, d]) => [c, { delay_pct: +d.pct.toFixed(1), n: d.n }])),
      formula: `Freight Cost = ${m.b0.toFixed(2)} + ${m.bWeight.toFixed(4)} × Weight (kg) + ${m.bDist.toFixed(4)} × Distance (km) + Carrier Effect + Handling Fee`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
