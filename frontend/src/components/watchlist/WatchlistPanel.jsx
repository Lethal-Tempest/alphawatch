
// frontend/src/components/watchlist/WatchlistPanel.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, ChevronDown, BarChart2, Table2,
  TrendingUp, TrendingDown, Minus, Loader2,
} from 'lucide-react';
import api, { fetchIndicators } from '../../services/api';

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
function StockRow({ symbol, exchange, socket, onOpenChart, onOpenTable, onRemove }) {
  const [tick, setTick]       = useState(null);
  const [indicators, setInd]  = useState({ sma20: null, ema20: null, rsi14: null });
  const [flash, setFlash]     = useState(null);
  const [loading, setLoading] = useState(true);
  const prevLtp               = useRef(null);
  const flashTimer            = useRef(null);

  // ── Hydrate from REST + fetch indicators ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: qd } = await api.get(`/stock/${exchange}/${symbol}`);
        if (!cancelled && qd?.metrics) {
          setTick({
            ltp: qd.metrics.lastPrice, open: qd.metrics.open, high: qd.metrics.high,
            low: qd.metrics.low, prevClose: qd.metrics.prevClose,
            volume: qd.metrics.volume, percentChange: qd.metrics.percentChange,
          });
          prevLtp.current = qd.metrics.lastPrice;
        }
      } catch (_) {}

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

  const ltpClass = flash === 'up' ? 'text-emerald-300' : flash === 'down' ? 'text-rose-300'
                 : isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : '';

  const rsi = indicators.rsi14;
  const rsiClass = rsi == null ? '' : rsi >= 70 ? 'text-red-400' : rsi <= 30 ? 'text-emerald-400' : 'text-slate-300';

  return (
    <div
      className="group relative border rounded-xl transition-colors duration-300"
      style={{
        background: flash === 'up' ? 'rgba(34,197,94,0.04)' : flash === 'down' ? 'rgba(239,68,68,0.04)' : 'var(--bg-surface)',
        borderColor: 'var(--border-base)',
      }}
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-black tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
          <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {exchange}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          {loading && !tick ? (
            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-faint)' }} />
          ) : (
            <>
              <span className={`text-sm font-black tabular-nums transition-colors duration-150 ${ltpClass}`}
                    style={!ltpClass ? { color: 'var(--text-primary)' } : {}}>
                ₹{fmt2(tick?.ltp)}
              </span>
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : ''}`}
                    style={!isUp && !isDown ? { color: 'var(--text-muted)' } : {}}>
                {isUp ? <TrendingUp size={9} /> : isDown ? <TrendingDown size={9} /> : <Minus size={9} />}
                {pct >= 0 ? '+' : ''}{fmt2(pct)}%
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
        <IndicatorChip label="SMA20" value={`₹${fmt2(indicators.sma20)}`} color="text-amber-400" />
        <IndicatorChip label="EMA20" value={`₹${fmt2(indicators.ema20)}`} color="text-purple-400" />
        <IndicatorChip label="RSI14" value={fmtI(indicators.rsi14)} color={rsiClass || 'text-slate-300'} />
        <IndicatorChip label="Vol" value={fmtV(tick?.volume)} color="text-sky-400" />
      </div>

      <div className="flex items-center border-t divide-x" style={{ borderColor: 'var(--border-base)' }}>
        <button onClick={() => onOpenChart(symbol, exchange)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold transition-colors cursor-pointer rounded-bl-xl hover:text-indigo-400 hover:bg-indigo-500/5"
          style={{ color: 'var(--text-muted)' }}>
          <BarChart2 size={11} /> Chart
        </button>
        <button onClick={() => onOpenTable(symbol, exchange)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold transition-colors cursor-pointer hover:text-sky-400 hover:bg-sky-500/5"
          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}>
          <Table2 size={11} /> Data Table
        </button>
        <button onClick={() => onRemove(symbol)}
          className="flex items-center justify-center px-3 py-1.5 transition-colors cursor-pointer rounded-br-xl hover:text-rose-400 hover:bg-rose-500/5"
          style={{ color: 'var(--text-faint)', borderColor: 'var(--border-base)' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

function IndicatorChip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className={`text-[9px] font-mono font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

// ── Main WatchlistPanel ───────────────────────────────────────────────────────
export default function WatchlistPanel({ watchlists, selectedId, onSelect, onRefresh, socket, onOpenChart, onOpenTable }) {
  const [newName, setNewName] = useState('');
  const current = watchlists.find(w => w._id === selectedId);

  const createWatchlist = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.post('/watchlists', { name: newName.trim() });
      setNewName(''); onRefresh();
    } catch {}
  };

  const removeStock = async (symbol) => {
    try { await api.delete(`/watchlists/${selectedId}/stocks/${symbol}`); onRefresh(); } catch {}
  };

  const deleteWatchlist = async () => {
    if (!window.confirm(`Delete "${current?.name}"?`)) return;
    try { await api.delete(`/watchlists/${selectedId}`); onRefresh(); } catch {}
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <form onSubmit={createWatchlist} className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New watchlist…"
          className="flex-1 border rounded-xl px-3 py-1.5 text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }} />
        <button type="submit" className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer transition-colors">
          <Plus size={14} />
        </button>
      </form>

      {watchlists.length > 0 && (
        <div className="relative">
          <select value={selectedId} onChange={e => onSelect(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-xs font-bold appearance-none focus:outline-none cursor-pointer"
            style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>
            {watchlists.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {(!current?.stocks || current.stocks.length === 0) && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <BarChart2 size={28} style={{ color: 'var(--bg-elevated)' }} />
            <p className="text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>No stocks yet.<br />Use search to add stocks.</p>
          </div>
        )}
        {current?.stocks?.map(s => (
          <StockRow key={`${s.exchange}:${s.symbol}`}
            symbol={s.symbol} exchange={s.exchange}
            socket={socket} onOpenChart={onOpenChart} onOpenTable={onOpenTable} onRemove={removeStock} />
        ))}
      </div>

      {current && current.stocks?.length === 0 && (
        <button onClick={deleteWatchlist}
          className="text-[10px] text-center cursor-pointer transition-colors pb-1 hover:text-rose-400"
          style={{ color: 'var(--text-faint)' }}>
          Delete this watchlist
        </button>
      )}
    </div>
  );
}
