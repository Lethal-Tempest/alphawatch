
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

    // 2. If not enough data OR the buffer is stale, re-fetch via getHistorical
    //    (getHistorical now contains stale-buffer detection + re-fetch logic)
    const needsFetch = candles.length < 30;
    if (!needsFetch && interval !== '1d' && candles.length > 0) {
      // Check staleness: if latest candle is older than 2 intervals, re-fetch
      const { getHistorical: _getHistorical } = require('./marketController');
      const INTERVAL_MS_MAP = {
        '1m': 60000, '5m': 300000, '10m': 600000,
        '15m': 900000, '30m': 1800000, '1h': 3600000,
      };
      const ms = INTERVAL_MS_MAP[interval];
      if (ms) {
        const latestTs = new Date(candles[candles.length - 1].timestamp).getTime();
        if (Date.now() - latestTs > ms) {
          // Trigger a re-fetch via getHistorical which will update the buffer
          const fakeReq = { params: { exchange, symbol, interval }, priority: 'low' };
          const fakeRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) {
              if (body?.candles?.length) candles = body.candles;
            },
          };
          try {
            await getHistorical(fakeReq, fakeRes, (err) => { if (err) throw err; });
          } catch (e) {
            console.warn(`[Indicators] Stale re-fetch failed for ${key}@${interval}:`, e.message);
          }
          candles = candleAggregator.getCandles(key, interval);
        }
      }
    } else if (needsFetch) {
      // Piggy-back on the existing historical fetch pipeline via internal call
      // We call the same internal function that marketController.getHistorical uses
      const fakeReq = { params: { exchange, symbol, interval }, priority: 'low' };
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
    indicators.close = candles.map(c => +c.close);
    indicators.open = candles.map(c => +c.open);
    indicators.high = candles.map(c => +c.high);
    indicators.low = candles.map(c => +c.low);
    indicators.volume = candles.map(c => +c.volume);

    res.json({ success: true, count: candles.length, indicators });
  } catch (error) {
    next(error);
  }
};

exports.getBatchIndicators = async (req, res, next) => {
  try {
    const { stocks, intervals, neededKeys } = req.body;
    if (!Array.isArray(stocks) || !Array.isArray(intervals)) {
      return res.status(400).json({ success: false, error: 'stocks and intervals are required arrays.' });
    }

    // Build a Set of needed indicator keys for selective computation
    // If not provided, fall back to computing all (backward compat)
    const keySet = Array.isArray(neededKeys) && neededKeys.length > 0
      ? new Set(neededKeys)
      : null;

    const results = {};

    await Promise.all(
      stocks.map(async (s) => {
        const keyPrefix = `${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`;
        
        await Promise.all(
          intervals.map(async (interval) => {
            try {
              const exchange = s.exchange;
              const symbol = s.symbol;
              const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

              let candles = candleAggregator.getCandles(key, interval);
              if (candles.length < 30) {
                const fakeReq = { params: { exchange, symbol, interval }, priority: 'low' };
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

              if (candles.length > 0) {
                // Use selective computation when neededKeys provided (much faster)
                const indicators = keySet
                  ? indicatorService.computeSelectedIndicators(candles, keySet)
                  : indicatorService.computeAllIndicators(candles);

                // Always include OHLCV arrays for live value lookups
                if (!indicators.close)  indicators.close  = candles.map(c => +c.close);
                if (!indicators.open)   indicators.open   = candles.map(c => +c.open);
                if (!indicators.high)   indicators.high   = candles.map(c => +c.high);
                if (!indicators.low)    indicators.low    = candles.map(c => +c.low);
                if (!indicators.volume) indicators.volume = candles.map(c => +c.volume);

                results[`${keyPrefix}:${interval}`] = indicators;
              }
            } catch (err) {
              console.error(`Failed to fetch indicators inside batch for ${s.exchange}:${s.symbol} at ${interval}:`, err.message);
            }
          })
        );
      })
    );

    res.json({ success: true, indicators: results });
  } catch (error) {
    next(error);
  }
};

