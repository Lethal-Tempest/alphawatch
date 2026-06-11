
// ─────────────────────────────────────────────────────────────────────────────
// backend/config/angelone.js
// Shared constants and URL definitions for the Angel One SmartAPI.
// All services import from here so endpoint strings never drift out of sync.
// ─────────────────────────────────────────────────────────────────────────────

const ANGEL_ONE = {
  // ── Authentication ─────────────────────────────────────────────────────────
  LOGIN_URL: 'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword',

  // ── Market Data ────────────────────────────────────────────────────────────
  QUOTE_URL:      'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/',
  HISTORICAL_URL: 'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',

  // ── Static scrip master (NSE + BSE equities, updated ~daily by AngelOne) ──
  SCRIP_MASTER_URL: 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json',

  // ── Session token TTL: AngelOne tokens expire at midnight IST.
  //    We cache for 23 h to guarantee a refresh before expiry. ───────────────
  SESSION_TTL_MS: 23 * 60 * 60 * 1000,

  // ── Historical interval mapping: our short codes → AngelOne enum ──────────
  INTERVAL_MAP: {
    '1m':  'ONE_MINUTE',
    '5m':  'FIVE_MINUTE',
    '15m': 'FIFTEEN_MINUTE',
    '30m': 'THIRTY_MINUTE',
    '1h':  'ONE_HOUR',
    '1d':  'ONE_DAY',
  },

  // ── Generous Lookback Days to Guarantee Stabilization Depth ────────────────
  // MODIFIED: Lifted day values so that at least 400-500 baseline candles 
  // are loaded dynamically into memory buffers before trimming down viewable rows.
  LOOKBACK_DAYS: {
    '1m':  100,    
    '5m':  200,   
    '10m': 500,   
    '15m': 900,   
    '30m': 1200,   
    '1h':  2400,   
    '1d':  5500,  
  },

  // ── Quote mode: FULL gives us OHLCV + depth ────────────────────────────────
  QUOTE_MODE: 'FULL',
};

module.exports = ANGEL_ONE;
