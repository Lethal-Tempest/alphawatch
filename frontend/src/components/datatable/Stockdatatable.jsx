// ─────────────────────────────────────────────────────────────────────────────
// frontend/src/components/datatable/Stockdatatable.jsx
//
// Self-contained data table. All indicator values are fetched from the backend
// (/api/indicators/:exchange/:symbol/:interval) — zero client-side math.
//
// Key design decisions:
//  • Zero-volume candles are filtered out of the display — they carry no real
//    market activity and corrupt volume-dependent indicator math.
//  • When a live candle_update arrives, indicators are re-fetched from the
//    backend (debounced 400 ms) so the new row immediately shows values
//    instead of hyphens. The indicator cache is invalidated before re-fetch.
//  • indicators state is always kept aligned to the current candle array
//    so getVal(k, i) never goes out of bounds.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RefreshCw, Download, X, ChevronDown, Activity, Settings2 } from 'lucide-react';
import api, { fetchIndicators, invalidateIndicatorCache } from '../../services/api';

const TABLE_ROWS = 1000;
const TIMEFRAMES = ['1m', '5m', '10m', '15m', '30m', '1h', '1d'];

// ── Format helpers ────────────────────────────────────────────────────────────
const p  = (n, d = 2)  => (n != null && !isNaN(n)) ? Number(n).toFixed(d) : '—';
const pd = (n, d = 3)  => (n != null && !isNaN(n)) ? (n >= 0 ? '+' : '') + Number(n).toFixed(d) : '—';

function fmtVol(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(2) + ' Cr';
  if (n >= 1_00_000)    return (n / 1_00_000).toFixed(2) + ' L';
  return Number(n).toLocaleString('en-IN');
}

function fmtTime(ts, interval) {
  const d = new Date(ts);
  if (interval === '1d') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  }
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ── Column groups ─────────────────────────────────────────────────────────────
const COLUMN_GROUPS = [
  {
    group: 'core', label: 'Core', color: 'text-slate-300', cols: [
      { key: 'open',   label: 'Open',   always: true },
      { key: 'high',   label: 'High',   always: true },
      { key: 'low',    label: 'Low',    always: true },
      { key: 'close',  label: 'Close',  always: true },
      { key: 'chg',    label: 'Chg%',   always: true },
      { key: 'volume', label: 'Volume', always: true },
    ],
  },
  {
    group: 'sma', label: 'SMA', color: 'text-amber-400', cols: [
      { key: 'sma20',  label: 'SMA 20'  }, { key: 'sma50',  label: 'SMA 50'  },
      { key: 'sma100', label: 'SMA 100' }, { key: 'sma200', label: 'SMA 200' },
    ],
  },
  {
    group: 'ema', label: 'EMA', color: 'text-purple-400', cols: [
      { key: 'ema20',  label: 'EMA 20'  }, { key: 'ema50',  label: 'EMA 50'  },
      { key: 'ema100', label: 'EMA 100' }, { key: 'ema200', label: 'EMA 200' },
    ],
  },
  { group: 'rsi',  label: 'RSI',      color: 'text-violet-400', cols: [{ key: 'rsi14', label: 'RSI 14' }] },
  {
    group: 'bb', label: 'Bollinger', color: 'text-slate-400', cols: [
      { key: 'bbUpper', label: 'BB Upper' }, { key: 'bbMid', label: 'BB Mid' }, { key: 'bbLower', label: 'BB Lower' },
    ],
  },
  {
    group: 'macd', label: 'MACD', color: 'text-sky-400', cols: [
      { key: 'macd', label: 'MACD' }, { key: 'macdSig', label: 'MACD Signal' }, { key: 'macdHist', label: 'MACD Hist' },
    ],
  },
  {
    group: 'adx', label: 'ADX / DI', color: 'text-yellow-400', cols: [
      { key: 'adx', label: 'ADX' }, { key: 'plusDI', label: '+DI' }, { key: 'minusDI', label: '-DI' },
    ],
  },
  { group: 'mfi', label: 'MFI', color: 'text-cyan-400', cols: [{ key: 'mfi', label: 'MFI 14' }] },
  {
    group: 'smi', label: 'SMI', color: 'text-emerald-400', cols: [
      { key: 'smi', label: 'SMI' },
      { key: 'smiSignal', label: 'SMI Signal' },
      { key: 'deltaSMI', label: 'Delta SMI' },
      { key: 'deltaSMISignal', label: 'Delta SMI Signal' },
      { key: 'smiDist', label: 'SMI Dist' },
      { key: 'deltaSMIDist', label: 'Delta SMI Dist' },
    ],
  },
  {
    group: 'custom', label: 'Custom ΔΔ', color: 'text-rose-400', cols: [
      { key: 'di',           label: 'DI (+DI−-DI)' },
      { key: 'deltaPlusDI',  label: 'Δ+DI'         },
      { key: 'deltaMinusDI', label: 'Δ-DI'          },
      { key: 'deltaDI',      label: 'ΔDI'           },
      { key: 'deltaADX',     label: 'ΔADX'          },
      { key: 'deltaSqADX',   label: 'ΔΔ ADX'        },
      { key: 'deltaMACD',    label: 'ΔMACD'         },
    ],
  },
];

const DEFAULT_VISIBLE = new Set([
  'open', 'high', 'low', 'close', 'chg', 'volume',
  'sma20', 'sma50', 'ema20', 'ema50', 'rsi14',
  'bbUpper', 'bbMid', 'bbLower',
  'macd', 'macdSig', 'macdHist',
  'adx', 'plusDI', 'minusDI',
  'di', 'deltaPlusDI', 'deltaMinusDI', 'deltaDI', 'deltaADX', 'deltaSqADX', 'deltaMACD',
]);

const ALL_COL_KEYS = COLUMN_GROUPS.flatMap(g => g.cols.map(c => c.key));
const COL_META     = Object.fromEntries(
  COLUMN_GROUPS.flatMap(g => g.cols.map(c => [c.key, { ...c, group: g.group, color: g.color }]))
);

// Map backend indicator key → column key
const IND_KEY_MAP = {
  sma20: 'sma20', sma50: 'sma50', sma100: 'sma100', sma200: 'sma200',
  ema20: 'ema20', ema50: 'ema50', ema100: 'ema100', ema200: 'ema200',
  rsi14: 'rsi14',
  bbUpper: 'bbUpper', bbMiddle: 'bbMid', bbLower: 'bbLower',
  macdLine: 'macd', macdSignal: 'macdSig', macdHist: 'macdHist',
  adx: 'adx', plusDI: 'plusDI', minusDI: 'minusDI',
  mfi14: 'mfi',
  smiLine: 'smi', smiSignal: 'smiSignal',
  deltaSMI: 'deltaSMI', deltaSMISignal: 'deltaSMISignal',
  smiDist: 'smiDist', deltaSMIDist: 'deltaSMIDist',
  di: 'di', deltaPlusDI: 'deltaPlusDI', deltaMinusDI: 'deltaMinusDI',
  deltaDI: 'deltaDI', deltaADX: 'deltaADX', deltaSqADX: 'deltaSqADX', deltaMACD: 'deltaMACD',
};

function Th({ children, right }) {
  return (
    <th className={`px-2 py-2 text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      style={{ color: 'var(--text-muted)' }}>
      {children}
    </th>
  );
}
function Td({ children, className = '', style }) {
  return (
    <td className={`px-2 py-1.5 text-[10px] font-mono tabular-nums whitespace-nowrap ${className}`} style={style}>
      {children}
    </td>
  );
}

export default function StockDataTable({ symbol, exchange, socket, onClose }) {
  const [interval, setIntervalVal] = useState(
    () => localStorage.getItem('aw_interval') || '5m'
  );
  // candles: filtered array (zero-volume excluded), sorted oldest→newest
  const [candles,    setCandles]    = useState([]);
  // indicators: parallel arrays aligned to `candles` — same length
  const [indicators, setIndicators] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [showColPanel, setShowColPanel] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = localStorage.getItem('aw_visible_cols');
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* ignore */ }
    return DEFAULT_VISIBLE;
  });

  // Ref to track pending indicator re-fetch debounce timer
  const indDebounceRef  = useRef(null);
  // Ref so the debounced callback always sees current values without stale closure
  const currentParamsRef = useRef({ symbol, exchange, interval });
  const tableBodyRef = useRef(null);

  useEffect(() => {
    currentParamsRef.current = { symbol, exchange, interval };
  }, [symbol, exchange, interval]);

  useEffect(() => {
    localStorage.setItem('aw_visible_cols', JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  // ── Full data fetch (candles + indicators together) ───────────────────────
  const fetchData = useCallback(async (sym, exch, iv) => {
    if (!sym || !exch) return;
    setLoading(true);
    setError(null);
    try {
      const [candleRes, indData] = await Promise.all([
        api.get(`/historical/${exch}/${sym}/${iv}`),
        fetchIndicators(exch, sym, iv),
      ]);

      if (!candleRes.data?.candles?.length) {
        setError('No historical data available.');
        setCandles([]);
        setIndicators(null);
        return;
      }

      // Filter out zero-volume candles before storing — they are phantom
      // entries with no real trade activity and must not appear in the table
      // or be fed into indicator calculations.
      const sorted = [...candleRes.data.candles]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .filter(c => (+c.volume || 0) > 0)
        .slice(-TABLE_ROWS);

      setCandles(sorted);
      setIndicators(indData);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data.');
      setCandles([]);
      setIndicators(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(symbol, exchange, interval);
  }, [symbol, exchange, interval, fetchData]);

  // ── Interval change ────────────────────────────────────────────────────────
  const handleIntervalChange = (iv) => {
    setIntervalVal(iv);
    localStorage.setItem('aw_interval', iv);
  };

  // ── Re-fetch only indicators (candles already updated by socket) ───────────
  // Called after a live candle arrives so the new row shows real values.
  const refreshIndicators = useCallback(async (sym, exch, iv) => {
    try {
      invalidateIndicatorCache(exch, sym, iv);
      const indData = await fetchIndicators(exch, sym, iv);
      setIndicators(indData);
    } catch (err) {
      console.warn('[StockDataTable] indicator refresh failed:', err.message);
    }
  }, []);

  // ── Live candle updates via socket ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handler = ({ interval: updInterval, candle }) => {
      if (updInterval !== interval) return;

      // Skip zero-volume candles — same rule as the backend aggregator
      if (!candle.volume || candle.volume <= 0) return;

      setCandles(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].timestamp === candle.timestamp) {
          // Update existing live candle in-place
          updated[lastIdx] = { ...updated[lastIdx], ...candle };
        } else {
          // New candle opened — append it
          updated.push({ ...candle });
          if (updated.length > TABLE_ROWS) updated.shift();
        }
        return updated;
      });

      // Debounce indicator re-fetch so rapid ticks within the same candle
      // don't hammer the API — only fire after quiet for 400 ms
      clearTimeout(indDebounceRef.current);
      indDebounceRef.current = setTimeout(() => {
        const { symbol: s, exchange: e, interval: iv } = currentParamsRef.current;
        refreshIndicators(s, e, iv);
      }, 400);
    };

    socket.on('candle_update', handler);
    return () => {
      socket.off('candle_update', handler);
      clearTimeout(indDebounceRef.current);
    };
  }, [socket, interval, refreshIndicators]);

  // ── getVal: map column key → indicator value at candle index i ─────────────
  // `i` is the index into the `candles` array (oldest→newest).
  // `indicators` arrays are returned by the backend aligned to the candle
  // array it computed over. They may be longer or shorter than `candles`
  // if a live update added a row. We align from the END: the last entry in
  // both arrays is the most-recent candle, so we offset accordingly.
  const getVal = useCallback((colKey, candleIdx) => {
    if (!indicators) return null;
    const backendKey = Object.entries(IND_KEY_MAP).find(([, v]) => v === colKey)?.[0];
    if (!backendKey) return null;
    const arr = indicators[backendKey];
    if (!arr || !arr.length) return null;

    // Align from the right: the last indicator value corresponds to the last
    // candle in `candles`. candleIdx counts from the start of `candles`.
    // offset = arr.length - candles.length  (can be 0 or positive if indicator
    // array is longer due to historical depth; never negative after re-fetch)
    const offset = arr.length - candles.length;
    const arrIdx = candleIdx + offset;
    if (arrIdx < 0 || arrIdx >= arr.length) return null;
    return arr[arrIdx] ?? null;
  }, [indicators, candles.length]);

  // ── Rendering helpers ──────────────────────────────────────────────────────
  const rsiColor = (v) => {
    if (v == null) return 'text-slate-600';
    if (v >= 70)   return 'text-red-400';
    if (v <= 30)   return 'text-emerald-400';
    return 'text-slate-300';
  };

  const renderCell = (key, val) => {
    if (val == null || isNaN(val))
      return <Td key={key} className="text-right" style={{ color: 'var(--text-faint)' }}>—</Td>;

    const isPos = val >= 0;
    let cls     = 'text-right ';
    let display = p(val);

    if (key === 'rsi14')   { cls += rsiColor(val); display = p(val, 1); }
    else if (key === 'macdHist') { cls += isPos ? 'text-emerald-400/80' : 'text-rose-400/80'; display = pd(val); }
    else if (['macd', 'macdSig'].includes(key)) {
      cls += isPos ? 'text-emerald-400' : 'text-rose-400'; display = p(val, 3);
    } else if (['di', 'deltaPlusDI', 'deltaMinusDI', 'deltaDI', 'deltaADX', 'deltaSqADX', 'deltaMACD', 'deltaSMI', 'deltaSMISignal', 'smiDist', 'deltaSMIDist'].includes(key)) {
      cls += isPos ? 'text-emerald-400' : 'text-rose-400'; display = pd(val);
    } else if (key === 'smi' || key === 'smiSignal') {
      cls += isPos ? 'text-emerald-400' : 'text-rose-400'; display = p(val, 2);
    } else if (['adx', 'plusDI', 'minusDI', 'mfi'].includes(key)) {
      cls += 'text-yellow-300'; display = p(val, 2);
    } else {
      cls += COL_META[key]?.color || 'text-slate-300';
    }
    return <Td key={key} className={cls}>{display}</Td>;
  };

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCsv = () => {
    if (!candles.length) return;
    const visKeys = ALL_COL_KEYS.filter(k => visibleCols.has(k));
    const headers = ['#', 'Time', ...visKeys.map(k => COL_META[k]?.label || k)];

    const rowStrs = candles.map((c, idx) => {
      const cells = [idx + 1, fmtTime(c.timestamp, interval)];
      visKeys.forEach(k => {
        if (['open', 'high', 'low', 'close', 'volume'].includes(k)) {
          cells.push(c[k]);
        } else if (k === 'chg') {
          cells.push(c.open ? ((c.close - c.open) / c.open * 100).toFixed(2) : '0.00');
        } else {
          const v = getVal(k, idx);
          cells.push(v !== null ? v : '');
        }
      });
      return cells.join(',');
    });

    const blob = new Blob([[headers.join(','), ...rowStrs].join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${exchange}_${symbol}_${interval}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived display data ───────────────────────────────────────────────────
  const rows  = [...candles].reverse();   // newest first
  const visKeys = ALL_COL_KEYS.filter(k => visibleCols.has(k));

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const closes = rows.map(r => parseFloat(r.close));
    return {
      avgClose: closes.reduce((a, b) => a + b, 0) / closes.length,
      maxHigh:  Math.max(...rows.map(r => parseFloat(r.high))),
      minLow:   Math.min(...rows.map(r => parseFloat(r.low))),
      totalVol: rows.reduce((a, r) => a + (parseInt(r.volume) || 0), 0),
    };
  }, [rows]);

  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full border rounded-xl overflow-hidden relative"
      style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-sky-400" />
          <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{exchange}</span>
          <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>· Data Table</span>
          {candles.length > 0 && (
            <span className="flex items-center gap-1 ml-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">LIVE</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={interval} onChange={e => handleIntervalChange(e.target.value)}
              className="border rounded-lg px-2.5 py-1 pr-6 text-[10px] font-bold appearance-none focus:outline-none cursor-pointer"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}>
              {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf.toUpperCase()}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
          </div>

          <button onClick={() => setShowColPanel(p => !p)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
              showColPanel ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' : ''
            }`}
            style={!showColPanel ? { background: 'var(--bg-surface)', borderColor: 'var(--border-muted)', color: 'var(--text-secondary)' } : {}}>
            <Settings2 size={11} /> Columns
            <span className="px-1 py-0.5 bg-indigo-700/60 text-indigo-200 rounded text-[8px] font-black ml-0.5">
              {visKeys.length}
            </span>
          </button>

          <button onClick={() => fetchData(symbol, exchange, interval)} disabled={loading}
            className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>

          <button onClick={exportCsv} disabled={!candles.length}
            className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--text-muted)' }}>
            <Download size={11} /> CSV
          </button>

          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Column Picker ─────────────────────────────────────────────────── */}
      {showColPanel && (
        <div className="border-b px-4 py-3 shrink-0"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {COLUMN_GROUPS.map(g => (
              <div key={g.group} className="flex flex-col gap-1 min-w-[110px]">
                <label className="flex items-center gap-1.5 cursor-pointer mb-0.5">
                  <input type="checkbox"
                    checked={g.cols.filter(c => !c.always).every(c => visibleCols.has(c.key))}
                    onChange={() => {
                      const gc    = g.cols.filter(c => !c.always);
                      const allOn = gc.every(c => visibleCols.has(c.key));
                      setVisibleCols(prev => {
                        const n = new Set(prev);
                        gc.forEach(c => allOn ? n.delete(c.key) : n.add(c.key));
                        return n;
                      });
                    }}
                    className="w-3 h-3 accent-indigo-500" />
                  <span className={`text-[9px] font-black uppercase tracking-wider ${g.color}`}>{g.label}</span>
                </label>
                <div className="flex flex-col gap-0.5 ml-4">
                  {g.cols.map(col => (
                    <label key={col.key} className="flex items-center gap-1.5 cursor-pointer group">
                      <input type="checkbox" checked={visibleCols.has(col.key)}
                        onChange={() => !col.always && toggleCol(col.key)} disabled={col.always}
                        className="w-3 h-3 accent-indigo-500" />
                      <span className={`text-[10px] transition-colors ${visibleCols.has(col.key) ? 'text-slate-300' : 'text-slate-600'} group-hover:text-slate-200`}>
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2.5">
            <button onClick={() => setVisibleCols(new Set(ALL_COL_KEYS))} className="text-[9px] text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">Select all</button>
            <span style={{ color: 'var(--border-muted)' }}>·</span>
            <button onClick={() => setVisibleCols(new Set(ALL_COL_KEYS.filter(k => COL_META[k]?.always)))} className="text-[9px] cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>Clear indicators</button>
            <span style={{ color: 'var(--border-muted)' }}>·</span>
            <button onClick={() => setVisibleCols(DEFAULT_VISIBLE)} className="text-[9px] cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>Reset to default</button>
          </div>
        </div>
      )}

      {/* ── Table body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto" ref={tableBodyRef}>
        {loading && (
          <div className="flex items-center justify-center h-32 gap-2">
            <RefreshCw size={16} className="text-indigo-400 animate-spin" />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading {interval.toUpperCase()} candles…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-xs text-rose-400">{error}</p>
            <button onClick={() => fetchData(symbol, exchange, interval)} className="text-[10px] text-indigo-400 hover:underline cursor-pointer">Retry</button>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
              <tr>
                <Th>#</Th>
                <Th>Time</Th>
                {visKeys.map(k => <Th key={k} right={k !== 'timestamp'}>{COL_META[k]?.label || k}</Th>)}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--bg-elevated)' }}>
              {rows.map((c, idx) => {
                // `i` = index in the chronological `candles` array
                const i      = candles.length - 1 - idx;
                const isLive = idx === 0;
                return (
                  <tr key={c.timestamp}
                    className="transition-colors"
                    style={{
                      background:  isLive ? 'rgba(99,102,241,0.06)' : undefined,
                      borderLeft:  isLive ? '2px solid #6366f1'     : undefined,
                    }}>
                    <Td style={{ color: 'var(--text-faint)', paddingLeft: '12px' }}>
                      {isLive
                        ? <span className="text-[8px] font-black text-indigo-400 uppercase tracking-wider">LIVE</span>
                        : idx + 1}
                    </Td>
                    <Td style={{ color: 'var(--text-secondary)' }}>{fmtTime(c.timestamp, interval)}</Td>

                    {visKeys.map(k => {
                      if (['open', 'high', 'low', 'close', 'volume'].includes(k)) {
                        const v   = +c[k];
                        const cls = k === 'close'  ? (+c.close >= +c.open ? 'text-right text-emerald-400' : 'text-right text-rose-400')
                                  : k === 'high'   ? 'text-right text-emerald-400'
                                  : k === 'low'    ? 'text-right text-rose-400'
                                  : k === 'volume' ? 'text-right text-sky-400'
                                  : 'text-right';
                        return (
                          <Td key={k} className={cls} style={k === 'open' ? { color: 'var(--text-primary)' } : {}}>
                            {k === 'volume' ? fmtVol(v) : p(v)}
                          </Td>
                        );
                      }
                      if (k === 'chg') {
                        const v = c.open ? ((+c.close - +c.open) / +c.open * 100) : 0;
                        return (
                          <Td key={k}
                            className={`text-right ${v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : ''}`}
                            style={v === 0 ? { color: 'var(--text-muted)' } : {}}>
                            {(v >= 0 ? '+' : '') + p(v)}%
                          </Td>
                        );
                      }
                      return renderCell(k, getVal(k, i));
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer stats ──────────────────────────────────────────────────── */}
      {stats && !loading && (
        <div className="flex items-center gap-5 px-4 py-2 border-t shrink-0 flex-wrap"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Rows: <b style={{ color: 'var(--text-secondary)' }}>{rows.length}</b></span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Avg Close: <b className="text-slate-300">₹{p(stats.avgClose)}</b></span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>High: <b className="text-emerald-400">₹{p(stats.maxHigh)}</b></span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Low: <b className="text-rose-400">₹{p(stats.minLow)}</b></span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Total Vol: <b className="text-sky-400">{fmtVol(stats.totalVol)}</b></span>
          <span className="text-[9px] ml-auto" style={{ color: 'var(--text-faint)' }}>
            {visKeys.length} indicator cols · Server-side computation ✓
          </span>
        </div>
      )}
    </div>
  );
}
