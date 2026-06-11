
// ─────────────────────────────────────────────────────────────────────────────
// backend/controllers/marketController.js
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const angelOne = require('../services/angelOneService');
const candleAggregator = require('../services/candleAggregator');
const ANGEL = require('../config/angelone');

// ── Symbol Search ─────────────────────────────────────────────────────────────
exports.search = async (req, res, next) => {
  try {
    const suggestions = angelOne.searchScrips(req.params.query);
    res.json({
      success: true,
      suggestions: suggestions.map(i => ({
        symbol: i.exch_seg === 'NSE' ? i.symbol.replace('-EQ', '') : i.symbol,
        shortname: i.name || i.symbol,
        exchange: i.exch_seg,
        token: i.token,
      })),
    });
  } catch (error) { next(error); }
};

// ── Live Quote ────────────────────────────────────────────────────────────────
exports.getQuote = async (req, res, next) => {
  try {
    const { exchange, symbol } = req.params;
    const scripMatch = angelOne.resolveToken(exchange, symbol);
    if (!scripMatch) return res.status(404).json({ error: 'Symbol not found.' });

    const data = await angelOne.fetchQuote(exchange.toUpperCase(), scripMatch.token);
    if (!data) return res.status(500).json({ error: 'Market data unavailable.' });

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      exchange: exchange.toUpperCase(),
      metrics: {
        lastPrice: parseFloat(data.ltp),
        open: parseFloat(data.open),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        prevClose: parseFloat(data.close),
        volume: parseInt(data.tradeVolume, 10),
        percentChange: parseFloat(data.percentChange),
      },
    });
  } catch (error) { next(error); }
};

// ── Historical Candles ────────────────────────────────────────────────────────
exports.getHistorical = async (req, res, next) => {
  try {
    const { exchange, symbol, interval } = req.params;
    const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

    // FIX: Only return memory buffer IF the initial 250-candle baseline was fetched
    if (candleAggregator.hasHistory(key, interval)) {
      const cached = candleAggregator.getCandles(key, interval);
      return res.json({ success: true, source: 'buffer', candles: cached });
    }

    const parsedCandles = await angelOne.fetchHistoricalCandles(exchange, symbol, interval);
    candleAggregator.setHistoricalCandles(key, interval, parsedCandles);
    return res.json({ success: true, source: 'angelone', candles: parsedCandles });
  } catch (error) { next(error); }
};
