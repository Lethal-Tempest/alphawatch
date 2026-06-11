// ─────────────────────────────────────────────────────────────────────────────
// backend/services/candleAggregator.js
//
// In-memory OHLCV candle buffer. Receives raw ticks from the polling loop and
// aggregates them into multiple time-frame candlesticks simultaneously.
//
// Design decisions:
//  • Pure in-memory — zero latency, no DB writes on every tick.
//  • Keeps the last 500 candles per interval per symbol (configurable).
//  • A "current" (incomplete) candle is always the last element in the array.
//  • Zero-volume ticks are IGNORED — they carry no real market activity and
//    would corrupt volume-dependent indicators (MFI) and produce
//    phantom zero-volume candles in the table.
//  • Historical candles from the AngelOne REST API can be seeded via
//    setHistoricalCandles() to provide depth on first chart load.
// ─────────────────────────────────────────────────────────────────────────────

// Shape: candleBuffer[key][interval] = [ { timestamp, open, high, low, close, volume }, ... ]
const candleBuffer  = {};
const historyLoaded = new Set();

const INTERVAL_MS = {
  '1m':  60       * 1000,
  '5m':  5  * 60  * 1000,
  '10m': 10 * 60  * 1000,
  '15m': 15 * 60  * 1000,
  '30m': 30 * 60  * 1000,
  '1h':  60 * 60  * 1000,
  '1d':  24 * 60 * 60 * 1000,
};

const MAX_CANDLES = 1000;

/**
 * Snap a Unix timestamp (ms) down to the start of its interval bucket.
 */
function snapTimestamp(tsMs, intervalMs) {
  return new Date(Math.floor(tsMs / intervalMs) * intervalMs).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core tick processor — called on every 5-second poll result
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCandleBuffer = (key, tick) => {
  const { ltp, volume, ts } = tick;

  // ── ZERO-VOLUME GUARD ────────────────────────────────────────────────────
  // AngelOne returns volume=0 when there has been no trade in the current
  // minute (illiquid stocks, pre/post market noise). Accepting these ticks
  // creates phantom candles with 0 volume and corrupts indicator calculations.
  // We completely skip the tick — price and OHLC may still be valid, but
  // without real volume we should not update the candle state.
  if (!volume || volume <= 0) return;

  if (!candleBuffer[key]) candleBuffer[key] = {};

  for (const [interval, ms] of Object.entries(INTERVAL_MS)) {
    if (!candleBuffer[key][interval]) candleBuffer[key][interval] = [];

    const candles = candleBuffer[key][interval];
    const snapped = snapTimestamp(ts, ms);
    const last    = candles[candles.length - 1];

    if (last && last.timestamp === snapped) {
      // ── Update the current (open) candle ─────────────────────────────────
      last.high  = Math.max(last.high, ltp);
      last.low   = Math.min(last.low,  ltp);
      last.close = ltp;

      // Volume delta: AngelOne `tradeVolume` is cumulative for the day on NSE.
      // We track the previous raw value so we only add the delta.
      const delta      = Math.max(0, volume - (last._prevVolume || volume));
      last.volume     += delta;
      last._prevVolume = volume;

    } else {
      // ── Close the previous candle (strip internal tracking field) ─────────
      if (last) delete last._prevVolume;

      // ── Open a new candle ─────────────────────────────────────────────────
      candles.push({
        timestamp:   snapped,
        open:        ltp,
        high:        ltp,
        low:         ltp,
        close:       ltp,
        volume:      0,          // will accumulate via delta on next tick
        _prevVolume: volume,
      });

      if (candles.length > MAX_CANDLES) candles.shift();
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

exports.hasHistory = (key, interval) => historyLoaded.has(`${key}:${interval}`);

/**
 * Return the candle array for a given key + interval (excluding internal fields).
 * Zero-volume candles that slipped in from historical data are also filtered out.
 */
exports.getCandles = (key, interval) => {
  const raw = candleBuffer[key]?.[interval];
  if (!raw) return [];
  return raw
    .filter(c => c.volume > 0)                 // exclude zero-volume candles
    .map(({ _prevVolume, ...c }) => c);         // strip internal field
};

/**
 * Seed historical candles from the AngelOne REST API.
 * Called by marketController.getHistorical() on cache miss.
 * Incoming candles are merged before any live-polled candles.
 * Zero-volume historical candles are dropped on ingestion.
 */
exports.setHistoricalCandles = (key, interval, candles) => {
  if (!candleBuffer[key]) candleBuffer[key] = {};

  historyLoaded.add(`${key}:${interval}`);

  // Drop zero-volume historical candles on ingestion
  const validCandles = candles.filter(c => (+c.volume || 0) > 0);

  const existing   = candleBuffer[key][interval] || [];
  const existingTs = new Set(existing.map(c => c.timestamp));

  const merged = [
    ...validCandles.filter(c => !existingTs.has(c.timestamp)),
    ...existing,
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  candleBuffer[key][interval] = merged.slice(-MAX_CANDLES);
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported constants
// ─────────────────────────────────────────────────────────────────────────────
exports.INTERVAL_MS = INTERVAL_MS;
