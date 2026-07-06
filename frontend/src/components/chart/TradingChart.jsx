
// ─────────────────────────────────────────────────────────────────────────────
// frontend/src/components/chart/TradingChart.jsx
//
// All indicator computation now happens on the backend (/api/indicators).
// The chart receives pre-computed arrays — zero math in the browser.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import { RefreshCw } from 'lucide-react';
import api, { fetchIndicators, invalidateIndicatorCache, setIndicatorCache } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

const TIMEFRAMES = ['1m', '5m', '10m', '15m', '30m', '1h', '1d'];

// Sub-chart definitions
const SUB_CHARTS = {
  RSI:             { label: 'RSI (14)',          height: 110 },
  MACD:            { label: 'MACD (12,26,9)',    height: 110 },
  ADX:             { label: 'ADX / DI (14)',     height: 110 },
  MFI:             { label: 'MFI (14)',          height: 110 },
  SMI:             { label: 'SMI (13)',          height: 110 },
  DELTASMI:        { label: 'Delta SMI',         height: 110 },
  DELTASMI_SIGNAL: { label: 'Delta SMI Signal',  height: 110 },
  SMI_DIST:        { label: 'SMI Dist',          height: 110 },
  DELTASMI_DIST:   { label: 'Delta SMI Dist',    height: 110 },
};

function toTvTime(ts) {
  const d = new Date(ts);
  return Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  ) / 1000;
}

function buildTheme(theme) {
  const isDark = theme === 'dark';
  return {
    layout:          { background: { color: isDark ? '#020617' : '#ffffff' }, textColor: isDark ? '#94a3b8' : '#475569' },
    grid:            { vertLines: { color: isDark ? '#0f172a' : '#f1f5f9' }, horzLines: { color: isDark ? '#0f172a' : '#f1f5f9' } },
    crosshair:       { mode: 1 },
    timeScale:       { borderColor: isDark ? '#1e293b' : '#e2e8f0', timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: isDark ? '#1e293b' : '#e2e8f0' },
  };
}

export default function TradingChart({
  symbol,
  exchange,
  socket,
  activeIndicators = [],
  onCandlesChange,
  onIntervalChange,
}) {
  const { theme } = useTheme();
  const mainRef    = useRef(null);
  const subRefs    = useRef({});
  const charts     = useRef({});
  const series     = useRef({});

  const indicatorsRef = useRef(null);
  const candlesRef    = useRef([]);
  const timeToIdxRef  = useRef(new Map());

  const formatVolume = (val) => {
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(0);
  };

  const updateLegends = (idx) => {
    const candles = candlesRef.current || [];
    const ind = indicatorsRef.current;
    
    if (candles.length === 0) return;
    
    const i = (idx !== null && idx !== undefined && idx >= 0 && idx < candles.length) ? idx : (candles.length - 1);
    const candle = candles[i];
    if (!candle) return;
    
    // 1. Update main chart OHLCV
    const mainOhlcvEl = document.getElementById('main-chart-ohlcv-legend');
    if (mainOhlcvEl) {
      const isUp = candle.close >= candle.open;
      const colorClass = isUp ? 'text-emerald-500' : 'text-rose-500';
      mainOhlcvEl.innerHTML = `
        <span class="text-slate-100 font-extrabold mr-1.5">${symbol}</span>
        <span class="mr-1.5">O: <span class="${colorClass}">${(+candle.open).toFixed(2)}</span></span>
        <span class="mr-1.5">H: <span class="${colorClass}">${(+candle.high).toFixed(2)}</span></span>
        <span class="mr-1.5">L: <span class="${colorClass}">${(+candle.low).toFixed(2)}</span></span>
        <span class="mr-1.5">C: <span class="${colorClass}">${(+candle.close).toFixed(2)}</span></span>
        <span>V: <span class="text-slate-300">${formatVolume(+candle.volume)}</span></span>
      `;
    }
    
    // 2. Update overlays legend
    const mainOverlayEl = document.getElementById('main-chart-overlay-legend');
    if (mainOverlayEl) {
      let overlayHtml = '';
      
      // Check SMA
      const smaConfigs = [
        { key: 'SMA20', label: 'SMA 20', color: '#f59e0b', field: 'sma20' },
        { key: 'SMA50', label: 'SMA 50', color: '#3b82f6', field: 'sma50' },
        { key: 'SMA100', label: 'SMA 100', color: '#10b981', field: 'sma100' },
        { key: 'SMA200', label: 'SMA 200', color: '#f43f5e', field: 'sma200' },
      ];
      smaConfigs.forEach(cfg => {
        if (activeIndicators.includes(cfg.key) && ind && ind[cfg.field] && ind[cfg.field][i] != null) {
          overlayHtml += `<span style="color: ${cfg.color}">${cfg.label}: ${ind[cfg.field][i].toFixed(2)}</span>`;
        }
      });
      
      // Check EMA
      const emaConfigs = [
        { key: 'EMA20', label: 'EMA 20', color: '#8b5cf6', field: 'ema20' },
        { key: 'EMA50', label: 'EMA 50', color: '#ec4899', field: 'ema50' },
        { key: 'EMA100', label: 'EMA 100', color: '#06b6d4', field: 'ema100' },
        { key: 'EMA200', label: 'EMA 200', color: '#f97316', field: 'ema200' },
      ];
      emaConfigs.forEach(cfg => {
        if (activeIndicators.includes(cfg.key) && ind && ind[cfg.field] && ind[cfg.field][i] != null) {
          overlayHtml += `<span style="color: ${cfg.color}">${cfg.label}: ${ind[cfg.field][i].toFixed(2)}</span>`;
        }
      });
      
      // Check BB
      if (activeIndicators.includes('BB') && ind && ind.bbUpper && ind.bbUpper[i] != null) {
        overlayHtml += `
          <span style="color: #475569" class="mr-1">BB (20, 2):</span>
          <span style="color: #94a3b8" class="mr-1">basis: ${ind.bbMiddle[i].toFixed(2)}</span>
          <span style="color: #94a3b8" class="mr-1">upper: ${ind.bbUpper[i].toFixed(2)}</span>
          <span style="color: #94a3b8">lower: ${ind.bbLower[i].toFixed(2)}</span>
        `;
      }
      
      mainOverlayEl.innerHTML = overlayHtml;
    }
    
    // 3. Update sub-chart legends
    const subChartKeys = Object.keys(SUB_CHARTS).filter(k => activeIndicators.includes(k));
    subChartKeys.forEach(key => {
      const el = document.getElementById(`sub-legend-${key}`);
      if (!el) return;
      
      let html = '';
      if (ind) {
        switch (key) {
          case 'RSI':
            if (ind.rsi14 && ind.rsi14[i] != null) {
              html = `<span style="color: #a78bfa">rsi: ${ind.rsi14[i].toFixed(2)}</span>`;
            }
            break;
          case 'MACD':
            if (ind.macdLine && ind.macdLine[i] != null) {
              const histColor = ind.macdHist[i] >= 0 ? 'text-emerald-500' : 'text-rose-500';
              html = `
                <span style="color: #38bdf8" class="mr-2">macd: ${ind.macdLine[i].toFixed(2)}</span>
                <span style="color: #fb923c" class="mr-2">sig: ${ind.macdSignal[i].toFixed(2)}</span>
                <span class="${histColor}">hist: ${ind.macdHist[i].toFixed(2)}</span>
              `;
            }
            break;
          case 'ADX':
            if (ind.adx && ind.adx[i] != null) {
              html = `
                <span style="color: #facc15" class="mr-2">adx: ${ind.adx[i].toFixed(2)}</span>
                <span style="color: #4ade80" class="mr-2">+di: ${ind.plusDI[i].toFixed(2)}</span>
                <span style="color: #f87171">-di: ${ind.minusDI[i].toFixed(2)}</span>
              `;
            }
            break;
          case 'MFI':
            if (ind.mfi14 && ind.mfi14[i] != null) {
              html = `<span style="color: #22d3ee">mfi: ${ind.mfi14[i].toFixed(2)}</span>`;
            }
            break;
          case 'SMI':
            if (ind.smiLine && ind.smiLine[i] != null) {
              html = `
                <span style="color: #34d399" class="mr-2">smi: ${ind.smiLine[i].toFixed(2)}</span>
                <span style="color: #fbbf24">sig: ${ind.smiSignal[i].toFixed(2)}</span>
              `;
            }
            break;
          case 'DELTASMI':
            if (ind.deltaSMI && ind.deltaSMI[i] != null) {
              html = `<span style="color: #34d399">delta smi: ${ind.deltaSMI[i].toFixed(2)}</span>`;
            }
            break;
          case 'DELTASMI_SIGNAL':
            if (ind.deltaSMISignal && ind.deltaSMISignal[i] != null) {
              html = `<span style="color: #fbbf24">delta smi sig: ${ind.deltaSMISignal[i].toFixed(2)}</span>`;
            }
            break;
          case 'SMI_DIST':
            if (ind.smiDist && ind.smiDist[i] != null) {
              html = `<span style="color: #38bdf8">smi dist: ${ind.smiDist[i].toFixed(2)}</span>`;
            }
            break;
          case 'DELTASMI_DIST':
            if (ind.deltaSMIDist && ind.deltaSMIDist[i] != null) {
              html = `<span style="color: #ec4899">delta smi dist: ${ind.deltaSMIDist[i].toFixed(2)}</span>`;
            }
            break;
        }
      }
      el.innerHTML = html;
    });
  };

  const [interval, setIntervalVal] = useState(
    () => localStorage.getItem('aw_interval') || '5m'
  );
  const [loading, setLoading]      = useState(false);
  const [candles, setCandles]      = useState([]);

  const [showIlliquidWarning, setShowIlliquidWarning] = useState(false);
  const [dismissedKey, setDismissedKey] = useState(null);

  useEffect(() => {
    const key = `${exchange}:${symbol}:${interval}`;
    if (!loading && candles.length < 50 && dismissedKey !== key) {
      setShowIlliquidWarning(true);
    } else {
      setShowIlliquidWarning(false);
    }
  }, [candles.length, symbol, exchange, interval, dismissedKey, loading]);

  const handleDismissWarning = () => {
    const key = `${exchange}:${symbol}:${interval}`;
    setDismissedKey(key);
    setShowIlliquidWarning(false);
  };

  const handleIntervalChange = (tf) => {
    setIntervalVal(tf);
    localStorage.setItem('aw_interval', tf);
    onIntervalChange?.(tf);
  };

  // ── Apply theme to all charts when it changes ──────────────────────────────
  useEffect(() => {
    const chartTheme = buildTheme(theme);
    Object.values(charts.current).forEach(c => {
      try { c?.applyOptions(chartTheme); } catch (_) {}
    });
  }, [theme]);

  // ── Add/remove series helpers ──────────────────────────────────────────────
  const addSeries = (key, opts, chartKey = 'main') => {
    const chart = charts.current[chartKey];
    if (!chart) return null;
    if (!series.current[key]) {
      series.current[key] = chart.addSeries(LineSeries, opts);
    }
    return series.current[key];
  };

  const removeSeries = (key, chartKey = 'main') => {
    if (series.current[key]) {
      try { charts.current[chartKey]?.removeSeries(series.current[key]); } catch (_) {}
      delete series.current[key];
    }
  };

  const toData = (vals, times) =>
    (vals || []).map((v, i) => v != null ? { time: times[i], value: v } : null).filter(Boolean);

  // ── 1. Main chart init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.innerHTML = '';

    const main = createChart(mainRef.current, {
      ...buildTheme(theme),
      width:  mainRef.current.clientWidth,
      height: 440,
    });
    charts.current.main = main;

    series.current.candle = main.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    series.current.volume = main.addSeries(HistogramSeries, {
      priceScaleId: 'vol', color: '#1e293b',
    });
    main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const ro = new ResizeObserver(() => {
      if (charts.current.main && mainRef.current)
        charts.current.main.applyOptions({ width: mainRef.current.clientWidth });
      Object.keys(SUB_CHARTS).forEach(k => {
        if (charts.current[k] && subRefs.current[k])
          charts.current[k].applyOptions({ width: subRefs.current[k].clientWidth });
      });
    });
    ro.observe(mainRef.current);

    return () => {
      ro.disconnect();
      Object.values(charts.current).forEach(c => { try { c?.remove(); } catch (_) {} });
      charts.current = {};
      series.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Sub-chart lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    Object.keys(SUB_CHARTS).forEach(key => {
      const shouldShow = activeIndicators.includes(key);
      const hasChart   = !!charts.current[key];
      const domEl      = subRefs.current[key];

      if (shouldShow && !hasChart && domEl) {
        domEl.innerHTML = '';
        const ch = createChart(domEl, {
          ...buildTheme(theme),
          width:  domEl.clientWidth,
          height: SUB_CHARTS[key].height,
        });
        charts.current[key] = ch;

        switch (key) {
          case 'RSI':
            series.current.rsiLine = ch.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1.5, priceLineVisible: false });
            series.current.rsiOB   = ch.addSeries(LineSeries, { color: '#ef444440', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            series.current.rsiOS   = ch.addSeries(LineSeries, { color: '#22c55e40', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            break;
          case 'MACD':
            series.current.macdLine   = ch.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1.5, priceLineVisible: false });
            series.current.macdSignal = ch.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1, priceLineVisible: false });
            series.current.macdHist   = ch.addSeries(HistogramSeries, { priceLineVisible: false });
            break;
          case 'ADX':
            series.current.adxLine  = ch.addSeries(LineSeries, { color: '#facc15', lineWidth: 1.5, priceLineVisible: false });
            series.current.adxPlus  = ch.addSeries(LineSeries, { color: '#4ade80', lineWidth: 1, priceLineVisible: false });
            series.current.adxMinus = ch.addSeries(LineSeries, { color: '#f87171', lineWidth: 1, priceLineVisible: false });
            break;
          case 'MFI':
            series.current.mfiLine = ch.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 1.5, priceLineVisible: false });
            series.current.mfiOB   = ch.addSeries(LineSeries, { color: '#ef444440', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            series.current.mfiOS   = ch.addSeries(LineSeries, { color: '#22c55e40', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            break;
          case 'SMI':
            series.current.smiLine   = ch.addSeries(LineSeries, { color: '#34d399', lineWidth: 1.5, priceLineVisible: false });
            series.current.smiSignal = ch.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, priceLineVisible: false });
            break;
          case 'DELTASMI':
            series.current.deltaSmiLine = ch.addSeries(LineSeries, { color: '#34d399', lineWidth: 1.5, priceLineVisible: false });
            break;
          case 'DELTASMI_SIGNAL':
            series.current.deltaSmiSignalLine = ch.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1.5, priceLineVisible: false });
            break;
          case 'SMI_DIST':
            series.current.smiDistLine = ch.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1.5, priceLineVisible: false });
            break;
          case 'DELTASMI_DIST':
            series.current.deltaSmiDistLine = ch.addSeries(LineSeries, { color: '#ec4899', lineWidth: 1.5, priceLineVisible: false });
            break;
        }
      }

      if (!shouldShow && hasChart) {
        try { charts.current[key].remove(); } catch (_) {}
        delete charts.current[key];
        const subKeys = {
          RSI: ['rsiLine','rsiOB','rsiOS'], MACD: ['macdLine','macdSignal','macdHist'],
          ADX: ['adxLine','adxPlus','adxMinus'], MFI: ['mfiLine','mfiOB','mfiOS'],
          SMI: ['smiLine','smiSignal'],
          DELTASMI: ['deltaSmiLine'],
          DELTASMI_SIGNAL: ['deltaSmiSignalLine'],
          SMI_DIST: ['smiDistLine'],
          DELTASMI_DIST: ['deltaSmiDistLine'],
        };
        (subKeys[key] || []).forEach(k => delete series.current[k]);
        if (domEl) domEl.innerHTML = '';
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators]);

  const allCandlesRef = useRef({});
  const allIndicatorsRef = useRef({});

  useEffect(() => {
    allCandlesRef.current = {};
    allIndicatorsRef.current = {};
  }, [symbol, exchange]);

  // ── 3. Load historical candles ─────────────────────────────────────────────
  const loadCandles = useCallback(async () => {
    if (!symbol || !exchange) return;

    const cached = allCandlesRef.current[interval];
    if (cached) {
      setCandles(cached);
      onCandlesChange?.(interval, cached);
      const tv  = cached.map(c => ({ time: toTvTime(c.timestamp), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
      const vol = cached.map(c => ({ time: toTvTime(c.timestamp), value: +c.volume, color: c.close >= c.open ? '#22c55e22' : '#ef444422' }));
      series.current.candle?.setData(tv);
      series.current.volume?.setData(vol);
      charts.current.main?.timeScale().fitContent();
      return;
    }

    if (socket && socket.connected) {
      console.log(`🔌 [TradingChart] Requesting history for ${interval} over WebSocket.`);
      socket.emit('subscribe', { symbol, exchange, interval });
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.get(`/historical/${exchange}/${symbol}/${interval}`);
      if (!data.candles?.length) return;
      const sorted = [...data.candles].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setCandles(sorted);
      onCandlesChange?.(interval, sorted);
      const tv  = sorted.map(c => ({ time: toTvTime(c.timestamp), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
      const vol = sorted.map(c => ({ time: toTvTime(c.timestamp), value: +c.volume, color: c.close >= c.open ? '#22c55e22' : '#ef444422' }));
      series.current.candle?.setData(tv);
      series.current.volume?.setData(vol);
      charts.current.main?.timeScale().fitContent();
    } catch (err) {
      console.error('[TradingChart] loadCandles error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange, interval, socket, onCandlesChange]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  // ── 4. Socket candle history ───────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = ({ key, intervals: ivs }) => {
      const [ex, sym] = key.split(':');
      if (sym !== symbol || ex !== exchange) return;
      Object.entries(ivs).forEach(([iv, cArr]) => {
        const sorted = [...cArr].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        allCandlesRef.current[iv] = sorted;
        onCandlesChange?.(iv, sorted);
      });

      const currentCandles = allCandlesRef.current[interval];
      if (currentCandles) {
        setCandles(currentCandles);
        const tv  = currentCandles.map(c => ({ time: toTvTime(c.timestamp), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
        const vol = currentCandles.map(c => ({ time: toTvTime(c.timestamp), value: +c.volume, color: c.close >= c.open ? '#22c55e22' : '#ef444422' }));
        series.current.candle?.setData(tv);
        series.current.volume?.setData(vol);
        charts.current.main?.timeScale().fitContent();
      }
    };

    const indicatorHistoryHandler = ({ key, intervals: ivs }) => {
      const [ex, sym] = key.split(':');
      if (sym !== symbol || ex !== exchange) return;
      Object.entries(ivs).forEach(([iv, indData]) => {
        setIndicatorCache(ex, sym, iv, indData);
        allIndicatorsRef.current[iv] = indData;
      });

      const currentIndicators = allIndicatorsRef.current[interval];
      if (currentIndicators && candlesRef.current.length > 0) {
        indicatorsRef.current = currentIndicators;
        updateLegends(null);
      }
    };

    socket.on('candle_history', handler);
    socket.on('indicator_history', indicatorHistoryHandler);
    return () => {
      socket.off('candle_history', handler);
      socket.off('indicator_history', indicatorHistoryHandler);
    };
  }, [socket, symbol, exchange, interval, onCandlesChange]);

  // ── 5. Overlay indicators — fetched from backend ───────────────────────────
  useEffect(() => {
    if (!candles.length || !charts.current.main) return;

    const times = candles.map(c => toTvTime(c.timestamp));

    fetchIndicators(exchange, symbol, interval).then(ind => {
      indicatorsRef.current = ind;
      // ── Overlay: SMA ────────────────────────────────────────────────────
      const smaConfigs = [
        { period: 20,  color: '#f59e0b', key: 'sma20',  indKey: 'sma20'  },
        { period: 50,  color: '#3b82f6', key: 'sma50',  indKey: 'sma50'  },
        { period: 100, color: '#10b981', key: 'sma100', indKey: 'sma100' },
        { period: 200, color: '#f43f5e', key: 'sma200', indKey: 'sma200' },
      ];
      smaConfigs.forEach(({ color, key, indKey }) => {
        if (activeIndicators.includes(`SMA${key.slice(3)}`)) {
          addSeries(key, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
            ?.setData(toData(ind[indKey], times));
        } else {
          removeSeries(key);
        }
      });

      // ── Overlay: EMA ────────────────────────────────────────────────────
      const emaConfigs = [
        { color: '#8b5cf6', key: 'ema20',  indKey: 'ema20'  },
        { color: '#ec4899', key: 'ema50',  indKey: 'ema50'  },
        { color: '#06b6d4', key: 'ema100', indKey: 'ema100' },
        { color: '#f97316', key: 'ema200', indKey: 'ema200' },
      ];
      emaConfigs.forEach(({ color, key, indKey }) => {
        if (activeIndicators.includes(`EMA${key.slice(3)}`)) {
          addSeries(key, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
            ?.setData(toData(ind[indKey], times));
        } else {
          removeSeries(key);
        }
      });

      // ── Overlay: Bollinger Bands ─────────────────────────────────────────
      if (activeIndicators.includes('BB')) {
        const bbBase = { lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, color: '#475569' };
        addSeries('bbUpper',  bbBase).setData(toData(ind.bbUpper,  times));
        addSeries('bbMiddle', { ...bbBase, lineStyle: LineStyle.Solid }).setData(toData(ind.bbMiddle, times));
        addSeries('bbLower',  bbBase).setData(toData(ind.bbLower,  times));
      } else {
        ['bbUpper', 'bbMiddle', 'bbLower'].forEach(k => removeSeries(k));
      }

      // ── Sub: RSI ────────────────────────────────────────────────────────
      if (activeIndicators.includes('RSI') && charts.current.RSI && series.current.rsiLine) {
        series.current.rsiLine.setData(toData(ind.rsi14, times));
        series.current.rsiOB?.setData(times.map(t => ({ time: t, value: 70 })));
        series.current.rsiOS?.setData(times.map(t => ({ time: t, value: 30 })));
      }

      // ── Sub: MACD ───────────────────────────────────────────────────────
      if (activeIndicators.includes('MACD') && charts.current.MACD && series.current.macdLine) {
        series.current.macdLine.setData(toData(ind.macdLine, times));
        series.current.macdSignal.setData(toData(ind.macdSignal, times));
        series.current.macdHist.setData(
          toData(ind.macdHist, times).map(d => ({ ...d, color: d.value >= 0 ? '#22c55e66' : '#ef444466' }))
        );
      }

      // ── Sub: ADX ────────────────────────────────────────────────────────
      if (activeIndicators.includes('ADX') && charts.current.ADX && series.current.adxLine) {
        series.current.adxLine.setData(toData(ind.adx, times));
        series.current.adxPlus.setData(toData(ind.plusDI, times));
        series.current.adxMinus.setData(toData(ind.minusDI, times));
      }

      // ── Sub: MFI ────────────────────────────────────────────────────────
      if (activeIndicators.includes('MFI') && charts.current.MFI && series.current.mfiLine) {
        series.current.mfiLine.setData(toData(ind.mfi14, times));
        series.current.mfiOB?.setData(times.map(t => ({ time: t, value: 80 })));
        series.current.mfiOS?.setData(times.map(t => ({ time: t, value: 20 })));
      }

      // ── Sub: SMI ────────────────────────────────────────────────────────
      if (activeIndicators.includes('SMI') && charts.current.SMI && series.current.smiLine) {
        series.current.smiLine.setData(toData(ind.smiLine, times));
        series.current.smiSignal.setData(toData(ind.smiSignal, times));
      }

      // ── Sub: Delta SMI ──────────────────────────────────────────────────
      if (activeIndicators.includes('DELTASMI') && charts.current.DELTASMI && series.current.deltaSmiLine) {
        series.current.deltaSmiLine.setData(toData(ind.deltaSMI, times));
      }

      // ── Sub: Delta SMI Signal ───────────────────────────────────────────
      if (activeIndicators.includes('DELTASMI_SIGNAL') && charts.current.DELTASMI_SIGNAL && series.current.deltaSmiSignalLine) {
        series.current.deltaSmiSignalLine.setData(toData(ind.deltaSMISignal, times));
      }

      // ── Sub: SMI Dist ───────────────────────────────────────────────────
      if (activeIndicators.includes('SMI_DIST') && charts.current.SMI_DIST && series.current.smiDistLine) {
        series.current.smiDistLine.setData(toData(ind.smiDist, times));
      }

      // ── Sub: Delta SMI Dist ─────────────────────────────────────────────
      if (activeIndicators.includes('DELTASMI_DIST') && charts.current.DELTASMI_DIST && series.current.deltaSmiDistLine) {
        series.current.deltaSmiDistLine.setData(toData(ind.deltaSMIDist, times));
      }
      updateLegends(null);
    }).catch(err => {
      console.warn('[TradingChart] indicator fetch failed:', err.message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, activeIndicators, exchange, symbol, interval]);

  // ── 6. Real-time candle_update ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handler = ({ key: updKey, interval: updInterval, candle }) => {
      const targetKey = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
      if (updKey !== targetKey) return;

      setCandles(prev => {
        if (updInterval !== interval) return prev;
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].timestamp === candle.timestamp) {
          updated[lastIdx] = { ...updated[lastIdx], ...candle };
        } else {
          updated.push({ ...candle });
        }
        allCandlesRef.current[interval] = updated;
        onCandlesChange?.(updInterval, updated);
        return updated;
      });

      if (updInterval !== interval) return;
      const tv = { time: toTvTime(candle.timestamp), open: +candle.open, high: +candle.high, low: +candle.low, close: +candle.close };
      series.current.candle?.update(tv);
      series.current.volume?.update({ time: tv.time, value: +candle.volume, color: candle.close >= candle.open ? '#22c55e22' : '#ef444422' });
    };

    const allHandler = ({ key: updKey, interval: updInterval, candle }) => {
      const targetKey = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
      if (updKey !== targetKey) return;
      if (updInterval === interval) return;
      onCandlesChange?.(updInterval, null, candle);
    };

    socket.on('candle_update', handler);
    socket.on('candle_update', allHandler);
    return () => {
      socket.off('candle_update', handler);
      socket.off('candle_update', allHandler);
    };
  }, [socket, interval, exchange, symbol, onCandlesChange]);

  // ── 7. Synchronize crosshair & timescales + display legend ──────────────────
  useEffect(() => {
    const activeCharts = Object.entries(charts.current).filter(([_, ch]) => !!ch);
    if (activeCharts.length === 0) return;

    // Build the time scale lookup map
    const map = new Map();
    candles.forEach((c, idx) => {
      map.set(toTvTime(c.timestamp), idx);
    });
    timeToIdxRef.current = map;
    
    // Also update references for handlers to avoid stale closures
    candlesRef.current = candles;

    // Initial legend display
    updateLegends(null);

    let isSyncingRange = false;

    const rangeHandlers = new Map();
    const crosshairHandlers = new Map();

    const getPrimarySeriesAndValue = (chartKey, idx, candle, ind) => {
      if (chartKey === 'main') {
        return {
          series: series.current.candle,
          value: candle ? +candle.close : null
        };
      }
      if (!ind) return null;
      switch (chartKey) {
        case 'RSI':
          return { series: series.current.rsiLine, value: ind.rsi14 ? ind.rsi14[idx] : null };
        case 'MACD':
          return { series: series.current.macdLine, value: ind.macdLine ? ind.macdLine[idx] : null };
        case 'ADX':
          return { series: series.current.adxLine, value: ind.adx ? ind.adx[idx] : null };
        case 'MFI':
          return { series: series.current.mfiLine, value: ind.mfi14 ? ind.mfi14[idx] : null };
        case 'SMI':
          return { series: series.current.smiLine, value: ind.smiLine ? ind.smiLine[idx] : null };
        case 'DELTASMI':
          return { series: series.current.deltaSmiLine, value: ind.deltaSMI ? ind.deltaSMI[idx] : null };
        case 'DELTASMI_SIGNAL':
          return { series: series.current.deltaSmiSignalLine, value: ind.deltaSMISignal ? ind.deltaSMISignal[idx] : null };
        case 'SMI_DIST':
          return { series: series.current.smiDistLine, value: ind.smiDist ? ind.smiDist[idx] : null };
        case 'DELTASMI_DIST':
          return { series: series.current.deltaSmiDistLine, value: ind.deltaSMIDist ? ind.deltaSMIDist[idx] : null };
      }
      return null;
    };

    activeCharts.forEach(([key, chart]) => {
      // 1. Time scale sync handler
      const rangeHandler = (range) => {
        if (isSyncingRange || !range) return;
        isSyncingRange = true;
        activeCharts.forEach(([otherKey, otherChart]) => {
          if (otherKey !== key) {
            otherChart.timeScale().setVisibleLogicalRange(range);
          }
        });
        isSyncingRange = false;
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);
      rangeHandlers.set(key, rangeHandler);

      // 2. Crosshair sync handler
      const crosshairHandler = (param) => {
        // Only sync if the event was triggered by user interaction (mouse/touch)
        if (!param.sourceEvent) {
          // If this is a programmatic update, it won't have a sourceEvent
          return;
        }

        const time = param.time;
        if (time) {
          const idx = timeToIdxRef.current.get(time);
          if (idx !== undefined) {
            // Update legends first
            updateLegends(idx);

            // Sync other charts
            const candle = candlesRef.current[idx];
            const ind = indicatorsRef.current;
            activeCharts.forEach(([otherKey, otherChart]) => {
              if (otherKey !== key) {
                const info = getPrimarySeriesAndValue(otherKey, idx, candle, ind);
                if (info && info.series && info.value !== null && info.value !== undefined) {
                  otherChart.setCrosshairPosition(info.value, time, info.series);
                } else {
                  otherChart.clearCrosshairPosition();
                }
              }
            });
          }
        } else {
          // Mouse left the chart area
          updateLegends(null);
          activeCharts.forEach(([otherKey, otherChart]) => {
            if (otherKey !== key) {
              otherChart.clearCrosshairPosition();
            }
          });
        }
      };
      chart.subscribeCrosshairMove(crosshairHandler);
      crosshairHandlers.set(key, crosshairHandler);
    });

    // Cleanup subscriptions on deps change / unmount
    return () => {
      activeCharts.forEach(([key, chart]) => {
        try {
          const rh = rangeHandlers.get(key);
          if (rh) chart.timeScale().unsubscribeVisibleLogicalRangeChange(rh);
        } catch (_) {}
        
        try {
          const ch = crosshairHandlers.get(key);
          if (ch) chart.unsubscribeCrosshairMove(ch);
        } catch (_) {}
      });
    };
  }, [candles, activeIndicators, symbol]);

  const subChartKeys = Object.keys(SUB_CHARTS).filter(k => activeIndicators.includes(k));
  const isDark = theme === 'dark';

  return (
    <div className="space-y-1 w-full relative">
      {showIlliquidWarning && (
        <div className="absolute bottom-4 right-4 z-40 bg-slate-900/95 backdrop-blur border border-amber-500/30 text-amber-200 rounded-xl p-3 text-[10px] max-w-[280px] shadow-2xl flex items-start gap-2.5 animate-fade-in pointer-events-auto">
          <span className="text-amber-400 font-extrabold shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="font-bold text-slate-100">Thinly Traded Stock</p>
            <p className="mt-0.5 leading-relaxed text-amber-200/90">
              You might be getting fewer candles because this stock is thinly traded or illiquid. If you face any issues, please feel free to contact us.
            </p>
          </div>
          <button 
            onClick={handleDismissWarning} 
            className="text-amber-500 hover:text-amber-300 transition-colors cursor-pointer shrink-0 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Timeframe selector */}
      <div className="flex items-center justify-end">
        <div
          className="flex gap-0.5 p-0.5 rounded-lg border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}
        >
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => handleIntervalChange(tf)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                interval === tf
                  ? 'bg-indigo-600 text-white'
                  : 'hover:text-white'
              }`}
              style={interval !== tf ? { color: 'var(--text-muted)' } : {}}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart */}
      <div
        className="relative rounded-xl overflow-hidden border"
        style={{ borderColor: 'var(--border-base)' }}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'var(--bg-base)', opacity: 0.7 }}>
            <RefreshCw className="text-indigo-400 animate-spin" size={22} />
          </div>
        )}
        <div className="absolute top-2.5 left-3 z-10 pointer-events-none font-mono text-[10px] space-y-0.5 leading-tight select-none flex flex-col gap-1">
          <div id="main-chart-ohlcv-legend" className="flex flex-wrap gap-2 text-slate-300" />
          <div id="main-chart-overlay-legend" className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-400" />
        </div>
        <div ref={mainRef} className="w-full" />
      </div>

      {/* Sub-charts */}
      {subChartKeys.map(key => (
        <div key={key} className="rounded-xl overflow-hidden border relative" style={{ borderColor: 'var(--border-base)' }}>
          <div className="absolute top-1.5 left-3 z-10 pointer-events-none font-mono text-[9px] font-black uppercase tracking-widest flex gap-3" style={{ color: 'var(--text-muted)' }}>
            <span>{SUB_CHARTS[key].label}</span>
            <span id={`sub-legend-${key}`} className="lowercase font-bold tracking-normal text-slate-400" />
          </div>
          <div ref={el => { subRefs.current[key] = el; }} className="w-full pt-4" />
        </div>
      ))}
    </div>
  );
}
