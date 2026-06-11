// ─────────────────────────────────────────────────────────────────────────────
// backend/controllers/alertController.js
// ─────────────────────────────────────────────────────────────────────────────
const Alert = require('../models/Alert');
const polling = require('../services/pollingLoop');

exports.getAlerts = async (req, res, next) => {
  try {
    const alerts = await Alert.find({ userId: req.user.id })
      .populate('watchlistId')
      .sort({ createdAt: -1 });
    res.json({ success: true, alerts });
  } catch (error) { next(error); }
};

exports.createAlert = async (req, res, next) => {
  try {
    const { name, targetType, watchlistId, stocks, conditions, isRepeating } = req.body;
    if (!name || !targetType || !conditions || conditions.length === 0) {
      return res.status(400).json({ error: 'name, targetType and conditions are required.' });
    }

    const alert = await Alert.create({
      userId: req.user.id,
      name,
      targetType,
      watchlistId: targetType === 'watchlist' ? watchlistId : null,
      stocks: targetType === 'specific_stocks' ? stocks : [],
      conditions,
      isRepeating: !!isRepeating,
      status: 'active'
    });

    // Auto-subscribe new stocks to the polling loop
    if (targetType === 'specific_stocks' && stocks) {
      for (const s of stocks) {
        polling.subscribe(`${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`);
      }
    }

    res.status(201).json({ success: true, alert });
  } catch (error) { next(error); }
};

exports.updateAlert = async (req, res, next) => {
  try {
    const { name, targetType, watchlistId, stocks, conditions, isRepeating, status } = req.body;
    if (!name || !targetType || !conditions || conditions.length === 0) {
      return res.status(400).json({ error: 'name, targetType and conditions are required.' });
    }

    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      {
        name,
        targetType,
        watchlistId: targetType === 'watchlist' ? watchlistId : null,
        stocks: targetType === 'specific_stocks' ? stocks : [],
        conditions,
        isRepeating: !!isRepeating,
        status: status || 'active',
        triggeredAt: null,
        lastTriggeredAt: null
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    // Auto-subscribe stocks to the polling loop
    if (targetType === 'specific_stocks' && stocks) {
      for (const s of stocks) {
        polling.subscribe(`${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`);
      }
    }

    res.json({ success: true, alert });
  } catch (error) { next(error); }
};

exports.deleteAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    res.json({ success: true });
  } catch (error) { next(error); }
};

exports.dismissAlert = async (req, res, next) => {
  try {
    const { status } = req.body;
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { status: status || 'dismissed', triggeredAt: null, lastTriggeredAt: null },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    res.json({ success: true, alert });
  } catch (error) { next(error); }
};
