
import { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import api from '../../services/api';

const fmt  = (n, d = 2) => n != null ? Number(n).toFixed(d) : '—';
const fmtV = (n) => {
  if (n == null) return '—';
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(2) + ' Cr';
  if (n >= 1_00_000)    return (n / 1_00_000).toFixed(2) + ' L';
  return Number(n).toLocaleString('en-IN');
};

function StatPill({ label, value, valueClass = '' }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5"
            style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className={`text-xs font-mono font-semibold leading-none tabular-nums ${valueClass}`}
            style={!valueClass ? { color: 'var(--text-primary)' } : {}}>{value}</span>
    </div>
  );
}

export default function LiveTickerBar({ symbol, exchange, socket }) {
  const [tick, setTick]             = useState(null);
  const [flash, setFlash]           = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevLtp                     = useRef(null);
  const flashTimer                  = useRef(null);

  useEffect(() => {
    if (!symbol || !exchange) { setTick(null); return; }
    setTick(null); prevLtp.current = null;
    api.get(`/stock/${exchange}/${symbol}`)
      .then(({ data }) => {
        if (data?.metrics) {
          setTick({
            ltp: data.metrics.lastPrice, open: data.metrics.open, high: data.metrics.high,
            low: data.metrics.low, prevClose: data.metrics.prevClose,
            volume: data.metrics.volume, percentChange: data.metrics.percentChange,
          });
          setLastUpdated(new Date());
          prevLtp.current = data.metrics.lastPrice;
        }
      }).catch(() => {});
  }, [symbol, exchange]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data.symbol !== symbol || data.exchange !== exchange) return;
      if (prevLtp.current != null) {
        const dir = data.ltp > prevLtp.current ? 'up' : data.ltp < prevLtp.current ? 'down' : null;
        if (dir) {
          setFlash(dir);
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(null), 500);
        }
      }
      prevLtp.current = data.ltp;
      setTick(data); setLastUpdated(new Date());
    };
    socket.on('tick', handler);
    return () => { socket.off('tick', handler); clearTimeout(flashTimer.current); };
  }, [socket, symbol, exchange]);

  if (!symbol) return null;

  const pct    = tick?.percentChange ?? 0;
  const isUp   = pct > 0;
  const isDown = pct < 0;

  const ltpColor = flash === 'up'   ? 'text-emerald-400'
                 : flash === 'down' ? 'text-rose-400'
                 : isUp             ? 'text-emerald-400'
                 : isDown           ? 'text-rose-400'
                 : '';

  return (
    <div
      className="w-full rounded-xl border px-4 py-3 flex items-center gap-6 flex-wrap transition-colors duration-300"
      style={{
        background: flash === 'up' ? 'rgba(34,197,94,0.04)' : flash === 'down' ? 'rgba(239,68,68,0.04)' : 'var(--bg-surface)',
        borderColor: 'var(--border-base)',
      }}
    >
      {/* Symbol */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-base font-black tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{exchange}</span>
      </div>

      <div className="w-px h-8 shrink-0" style={{ background: 'var(--border-base)' }} />

      {/* LTP */}
      <div className="flex items-baseline gap-2 shrink-0">
        <span className={`text-2xl font-black tabular-nums transition-colors duration-200 ${ltpColor}`}
              style={!ltpColor ? { color: 'var(--text-primary)' } : {}}>
          ₹{tick ? fmt(tick.ltp, 2) : '—'}
        </span>
        <div className={`flex items-center gap-0.5 text-xs font-bold ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : ''}`}
             style={!isUp && !isDown ? { color: 'var(--text-muted)' } : {}}>
          {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : <Minus size={12} />}
          <span>{pct >= 0 ? '+' : ''}{fmt(pct, 2)}%</span>
        </div>
      </div>

      <div className="w-px h-8 shrink-0" style={{ background: 'var(--border-base)' }} />

      {/* OHLCV pills */}
      <div className="flex items-center gap-4 flex-wrap">
        <StatPill label="Open"       value={tick ? `₹${fmt(tick.open)}` : '—'} />
        <StatPill label="High"       value={tick ? `₹${fmt(tick.high)}` : '—'} valueClass="text-emerald-400" />
        <StatPill label="Low"        value={tick ? `₹${fmt(tick.low)}` : '—'}  valueClass="text-rose-400" />
        <StatPill label="Prev Close" value={tick ? `₹${fmt(tick.prevClose)}` : '—'} />
        <StatPill label="Volume"     value={tick ? fmtV(tick.volume) : '—'} valueClass="text-sky-400" />
      </div>

      <div className="flex-1" />

      {lastUpdated && (
        <div className="flex items-center gap-1 text-[9px] font-mono shrink-0" style={{ color: 'var(--text-faint)' }}>
          <Clock size={9} />
          <span>{lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
      </div>
    </div>
  );
}
