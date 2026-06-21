// frontend/src/components/watchlist/WatchlistDashboard.jsx
import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Table2, Bell, Trash2, Loader2, RefreshCw
} from 'lucide-react';
import api, { fetchIndicators, invalidateIndicatorCache } from '../../services/api';

const fmt2 = (n) => (n != null && !isNaN(n)) ? Number(n).toFixed(2) : '—';
const fmtI = (n) => (n != null && !isNaN(n)) ? Number(n).toFixed(1) : '—';
const fmtV = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(1) + ' Cr';
  if (n >= 1_00_000)    return (n / 1_00_00_000).toFixed(1) + ' L';
  if (n >= 1_000)       return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

export default function WatchlistDashboard({
  watchlists,
  selectedId,
  socket,
  onOpenChart,
  onOpenTable,
  onOpenAlert,
  onRemoveStock,
}) {
  const [timeframe, setTimeframe] = useState('5m');
  const [quotes, setQuotes] = useState({});
  const [indicators, setIndicators] = useState({});
  const [loading, setLoading] = useState(false);
  const [flashes, setFlashes] = useState({});

  const prevLtps = useRef({});
  const flashTimers = useRef({});
  const current = watchlists.find((w) => w._id === selectedId);

  // ── Fetch batch quotes and indicators when watchlist or timeframe changes ──
  useEffect(() => {
    if (!current?.stocks || current.stocks.length === 0) {
      setQuotes({});
      setIndicators({});
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Fetch batch quotes (instant)
        const payload = current.stocks.map((s) => ({ symbol: s.symbol, exchange: s.exchange }));
        const quoteRes = await api.post('/stock/quotes', { stocks: payload });
        
        if (cancelled) return;

        const newQuotes = {};
        if (quoteRes.data?.success && quoteRes.data.quotes) {
          quoteRes.data.quotes.forEach((q) => {
            const key = `${q.exchange.toUpperCase()}:${q.symbol.toUpperCase()}`;
            newQuotes[key] = {
              ...q.metrics,
              ltp: q.metrics.lastPrice,
            };
            prevLtps.current[key] = q.metrics.lastPrice;
          });
          setQuotes(newQuotes);
        }

        // Set loading to false early so user sees prices instantly in msec!
        setLoading(false);

        // Reset indicators state to loading representation before starting fetches
        setIndicators({});

        // 2. Fetch indicators for all stocks progressively
        current.stocks.forEach(async (s) => {
          const key = `${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`;
          try {
            const indData = await fetchIndicators(s.exchange, s.symbol, timeframe);
            if (cancelled) return;
            const last = (arr) => (arr && arr.length > 0) ? arr[arr.length - 1] : null;
            setIndicators((prev) => ({
              ...prev,
              [key]: {
                sma20: last(indData.sma20),
                ema20: last(indData.ema20),
                rsi14: last(indData.rsi14),
              },
            }));
          } catch (err) {
            console.error(`Failed to fetch indicators progressively for ${key}:`, err);
          }
        });
      } catch (err) {
        console.error('Error loading watchlist dashboard data:', err);
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [current?.stocks, timeframe]);

  // ── Handle real-time socket tick updates ──
  useEffect(() => {
    if (!socket) return;

    const handleTick = (data) => {
      const key = `${data.exchange.toUpperCase()}:${data.symbol.toUpperCase()}`;
      
      // Update quote
      setQuotes((prev) => {
        if (!prev[key]) return prev;
        return {
          ...prev,
          [key]: {
            ...prev[key],
            ltp: data.ltp,
            volume: data.volume,
            percentChange: data.percentChange,
            open: data.open,
            high: data.high,
            low: data.low,
            prevClose: data.prevClose,
          },
        };
      });

      // Handle flash transition
      const prevLtp = prevLtps.current[key];
      if (prevLtp != null && data.ltp !== prevLtp) {
        const dir = data.ltp > prevLtp ? 'up' : 'down';
        setFlashes((prev) => ({ ...prev, [key]: dir }));
        clearTimeout(flashTimers.current[key]);
        flashTimers.current[key] = setTimeout(() => {
          setFlashes((prev) => ({ ...prev, [key]: null }));
        }, 600);
      }
      prevLtps.current[key] = data.ltp;
    };

    socket.on('tick', handleTick);
    return () => {
      socket.off('tick', handleTick);
      // Clean up all flash timers
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, [socket]);

  // ── Handle real-time candle updates to refresh indicators ──
  useEffect(() => {
    if (!socket) return;

    const handleCandleUpdate = async (data) => {
      // data: { key, interval, candle }
      if (data.interval !== timeframe) return;
      const [exchange, symbol] = data.key.split(':');
      
      try {
        invalidateIndicatorCache(exchange, symbol, timeframe);
        const indData = await fetchIndicators(exchange, symbol, timeframe);
        const last = (arr) => (arr && arr.length > 0) ? arr[arr.length - 1] : null;

        setIndicators((prev) => ({
          ...prev,
          [data.key]: {
            sma20: last(indData.sma20),
            ema20: last(indData.ema20),
            rsi14: last(indData.rsi14),
          },
        }));
      } catch (err) {
        console.error(`Failed to refresh indicator on candle update for ${data.key}:`, err);
      }
    };

    socket.on('candle_update', handleCandleUpdate);
    return () => {
      socket.off('candle_update', handleCandleUpdate);
    };
  }, [socket, timeframe]);

  if (!current) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
          Please select or create a watchlist to view the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border-base)' }}>
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {current.name} Dashboard
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {current.stocks?.length || 0} stocks tracked in this watchlist
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/20 p-0.5 rounded-lg border" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}>
            {['1m', '5m', '15m', '30m', '1h', '1d'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all ${
                  timeframe === tf
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'hover:text-indigo-400'
                }`}
                style={timeframe !== tf ? { color: 'var(--text-muted)' } : {}}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Loading Indicator / Manual Refresh */}
          <div className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer"
               style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-base)', color: 'var(--text-secondary)' }}
               onClick={() => setTimeframe((t) => t)} // Trigger reload
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin text-indigo-400" />
            ) : (
              <RefreshCw size={14} className="hover:text-indigo-400 transition-colors" />
            )}
          </div>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="flex-1 overflow-auto border rounded-xl" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-surface)' }}>
        {(!current.stocks || current.stocks.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <BarChart2 size={44} style={{ color: 'var(--bg-elevated)' }} />
            <div className="text-center">
              <p className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>No stocks in this watchlist yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Use the search box at the top to add stocks.</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Symbol</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>LTP</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Change %</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Open</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>High</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Low</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Prev Close</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Volume</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-amber-400" style={{ borderColor: 'var(--border-base)' }}>SMA 20</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-purple-400" style={{ borderColor: 'var(--border-base)' }}>EMA 20</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-sky-400" style={{ borderColor: 'var(--border-base)' }}>RSI 14</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-base)' }}>
              {current.stocks.map((stock) => {
                const key = `${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`;
                const quote = quotes[key];
                const ind = indicators[key] || { sma20: null, ema20: null, rsi14: null };
                const flash = flashes[key];

                const pct = quote?.percentChange ?? 0;
                const isUp = pct > 0;
                const isDown = pct < 0;

                const ltpClass = flash === 'up' ? 'text-emerald-300'
                               : flash === 'down' ? 'text-rose-300'
                               : isUp ? 'text-emerald-400'
                               : isDown ? 'text-rose-400' : '';

                const rsiVal = ind.rsi14;
                const rsiClass = rsiVal == null ? ''
                               : rsiVal >= 70 ? 'text-red-400 font-bold'
                               : rsiVal <= 30 ? 'text-emerald-400 font-bold'
                               : 'text-slate-300';

                return (
                  <tr
                    key={key}
                    className="hover:bg-slate-500/5 transition-colors duration-150"
                    style={{
                      background: flash === 'up' ? 'rgba(34,197,94,0.03)' : flash === 'down' ? 'rgba(239,68,68,0.03)' : 'transparent'
                    }}
                  >
                    {/* Symbol */}
                    <td className="p-3 font-black">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--text-primary)' }}>{stock.symbol}</span>
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                          {stock.exchange}
                        </span>
                      </div>
                    </td>

                    {/* LTP */}
                    <td className={`p-3 font-mono font-bold transition-colors duration-150 ${ltpClass}`}
                        style={!ltpClass ? { color: 'var(--text-primary)' } : {}}>
                      ₹{fmt2(quote?.ltp)}
                    </td>

                    {/* Change % */}
                    <td className="p-3">
                      <span className={`font-mono font-bold flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : ''}`}
                            style={!isUp && !isDown ? { color: 'var(--text-muted)' } : {}}>
                        {isUp ? <TrendingUp size={10} /> : isDown ? <TrendingDown size={10} /> : <Minus size={10} />}
                        {pct >= 0 ? '+' : ''}{fmt2(pct)}%
                      </span>
                    </td>

                    {/* Open */}
                    <td className="p-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      ₹{fmt2(quote?.open)}
                    </td>

                    {/* High */}
                    <td className="p-3 font-mono text-emerald-400/90">
                      ₹{fmt2(quote?.high)}
                    </td>

                    {/* Low */}
                    <td className="p-3 font-mono text-rose-400/90">
                      ₹{fmt2(quote?.low)}
                    </td>

                    {/* Prev Close */}
                    <td className="p-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      ₹{fmt2(quote?.prevClose)}
                    </td>

                    {/* Volume */}
                    <td className="p-3 font-mono" style={{ color: 'var(--text-muted)' }}>
                      {fmtV(quote?.volume)}
                    </td>

                    {/* SMA 20 */}
                    <td className="p-3 font-mono text-amber-400/80">
                      ₹{fmt2(ind.sma20)}
                    </td>

                    {/* EMA 20 */}
                    <td className="p-3 font-mono text-purple-400/80">
                      ₹{fmt2(ind.ema20)}
                    </td>

                    {/* RSI 14 */}
                    <td className={`p-3 font-mono ${rsiClass}`}>
                      {fmtI(rsiVal)}
                    </td>

                    {/* Actions */}
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenChart(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-indigo-400 hover:bg-indigo-500/10"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}
                          title="Open Interactive Chart"
                        >
                          <BarChart2 size={13} />
                        </button>
                        <button
                          onClick={() => onOpenTable(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-sky-400 hover:bg-sky-500/10"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}
                          title="View Data Table"
                        >
                          <Table2 size={13} />
                        </button>
                        <button
                          onClick={() => onOpenAlert(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-amber-400 hover:bg-amber-500/10"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}
                          title="Set / View Alerts"
                        >
                          <Bell size={13} />
                        </button>
                        <button
                          onClick={() => onRemoveStock(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-rose-400 hover:bg-rose-500/10"
                          style={{ color: 'var(--text-faint)', borderColor: 'var(--border-base)' }}
                          title="Remove from Watchlist"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
