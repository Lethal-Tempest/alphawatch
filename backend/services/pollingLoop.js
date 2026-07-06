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
const indicatorService = require('./indicatorService');

// Set of "EXCHANGE:SYMBOL" keys currently being polled
const activeSubscriptions = new Set();

// Latest tick snapshot, keyed by "EXCHANGE:SYMBOL"
const liveMarketState = {};

// Last-broadcast candle per key+interval, used to detect real changes
// Shape: lastBroadcastCandle[key][interval] = { timestamp, open, high, low, close, volume }
const lastBroadcastCandle = {};

let ioInstance;
let isPolling = false;

exports.init = (io) => {
  ioInstance = io;
  const angelOneSocket = require('./angelOneSocket');
  
  angelOneSocket.init(io, (key, tick) => {
    // 1. Cache and update live market state
    liveMarketState[key] = tick;

    // 2. Broadcast raw tick to client rooms
    if (ioInstance && activeSubscriptions.has(key)) {
      ioInstance.to(`ticker:${key}`).emit('tick', tick);
    }

    // 3. Zero-volume and market open check
    // NSE/BSE: 09:15 - 15:30 IST (using explicit Asia/Kolkata timezone)
    const now = new Date();
    const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const timeInt = nowIST.getHours() * 100 + nowIST.getMinutes();
    const isMarketOpen = timeInt >= 915 && timeInt <= 1530;

    if (!isMarketOpen || tick.volume <= 0) return;

    // 4. Update the in-memory candle aggregator
    candleAggregator.updateCandleBuffer(key, tick);

    // 5. Emit candle_update ONLY when the candle snapshot has actually changed
    if (!ioInstance) return;
    if (!lastBroadcastCandle[key]) lastBroadcastCandle[key] = {};

    for (const interval of Object.keys(candleAggregator.INTERVAL_MS)) {
      const candles = candleAggregator.getCandles(key, interval);
      if (!candles.length) continue;

      const latest = candles[candles.length - 1];
      const prev   = lastBroadcastCandle[key][interval];

      if (candleChanged(prev, latest)) {
        lastBroadcastCandle[key][interval] = { ...latest };

        if (activeSubscriptions.has(key)) {
          const indicators = indicatorService.computeAllIndicators(candles);
          indicators.close = candles.map(c => +c.close);
          indicators.open = candles.map(c => +c.open);
          indicators.high = candles.map(c => +c.high);
          indicators.low = candles.map(c => +c.low);
          indicators.volume = candles.map(c => +c.volume);

          ioInstance.to(`ticker:${key}`).emit('candle_update', {
            key,
            interval,
            candle: latest,
            indicators,
          });
        }
      }
    }
  });
};

let syncTimeout = null;

/**
 * Trigger immediate subscription sync (debounced at 250ms to prevent spamming AngelOne API)
 */
exports.triggerSubscriptionSync = () => {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(async () => {
    try {
      const activeAlerts = await alertEngine.getActiveAlerts();
      const alertKeys = await alertEngine.getActiveAlertKeys(activeAlerts);
      
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
      const angelOneSocket = require('./angelOneSocket');
      angelOneSocket.syncSubscriptions(allKeys);
    } catch (err) {
      console.error(`[Polling] Immediate sync failed:`, err.message);
    }
  }, 250);
};

exports.subscribe = (key) => {
  activeSubscriptions.add(key);
  exports.triggerSubscriptionSync();
};

/**
 * Unsubscribe a key only when no sockets remain in the ticker room.
 * This prevents a single disconnecting client from killing data for everyone.
 */
exports.unsubscribe = (key) => {
  if (!ioInstance) {
    activeSubscriptions.delete(key);
    exports.triggerSubscriptionSync();
    return;
  }
  const room = ioInstance.sockets.adapter.rooms.get(`ticker:${key}`);
  if (!room || room.size === 0) {
    activeSubscriptions.delete(key);
    exports.triggerSubscriptionSync();
  }
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
    
    // 1. Sync WebSocket subscriptions with AngelOne
    const angelOneSocket = require('./angelOneSocket');
    angelOneSocket.syncSubscriptions(allKeys);

    if (allKeys.size === 0) return;

    // 2. Evaluate all active alerts once for the cycle
    await alertEngine.evaluateAll(activeAlerts, liveMarketState);

    // 3. Run the auto trading bot engine
    await autoTradeEngine.runAutoTradeCycle(liveMarketState);

  } catch (err) {
    console.error(`[Polling] Decoupled cycle failed:`, err.message);
  } finally {
    isPolling = false;
  }
};
