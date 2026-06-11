import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Search, Loader2 } from 'lucide-react';
import api from '../../services/api';

const INDICATORS = [
  { key: 'close', label: 'Price (LTP)' },
  { key: 'open', label: 'Open' },
  { key: 'high', label: 'High' },
  { key: 'low', label: 'Low' },
  { key: 'volume', label: 'Volume' },
  { key: 'rsi14', label: 'RSI 14' },
  { key: 'smiLine', label: 'SMI Line' },
  { key: 'smiSignal', label: 'SMI Signal' },
  { key: 'deltaSMI', label: 'Delta SMI' },
  { key: 'deltaSMISignal', label: 'Delta SMI Signal' },
  { key: 'smiDist', label: 'SMI Dist' },
  { key: 'deltaSMIDist', label: 'Delta SMI Dist' },
  { key: 'macdLine', label: 'MACD Line' },
  { key: 'macdSignal', label: 'MACD Signal' },
  { key: 'macdHist', label: 'MACD Histogram' },
  { key: 'adx', label: 'ADX' },
  { key: 'plusDI', label: '+DI' },
  { key: 'minusDI', label: '-DI' },
  { key: 'mfi14', label: 'MFI 14' },
  { key: 'sma20', label: 'SMA 20' },
  { key: 'sma50', label: 'SMA 50' },
  { key: 'sma100', label: 'SMA 100' },
  { key: 'sma200', label: 'SMA 200' },
  { key: 'ema20', label: 'EMA 20' },
  { key: 'ema50', label: 'EMA 50' },
  { key: 'ema100', label: 'EMA 100' },
  { key: 'ema200', label: 'EMA 200' },
  { key: 'di', label: 'DI (+DI - -DI)' },
  { key: 'deltaPlusDI', label: 'Delta +DI' },
  { key: 'deltaMinusDI', label: 'Delta -DI' },
  { key: 'deltaDI', label: 'Delta DI' },
  { key: 'deltaADX', label: 'Delta ADX' },
  { key: 'deltaSqADX', label: 'Delta Delta ADX' },
  { key: 'deltaMACD', label: 'Delta MACD' }
];

const TIMEFRAMES = ['1m', '5m', '10m', '15m', '30m', '1h', '1d'];
const OPERATORS = ['>', '>=', '==', '<=', '<', '!='];

export default function AlertModal({ alert: editingAlert, onClose, onSave }) {
  const [name, setName] = useState(editingAlert?.name || '');
  const [targetType, setTargetType] = useState(editingAlert?.targetType || 'specific_stocks');
  const [watchlistId, setWatchlistId] = useState(editingAlert?.watchlistId?._id || editingAlert?.watchlistId || '');
  const [stocks, setStocks] = useState(editingAlert?.stocks || []);
  const [conditions, setConditions] = useState(
    editingAlert?.conditions || [
      { timeframe: '5m', leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '', rightIndicator: 'close' }
    ]
  );
  const [isRepeating, setIsRepeating] = useState(editingAlert?.isRepeating || false);

  const [watchlists, setWatchlists] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchWatchlists();
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await api.get(`/search/${encodeURIComponent(searchQuery)}`);
        setSearchResults(data.suggestions || []);
        setSearchOpen(true);
      } catch {} finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchWatchlists = async () => {
    try {
      const { data } = await api.get('/watchlists');
      setWatchlists(data.watchlists || []);
      if (data.watchlists?.length > 0 && !watchlistId) {
        setWatchlistId(data.watchlists[0]._id);
      }
    } catch {}
  };

  const handleAddStock = (symbol, exchange) => {
    if (stocks.some(s => s.symbol === symbol && s.exchange === exchange)) return;
    setStocks([...stocks, { symbol, exchange }]);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleRemoveStock = (index) => {
    setStocks(stocks.filter((_, i) => i !== index));
  };

  const handleAddCondition = () => {
    setConditions([
      ...conditions,
      { timeframe: '5m', leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '', rightIndicator: 'close' }
    ]);
  };

  const handleRemoveCondition = (index) => {
    if (conditions.length === 1) return;
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index, field, val) => {
    const updated = [...conditions];
    updated[index][field] = val;
    setConditions(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return alert('Please enter an alert name.');
    if (targetType === 'specific_stocks' && stocks.length === 0) {
      return alert('Please select at least one stock.');
    }
    if (targetType === 'watchlist' && !watchlistId) {
      return alert('Please select a watchlist.');
    }

    const cleanedConditions = conditions.map(c => ({
      ...c,
      rightValue: c.rightType === 'value' ? parseFloat(c.rightValue) : undefined,
      rightIndicator: c.rightType === 'indicator' ? c.rightIndicator : undefined
    }));

    if (cleanedConditions.some(c => c.rightType === 'value' && isNaN(c.rightValue))) {
      return alert('Please enter a valid comparison value for all conditions.');
    }

    try {
      const payload = {
        name,
        targetType,
        watchlistId: targetType === 'watchlist' ? watchlistId : undefined,
        stocks: targetType === 'specific_stocks' ? stocks : undefined,
        conditions: cleanedConditions,
        isRepeating
      };

      if (editingAlert?._id) {
        await api.put(`/alerts/${editingAlert._id}`, payload);
      } else {
        await api.post('/alerts', payload);
      }

      onSave();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save alert.');
    }
  };

  const inputCls = "w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 transition-colors";
  const inputStyle = { background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border rounded-2xl shadow-2xl p-6 flex flex-col overflow-hidden max-h-[90vh]"
           style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b shrink-0" style={{ borderColor: 'var(--border-base)' }}>
          <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400">
            {editingAlert ? 'Edit Stock Alert' : 'Create Stock Alert'}
          </h3>
          <button onClick={onClose} className="p-1 hover:text-indigo-400 transition-colors cursor-pointer text-slate-500">
            <X size={16} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Name */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Alert Name</label>
            <input
              type="text" required placeholder="E.g. RSI Oversold with SMI Crossover" value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls} style={inputStyle}
            />
          </div>

          {/* Targets */}
          <div className="border rounded-xl p-3" style={{ borderColor: 'var(--border-muted)', background: 'rgba(255,255,255,0.01)' }}>
            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2 block">Alert Targets</label>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setTargetType('specific_stocks')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                  targetType === 'specific_stocks' ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'text-slate-400 border-transparent hover:bg-slate-800/10'
                }`}
              >
                Specific Stocks
              </button>
              <button
                type="button"
                onClick={() => setTargetType('watchlist')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                  targetType === 'watchlist' ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'text-slate-400 border-transparent hover:bg-slate-800/10'
                }`}
              >
                Watchlist
              </button>
            </div>

            {targetType === 'watchlist' ? (
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Select Watchlist</label>
                <select
                  value={watchlistId}
                  onChange={e => setWatchlistId(e.target.value)}
                  className={inputCls} style={inputStyle}
                >
                  {watchlists.map(w => (
                    <option key={w._id} value={w._id}>{w.name} ({w.stocks.length} stocks)</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Add Stocks</label>
                <div ref={searchRef} className="relative">
                  <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Type stock symbol (e.g. RELIANCE)..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                      className={`${inputCls} pl-8`} style={inputStyle}
                    />
                    {searchLoading && <Loader2 size={12} className="absolute right-3 text-indigo-400 animate-spin" />}
                  </div>

                  {searchOpen && searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 w-full border rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto"
                         style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)' }}>
                      {searchResults.map((item, i) => (
                        <div key={i}
                          className="flex items-center justify-between px-3 py-2 border-b last:border-0 hover:bg-indigo-600/10 cursor-pointer text-xs"
                          style={{ borderColor: 'var(--border-base)' }}
                          onClick={() => handleAddStock(item.symbol, item.exchange)}>
                          <div>
                            <span className="font-bold text-slate-200">{item.symbol}</span>
                            <span className="text-[10px] text-slate-500 ml-2">{item.shortname}</span>
                          </div>
                          <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-400">{item.exchange}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected stocks tags */}
                {stocks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {stocks.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-indigo-950/40 border border-indigo-800/30 rounded-lg text-indigo-300">
                        <span>{s.exchange}:{s.symbol}</span>
                        <button type="button" onClick={() => handleRemoveStock(idx)} className="hover:text-red-400 cursor-pointer">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Conditions */}
          <div className="border rounded-xl p-3 space-y-3" style={{ borderColor: 'var(--border-muted)', background: 'rgba(255,255,255,0.01)' }}>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Trigger Conditions (AND)</label>
              <button
                type="button" onClick={handleAddCondition}
                className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-500 transition-colors"
              >
                <Plus size={10} /> Add Condition
              </button>
            </div>

            <div className="space-y-2.5">
              {conditions.map((cond, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 border-b last:border-0 pb-2.5 last:pb-0" style={{ borderColor: 'var(--border-base)' }}>
                  
                  {/* Timeframe */}
                  <div className="w-[75px]">
                    <select
                      value={cond.timeframe}
                      onChange={e => handleConditionChange(idx, 'timeframe', e.target.value)}
                      className={inputCls} style={inputStyle}
                    >
                      {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                    </select>
                  </div>

                  {/* Left Indicator */}
                  <div className="flex-1 min-w-[130px]">
                    <select
                      value={cond.leftIndicator}
                      onChange={e => handleConditionChange(idx, 'leftIndicator', e.target.value)}
                      className={inputCls} style={inputStyle}
                    >
                      {INDICATORS.map(ind => <option key={ind.key} value={ind.key}>{ind.label}</option>)}
                    </select>
                  </div>

                  {/* Operator */}
                  <div className="w-[60px]">
                    <select
                      value={cond.operator}
                      onChange={e => handleConditionChange(idx, 'operator', e.target.value)}
                      className={inputCls} style={inputStyle}
                    >
                      {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </div>

                  {/* Right Type (Value / Indicator) */}
                  <div className="w-[90px]">
                    <select
                      value={cond.rightType}
                      onChange={e => {
                        handleConditionChange(idx, 'rightType', e.target.value);
                        if (e.target.value === 'value') {
                          handleConditionChange(idx, 'rightValue', '');
                        } else {
                          handleConditionChange(idx, 'rightIndicator', cond.leftIndicator);
                        }
                      }}
                      className={inputCls} style={inputStyle}
                    >
                      <option value="value">Value</option>
                      <option value="indicator">Indicator</option>
                    </select>
                  </div>

                  {/* Right value or indicator input */}
                  {cond.rightType === 'value' ? (
                    <div className="w-[100px]">
                      <input
                        type="number" step="any" required placeholder="0.0" value={cond.rightValue}
                        onChange={e => handleConditionChange(idx, 'rightValue', e.target.value)}
                        className={inputCls} style={inputStyle}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-w-[130px]">
                      <select
                        value={cond.rightIndicator}
                        onChange={e => handleConditionChange(idx, 'rightIndicator', e.target.value)}
                        className={inputCls} style={inputStyle}
                      >
                        {INDICATORS.map(ind => <option key={ind.key} value={ind.key}>{ind.label}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveCondition(idx)}
                    disabled={conditions.length === 1}
                    className="p-1.5 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none text-slate-500"
                  >
                    <Trash2 size={14} />
                  </button>

                </div>
              ))}
            </div>
          </div>

          {/* Repeat options */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox" id="isRepeating" checked={isRepeating}
              onChange={e => setIsRepeating(e.target.checked)}
              className="w-4 h-4 accent-indigo-500 cursor-pointer"
            />
            <label htmlFor="isRepeating" className="text-xs font-bold cursor-pointer text-slate-300">
              Repeating Alert (re-arm automatically after triggering, with 1-min cooldown)
            </label>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t shrink-0" style={{ borderColor: 'var(--border-base)' }}>
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-800/10 transition-colors"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-muted)', background: 'var(--bg-surface)' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            {editingAlert ? 'Save Alert' : 'Create Alert'}
          </button>
        </div>

      </div>
    </div>
  );
}
