
const express = require('express');
const router = express.Router();
const { getQuote, getQuotesBatch } = require('../controllers/marketController');
router.post('/quotes', getQuotesBatch);
router.get('/:exchange/:symbol', getQuote);
module.exports = router;
