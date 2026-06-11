
const express = require('express');
const router = express.Router();
const { getQuote } = require('../controllers/marketController');
router.get('/:exchange/:symbol', getQuote);
module.exports = router;
