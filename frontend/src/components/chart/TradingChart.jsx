
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
import api, { fetchIndicators, invalidateIndicatorCache } from '../../services/api';
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
  return Math.floor(new Date(ts).getTime() / 1000);
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

  const [interval, setIntervalVal] = useState(
    () => localStorage.getItem('aw_interval') || '5m'
  );
  const [loading, setLoading]      = useState(false);
  const [candles, setCandles]      = useState([]);

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

  // ── 3. Load historical candles ─────────────────────────────────────────────
  const loadCandles = useCallback(async () => {
    if (!symbol || !exchange) return;
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
  }, [symbol, exchange, interval]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  // ── 4. Socket candle history ───────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = ({ key, intervals: ivs }) => {
      const [ex, sym] = key.split(':');
      if (sym !== symbol || ex !== exchange) return;
      Object.entries(ivs).forEach(([iv, cArr]) => {
        const sorted = [...cArr].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        onCandlesChange?.(iv, sorted);
        if (iv === interval) {
          setCandles(sorted);
          const tv  = sorted.map(c => ({ time: toTvTime(c.timestamp), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
          const vol = sorted.map(c => ({ time: toTvTime(c.timestamp), value: +c.volume, color: c.close >= c.open ? '#22c55e22' : '#ef444422' }));
          series.current.candle?.setData(tv);
          series.current.volume?.setData(vol);
          charts.current.main?.timeScale().fitContent();
        }
      });
    };
    socket.on('candle_history', handler);
    return () => socket.off('candle_history', handler);
  }, [socket, symbol, exchange, interval]);

  // ── 5. Overlay indicators — fetched from backend ───────────────────────────
  useEffect(() => {
    if (!candles.length || !charts.current.main) return;

    const times = candles.map(c => toTvTime(c.timestamp));

    fetchIndicators(exchange, symbol, interval).then(ind => {
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
    }).catch(err => {
      console.warn('[TradingChart] indicator fetch failed:', err.message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, activeIndicators, exchange, symbol, interval]);

  // ── 6. Real-time candle_update ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handler = ({ interval: updInterval, candle }) => {
      setCandles(prev => {
        if (updInterval !== interval) return prev;
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].timestamp === candle.timestamp) {
          updated[lastIdx] = { ...updated[lastIdx], ...candle };
        } else {
          updated.push({ ...candle });
        }
        onCandlesChange?.(updInterval, updated);
        // Invalidate indicator cache so next effect re-fetch gets fresh data
        invalidateIndicatorCache(exchange, symbol, updInterval);
        return updated;
      });

      if (updInterval !== interval) return;
      const tv = { time: toTvTime(candle.timestamp), open: +candle.open, high: +candle.high, low: +candle.low, close: +candle.close };
      series.current.candle?.update(tv);
      series.current.volume?.update({ time: tv.time, value: +candle.volume, color: candle.close >= candle.open ? '#22c55e22' : '#ef444422' });
    };

    const allHandler = ({ interval: updInterval, candle }) => {
      if (updInterval === interval) return;
      onCandlesChange?.(updInterval, null, candle);
    };

    socket.on('candle_update', handler);
    socket.on('candle_update', allHandler);
    return () => {
      socket.off('candle_update', handler);
      socket.off('candle_update', allHandler);
    };
  }, [socket, interval, exchange, symbol]);

  const subChartKeys = Object.keys(SUB_CHARTS).filter(k => activeIndicators.includes(k));
  const isDark = theme === 'dark';

  return (
    <div className="space-y-1 w-full">
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
        <div ref={mainRef} className="w-full" />
      </div>

      {/* Sub-charts */}
      {subChartKeys.map(key => (
        <div key={key} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-base)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest px-3 pt-1.5" style={{ color: 'var(--text-muted)' }}>
            {SUB_CHARTS[key].label}
          </p>
          <div ref={el => { subRefs.current[key] = el; }} className="w-full" />
        </div>
      ))}
    </div>
  );
}
