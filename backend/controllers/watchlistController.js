
const Watchlist = require('../models/Watchlist');

exports.getWatchlists = async (req, res, next) => {
  try {
    const watchlists = await Watchlist.find({ userId: req.user.id });
    res.json({ success: true, watchlists });
  } catch (error) { next(error); }
};

exports.createWatchlist = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Watchlist name required.' });
    const wl = await Watchlist.create({ userId: req.user.id, name: name.trim(), stocks: [] });
    res.status(201).json({ success: true, watchlist: wl });
  } catch (error) { next(error); }
};

exports.addStock = async (req, res, next) => {
  try {
    const { symbol, exchange } = req.body;
    const wl = await Watchlist.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $addToSet: { stocks: { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() } } },
      { new: true }
    );
    if (!wl) return res.status(404).json({ error: 'Watchlist not found.' });
    res.json({ success: true, watchlist: wl });
  } catch (error) { next(error); }
};

exports.removeStock = async (req, res, next) => {
  try {
    const wl = await Watchlist.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $pull: { stocks: { symbol: req.params.symbol.toUpperCase() } } },
      { new: true }
    );
    res.json({ success: true, watchlist: wl });
  } catch (error) { next(error); }
};

exports.deleteWatchlist = async (req, res, next) => {
  try {
    await Watchlist.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (error) { next(error); }
};
