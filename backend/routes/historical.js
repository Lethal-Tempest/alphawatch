
const express = require('express');
const router = express.Router();
const { getHistorical } = require('../controllers/marketController');
router.get('/:exchange/:symbol/:interval', getHistorical);
module.exports = router;
