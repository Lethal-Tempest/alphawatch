// ─────────────────────────────────────────────────────────────────────────────
// backend/services/indicatorService.js
//
// Server-side indicator calculations.
// Uses the `technicalindicators` npm package for speed and correctness.
// Pure functions — no state, no side effects.
// ─────────────────────────────────────────────────────────────────────────────
const ti = require('technicalindicators');

// ── Shared helpers ────────────────────────────────────────────────────────────

function padLeft(arr, totalLength, fill = null) {
  const padding = Array(Math.max(0, totalLength - arr.length)).fill(fill);
  return [...padding, ...arr];
}

function nullSafe(v) {
  if (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) return null;
  return +v.toFixed(4);
}

// ── RSI (Wilder) — kept for alertEngine backward-compat ──────────────────────
const calculateRSI = (closes, period = 14) => {
  if (!closes || closes.length < period + 1) return null;
  const results = ti.RSI.calculate({ values: closes, period });
  if (!results.length) return null;
  return parseFloat(results[results.length - 1].toFixed(2));
};

// ── SMA ───────────────────────────────────────────────────────────────────────
const calculateSMA = (values, period) => {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
};

// ─────────────────────────────────────────────────────────────────────────────
// computeAllIndicators
//
// Given an array of candles ({ open, high, low, close, volume, timestamp }),
// returns an object with one array per indicator, length === candles.length,
// with null for indices where the indicator has no value yet.
// ─────────────────────────────────────────────────────────────────────────────
const computeAllIndicators = (candles) => {
  const n = candles.length;
  const closes = candles.map(c => +c.close);
  const highs = candles.map(c => +c.high);
  const lows = candles.map(c => +c.low);
  const volumes = candles.map(c => +c.volume);

  // ── SMA ──────────────────────────────────────────────────────────────────
  const smaOf = (period) =>
    padLeft(ti.SMA.calculate({ values: closes, period }).map(nullSafe), n);

  // ── EMA ──────────────────────────────────────────────────────────────────
  const emaOf = (period) =>
    padLeft(ti.EMA.calculate({ values: closes, period }).map(nullSafe), n);

  // ── RSI ──────────────────────────────────────────────────────────────────
  const rsi14 = padLeft(
    ti.RSI.calculate({ values: closes, period: 14 }).map(nullSafe), n
  );

  // ── Bollinger Bands ───────────────────────────────────────────────────────
  const bbRaw = ti.BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const bbUpper = padLeft(bbRaw.map(b => nullSafe(b.upper)), n);
  const bbMiddle = padLeft(bbRaw.map(b => nullSafe(b.middle)), n);
  const bbLower = padLeft(bbRaw.map(b => nullSafe(b.lower)), n);

  // ── MACD ─────────────────────────────────────────────────────────────────
  const macdRaw = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdLine = padLeft(macdRaw.map(m => nullSafe(m.MACD)), n);
  const macdSignal = padLeft(macdRaw.map(m => nullSafe(m.signal)), n);
  const macdHist = padLeft(macdRaw.map(m => nullSafe(m.histogram)), n);

  // ── ADX / DI ─────────────────────────────────────────────────────────────
  const adxRaw = ti.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const adx = padLeft(adxRaw.map(a => nullSafe(a.adx)), n);
  const plusDI = padLeft(adxRaw.map(a => nullSafe(a.pdi)), n);
  const minusDI = padLeft(adxRaw.map(a => nullSafe(a.mdi)), n);

  // ── MFI ──────────────────────────────────────────────────────────────────
  const mfiRaw = computeMFI(candles, 14);
  const mfi14 = padLeft(mfiRaw.map(nullSafe), n);

  // ── Stochastic Momentum Index ─────────────────────────────────────────────
  const smiResult = computeSMI(candles);
  const smiLine = smiResult.smi.map(nullSafe);
  const smiSignal = smiResult.signal.map(nullSafe);

  // ── Derived deltas ────────────────────────────────────────────────────────
  const di = plusDI.map((p, i) =>
    p !== null && minusDI[i] !== null ? nullSafe(p - minusDI[i]) : null
  );
  const deltaPlusDI = plusDI.map((v, i) =>
    i > 0 && v !== null && plusDI[i - 1] !== null ? nullSafe(v - plusDI[i - 1]) : null
  );
  const deltaMinusDI = minusDI.map((v, i) =>
    i > 0 && v !== null && minusDI[i - 1] !== null ? nullSafe(v - minusDI[i - 1]) : null
  );
  const deltaDI = di.map((v, i) =>
    i > 0 && v !== null && di[i - 1] !== null ? nullSafe(v - di[i - 1]) : null
  );
  const deltaADX = adx.map((v, i) =>
    i > 0 && v !== null && adx[i - 1] !== null ? nullSafe(v - adx[i - 1]) : null
  );
  const deltaSqADX = deltaADX.map((v, i) =>
    i > 0 && v !== null && deltaADX[i - 1] !== null ? nullSafe(v - deltaADX[i - 1]) : null
  );
  const deltaMACD = macdLine.map((v, i) =>
    i > 0 && v !== null && macdLine[i - 1] !== null ? nullSafe(v - macdLine[i - 1]) : null
  );

  const deltaSMI = smiLine.map((v, i) =>
    i > 0 && v !== null && smiLine[i - 1] !== null ? nullSafe(v - smiLine[i - 1]) : null
  );
  const deltaSMISignal = smiSignal.map((v, i) =>
    i > 0 && v !== null && smiSignal[i - 1] !== null ? nullSafe(v - smiSignal[i - 1]) : null
  );
  const smiDist = smiLine.map((v, i) =>
    v !== null && smiSignal[i] !== null ? nullSafe(v - smiSignal[i]) : null
  );
  const deltaSMIDist = smiDist.map((v, i) =>
    i > 0 && v !== null && smiDist[i - 1] !== null ? nullSafe(v - smiDist[i - 1]) : null
  );

  return {
    sma20: smaOf(20), sma50: smaOf(50),
    sma100: smaOf(100), sma200: smaOf(200),
    ema20: emaOf(20), ema50: emaOf(50),
    ema100: emaOf(100), ema200: emaOf(200),
    rsi14,
    bbUpper, bbMiddle, bbLower,
    macdLine, macdSignal, macdHist,
    adx, plusDI, minusDI,
    mfi14,
    smiLine, smiSignal,
    di, deltaPlusDI, deltaMinusDI,
    deltaDI, deltaADX, deltaSqADX, deltaMACD,
    deltaSMI, deltaSMISignal, smiDist, deltaSMIDist,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Stochastic Momentum Index (TradingView Parity)
// ─────────────────────────────────────────────────────────────────────────────
function computeSMI(candles, period = 10, smooth1 = 3, smooth2 = 3, signalPeriod = 10) {
  const n = candles.length;

  const tvEMA = (data, len) => {
    const alpha = 2 / (len + 1);
    const out = Array(n).fill(null);
    let prev = null;
    for (let i = 0; i < n; i++) {
      if (data[i] === null) continue;
      if (prev === null) {
        prev = data[i];
      } else {
        prev = alpha * data[i] + (1 - alpha) * prev;
      }
      out[i] = prev;
    }
    return out;
  };

  const hh = Array(n).fill(null);
  const ll = Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (+candles[j].high > maxH) maxH = +candles[j].high;
      if (+candles[j].low < minL) minL = +candles[j].low;
    }
    hh[i] = maxH;
    ll[i] = minL;
  }

  const num = Array(n).fill(null);
  const den = Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const center = (hh[i] + ll[i]) / 2;
    num[i] = +candles[i].close - center;
    den[i] = (hh[i] - ll[i]) / 2;
  }

  const numEma1 = tvEMA(num, smooth1);
  const numEma2 = tvEMA(numEma1, smooth2);
  const denEma1 = tvEMA(den, smooth1);
  const denEma2 = tvEMA(denEma1, smooth2);

  const smi = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (numEma2[i] !== null && denEma2[i] !== null && denEma2[i] !== 0) {
      smi[i] = (numEma2[i] / denEma2[i]) * 100;
    }
  }

  const signal = tvEMA(smi, signalPeriod);
  return { smi, signal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Money Flow Index (TradingView Parity)
// ─────────────────────────────────────────────────────────────────────────────
function computeMFI(candles, period = 14) {
  const n = candles.length;
  const mfi = Array(n).fill(null);
  const hlc3 = candles.map(c => (+c.high + +c.low + +c.close) / 3);

  for (let i = period; i < n; i++) {
    let posFlow = 0;
    let negFlow = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = hlc3[j] - hlc3[j - 1];
      const rawFlow = hlc3[j] * (+candles[j].volume);

      if (change > 0) posFlow += rawFlow;
      else if (change < 0) negFlow += rawFlow;
    }

    if (posFlow === 0 && negFlow === 0) {
      mfi[i] = 50;
    } else if (negFlow === 0) {
      mfi[i] = 100;
    } else if (posFlow === 0) {
      mfi[i] = 0;
    } else {
      mfi[i] = 100 - (100 / (1 + (posFlow / negFlow)));
    }
  }
  return mfi;
}

module.exports = {
  calculateRSI,
  calculateSMA,
  computeAllIndicators,
  computeSMI,
  computeMFI
};