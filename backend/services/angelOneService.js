
// ─────────────────────────────────────────────────────────────────────────────
// backend/services/angelOneService.js
//
// BUG FIX: `fetchQuote` previously called `this.getAngelOneSession()`.
// In a CommonJS module, `this` at the top level is the `module.exports` object
// ONLY in some edge cases — but inside a regular function body, `this` is
// `undefined` in strict mode (or the global object in sloppy mode). The correct
// pattern is to call `exports.getAngelOneSession()` or store a reference.
// We use a local `self` alias that always points to the exports object.
// ─────────────────────────────────────────────────────────────────────────────
const axios   = require('axios');
const { authenticator } = require('otplib');
const ANGEL   = require('../config/angelone');

// ── Module-level session cache ────────────────────────────────────────────────
let angelScripMaster  = [];
let angelSessionToken = null;
let angelSessionExpiry = 0;

// Self-reference so inner functions can call sibling exports safely
const self = exports;

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Header Factories
// ─────────────────────────────────────────────────────────────────────────────
function buildBaseHeaders() {
  return {
    'Accept':            'application/json',
    'Content-Type':      'application/json',
    'X-UserType':        'USER',
    'X-SourceID':        'WEB',
    'X-ClientLocalIP':   process.env.CLIENT_LOCAL_IP,
    'X-ClientPublicIP':  process.env.CLIENT_PUBLIC_IP,
    'X-MACAddress':      process.env.CLIENT_MAC_ADDRESS,
    'X-PrivateKey':      process.env.ANGEL_API_KEY,
  };
}

function buildAuthHeaders(jwtToken) {
  return { ...buildBaseHeaders(), Authorization: `Bearer ${jwtToken}` };
}

// Export buildBaseHeaders so marketController can use it for inline historical calls
exports.buildBaseHeaders = buildBaseHeaders;

// ─────────────────────────────────────────────────────────────────────────────
// Session Management — cached JWT, refreshed every 23 h
// ─────────────────────────────────────────────────────────────────────────────
exports.getAngelOneSession = async () => {
  const now = Date.now();
  if (angelSessionToken && now < angelSessionExpiry) return angelSessionToken;

  // Generate a fresh 6-digit TOTP from our Base32 secret
  const totp = authenticator.generate(process.env.ANGEL_TOTP_SECRET);

  const body = {
    clientcode: process.env.ANGEL_CLIENT_CODE,
    password:   process.env.ANGEL_MPIN,
    totp,
  };

  const res = await axios.post(ANGEL.LOGIN_URL, body, { headers: buildBaseHeaders() });

  if (!res.data?.data?.jwtToken) {
    throw new Error('AngelOne login failed — unexpected response shape: ' + JSON.stringify(res.data));
  }

  angelSessionToken  = res.data.data.jwtToken;
  angelSessionExpiry = now + ANGEL.SESSION_TTL_MS;
  console.log('🔐 AngelOne session refreshed.');
  return angelSessionToken;
};

// ─────────────────────────────────────────────────────────────────────────────
// Scrip Master — download & cache NSE/BSE equity token list on startup
// ─────────────────────────────────────────────────────────────────────────────
exports.syncScripMaster = async () => {
  console.log('📥 Syncing AngelOne Scrip Master...');
  const res = await axios.get(ANGEL.SCRIP_MASTER_URL);

  if (!Array.isArray(res.data)) {
    console.error('❌ Scrip Master response was not an array — skipping.');
    return;
  }

  // Keep only NSE equity (-EQ suffix) and BSE equity instruments
  angelScripMaster = res.data.filter(item =>
    (item.exch_seg === 'NSE' && item.symbol.endsWith('-EQ')) ||
    (item.exch_seg === 'BSE' && (item.instrumenttype === 'AMXEQ' || item.instrumenttype === ''))
  );

  console.log(`✅ Cached ${angelScripMaster.length} equity tokens.`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Token Resolution — map exchange + symbol string → scrip master entry
// ─────────────────────────────────────────────────────────────────────────────
exports.resolveToken = (exchange, symbol) => {
  const upper = symbol.toUpperCase();
  if (exchange.toUpperCase() === 'NSE') {
    return angelScripMaster.find(
      i => i.exch_seg === 'NSE' && i.symbol === `${upper}-EQ`
    );
  }
  return angelScripMaster.find(
    i => i.exch_seg === 'BSE' && (i.symbol === upper || i.name === upper)
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Quote Fetcher — BUG FIX: was `this.getAngelOneSession()` (wrong context)
//                           now  `self.getAngelOneSession()`  (correct)
// ─────────────────────────────────────────────────────────────────────────────
exports.fetchQuote = async (exchange, token) => {
  // FIX: use `self` alias, not `this`
  const jwt  = await self.getAngelOneSession();
  const body = { mode: ANGEL.QUOTE_MODE, exchangeTokens: { [exchange.toUpperCase()]: [String(token)] } };

  const res = await axios.post(ANGEL.QUOTE_URL, body, { headers: buildAuthHeaders(jwt) });
  return res.data?.data?.fetched?.[0] || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Symbol Search — fuzzy match against in-memory scrip master
// ─────────────────────────────────────────────────────────────────────────────
exports.searchScrips = (term) => {
  const upper = term.toUpperCase().trim();
  if (upper.length < 2) return [];
  return angelScripMaster
    .filter(i => i.symbol.includes(upper) || i.name?.toUpperCase().includes(upper))
    .slice(0, 8);
};

// ─────────────────────────────────────────────────────────────────────────────
// Historical Candle Fetcher & Downsampler
// ─────────────────────────────────────────────────────────────────────────────
exports.fetchHistoricalCandles = async (exchange, symbol, interval) => {
  const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

  // Map frontend intervals to API constraints
  let apiInterval = '';
  let downsampleFactor = 1;

  switch (interval) {
    case '1m': apiInterval = 'ONE_MINUTE'; break;
    case '5m': apiInterval = 'FIVE_MINUTE'; break;
    case '10m': apiInterval = 'FIVE_MINUTE'; downsampleFactor = 2; break;
    case '15m': apiInterval = 'FIFTEEN_MINUTE'; break;
    case '30m': apiInterval = 'FIFTEEN_MINUTE'; downsampleFactor = 2; break;
    case '1h': apiInterval = 'ONE_HOUR'; break;
    case '1d': apiInterval = 'ONE_DAY'; break;
    default: throw new Error(`Invalid interval: ${interval}`);
  }

  const scripMatch = self.resolveToken(exchange, symbol);
  if (!scripMatch) throw new Error(`Symbol not found: ${key}`);

  const todayDate = new Date();
  const pastDate = new Date();
  pastDate.setDate(todayDate.getDate() - (ANGEL.LOOKBACK_DAYS[interval] || 30));

  const pad = n => String(n).padStart(2, '0');
  const fromDateStr = `${pastDate.getFullYear()}-${pad(pastDate.getMonth() + 1)}-${pad(pastDate.getDate())} 09:15`;
  const toDateStr = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-${pad(todayDate.getDate())} 15:30`;

  const jwtToken = await self.getAngelOneSession();
  const response = await axios.post(
    ANGEL.HISTORICAL_URL,
    {
      exchange: exchange.toUpperCase(),
      symboltoken: scripMatch.token,
      interval: apiInterval,
      fromdate: fromDateStr,
      todate: toDateStr,
    },
    { headers: buildAuthHeaders(jwtToken) }
  );

  if (!response.data?.status || !Array.isArray(response.data.data)) {
    throw new Error(`AngelOne API returned empty data for ${key} (${interval})`);
  }

  let parsedCandles = response.data.data.map(c => ({
    timestamp: new Date(c[0]).toISOString(),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseInt(c[5], 10),
  }));

  // Dynamic Downsampling Engine (handles both 10m and 30m)
  if (downsampleFactor > 1) {
    const downsampled = [];
    for (let i = 0; i < parsedCandles.length; i += downsampleFactor) {
      if (i + downsampleFactor - 1 < parsedCandles.length) {
        const chunk = parsedCandles.slice(i, i + downsampleFactor);
        downsampled.push({
          timestamp: chunk[0].timestamp,
          open: chunk[0].open,
          high: Math.max(...chunk.map(c => c.high)),
          low: Math.min(...chunk.map(c => c.low)),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((sum, c) => sum + c.volume, 0),
        });
      }
    }
    parsedCandles = downsampled;
  }

  if (parsedCandles.length >= 1000) {
    parsedCandles = parsedCandles.slice(-1000);
  }

  return parsedCandles;
};

