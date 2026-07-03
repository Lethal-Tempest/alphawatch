const express = require('express');
const router = express.Router();
const { runBacktest } = require('../controllers/backtestController');
const verifyToken = require('../middleware/auth');

router.use(verifyToken);
router.post('/', runBacktest);

module.exports = router;
