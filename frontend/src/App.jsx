
// ─────────────────────────────────────────────────────────────────────────────
// frontend/src/App.jsx — AlphaWatch Dashboard
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TradingChart    from './components/chart/TradingChart';
import WatchlistPanel  from './components/watchlist/WatchlistPanel';
import AlertsPanel     from './components/alerts/AlertsPanel';
import SearchBar       from './components/search/SearchBar';
import AuthModal       from './components/auth/AuthModal';
import LiveTickerBar   from './components/ticker/Livetickerbar';
import StockDataTable  from './components/datatable/Stockdatatable';
import { useSocket }   from './services/useSocket';
import { useTheme }    from './contexts/ThemeContext';
import api             from './services/api';
import { LogOut, BarChart2, Plus, Minus, Table2, ChevronDown, Sun, Moon } from 'lucide-react';

// ── Indicator definitions ─────────────────────────────────────────────────────
const INDICATOR_GROUPS = [
  {
    group: 'SMA', label: 'SMA', color: 'text-amber-400 border-amber-700 bg-amber-950/30',
    items: [
      { key: 'SMA20', label: '20' }, { key: 'SMA50', label: '50' },
      { key: 'SMA100', label: '100' }, { key: 'SMA200', label: '200' },
    ],
  },
  {
    group: 'EMA', label: 'EMA', color: 'text-purple-400 border-purple-700 bg-purple-950/30',
    items: [
      { key: 'EMA20', label: '20' }, { key: 'EMA50', label: '50' },
      { key: 'EMA100', label: '100' }, { key: 'EMA200', label: '200' },
    ],
  },
  {
    group: 'overlay', label: 'Overlay', color: 'text-slate-400 border-slate-600 bg-slate-800/30',
    items: [{ key: 'BB', label: 'BB' }],
  },
  {
    group: 'panels', label: 'Panels', color: 'text-sky-400 border-sky-700 bg-sky-950/30',
    items: [
      { key: 'RSI', label: 'RSI' }, { key: 'MACD', label: 'MACD' },
      { key: 'ADX', label: 'ADX/DI' }, { key: 'MFI', label: 'MFI' },
      { key: 'SMI', label: 'SMI' },
      { key: 'DELTASMI', label: 'Delta SMI' },
      { key: 'DELTASMI_SIGNAL', label: 'Delta SMI Signal' },
      { key: 'SMI_DIST', label: 'SMI Dist' },
      { key: 'DELTASMI_DIST', label: 'Delta SMI Dist' },
    ],
  },
];

const ALL_INDICATOR_KEYS = INDICATOR_GROUPS.flatMap(g => g.items.map(i => i.key));

// ── Indicator Picker Dropdown ─────────────────────────────────────────────────
function IndicatorPicker({ activeIndicators, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
          open ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : ''
        }`}
        style={!open ? { background: 'var(--bg-surface)', borderColor: 'var(--border-muted)', color: 'var(--text-secondary)' } : {}}
      >
        <BarChart2 size={11} />
        Indicators
        {activeIndicators.length > 0 && (
          <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[8px] font-black">
            {activeIndicators.length}
          </span>
        )}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 border rounded-xl shadow-2xl p-3 min-w-[320px]"
             style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Chart Indicators</span>
            {activeIndicators.length > 0 && (
              <button
                onClick={() => ALL_INDICATOR_KEYS.forEach(k => activeIndicators.includes(k) && onToggle(k))}
                className="text-[9px] text-rose-400/70 hover:text-rose-400 cursor-pointer transition-colors"
              >Clear all</button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {INDICATOR_GROUPS.map(g => (
              <div key={g.group}>
                <span className={`text-[8px] font-black uppercase tracking-widest ${g.color.split(' ')[0]} mb-1 block`}>
                  {g.label}
                </span>
                <div className="flex flex-wrap gap-1">
                  {g.items.map(item => {
                    const active = activeIndicators.includes(item.key);
                    return (
                      <button key={item.key} onClick={() => onToggle(item.key)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-all ${
                          active ? g.color : ''
                        }`}
                        style={!active ? { color: 'var(--text-faint)', borderColor: 'var(--bg-elevated)' } : {}}>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Theme Toggle Button ───────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 rounded-lg border transition-all cursor-pointer"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-base)', color: 'var(--text-secondary)' }}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

export default function App() {
  const { socket, connected } = useSocket();
  const { theme }             = useTheme();

  const [user, setUser]                   = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeView, setActiveView]       = useState(null);
  const [watchlists, setWatchlists]       = useState([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState('');

  // ── Persisted state — survive reloads ──────────────────────────────────────
  const [activeIndicators, setActiveIndicators] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aw_indicators')) || ['SMA20', 'SMA50', 'RSI']; }
    catch { return ['SMA20', 'SMA50', 'RSI']; }
  });

  const [allCandles, setAllCandles]       = useState({});
  const [currentInterval, setCurrentInterval] = useState(
    () => localStorage.getItem('aw_interval') || '5m'
  );

  // Persist indicator choices
  useEffect(() => {
    localStorage.setItem('aw_indicators', JSON.stringify(activeIndicators));
  }, [activeIndicators]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUser({ id: payload.id, email: payload.email });
          fetchWatchlists();
        } else {
          localStorage.removeItem('token');
        }
      } catch { localStorage.removeItem('token'); }
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && socket && connected) socket.emit('authenticate', token);
  }, [user, socket, connected]);

  const fetchWatchlists = async () => {
    try {
      const { data } = await api.get('/watchlists');
      setWatchlists(data.watchlists || []);
      if (data.watchlists?.length > 0 && !selectedWatchlistId) {
        setSelectedWatchlistId(data.watchlists[0]._id);
      }
    } catch {}
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData); setShowAuthModal(false); fetchWatchlists();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null); setWatchlists([]); setSelectedWatchlistId(''); setActiveView(null);
  };

  const isInWatchlist = useMemo(() => {
    if (!activeView || !selectedWatchlistId) return false;
    const wl = watchlists.find(w => w._id === selectedWatchlistId);
    if (!wl) return false;
    return wl.stocks.some(s =>
      s.symbol === activeView.symbol.toUpperCase() && s.exchange === activeView.exchange.toUpperCase()
    );
  }, [activeView, selectedWatchlistId, watchlists]);

  const handleOpenChart = useCallback((symbol, exchange) => {
    if (activeView?.symbol !== symbol || activeView?.exchange !== exchange) {
      setAllCandles({});
    }
    setActiveView({ symbol, exchange, mode: 'chart' });
    if (socket) socket.emit('subscribe', { symbol, exchange });
  }, [activeView, socket]);

  const handleOpenTable = useCallback((symbol, exchange) => {
    setActiveView({ symbol, exchange, mode: 'table' });
    if (socket) socket.emit('subscribe', { symbol, exchange });
  }, [socket]);

  useEffect(() => {
    if (socket && connected && activeView) {
      socket.emit('subscribe', { symbol: activeView.symbol, exchange: activeView.exchange });
    }
  }, [socket, connected, activeView]);

  const handleAddToWatchlist = async (symbol, exchange) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!selectedWatchlistId) return;
    try { await api.post(`/watchlists/${selectedWatchlistId}/stocks`, { symbol, exchange }); fetchWatchlists(); } catch {}
  };

  const handleRemoveFromWatchlist = async (symbol, exchange) => {
    if (!user || !selectedWatchlistId) return;
    try { await api.delete(`/watchlists/${selectedWatchlistId}/stocks/${symbol.toUpperCase()}`); fetchWatchlists(); } catch {}
  };

  const handleCandlesChange = useCallback((iv, candles, liveCandle) => {
    setAllCandles(prev => {
      if (candles !== null) return { ...prev, [iv]: candles };
      if (!liveCandle) return prev;
      const existing = prev[iv] || [];
      const updated  = [...existing];
      const lastIdx  = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].timestamp === liveCandle.timestamp) {
        updated[lastIdx] = { ...updated[lastIdx], ...liveCandle };
      } else {
        updated.push({ ...liveCandle });
        if (updated.length > 500) updated.shift();
      }
      return { ...prev, [iv]: updated };
    });
  }, []);

  const toggleIndicator = (ind) => {
    setActiveIndicators(prev =>
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  };

  const isChartView = activeView?.mode === 'chart';
  const isTableView = activeView?.mode === 'table';
  const isDark      = theme === 'dark';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-4 py-2 border-b shrink-0 z-20 backdrop-blur-sm"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <BarChart2 size={18} className="text-indigo-400" />
          <span className="text-sm font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>AlphaWatch</span>
          <span className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
            connected ? 'text-emerald-400 border-emerald-800 bg-emerald-950/40' : 'text-rose-400 border-rose-800 bg-rose-950/40'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Search bar */}
        <div className="flex-1 max-w-lg mx-auto">
          <SearchBar onSelect={(s, e) => handleOpenChart(s, e)} onAddToWatchlist={handleAddToWatchlist} showAddButton={!!user} />
        </div>

        {/* Right controls */}
        <div className="shrink-0 flex items-center gap-2">
          {isChartView && (
            <IndicatorPicker activeIndicators={activeIndicators} onToggle={toggleIndicator} />
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Auth */}
          {user ? (
            <>
              <span className="text-[10px] font-mono hidden sm:block" style={{ color: 'var(--text-muted)' }}>{user.email}</span>
              <button onClick={handleLogout}
                className="p-1.5 rounded-lg transition-colors cursor-pointer hover:text-rose-400 hover:bg-rose-950/30"
                style={{ color: 'var(--text-muted)' }} title="Sign out">
                <LogOut size={14} />
              </button>
            </>
          ) : (
            <button onClick={() => setShowAuthModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors">
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── Main Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — watchlist */}
        <aside className="w-72 border-r flex flex-col overflow-hidden shrink-0"
               style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
          <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-base)' }}>
            <h2 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Watchlists</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {user ? (
              <WatchlistPanel
                watchlists={watchlists} selectedId={selectedWatchlistId}
                onSelect={setSelectedWatchlistId} onRefresh={fetchWatchlists}
                socket={socket} onOpenChart={handleOpenChart} onOpenTable={handleOpenTable}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                <BarChart2 size={32} style={{ color: 'var(--bg-elevated)' }} />
                <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
                  Sign in to save watchlists and get live stock data
                </p>
                <button onClick={() => setShowAuthModal(true)}
                  className="px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-bold rounded-xl cursor-pointer hover:bg-indigo-600/30 transition-colors">
                  Sign In
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!activeView && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <BarChart2 size={56} style={{ color: 'var(--bg-elevated)' }} />
              <div className="text-center">
                <p className="font-medium" style={{ color: 'var(--text-faint)' }}>Select a stock to get started</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-faint)', opacity: 0.6 }}>
                  Use Search above, or click Chart or Data Table on any watchlist stock
                </p>
              </div>
            </div>
          )}

          {isChartView && (
            <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
              <LiveTickerBar symbol={activeView.symbol} exchange={activeView.exchange} socket={socket} />

              {user && selectedWatchlistId && (
                <div className="flex items-center gap-2">
                  {isInWatchlist ? (
                    <button onClick={() => handleRemoveFromWatchlist(activeView.symbol, activeView.exchange)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/30 border border-rose-700/50 hover:border-rose-500 text-rose-400 hover:text-rose-300 text-xs font-bold rounded-xl cursor-pointer transition-colors">
                      <Minus size={12} /> Remove from Watchlist
                    </button>
                  ) : (
                    <button onClick={() => handleAddToWatchlist(activeView.symbol, activeView.exchange)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-xl cursor-pointer transition-colors hover:border-indigo-500 hover:text-indigo-400"
                      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)', color: 'var(--text-secondary)' }}>
                      <Plus size={12} /> Add to Watchlist
                    </button>
                  )}
                  <button onClick={() => setActiveView(v => ({ ...v, mode: 'table' }))}
                    className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-xl cursor-pointer transition-colors hover:border-sky-500 hover:text-sky-400"
                    style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)', color: 'var(--text-secondary)' }}>
                    <Table2 size={12} /> Data Table
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-hidden overflow-y-auto">
                <TradingChart
                  symbol={activeView.symbol} exchange={activeView.exchange}
                  socket={socket} activeIndicators={activeIndicators}
                  onCandlesChange={handleCandlesChange} onIntervalChange={setCurrentInterval}
                />
              </div>
            </div>
          )}

          {isTableView && (
            <div className="flex-1 overflow-hidden p-3">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setActiveView(v => ({ ...v, mode: 'chart' }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-xl cursor-pointer transition-colors hover:border-indigo-500 hover:text-indigo-400"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)', color: 'var(--text-secondary)' }}>
                  <BarChart2 size={12} /> View Chart
                </button>
              </div>
              <div className="h-full overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-base)' }}>
                <StockDataTable symbol={activeView.symbol} exchange={activeView.exchange} socket={socket} />
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar — Alerts */}
        <aside className="w-64 border-l p-3 flex flex-col gap-3 overflow-y-auto shrink-0"
               style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
          <h2 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Price Alerts</h2>
          {user ? (
            <AlertsPanel symbol={activeView?.symbol} exchange={activeView?.exchange} socket={socket} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>Sign in to create price alerts</p>
              <button onClick={() => setShowAuthModal(true)}
                className="px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-bold rounded-xl cursor-pointer hover:bg-indigo-600/30 transition-colors">
                Sign In
              </button>
            </div>
          )}
        </aside>
      </div>

      {showAuthModal && (
        <AuthModal onSuccess={handleAuthSuccess} onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  );
}
