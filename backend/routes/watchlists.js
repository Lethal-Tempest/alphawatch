
const express = require('express');
const router = express.Router();
const { getWatchlists, createWatchlist, addStock, removeStock, deleteWatchlist } = require('../controllers/watchlistController');
const verifyToken = require('../middleware/auth');

router.use(verifyToken);
router.route('/').get(getWatchlists).post(createWatchlist);
router.route('/:id').delete(deleteWatchlist);
router.route('/:id/stocks').post(addStock);
router.route('/:id/stocks/:symbol').delete(removeStock);

module.exports = router;
