import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, ArrowUpRight, ArrowDownRight, X, Plus, Trash2, Shield, ShieldAlert, CheckCircle2, AlertTriangle, Settings2, RefreshCw, Save, Edit3 } from 'lucide-react';
import api from '../../services/api';

const INDICATOR_GROUPS = [
  {
    label: 'Price & Volume',
    options: [
      { key: 'close', label: 'Price (LTP)' },
      { key: 'open', label: 'Open' },
      { key: 'high', label: 'High' },
      { key: 'low', label: 'Low' },
      { key: 'volume', label: 'Volume' }
    ]
  },
  {
    label: 'SMA',
    options: [
      { key: 'sma20', label: 'SMA 20' },
      { key: 'deltaSma20', label: 'Delta SMA 20' },
      { key: 'deltaSqSma20', label: 'Delta Delta SMA 20' },
      { key: 'sma50', label: 'SMA 50' },
      { key: 'deltaSma50', label: 'Delta SMA 50' },
      { key: 'deltaSqSma50', label: 'Delta Delta SMA 50' },
      { key: 'sma100', label: 'SMA 100' },
      { key: 'deltaSma100', label: 'Delta SMA 100' },
      { key: 'deltaSqSma100', label: 'Delta Delta SMA 100' },
      { key: 'sma200', label: 'SMA 200' },
      { key: 'deltaSma200', label: 'Delta SMA 200' },
      { key: 'deltaSqSma200', label: 'Delta Delta SMA 200' }
    ]
  },
  {
    label: 'EMA',
    options: [
      { key: 'ema20', label: 'EMA 20' },
      { key: 'deltaEma20', label: 'Delta EMA 20' },
      { key: 'deltaSqEma20', label: 'Delta Delta EMA 20' },
      { key: 'ema50', label: 'EMA 50' },
      { key: 'deltaEma50', label: 'Delta EMA 50' },
      { key: 'deltaSqEma50', label: 'Delta Delta EMA 50' },
      { key: 'ema100', label: 'EMA 100' },
      { key: 'deltaEma100', label: 'Delta EMA 100' },
      { key: 'deltaSqEma100', label: 'Delta Delta EMA 100' },
      { key: 'ema200', label: 'EMA 200' },
      { key: 'deltaEma200', label: 'Delta EMA 200' },
      { key: 'deltaSqEma200', label: 'Delta Delta EMA 200' }
    ]
  },
  {
    label: 'RSI',
    options: [
      { key: 'rsi14', label: 'RSI 14' },
      { key: 'deltaRsi14', label: 'Delta RSI 14' },
      { key: 'deltaSqRsi14', label: 'Delta Delta RSI 14' }
    ]
  },
  {
    label: 'Bollinger Bands',
    options: [
      { key: 'bbUpper', label: 'BB Upper' },
      { key: 'deltaBbUpper', label: 'Delta BB Upper' },
      { key: 'deltaSqBbUpper', label: 'Delta Delta BB Upper' },
      { key: 'bbMiddle', label: 'BB Mid' },
      { key: 'deltaBbMiddle', label: 'Delta BB Mid' },
      { key: 'deltaSqBbMiddle', label: 'Delta Delta BB Mid' },
      { key: 'bbLower', label: 'BB Lower' },
      { key: 'deltaBbLower', label: 'Delta BB Lower' },
      { key: 'deltaSqBbLower', label: 'Delta Delta BB Lower' }
    ]
  },
  {
    label: 'MACD',
    options: [
      { key: 'macdLine', label: 'MACD Line' },
      { key: 'deltaMACD', label: 'Delta MACD Line' },
      { key: 'deltaSqMacdLine', label: 'Delta Delta MACD Line' },
      { key: 'macdSignal', label: 'MACD Signal' },
      { key: 'deltaMacdSignal', label: 'Delta MACD Signal' },
      { key: 'deltaSqMacdSignal', label: 'Delta Delta MACD Signal' },
      { key: 'macdHist', label: 'MACD Histogram' },
      { key: 'deltaMacdHist', label: 'Delta MACD Histogram' },
      { key: 'deltaSqMacdHist', label: 'Delta Delta MACD Histogram' }
    ]
  },
  {
    label: 'ADX / DI',
    options: [
      { key: 'adx', label: 'ADX' },
      { key: 'deltaADX', label: 'Delta ADX' },
      { key: 'deltaSqADX', label: 'Delta Delta ADX' },
      { key: 'plusDI', label: '+DI' },
      { key: 'deltaPlusDI', label: 'Delta +DI' },
      { key: 'deltaSqPlusDI', label: 'Delta Delta +DI' },
      { key: 'minusDI', label: '-DI' },
      { key: 'deltaMinusDI', label: 'Delta -DI' },
      { key: 'deltaSqMinusDI', label: 'Delta Delta -DI' },
      { key: 'di', label: 'DI (+DI - -DI)' },
      { key: 'deltaDI', label: 'Delta DI' },
      { key: 'deltaSqDI', label: 'Delta Delta DI' }
    ]
  },
  {
    label: 'MFI',
    options: [
      { key: 'mfi14', label: 'MFI 14' },
      { key: 'deltaMfi14', label: 'Delta MFI 14' },
      { key: 'deltaSqMfi14', label: 'Delta Delta MFI 14' }
    ]
  },
  {
    label: 'SMI',
    options: [
      { key: 'smiLine', label: 'SMI Line' },
      { key: 'deltaSMI', label: 'Delta SMI' },
      { key: 'deltaSqSmiLine', label: 'Delta Delta SMI Line' },
      { key: 'smiSignal', label: 'SMI Signal' },
      { key: 'deltaSMISignal', label: 'Delta SMI Signal' },
      { key: 'deltaSqSmiSignal', label: 'Delta Delta SMI Signal' },
      { key: 'smiDist', label: 'SMI Dist' },
      { key: 'deltaSMIDist', label: 'Delta SMI Dist' },
      { key: 'deltaSqSMIDist', label: 'Delta Delta SMI Dist' }
    ]
  }
];

const TIMEFRAMES = ['1m', '5m', '10m', '15m', '30m', '1h', '1d'];
const OPERATORS = ['>', '>=', '==', '<=', '<', '!=', 'crossover', 'crossunder'];

export default function AutoTradeDashboard() {
  // Global config states
  const [config, setConfig] = useState({
    enabled: false,
    capital: 50000
  });

  const [connected, setConnected] = useState(false);
  const [hdfcApiKey, setHdfcApiKey] = useState('');
  const [tradeLogs, setTradeLogs] = useState([]);
  const [conditionsPool, setConditionsPool] = useState([]);

  // Form states for creating named conditions
  const [newCondName, setNewCondName] = useState('');
  const [newCondType, setNewCondType] = useState('buy');

  // Editing state
  const [editingCond, setEditingCond] = useState(null); // holds { _id, name, type, rules }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingLogs, setRefreshingLogs] = useState(false);

  // 1. Initial config and token loader
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get('request_token');

    const initialize = async () => {
      try {
        if (requestToken) {
          await api.post('/trade/hdfc/connect', { requestToken });
          window.history.replaceState({}, document.title, window.location.pathname);
          alert('HDFC Account connected successfully.');
        }

        const configRes = await api.get('/trade/config');
        if (configRes.data?.success) {
          setConfig(configRes.data.config);
          setConditionsPool(configRes.data.conditions || []);
          setConnected(configRes.data.connected);
          setHdfcApiKey(configRes.data.hdfcApiKey || '');
        }

        const logsRes = await api.get('/trade/logs');
        if (logsRes.data?.success) {
          setTradeLogs(logsRes.data.logs);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  // 2. Fetch trade logs
  const fetchLogs = useCallback(async () => {
    setRefreshingLogs(true);
    try {
      const res = await api.get('/trade/logs');
      if (res.data?.success) {
        setTradeLogs(res.data.logs);
      }
    } catch (err) {
      console.error('Failed to retrieve trade logs:', err);
    } finally {
      setRefreshingLogs(false);
    }
  }, []);

  // 3. Save global config (enabled status, trade capital limit)
  const handleSaveGlobalConfig = async (updatedConfig = config) => {
    setSaving(true);
    try {
      const res = await api.put('/trade/config', updatedConfig);
      if (res.data?.success) {
        setConfig(res.data.config);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save auto trade settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGlobal = () => {
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    handleSaveGlobalConfig(updated);
  };

  // 4. Create a named condition inside user's pool
  const handleCreateCondition = async (e) => {
    e.preventDefault();
    if (!newCondName.trim()) return alert('Condition name is required.');
    
    try {
      const res = await api.post('/trade/conditions', {
        name: newCondName.trim(),
        type: newCondType,
        rules: []
      });
      if (res.data?.success) {
        setConditionsPool(res.data.conditions);
        setNewCondName('');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create condition.');
    }
  };

  // 5. Delete a condition from user pool
  const handleDeleteCondition = async (id, name) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"?\nNote: Deleting this condition will automatically disable auto-trading and detach this rule on any stocks assigned to it.`
    );
    if (!confirmed) return;

    try {
      const res = await api.delete(`/trade/conditions/${id}`);
      if (res.data?.success) {
        setConditionsPool(res.data.conditions);
        if (editingCond?._id === id) {
          setEditingCond(null);
        }
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete condition.');
    }
  };

  // 6. Manage rules of the condition currently being edited
  const handleAddGroup = () => {
    if (!editingCond) return;
    setEditingCond({
      ...editingCond,
      groups: [
        ...(editingCond.groups || []),
        { rules: [], sellPct: 100 }
      ]
    });
  };

  const handleRemoveGroup = (groupIndex) => {
    if (!editingCond) return;
    setEditingCond({
      ...editingCond,
      groups: (editingCond.groups || []).filter((_, idx) => idx !== groupIndex)
    });
  };

  const handleGroupSellPctChange = (groupIndex, value) => {
    if (!editingCond) return;
    const updated = [...(editingCond.groups || [])];
    updated[groupIndex] = { ...updated[groupIndex], sellPct: parseFloat(value) || 0 };
    setEditingCond({ ...editingCond, groups: updated });
  };

  const handleAddRuleRow = (groupIndex) => {
    if (!editingCond) return;
    const updated = [...(editingCond.groups || [])];
    updated[groupIndex] = {
      ...updated[groupIndex],
      rules: [
        ...(updated[groupIndex].rules || []),
        { timeframe: '5m', leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '', rightIndicator: 'close' }
      ]
    };
    setEditingCond({ ...editingCond, groups: updated });
  };

  const handleRemoveRuleRow = (groupIndex, ruleIndex) => {
    if (!editingCond) return;
    const updated = [...(editingCond.groups || [])];
    updated[groupIndex] = {
      ...updated[groupIndex],
      rules: (updated[groupIndex].rules || []).filter((_, idx) => idx !== ruleIndex)
    };
    setEditingCond({ ...editingCond, groups: updated });
  };

  const handleRuleRowChange = (groupIndex, ruleIndex, field, value) => {
    if (!editingCond) return;
    const updated = [...(editingCond.groups || [])];
    const rules = [...updated[groupIndex].rules];
    rules[ruleIndex] = { ...rules[ruleIndex], [field]: value };
    updated[groupIndex] = { ...updated[groupIndex], rules };
    setEditingCond({ ...editingCond, groups: updated });
  };

  const handleSaveConditionRules = async () => {
    if (!editingCond) return;
    setSaving(true);
    try {
      const res = await api.put(`/trade/conditions/${editingCond._id}`, {
        name: editingCond.name,
        groups: editingCond.groups
      });
      if (res.data?.success) {
        setConditionsPool(res.data.conditions);
        setEditingCond(null);
        alert('Condition groups saved successfully.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save condition rules.');
    } finally {
      setSaving(false);
    }
  };

  const handleHdfcConnect = () => {
    if (!hdfcApiKey) {
      return alert('HDFC API Key is missing. Check your backend .env file.');
    }
    window.location.href = `https://developer.hdfcsec.com/oapi/v1/login?api_key=${hdfcApiKey}`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  const selectStyle = { background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border-base)' }}>
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            HDFC Auto Trading Panel
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Create reusable named conditions, assign them to specific stocks, and track background execution logs.
          </p>
        </div>

        {/* Global trigger */}
        <button
          onClick={handleToggleGlobal}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase border cursor-pointer transition-all flex items-center gap-2 ${
            config.enabled 
              ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/10' 
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          {config.enabled ? <Play size={12} /> : <Pause size={12} />}
          Bot Engine: {config.enabled ? 'ON / ACTIVE' : 'OFF / IDLE'}
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 overflow-auto">
        
        {/* Left Side: Setup & Pool */}
        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          
          {/* HDFC Broker Sync Box */}
          <div className="border rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                {connected ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  HDFC Sky OpenAPI Auth
                </h3>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {connected 
                    ? 'Connected and active. Bot executes orders on HDFC exchange segment.' 
                    : 'Disconnected. Falling back to local paper-trading simulation logs.'}
                </p>
              </div>
              <button
                onClick={handleHdfcConnect}
                className="ml-auto px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded-lg cursor-pointer transition-colors shadow-md animate-pulse"
              >
                {connected ? 'Reconnect' : 'Connect Account'}
              </button>
            </div>
          </div>

          {/* Constraints settings */}
          <div className="border rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 border-b pb-2" style={{ borderColor: 'var(--border-base)' }}>
              Execution Limits
            </h3>
            <div className="space-y-1.5 max-w-xs">
              <label className="text-[10px] font-black uppercase" style={{ color: 'var(--text-muted)' }}>Max Capital per stock buy trade (INR)</label>
              <input
                type="number" step="any"
                value={config.capital}
                onChange={e => {
                  const updated = { ...config, capital: parseFloat(e.target.value) || 0 };
                  setConfig(updated);
                }}
                onBlur={() => handleSaveGlobalConfig()}
                className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-right"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Condition Pool Manager */}
          <div className="border rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
            <div className="border-b pb-3 flex items-center justify-between" style={{ borderColor: 'var(--border-base)' }}>
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400">
                Rule Templates Pool
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Create named strategy templates to reuse across multiple stocks.
              </p>
            </div>

            {/* Create New Condition Inline Form */}
            <form onSubmit={handleCreateCondition} className="flex flex-wrap items-center gap-3 bg-slate-900/30 p-4 border rounded-xl" style={{ borderColor: 'var(--border-muted)' }}>
              <div className="flex-1 min-w-[200px] space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Condition Template Name</label>
                <input
                  type="text" placeholder="e.g. RSI Oversold, MACD Bearish Cross..."
                  value={newCondName}
                  onChange={e => setNewCondName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Type</label>
                <select
                  value={newCondType}
                  onChange={e => setNewCondType(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                  style={selectStyle}
                >
                  <option value="buy">BUY Setup Condition</option>
                  <option value="sell">SELL Setup Condition</option>
                </select>
              </div>

              <button
                type="submit"
                className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded-lg cursor-pointer transition-colors shadow-md self-end"
              >
                Create Template
              </button>
            </form>

            {/* Pool Lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {['buy', 'sell'].map((type) => {
                const list = conditionsPool.filter(c => c.type === type);
                return (
                  <div key={type} className="space-y-3">
                    <h4 className={`text-[10px] font-black uppercase tracking-wider border-b pb-1.5 ${type === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`} style={{ borderColor: 'var(--border-base)' }}>
                      {type === 'buy' ? '🟢 Reusable Buy Conditions' : '🔴 Reusable Sell Conditions'}
                    </h4>
                    <div className="space-y-2">
                      {list.map((cond) => (
                        <div
                          key={cond._id}
                          className={`flex items-center justify-between p-3 border rounded-xl transition-all ${
                            editingCond?._id === cond._id 
                              ? 'border-indigo-500 bg-indigo-500/5' 
                              : 'bg-slate-900/10 border-slate-800'
                          }`}
                        >
                          <div>
                            <span className="text-xs font-black text-slate-200">{cond.name}</span>
                            <span className="text-[9px] text-slate-500 block">
                              {cond.groups ? cond.groups.reduce((acc, g) => acc + (g.rules?.length || 0), 0) : (cond.rules?.length || 0)} criteria rules configured
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                const groups = cond.groups && cond.groups.length > 0
                                  ? JSON.parse(JSON.stringify(cond.groups))
                                  : [{ rules: JSON.parse(JSON.stringify(cond.rules || [])), sellPct: 100 }];
                                setEditingCond({ ...cond, groups });
                              }}
                              className="p-1.5 rounded-lg border text-slate-500 hover:text-indigo-400 cursor-pointer hover:bg-indigo-500/10 transition-colors"
                              style={{ borderColor: 'var(--border-muted)', background: 'var(--bg-elevated)' }}
                              title="Edit Rules"
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={() => handleDeleteCondition(cond._id, cond.name)}
                              className="p-1.5 rounded-lg border text-slate-500 hover:text-rose-400 cursor-pointer hover:bg-rose-500/10 transition-colors"
                              style={{ borderColor: 'var(--border-muted)', background: 'var(--bg-elevated)' }}
                              title="Delete Template"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {list.length === 0 && (
                        <p className="text-[10px] text-slate-500 italic py-4">No {type} conditions defined.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inline Active Condition Criteria Editor */}
          {editingCond && (
            <div className="border border-indigo-500 rounded-2xl p-5 space-y-4 animate-fade-in" style={{ background: 'var(--bg-surface)' }}>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-base)' }}>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400">
                    Editing: "{editingCond.name}"
                  </h3>
                  <p className="text-[9px] text-slate-500">
                    Configure condition groups (joined by OR logic) containing rule constraints (joined by AND logic).
                  </p>
                </div>
                <button
                  onClick={() => setEditingCond(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 border-slate-700 border text-slate-400 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>

              {/* Groups List */}
              <div className="space-y-6">
                {(editingCond.groups || []).map((group, gIdx) => (
                  <div key={gIdx} className="border border-slate-800 rounded-xl p-4 bg-slate-900/20 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black rounded text-[9px] uppercase">
                          Condition Group {gIdx + 1}
                        </span>
                        {gIdx > 0 && (
                          <span className="text-[10px] text-indigo-400/80 font-black uppercase">
                            [OR]
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {editingCond.type === 'sell' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase">Sell Percentage:</span>
                            <input
                              type="number" min="1" max="100"
                              value={group.sellPct ?? 100}
                              onChange={(e) => handleGroupSellPctChange(gIdx, e.target.value)}
                              className="w-14 border rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                              style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                            />
                            <span className="text-xs text-slate-500 font-bold">%</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(gIdx)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                          title="Remove Group"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Rules inside group */}
                    <div className="space-y-3">
                      {(group.rules || []).map((rule, rIdx) => (
                        <div key={rIdx} className="flex flex-wrap items-center gap-2 border-b last:border-0 pb-3 last:pb-0" style={{ borderColor: 'var(--border-base)' }}>
                          
                          {/* Timeframe selector */}
                          <div className="w-[75px]">
                            <select
                              value={rule.timeframe}
                              onChange={e => handleRuleRowChange(gIdx, rIdx, 'timeframe', e.target.value)}
                              className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 font-bold cursor-pointer"
                              style={selectStyle}
                            >
                              {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                            </select>
                          </div>

                          {/* Left Indicator */}
                          <div className="flex items-center gap-1.5 border rounded-lg p-1" style={{ borderColor: 'var(--border-muted)', background: 'var(--bg-elevated)' }}>
                            <span className="text-[9px] font-bold px-1 text-slate-400 uppercase">LHS:</span>
                            <select
                              value={rule.leftIndicator}
                              onChange={e => handleRuleRowChange(gIdx, rIdx, 'leftIndicator', e.target.value)}
                              className="border-0 bg-transparent text-xs focus:outline-none cursor-pointer max-w-[120px]"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {INDICATOR_GROUPS.map(g => (
                                <optgroup key={g.label} label={g.label} className="bg-slate-900 text-slate-300 font-bold">
                                  {g.options.map(ind => (
                                    <option key={ind.key} value={ind.key} className="bg-slate-950 text-slate-200 font-normal">
                                      {ind.label}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>

                          {/* Operator */}
                          <div className="w-[85px]">
                            <select
                              value={rule.operator}
                              onChange={e => handleRuleRowChange(gIdx, rIdx, 'operator', e.target.value)}
                              className="w-full border rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:border-indigo-500 font-bold cursor-pointer"
                              style={selectStyle}
                            >
                              {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </div>

                          {/* Right Hand Side */}
                          <div className="flex items-center gap-1.5 border rounded-lg p-1" style={{ borderColor: 'var(--border-muted)', background: 'var(--bg-elevated)' }}>
                            <select
                              value={rule.rightType}
                              onChange={e => {
                                handleRuleRowChange(gIdx, rIdx, 'rightType', e.target.value);
                                if (e.target.value === 'value') {
                                  handleRuleRowChange(gIdx, rIdx, 'rightValue', '0');
                                } else {
                                  handleRuleRowChange(gIdx, rIdx, 'rightIndicator', 'close');
                                }
                              }}
                              className="border-0 bg-transparent text-xs focus:outline-none cursor-pointer"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <option value="value">Value</option>
                              <option value="indicator">Indicator</option>
                            </select>

                            {rule.rightType === 'value' ? (
                              <input
                                type="number" step="any" required placeholder="0.0"
                                value={rule.rightValue ?? ''}
                                onChange={e => handleRuleRowChange(gIdx, rIdx, 'rightValue', e.target.value)}
                                className="w-20 border rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                              />
                            ) : (
                              <select
                                value={rule.rightIndicator}
                                onChange={e => handleRuleRowChange(gIdx, rIdx, 'rightIndicator', e.target.value)}
                                className="border-0 bg-transparent text-xs focus:outline-none cursor-pointer max-w-[120px]"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {INDICATOR_GROUPS.map(g => (
                                  <optgroup key={g.label} label={g.label} className="bg-slate-900 text-slate-300 font-bold">
                                    {g.options.map(ind => (
                                      <option key={ind.key} value={ind.key} className="bg-slate-950 text-slate-200 font-normal">
                                        {ind.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Delete row */}
                          <button
                            type="button"
                            onClick={() => handleRemoveRuleRow(gIdx, rIdx)}
                            className="p-1.5 rounded-lg border hover:text-rose-400 cursor-pointer text-slate-500 transition-colors ml-auto sm:ml-0"
                            style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}

                      {(!group.rules || group.rules.length === 0) && (
                        <p className="text-[10px] text-slate-500 italic">No rules defined in this group. Click "+ Add Rule (AND)" below.</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddRuleRow(gIdx)}
                      className="flex items-center gap-1.5 text-[9px] font-black uppercase px-2.5 py-1.5 border border-indigo-500/20 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-lg cursor-pointer transition-colors"
                    >
                      <Plus size={10} /> Add Rule (AND)
                    </button>
                  </div>
                ))}

                {(editingCond.groups || []).length === 0 && (
                  <p className="text-[10px] text-slate-500 italic py-2">No condition groups configured yet. Click "+ Add Condition Group (OR)" below.</p>
                )}
              </div>

              {/* Action row */}
              <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                <button
                  type="button"
                  onClick={handleAddGroup}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase px-3 py-2 border border-indigo-500/20 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-lg cursor-pointer transition-colors"
                >
                  <Plus size={10} /> Add Condition Group (OR)
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCond(null)}
                    className="px-4 py-2 border text-[10px] font-black uppercase rounded-lg cursor-pointer text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConditionRules}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded-lg cursor-pointer transition-colors shadow-md"
                  >
                    <Save size={10} /> Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Trade Execution Logs */}
        <div className="w-full xl:w-[450px] border rounded-2xl p-5 space-y-4 flex flex-col max-h-[600px] xl:max-h-none shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-base)' }}>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400">
                Latest Trade Executions
              </h3>
              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                Displays the 10 most recent automated trades.
              </p>
            </div>
            <button
              onClick={fetchLogs}
              disabled={refreshingLogs}
              className="p-1.5 rounded-lg border text-slate-500 hover:text-indigo-400 cursor-pointer disabled:opacity-30"
              style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}
            >
              <RefreshCw size={12} className={refreshingLogs ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-auto space-y-2.5 pr-1">
            {tradeLogs.map((log) => {
              const isBuy = log.type === 'buy';
              return (
                <div key={log._id} className="border rounded-xl p-3 space-y-2 text-xs" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-black text-slate-200">{log.symbol}</span>
                    <span className={`px-2 py-0.5 rounded-[6px] text-[8px] font-black uppercase border select-none ${
                      isBuy 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      {log.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <div>
                      Qty: <span className="font-bold text-slate-300">{log.quantity}</span>
                    </div>
                    <div className="text-right">
                      Price: <span className="font-bold text-slate-300">₹{Number(log.price).toFixed(2)}</span>
                    </div>
                    <div>
                      ID: <span className="font-mono text-slate-400">{log.orderId || 'N/A'}</span>
                    </div>
                    <div className="text-right font-mono text-[9px]">
                      {new Date(log.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                  {log.message && (
                    <div className="text-[9px] text-slate-500 italic border-t pt-1 mt-1 border-slate-800">
                      {log.message}
                    </div>
                  )}
                </div>
              );
            })}
            {tradeLogs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500 italic">
                <AlertTriangle size={24} className="text-slate-600" />
                <span>No trades recorded yet.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
