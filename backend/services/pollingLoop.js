// ─────────────────────────────────────────────────────────────────────────────
// backend/services/pollingLoop.js
//
// Maintains the set of symbols currently being polled. On each 5-second tick:
//  1. Fetch OHLCV quote from AngelOne for every subscribed symbol
//  2. Always broadcast the raw tick (for live price header display)
//  3. If market is open AND volume > 0:
//       - Update the in-memory candle aggregator
//       - Run the alert engine
//       - Emit candle_update ONLY when the candle snapshot has actually changed
//
// Zero-volume ticks are NOT fed into the candle aggregator. They represent
// periods with no real trades (illiquid stocks, momentary stale quotes) and
// would create phantom zero-volume candles that corrupt indicator math.
// ─────────────────────────────────────────────────────────────────────────────
const angelOne         = require('./angelOneService');
const candleAggregator = require('./candleAggregator');
const alertEngine      = require('./alertEngine');

// Set of "EXCHANGE:SYMBOL" keys currently being polled
const activeSubscriptions = new Set();

// Latest tick snapshot, keyed by "EXCHANGE:SYMBOL"
const liveMarketState = {};

// Last-broadcast candle per key+interval, used to detect real changes
// Shape: lastBroadcastCandle[key][interval] = { timestamp, open, high, low, close, volume }
const lastBroadcastCandle = {};

let ioInstance;

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

// ─────────────────────────────────────────────────────────────────────────────
// Helper: compare two candle objects for meaningful changes.
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Main polling cycle — called every 5 seconds by server.js
// ─────────────────────────────────────────────────────────────────────────────
exports.runPollingCycle = async () => {
  const alertKeys = await alertEngine.getActiveAlertKeys();
  const allKeys = new Set([...activeSubscriptions, ...alertKeys]);
  if (allKeys.size === 0) return;

  // NSE/BSE: 09:15 – 15:30 IST (server must run with TZ=Asia/Kolkata)
  const now     = new Date();
  const timeInt = now.getHours() * 100 + now.getMinutes();
  const isMarketOpen = timeInt >= 915 && timeInt <= 1530;

  for (const key of allKeys) {
    try {
      const [exchange, symbol] = key.split(':');

      const scripMatch = angelOne.resolveToken(exchange, symbol);
      if (!scripMatch) {
        console.warn(`[Polling] No token found for ${key} — skipping`);
        continue;
      }

      const data = await angelOne.fetchQuote(exchange, scripMatch.token);
      if (!data) {
        console.warn(`[Polling] Null quote returned for ${key}`);
        continue;
      }

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
      // (the live ticker bar / price header always needs a fresh price)
      liveMarketState[key] = tick;
      if (ioInstance && activeSubscriptions.has(key)) {
        ioInstance.to(`ticker:${key}`).emit('tick', tick);
      }

      // Evaluate price/indicator alerts for this symbol
      // This happens on every tick (even when the market is closed or volume is 0),
      // so alerts can be evaluated and triggered immediately.
      await alertEngine.evaluate(key, tick);

      // ── ZERO-VOLUME GUARD ───────────────────────────────────────────────
      // Do NOT aggregate or emit candle updates for zero-volume ticks.
      // These represent periods with no real trades and must not create
      // phantom candles or update existing candle state.
      if (!isMarketOpen || volume <= 0) continue;

      // Feed the real tick into the candle aggregator
      candleAggregator.updateCandleBuffer(key, tick);

      // ── Emit candle_update only when the candle actually changed ─────────
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

    } catch (err) {
      console.error(`[Polling] Failed for ${key}:`, err.message);
    }
  }
};
