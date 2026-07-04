// -----------------------------------------------------------------------------
// backend/services/pollingLoop.js
//
// Maintains the set of symbols currently being polled. On each 5-second tick:
//  1. Fetch OHLCV quotes in batch from AngelOne for all subscribed symbols
//  2. Always broadcast the raw ticks (for live price header display)
//  3. If market is open AND volume > 0:
//       - Update the in-memory candle aggregator
//       - Run the alert engine
//       - Emit candle_update ONLY when the candle snapshot has actually changed
//
// Zero-volume ticks are NOT fed into the candle aggregator. They represent
// periods with no real trades (illiquid stocks, momentary stale quotes) and
// would create phantom zero-volume candles that corrupt indicator math.
// -----------------------------------------------------------------------------
const angelOne         = require('./angelOneService');
const candleAggregator = require('./candleAggregator');
const alertEngine      = require('./alertEngine');
const User             = require('../models/User');
const Watchlist        = require('../models/Watchlist');
const autoTradeEngine  = require('./autoTradeEngine');

// Set of "EXCHANGE:SYMBOL" keys currently being polled
const activeSubscriptions = new Set();

// Latest tick snapshot, keyed by "EXCHANGE:SYMBOL"
const liveMarketState = {};

// Last-broadcast candle per key+interval, used to detect real changes
// Shape: lastBroadcastCandle[key][interval] = { timestamp, open, high, low, close, volume }
const lastBroadcastCandle = {};

let ioInstance;
let isPolling = false;

exports.init = (io) => { ioInstance = io; };

exports.subscribe = (key) => { activeSubscriptions.add(key); };

/**
 * Unsubscribe a key only when no sockets remain in the ticker room.
 * This prevents a single disconnecting client from killing data for everyone.
 */
exports.unsubscribe = (key) => {
  if (!ioInstance) { activeSubscriptions.delete(key); return; }
  const room = ioInstance.sockets.adapter.rooms.get(`ticker:${key}`);
  if (!room || room.size === 0) activeSubscriptions.delete(key);
};

exports.getLiveState     = (key) => liveMarketState[key];
exports.getSubscriptions = ()    => Array.from(activeSubscriptions);

// -----------------------------------------------------------------------------
// Helper: compare two candle objects for meaningful changes.
// -----------------------------------------------------------------------------
function candleChanged(prev, next) {
  if (!prev) return true;
  const r = (n) => Math.round(n * 100) / 100;
  return (
    prev.timestamp !== next.timestamp ||
    r(prev.high)   !== r(next.high)   ||
    r(prev.low)    !== r(next.low)    ||
    r(prev.close)  !== r(next.close)  ||
    prev.volume    !== next.volume
  );
}

// -----------------------------------------------------------------------------
// Main polling cycle - called every 5 seconds by server.js
// -----------------------------------------------------------------------------
exports.runPollingCycle = async () => {
  if (isPolling) {
    console.log('[Polling] Preempting runPollingCycle: previous cycle still active.');
    return;
  }
  isPolling = true;
  try {
    const activeAlerts = await alertEngine.getActiveAlerts();
    const alertKeys = await alertEngine.getActiveAlertKeys(activeAlerts);
    
    // Fetch whitelisted stocks for auto-trading
    const autoTradeUsers = await User.find({ 'autoTradeConfig.enabled': true });
    const autoTradeUserIds = autoTradeUsers.map((u) => u._id);
    const autoTradeWatchlists = await Watchlist.find({ userId: { $in: autoTradeUserIds } });
    const autoTradeKeys = [];
    for (const wl of autoTradeWatchlists) {
      if (!wl.stocks) continue;
      for (const stock of wl.stocks) {
        if (stock.autoTradeEnabled) {
          autoTradeKeys.push(`${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`);
        }
      }
    }

    const allKeys = new Set([...activeSubscriptions, ...alertKeys, ...autoTradeKeys]);
    if (allKeys.size === 0) return;

    // NSE/BSE: 09:15 - 15:30 IST (server must run with TZ=Asia/Kolkata)
    const now     = new Date();
    const timeInt = now.getHours() * 100 + now.getMinutes();
    const isMarketOpen = timeInt >= 915 && timeInt <= 1530;

    // Resolve scrip tokens for all keys
    const items = [];
    const keyToScrip = {};

    for (const key of allKeys) {
      const [exchange, symbol] = key.split(':');
      const scripMatch = angelOne.resolveToken(exchange, symbol);
      if (!scripMatch) {
        console.warn(`[Polling] No token found for ${key} - skipping`);
        continue;
      }
      items.push({ exchange, token: scripMatch.token, symbol });
      keyToScrip[key] = scripMatch;
    }

    if (items.length === 0) return;

    // Fetch all quotes in batch
    const fetchedQuotes = await angelOne.fetchQuotesBatch(items);
    if (!fetchedQuotes || fetchedQuotes.length === 0) {
      console.warn(`[Polling] Batch quote returned no data`);
      return;
    }

    // Index fetched quotes by exchange + token for quick access
    const quoteMap = {};
    for (const q of fetchedQuotes) {
      const qKey = `${q.exchange.toUpperCase()}:${q.symbolToken}`;
      quoteMap[qKey] = q;
    }

    // Process each resolved key
    for (const key of allKeys) {
      const scripMatch = keyToScrip[key];
      if (!scripMatch) continue;

      const qKey = `${scripMatch.exch_seg.toUpperCase()}:${scripMatch.token}`;
      const data = quoteMap[qKey];
      if (!data) {
        console.warn(`[Polling] No fetched quote data found in batch for ${key}`);
        continue;
      }

      const [exchange, symbol] = key.split(':');
      const volume = parseInt(data.tradeVolume, 10) || 0;

      const tick = {
        symbol,
        exchange,
        ltp:           parseFloat(data.ltp)           || 0,
        open:          parseFloat(data.open)          || 0,
        high:          parseFloat(data.high)          || 0,
        low:           parseFloat(data.low)           || 0,
        prevClose:     parseFloat(data.close)         || 0,
        volume,
        percentChange: parseFloat(data.percentChange) || 0,
        ts:            Date.now(),
      };

      // Cache and broadcast the raw tick regardless of volume
      liveMarketState[key] = tick;
      if (ioInstance && activeSubscriptions.has(key)) {
        ioInstance.to(`ticker:${key}`).emit('tick', tick);
      }

      // --- ZERO-VOLUME GUARD ---
      if (!isMarketOpen || volume <= 0) continue;

      // Feed the real tick into the candle aggregator
      candleAggregator.updateCandleBuffer(key, tick);

      // --- Emit candle_update only when the candle actually changed ---
      if (!ioInstance) continue;
      if (!lastBroadcastCandle[key]) lastBroadcastCandle[key] = {};

      for (const interval of Object.keys(candleAggregator.INTERVAL_MS)) {
        const candles = candleAggregator.getCandles(key, interval);
        if (!candles.length) continue;

        const latest = candles[candles.length - 1];
        const prev   = lastBroadcastCandle[key][interval];

        if (candleChanged(prev, latest)) {
          lastBroadcastCandle[key][interval] = { ...latest };

          if (activeSubscriptions.has(key)) {
            ioInstance.to(`ticker:${key}`).emit('candle_update', {
              key,
              interval,
              candle: latest,
            });
          }
        }
      }
    }

    // Evaluate all active alerts once for the entire polling cycle
    await alertEngine.evaluateAll(activeAlerts, liveMarketState);

    // Run the auto trading bot engine
    await autoTradeEngine.runAutoTradeCycle(liveMarketState);

  } catch (err) {
    console.error(`[Polling] Batch polling cycle failed:`, err.message);
  } finally {
    isPolling = false;
  }
};
