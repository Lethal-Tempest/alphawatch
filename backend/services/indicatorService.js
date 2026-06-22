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

  // ── Helper to calculate delta and deltaSq ──────────────────────────────
  const getDeltas = (arr) => {
    if (!arr || !arr.length) return [null, null];
    const d1 = arr.map((v, i) =>
      i > 0 && v !== null && arr[i - 1] !== null ? nullSafe(v - arr[i - 1]) : null
    );
    const d2 = d1.map((v, i) =>
      i > 0 && v !== null && d1[i - 1] !== null ? nullSafe(v - d1[i - 1]) : null
    );
    return [d1, d2];
  };

  const sma20 = smaOf(20);
  const sma50 = smaOf(50);
  const sma100 = smaOf(100);
  const sma200 = smaOf(200);

  const ema20 = emaOf(20);
  const ema50 = emaOf(50);
  const ema100 = emaOf(100);
  const ema200 = emaOf(200);

  const [deltaSma20, deltaSqSma20] = getDeltas(sma20);
  const [deltaSma50, deltaSqSma50] = getDeltas(sma50);
  const [deltaSma100, deltaSqSma100] = getDeltas(sma100);
  const [deltaSma200, deltaSqSma200] = getDeltas(sma200);

  const [deltaEma20, deltaSqEma20] = getDeltas(ema20);
  const [deltaEma50, deltaSqEma50] = getDeltas(ema50);
  const [deltaEma100, deltaSqEma100] = getDeltas(ema100);
  const [deltaEma200, deltaSqEma200] = getDeltas(ema200);

  const [deltaRsi14, deltaSqRsi14] = getDeltas(rsi14);

  const [deltaBbUpper, deltaSqBbUpper] = getDeltas(bbUpper);
  const [deltaBbMiddle, deltaSqBbMiddle] = getDeltas(bbMiddle);
  const [deltaBbLower, deltaSqBbLower] = getDeltas(bbLower);

  const [deltaMacdLine, deltaSqMacdLine] = getDeltas(macdLine);
  const [deltaMacdSignal, deltaSqMacdSignal] = getDeltas(macdSignal);
  const [deltaMacdHist, deltaSqMacdHist] = getDeltas(macdHist);

  const [deltaADX, deltaSqADX] = getDeltas(adx);
  const [deltaPlusDI, deltaSqPlusDI] = getDeltas(plusDI);
  const [deltaMinusDI, deltaSqMinusDI] = getDeltas(minusDI);

  const [deltaMfi14, deltaSqMfi14] = getDeltas(mfi14);

  const [deltaSmiLine, deltaSqSmiLine] = getDeltas(smiLine);
  const [deltaSmiSignal, deltaSqSmiSignal] = getDeltas(smiSignal);

  // Derived: di and smiDist
  const di = plusDI.map((p, i) =>
    p !== null && minusDI[i] !== null ? nullSafe(p - minusDI[i]) : null
  );
  const [deltaDI, deltaSqDI] = getDeltas(di);

  const smiDist = smiLine.map((v, i) =>
    v !== null && smiSignal[i] !== null ? nullSafe(v - smiSignal[i]) : null
  );
  const [deltaSMIDist, deltaSqSMIDist] = getDeltas(smiDist);
  const deltaSmiDist = deltaSMIDist;
  const deltaSqSmiDist = deltaSqSMIDist;

  return {
    sma20, sma50, sma100, sma200,
    ema20, ema50, ema100, ema200,
    rsi14,
    bbUpper, bbMiddle, bbLower,
    macdLine, macdSignal, macdHist,
    adx, plusDI, minusDI,
    mfi14,
    smiLine, smiSignal,
    di, smiDist,

    // SMA deltas & deltaSqs
    deltaSma20, deltaSqSma20,
    deltaSma50, deltaSqSma50,
    deltaSma100, deltaSqSma100,
    deltaSma200, deltaSqSma200,

    // EMA deltas & deltaSqs
    deltaEma20, deltaSqEma20,
    deltaEma50, deltaSqEma50,
    deltaEma100, deltaSqEma100,
    deltaEma200, deltaSqEma200,

    // RSI deltas & deltaSqs
    deltaRsi14, deltaSqRsi14,

    // Bollinger deltas & deltaSqs
    deltaBbUpper, deltaSqBbUpper,
    deltaBbMiddle, deltaSqBbMiddle,
    deltaBbLower, deltaSqBbLower,

    // MACD deltas & deltaSqs
    deltaMacdLine, deltaSqMacdLine,
    deltaMacdSignal, deltaSqMacdSignal,
    deltaMacdHist, deltaSqMacdHist,

    // ADX / DI deltas & deltaSqs
    deltaADX, deltaSqADX,
    deltaPlusDI, deltaSqPlusDI,
    deltaMinusDI, deltaSqMinusDI,
    deltaDI, deltaSqDI,

    // MFI deltas & deltaSqs
    deltaMfi14, deltaSqMfi14,

    // SMI deltas & deltaSqs
    deltaSmiLine, deltaSqSmiLine,
    deltaSmiSignal, deltaSqSmiSignal,
    deltaSmiDist, deltaSqSmiDist,

    // Legacy Aliases for Alert Engine & Backward Compatibility
    deltaMACD: deltaMacdLine,
    deltaSMI: deltaSmiLine,
    deltaSMISignal: deltaSmiSignal,
    deltaSMIDist: deltaSMIDist,
    deltaSqSMIDist: deltaSqSmiDist,
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