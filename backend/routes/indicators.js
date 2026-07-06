
const express = require('express');
const router  = express.Router();
const { getIndicators, getBatchIndicators } = require('../controllers/indicatorController');

router.post('/batch', getBatchIndicators);
router.get('/:exchange/:symbol/:interval', getIndicators);

module.exports = router;
