
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
        symbol: i.exch_seg === 'NSE' ? i.symbol.replace(/-EQ$|-BE$|-SM$|-ST$/, '') : i.symbol,
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

    const data = await angelOne.fetchQuote(exchange.toUpperCase(), scripMatch.token, 'high');
    if (!data) return res.status(500).json({ error: 'Market data unavailable.' });

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      exchange: exchange.toUpperCase(),
      metrics: {
        ltp: parseFloat(data.ltp),
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

// Helper: compute the start of the current interval bucket (aligned to market open 09:15 IST)
function currentCandleStart(intervalMs) {
  const now = Date.now();
  const intervalMin = intervalMs / (60 * 1000);
  const offsetMs    = (225 % intervalMin) * 60 * 1000; // 225 = minutes from UTC midnight to 09:15 IST
  const shifted     = now - offsetMs;
  return Math.floor(shifted / intervalMs) * intervalMs + offsetMs;
}

const INTERVAL_MS = {
  '1m':  60 * 1000, '5m': 5 * 60 * 1000, '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000, '30m': 30 * 60 * 1000, '1h': 60 * 60 * 1000,
  '1d':  24 * 60 * 60 * 1000,
};

exports.getHistorical = async (req, res, next) => {
  try {
    const { exchange, symbol, interval } = req.params;
    const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

    if (candleAggregator.hasHistory(key, interval)) {
      const cached = candleAggregator.getCandles(key, interval);

      // ── Stale-buffer check ─────────────────────────────────────────────────
      // If the latest cached candle is OLDER than the current interval bucket,
      // the WebSocket feed hasn't been updating the buffer. Force a re-fetch so
      // the LIVE row always shows current market data.
      const ms        = INTERVAL_MS[interval];
      const isIntraday = interval !== '1d';
      if (ms && isIntraday && cached.length > 0) {
        const latestTs  = new Date(cached[cached.length - 1].timestamp).getTime();
        const bucketStart = currentCandleStart(ms);
        const isStale   = latestTs < bucketStart;
        if (isStale) {
          console.log(`📡 [Historical] Buffer stale for ${key}@${interval} — re-fetching from AngelOne`);
          // Re-fetch and merge without blocking the request more than necessary
          try {
            const freshCandles = await angelOne.fetchHistoricalCandles(exchange, symbol, interval, req.priority || 'high');
            candleAggregator.setHistoricalCandles(key, interval, freshCandles);
          } catch (fetchErr) {
            console.warn(`⚠️  [Historical] Re-fetch failed for ${key}@${interval}:`, fetchErr.message);
          }
          const refreshed = candleAggregator.getCandles(key, interval);
          return res.json({ success: true, source: 'refreshed', candles: refreshed });
        }
      }

      return res.json({ success: true, source: 'buffer', candles: cached });
    }

    const priority = req.priority || 'high';
    await candleAggregator.getOrFetchHistory(key, exchange, symbol, interval, () =>
      angelOne.fetchHistoricalCandles(exchange, symbol, interval, priority)
    );

    const cached = candleAggregator.getCandles(key, interval);
    return res.json({ success: true, source: 'angelone', candles: cached });
  } catch (error) { next(error); }
};

// ── Batch Live Quotes ────────────────────────────────────────────────────────
exports.getQuotesBatch = async (req, res, next) => {
  try {
    const { stocks } = req.body;
    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.json({ success: true, quotes: [] });
    }

    const items = [];
    const keyToSymbol = {};

    for (const stock of stocks) {
      const { exchange, symbol } = stock;
      if (!exchange || !symbol) continue;
      const scripMatch = angelOne.resolveToken(exchange, symbol);
      if (scripMatch) {
        items.push({ exchange: exchange.toUpperCase(), token: scripMatch.token, symbol: symbol.toUpperCase() });
        const mapKey = `${exchange.toUpperCase()}:${scripMatch.token}`;
        keyToSymbol[mapKey] = { symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() };
      }
    }

    if (items.length === 0) {
      return res.json({ success: true, quotes: [] });
    }

    const fetchedQuotes = await angelOne.fetchQuotesBatch(items);
    
    const quotes = fetchedQuotes.map(data => {
      const mapKey = `${data.exchange.toUpperCase()}:${data.symbolToken}`;
      const original = keyToSymbol[mapKey] || { symbol: data.tradingSymbol, exchange: data.exchange };
      return {
        symbol: original.symbol,
        exchange: original.exchange,
        metrics: {
          ltp: parseFloat(data.ltp) || 0,
          lastPrice: parseFloat(data.ltp) || 0,
          open: parseFloat(data.open) || 0,
          high: parseFloat(data.high) || 0,
          low: parseFloat(data.low) || 0,
          prevClose: parseFloat(data.close) || 0,
          volume: parseInt(data.tradeVolume, 10) || 0,
          percentChange: parseFloat(data.percentChange) || 0
        }
      };
    });

    res.json({ success: true, quotes });
  } catch (error) { next(error); }
};
