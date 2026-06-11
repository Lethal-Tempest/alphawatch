
// backend/routes/indicators.js
const express = require('express');
const router  = express.Router();
const { getIndicators } = require('../controllers/indicatorController');
router.get('/:exchange/:symbol/:interval', getIndicators);
module.exports = router;
