
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

exports.updateScoreConditions = async (req, res, next) => {
  try {
    const { scoreConditions } = req.body;
    if (!Array.isArray(scoreConditions)) {
      return res.status(400).json({ error: 'scoreConditions must be an array.' });
    }
    
    const cleaned = scoreConditions.map(c => {
      if (!c || typeof c !== 'object') return null;
      if (c.type === 'operand') {
        const valueType = c.valueType === 'value' ? 'value' : 'indicator';
        return {
          type: 'operand',
          valueType,
          value: valueType === 'value' ? parseFloat(c.value ?? 0) : undefined,
          indicator: valueType === 'indicator' ? String(c.indicator || 'close') : undefined,
          timeframe: valueType === 'indicator' ? String(c.timeframe || '5m') : undefined
        };
      } else if (c.type === 'operator') {
        return {
          type: 'operator',
          valueStr: ['+', '-', '*', '/'].includes(c.valueStr) ? c.valueStr : '+'
        };
      } else if (c.type === 'parenthesis') {
        return {
          type: 'parenthesis',
          valueStr: ['(', ')'].includes(c.valueStr) ? c.valueStr : '('
        };
      }
      return null;
    }).filter(Boolean);

    const wl = await Watchlist.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { scoreConditions: cleaned },
      { new: true }
    );
    if (!wl) return res.status(404).json({ error: 'Watchlist not found.' });
    res.json({ success: true, watchlist: wl });
  } catch (error) { next(error); }
};
