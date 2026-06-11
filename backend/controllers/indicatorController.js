
// ─────────────────────────────────────────────────────────────────────────────
// backend/controllers/indicatorController.js
//
// GET /api/indicators/:exchange/:symbol/:interval
//
// Returns all indicator arrays for the requested symbol + timeframe in one
// response so the frontend never runs a single math loop.
// ─────────────────────────────────────────────────────────────────────────────
const candleAggregator  = require('../services/candleAggregator');
const indicatorService  = require('../services/indicatorService');
const angelOne          = require('../services/angelOneService');
const { getHistorical } = require('./marketController');
const axios             = require('axios');
const ANGEL             = require('../config/angelone');

exports.getIndicators = async (req, res, next) => {
  try {
    const { exchange, symbol, interval } = req.params;
    const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

    // 1. Try to get candles from the in-memory buffer first (instant)
    let candles = candleAggregator.getCandles(key, interval);

    // 2. If not enough data, fetch from AngelOne REST (same logic as marketController)
    if (candles.length < 30) {
      // Piggy-back on the existing historical fetch pipeline via internal call
      // We call the same internal function that marketController.getHistorical uses
      const fakeReq = { params: { exchange, symbol, interval } };
      let resolved = false;
      const fakeRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) {
          if (body?.candles?.length) {
            candles = body.candles;
          }
          resolved = true;
        },
      };
      await getHistorical(fakeReq, fakeRes, (err) => { if (err) throw err; });
      if (!resolved) candles = candleAggregator.getCandles(key, interval);
    }

    if (!candles.length) {
      return res.status(404).json({ success: false, error: 'No candle data available.' });
    }

    // 3. Compute all indicators server-side
    const indicators = indicatorService.computeAllIndicators(candles);

    res.json({ success: true, count: candles.length, indicators });
  } catch (error) {
    next(error);
  }
};
