
const express = require('express');
const router = express.Router();
const { search } = require('../controllers/marketController');
router.get('/:query', search);
module.exports = router;
