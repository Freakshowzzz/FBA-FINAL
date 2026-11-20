const express = require('express');
const router = express.Router();
const predictiveController = require('../controllers/predictiveController');

router.get('/options', predictiveController.getOptions);
router.get('/metrics', predictiveController.getMetrics);
router.post('/estimate', predictiveController.estimateCost);

module.exports = router;
