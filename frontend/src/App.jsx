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
import WatchlistDashboard from './components/watchlist/WatchlistDashboard';
import BacktestDashboard from './components/backtest/BacktestDashboard';
import AutoTradeDashboard from './components/autotrade/AutoTradeDashboard';
import AiAssistant from './components/agent/AiAssistant';
import { useSocket }   from './services/useSocket';
import { useTheme }    from './contexts/ThemeContext';
import api             from './services/api';
import { LogOut, BarChart2, Plus, Minus, Table2, ChevronDown, Sun, Moon, Bell, X, Trash2 } from 'lucide-react';

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
  const [activeView, setActiveView]       = useState(() => {
    try {
      const saved = localStorage.getItem('aw_active_view');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [watchlists, setWatchlists]       = useState([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState(
    () => localStorage.getItem('aw_selected_watchlist_id') || ''
  );
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [activeMainTab, setActiveMainTab]       = useState(
    () => localStorage.getItem('aw_active_main_tab') || 'watchlist'
  );

  // Alerts sidebar state
  const [showAlertsSidebar, setShowAlertsSidebar] = useState(false);
  const [activeAlertStock, setActiveAlertStock]   = useState(null);

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
  const currentWatchlist = useMemo(() => {
    return watchlists.find(w => w._id === selectedWatchlistId);
  }, [watchlists, selectedWatchlistId]);

  useEffect(() => {
    localStorage.setItem('aw_indicators', JSON.stringify(activeIndicators));
  }, [activeIndicators]);

  useEffect(() => {
    if (activeView) {
      localStorage.setItem('aw_active_view', JSON.stringify(activeView));
    } else {
      localStorage.removeItem('aw_active_view');
    }
  }, [activeView]);

  useEffect(() => {
    if (selectedWatchlistId) {
      localStorage.setItem('aw_selected_watchlist_id', selectedWatchlistId);
    } else {
      localStorage.removeItem('aw_selected_watchlist_id');
    }
  }, [selectedWatchlistId]);

  useEffect(() => {
    localStorage.setItem('aw_active_main_tab', activeMainTab);
  }, [activeMainTab]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('request_token') || params.get('requestToken')) {
      setActiveMainTab('autotrade');
    }

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
      const list = data.watchlists || [];
      setWatchlists(list);

      const persistedWlId = localStorage.getItem('aw_selected_watchlist_id');
      if (list.length > 0) {
        if (persistedWlId && list.some(w => w._id === persistedWlId)) {
          setSelectedWatchlistId(persistedWlId);
        } else if (!selectedWatchlistId || !list.some(w => w._id === selectedWatchlistId)) {
          setSelectedWatchlistId(list[0]._id);
        }
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
      if (socket && activeView) {
        socket.emit('unsubscribe', { symbol: activeView.symbol, exchange: activeView.exchange });
      }
      setAllCandles({});
    }
    setActiveView({ symbol, exchange, mode: 'chart' });
    if (socket) socket.emit('subscribe', { symbol, exchange, interval: currentInterval });
  }, [activeView, socket, currentInterval]);

  const handleOpenTable = useCallback((symbol, exchange) => {
    if (activeView?.symbol !== symbol || activeView?.exchange !== exchange) {
      if (socket && activeView) {
        socket.emit('unsubscribe', { symbol: activeView.symbol, exchange: activeView.exchange });
      }
    }
    setActiveView({ symbol, exchange, mode: 'table' });
    if (socket) socket.emit('subscribe', { symbol, exchange, interval: currentInterval });
  }, [activeView, socket, currentInterval]);

  const handleOpenAlert = useCallback((symbol, exchange) => {
    setActiveAlertStock({ symbol, exchange });
    setShowAlertsSidebar(true);
  }, []);

  useEffect(() => {
    if (socket && connected && activeView) {
      socket.emit('subscribe', { symbol: activeView.symbol, exchange: activeView.exchange, interval: currentInterval });
    }
  }, [socket, connected, activeView, currentInterval]);

  // Subscribe to all stocks in the active watchlist
  useEffect(() => {
    if (!socket || !connected || !selectedWatchlistId) return;
    const wl = watchlists.find(w => w._id === selectedWatchlistId);
    if (!wl || !wl.stocks || wl.stocks.length === 0) return;

    // Subscribe to all watchlist stocks
    wl.stocks.forEach(s => {
      socket.emit('subscribe', { symbol: s.symbol, exchange: s.exchange });
    });

    // Unsubscribe from them when the watchlist changes or we unmount
    return () => {
      wl.stocks.forEach(s => {
        socket.emit('unsubscribe', { symbol: s.symbol, exchange: s.exchange });
      });
    };
  }, [socket, connected, selectedWatchlistId, watchlists]);

  const handleAddToWatchlist = async (symbol, exchange) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!selectedWatchlistId) return;
    try { await api.post(`/watchlists/${selectedWatchlistId}/stocks`, { symbol, exchange }); fetchWatchlists(); } catch {}
  };

  const handleRemoveFromWatchlist = async (symbol, exchange) => {
    if (!user || !selectedWatchlistId) return;
    try { await api.delete(`/watchlists/${selectedWatchlistId}/stocks/${symbol.toUpperCase()}`); fetchWatchlists(); } catch {}
  };

  const handleCreateWatchlist = async (e) => {
    e.preventDefault();
    if (!newWatchlistName.trim()) return;
    try {
      const { data } = await api.post('/watchlists', { name: newWatchlistName.trim() });
      setNewWatchlistName('');
      await fetchWatchlists();
      if (data.watchlist?._id) setSelectedWatchlistId(data.watchlist._id);
    } catch {}
  };

  const handleDeleteWatchlist = async () => {
    const currentWl = watchlists.find(w => w._id === selectedWatchlistId);
    if (!currentWl) return;
    if (!window.confirm(`Delete watchlist "${currentWl.name}"?`)) return;
    try {
      await api.delete(`/watchlists/${selectedWatchlistId}`);
      setSelectedWatchlistId('');
      await fetchWatchlists();
    } catch {}
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

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-6 py-3 border-b shrink-0 z-20 backdrop-blur-sm"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        {/* Logo */}
        <button onClick={() => setActiveView(null)} className="flex items-center gap-2 shrink-0 cursor-pointer bg-transparent border-0 outline-none text-left p-0">
          <BarChart2 size={20} className="text-indigo-400" />
          <span className="text-base font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>AlphaWatch</span>
        </button>
        <span className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
          connected ? 'text-emerald-400 border-emerald-800 bg-emerald-950/40' : 'text-rose-400 border-rose-800 bg-rose-950/40'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>

        {/* Search bar */}
        <div className="flex-1 max-w-md mx-auto">
          <SearchBar onSelect={(s, e) => handleOpenChart(s, e)} onAddToWatchlist={handleAddToWatchlist} showAddButton={!!user} />
        </div>

        {/* Right controls */}
        <div className="shrink-0 flex items-center gap-3">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Alerts Toggle Button */}
          {user && (
            <button
              onClick={() => {
                setShowAlertsSidebar(s => !s);
                setActiveAlertStock(null);
              }}
              className="p-1.5 rounded-lg border transition-all cursor-pointer relative"
              style={{
                background: showAlertsSidebar ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
                borderColor: showAlertsSidebar ? 'rgba(99,102,241,0.4)' : 'var(--border-base)',
                color: showAlertsSidebar ? 'rgb(129,140,248)' : 'var(--text-secondary)'
              }}
              title="Toggle Alerts Sidebar"
            >
              <Bell size={14} />
            </button>
          )}

          {/* Auth */}
          {user ? (
            <>
              <span className="text-[10px] font-mono hidden sm:block" style={{ color: 'var(--text-muted)' }}>{user.email}</span>
              <button onClick={handleLogout}
                className="p-1.5 rounded-lg transition-colors cursor-pointer hover:text-rose-400 hover:bg-rose-950/30"
                style={{ color: 'var(--text-muted)' }} title="Sign out">
                <LogOut size={15} />
              </button>
            </>
          ) : (
            <button onClick={() => setShowAuthModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors">
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── Main Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main scrollable column */}
        <div className="flex-1 overflow-y-auto">
          <main className="flex flex-col p-6 gap-6 max-w-7xl mx-auto w-full">
            {!user ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <BarChart2 size={64} style={{ color: 'var(--bg-elevated)' }} />
                <div className="text-center">
                  <p className="font-extrabold text-xl" style={{ color: 'var(--text-primary)' }}>Welcome to AlphaWatch</p>
                  <p className="text-xs mt-1 mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-faint)' }}>
                    Sign in to build your dashboard, track real-time stocks, compute technical indicators, and create price alerts.
                  </p>
                  <button onClick={() => setShowAuthModal(true)}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-lg shadow-indigo-600/20">
                    Sign In to Get Started
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Watchlist Selection / Management Toolbar (Only visible in Watchlist state) */}
                {!activeView && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-xl"
                       style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
                    
                    {/* Select watchlist dropdown & Switcher */}
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0 min-w-[180px]">
                        <select value={selectedWatchlistId} onChange={e => setSelectedWatchlistId(e.target.value)}
                          className="w-full border rounded-xl px-3 py-1.5 text-xs font-bold appearance-none focus:outline-none cursor-pointer pr-8"
                          style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>
                          {watchlists.length === 0 ? (
                            <option value="">No watchlists</option>
                          ) : (
                            watchlists.map(w => <option key={w._id} value={w._id}>{w.name}</option>)
                          )}
                        </select>
                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                      </div>

                      {/* Delete watchlist button */}
                      {currentWatchlist && (
                        <button onClick={handleDeleteWatchlist} title="Delete current watchlist"
                          className="p-2 border rounded-xl hover:text-rose-400 hover:border-rose-900/30 transition-colors cursor-pointer"
                          style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)', color: 'var(--text-faint)' }}>
                          <Trash2 size={13} />
                        </button>
                      )}

                      {/* Segmented main tab switcher */}
                      <div className="flex items-center gap-1 p-0.5 rounded-lg border ml-2" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}>
                        <button
                          type="button"
                          onClick={() => setActiveMainTab('watchlist')}
                          className={`px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all ${
                            activeMainTab === 'watchlist' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-400'
                          }`}
                        >
                          Watchlist
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMainTab('backtest')}
                          className={`px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all ${
                            activeMainTab === 'backtest' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-400'
                          }`}
                        >
                          Backtest
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMainTab('autotrade')}
                          className={`px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all ${
                            activeMainTab === 'autotrade' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-400'
                          }`}
                        >
                          Auto Trade
                        </button>
                      </div>
                    </div>

                    {/* Create watchlist inline form */}
                    <form onSubmit={handleCreateWatchlist} className="flex gap-2">
                      <input value={newWatchlistName} onChange={e => setNewWatchlistName(e.target.value)} placeholder="New watchlist name..."
                        className="border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                        style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }} />
                      <button type="submit" className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer transition-colors">
                        <Plus size={13} />
                      </button>
                    </form>
                  </div>
                )}

                {/* View Switcher: Watchlist Dashboard OR Backtesting Dashboard OR Active stock details workspace */}
                {!activeView ? (
                  activeMainTab === 'watchlist' ? (
                    <WatchlistDashboard
                      watchlists={watchlists}
                      selectedId={selectedWatchlistId}
                      socket={socket}
                      onOpenChart={handleOpenChart}
                      onOpenTable={handleOpenTable}
                      onOpenAlert={handleOpenAlert}
                      onRemoveStock={handleRemoveFromWatchlist}
                      onWatchlistsChange={fetchWatchlists}
                    />
                  ) : activeMainTab === 'backtest' ? (
                    <BacktestDashboard
                      watchlists={watchlists}
                      selectedId={selectedWatchlistId}
                    />
                  ) : (
                    <AutoTradeDashboard />
                  )
                ) : (
                  <div className="flex flex-col gap-6 w-full animate-fade-in">
                    {/* View Switcher Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border-base)' }}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            {activeView.symbol} Workspace
                          </h1>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                            {activeView.exchange}
                          </span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          Analyzing {activeView.symbol} on {activeView.exchange} in {activeView.mode === 'chart' ? 'Interactive Chart' : 'Depth Data Table'} mode
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Segmented View Switcher Control */}
                        <div className="flex items-center gap-1.5 p-0.5 rounded-lg border" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}>
                          <button
                            onClick={() => {
                              if (socket && activeView) {
                                socket.emit('unsubscribe', { symbol: activeView.symbol, exchange: activeView.exchange });
                              }
                              setActiveView(null);
                            }}
                            className="px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all hover:text-indigo-400"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Watchlist
                          </button>
                          <button
                            onClick={() => setActiveView(v => ({ ...v, mode: 'chart' }))}
                            className={`px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all ${
                              isChartView ? 'bg-indigo-600 text-white shadow-md' : 'hover:text-indigo-400'
                            }`}
                            style={!isChartView ? { color: 'var(--text-muted)' } : {}}
                          >
                            Chart
                          </button>
                          <button
                            onClick={() => setActiveView(v => ({ ...v, mode: 'table' }))}
                            className={`px-3 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer transition-all ${
                              isTableView ? 'bg-indigo-600 text-white shadow-md' : 'hover:text-indigo-400'
                            }`}
                            style={!isTableView ? { color: 'var(--text-muted)' } : {}}
                          >
                            Depth Table
                          </button>
                        </div>

                        {isChartView && (
                          <IndicatorPicker activeIndicators={activeIndicators} onToggle={toggleIndicator} />
                        )}

                        {/* Back Close Button */}
                        <button
                          onClick={() => {
                            if (socket && activeView) {
                              socket.emit('unsubscribe', { symbol: activeView.symbol, exchange: activeView.exchange });
                            }
                            setActiveView(null);
                          }}
                          className="p-2 border rounded-xl hover:text-rose-400 hover:border-rose-900/30 transition-colors cursor-pointer"
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-base)', color: 'var(--text-faint)' }}
                          title="Back to Watchlist"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>

                    {/* View Content Area */}
                    <div className="w-full">
                      {isChartView && (
                        <div className="flex flex-col gap-4">
                          <LiveTickerBar symbol={activeView.symbol} exchange={activeView.exchange} socket={socket} />
                          <TradingChart
                            symbol={activeView.symbol} exchange={activeView.exchange}
                            socket={socket} activeIndicators={activeIndicators}
                            onCandlesChange={handleCandlesChange} onIntervalChange={setCurrentInterval}
                          />
                        </div>
                      )}
                      
                      {isTableView && (
                        <div className="h-[600px] w-full rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-base)' }}>
                          <StockDataTable symbol={activeView.symbol} exchange={activeView.exchange} socket={socket} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>

        {/* Sliding Right Alerts Sidebar */}
        {showAlertsSidebar && user && (
          <aside className="w-80 border-l flex flex-col overflow-hidden shrink-0 animate-fade-in"
                 style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border-base)' }}>
              <span className="text-xs font-black uppercase tracking-wider text-slate-100">Price Alerts</span>
              <button
                onClick={() => {
                  setShowAlertsSidebar(false);
                  setActiveAlertStock(null);
                }}
                className="p-1 hover:text-rose-400 cursor-pointer rounded-lg hover:bg-rose-950/30 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <AlertsPanel
                symbol={activeAlertStock?.symbol}
                exchange={activeAlertStock?.exchange}
                socket={socket}
                onClearFilter={() => setActiveAlertStock(null)}
              />
            </div>
          </aside>
        )}
      </div>

      {showAuthModal && (
        <AuthModal onSuccess={handleAuthSuccess} onClose={() => setShowAuthModal(false)} />
      )}

      {user && (
        <AiAssistant
          currentWatchlistId={selectedWatchlistId}
          onWatchlistsChange={fetchWatchlists}
        />
      )}
    </div>
  );
}
