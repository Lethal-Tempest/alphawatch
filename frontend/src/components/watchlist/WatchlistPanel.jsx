// frontend/src/components/watchlist/WatchlistPanel.jsx
import { useState, useEffect, useRef } from 'react';
import {
  Trash2, BarChart2, Table2, Bell,
  TrendingUp, TrendingDown, Minus, Loader2,
} from 'lucide-react';
import { fetchIndicators } from '../../services/api';

const fmt2 = (n) => (n != null && !isNaN(n)) ? Number(n).toFixed(2) : '—';
const fmtI = (n) => (n != null && !isNaN(n)) ? Number(n).toFixed(1) : '—';
const fmtV = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(1) + ' Cr';
  if (n >= 1_00_000)    return (n / 1_00_000).toFixed(1) + ' L';
  if (n >= 1_000)       return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

// ── Per-stock live row ────────────────────────────────────────────────────────
function StockRow({ symbol, exchange, initialTick, socket, onOpenChart, onOpenTable, onOpenAlert, onRemove }) {
  const [tick, setTick]       = useState(initialTick || null);
  const [indicators, setInd]  = useState({ sma20: null, ema20: null, rsi14: null });
  const [flash, setFlash]     = useState(null);
  const [loading, setLoading] = useState(true);
  const prevLtp               = useRef(null);
  const flashTimer            = useRef(null);

  // ── Sync tick with initialTick ─────────────────────────────────────────────
  useEffect(() => {
    if (initialTick) {
      setTick(initialTick);
      prevLtp.current = initialTick.ltp;
    }
  }, [initialTick]);

  // ── Hydrate from REST + fetch indicators ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch indicators from backend — last values only needed for chips
        const indData = await fetchIndicators(exchange, symbol, '5m');
        if (!cancelled && indData) {
          const last = (arr) => arr ? arr[arr.length - 1] : null;
          setInd({
            sma20: last(indData.sma20),
            ema20: last(indData.ema20),
            rsi14: last(indData.rsi14),
          });
        }
      } catch (_) {}

      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [symbol, exchange]);

  // ── Real-time tick ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const tickHandler = (data) => {
      if (data.symbol !== symbol || data.exchange !== exchange) return;
      if (prevLtp.current != null) {
        const dir = data.ltp > prevLtp.current ? 'up' : data.ltp < prevLtp.current ? 'down' : null;
        if (dir) {
          setFlash(dir);
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(null), 600);
        }
      }
      prevLtp.current = data.ltp;
      setTick(data);
    };
    socket.on('tick', tickHandler);
    return () => { socket.off('tick', tickHandler); clearTimeout(flashTimer.current); };
  }, [socket, symbol, exchange]);

  const pct    = tick?.percentChange ?? 0;
  const isUp   = pct > 0;
  const isDown = pct < 0;

  const ltpClass = flash === 'up' ? 'text-emerald-300 font-extrabold' : flash === 'down' ? 'text-rose-300 font-extrabold'
                 : isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : '';

  const rsi = indicators.rsi14;
  const rsiClass = rsi == null ? '' : rsi >= 70 ? 'text-rose-400' : rsi <= 30 ? 'text-emerald-400' : 'text-slate-300';

  return (
    <tr
      className="border-b transition-all duration-200 hover:bg-slate-900/40"
      style={{
        borderColor: 'var(--border-base)',
        background: flash === 'up' ? 'rgba(34,197,94,0.04)' : flash === 'down' ? 'rgba(239,68,68,0.04)' : '',
      }}
    >
      <td className="px-4 py-3 font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>
        {symbol}
      </td>
      <td className="px-4 py-3 text-xs">
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          {exchange}
        </span>
      </td>
      <td className={`px-4 py-3 text-right font-black tabular-nums text-xs transition-colors duration-150 ${ltpClass}`}
          style={!ltpClass ? { color: 'var(--text-primary)' } : {}}>
        {loading && !tick ? (
          <Loader2 size={10} className="animate-spin inline-block" style={{ color: 'var(--text-faint)' }} />
        ) : (
          `₹${fmt2(tick?.ltp)}`
        )}
      </td>
      <td className={`px-4 py-3 text-right font-bold text-xs tabular-nums ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : ''}`}
          style={!isUp && !isDown ? { color: 'var(--text-muted)' } : {}}>
        {loading && !tick ? '—' : (
          <span className="flex items-center justify-end gap-1">
            {isUp ? <TrendingUp size={10} /> : isDown ? <TrendingDown size={10} /> : <Minus size={10} />}
            {pct >= 0 ? '+' : ''}{fmt2(pct)}%
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-sky-400">
        {fmtV(tick?.volume)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-amber-500">
        {loading ? '—' : `₹${fmt2(indicators.sma20)}`}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-purple-400">
        {loading ? '—' : `₹${fmt2(indicators.ema20)}`}
      </td>
      <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${rsiClass || 'text-slate-300'}`}>
        {loading ? '—' : fmtI(indicators.rsi14)}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={() => onOpenChart(symbol, exchange)} title="Open Chart"
            className="p-1.5 hover:text-indigo-400 cursor-pointer rounded-lg hover:bg-indigo-500/10 transition-colors text-slate-400">
            <BarChart2 size={13} />
          </button>
          <button onClick={() => onOpenTable(symbol, exchange)} title="View Depth Table"
            className="p-1.5 hover:text-sky-400 cursor-pointer rounded-lg hover:bg-sky-500/10 transition-colors text-slate-400">
            <Table2 size={13} />
          </button>
          <button onClick={() => onOpenAlert(symbol, exchange)} title="Create Alert"
            className="p-1.5 hover:text-amber-400 cursor-pointer rounded-lg hover:bg-amber-500/10 transition-colors text-slate-400">
            <Bell size={13} />
          </button>
          <button onClick={() => onRemove(symbol)} title="Remove from Watchlist"
            className="p-1.5 hover:text-rose-400 cursor-pointer rounded-lg hover:bg-rose-500/10 transition-colors text-slate-400">
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main WatchlistPanel ───────────────────────────────────────────────────────
export default function WatchlistPanel({ stocks, quotes, socket, onOpenChart, onOpenTable, onOpenAlert, onRemove }) {
  return (
    <div className="w-full overflow-hidden border rounded-xl" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Exchange</th>
              <th className="px-4 py-3 text-right">LTP (₹)</th>
              <th className="px-4 py-3 text-right">Change (%)</th>
              <th className="px-4 py-3 text-right">Volume</th>
              <th className="px-4 py-3 text-right text-amber-500">SMA20 (₹)</th>
              <th className="px-4 py-3 text-right text-purple-400">EMA20 (₹)</th>
              <th className="px-4 py-3 text-right text-indigo-400">RSI14</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!stocks || stocks.length === 0) ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
                  No stocks in this watchlist yet. Use Search above to find and add stocks.
                </td>
              </tr>
            ) : (
              stocks.map(s => {
                const key = `${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`;
                return (
                  <StockRow key={key}
                    symbol={s.symbol} exchange={s.exchange}
                    initialTick={quotes[key]}
                    socket={socket}
                    onOpenChart={onOpenChart}
                    onOpenTable={onOpenTable}
                    onOpenAlert={onOpenAlert}
                    onRemove={onRemove}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
