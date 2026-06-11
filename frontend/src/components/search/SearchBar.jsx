
import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Plus } from 'lucide-react';
import api from '../../services/api';

export default function SearchBar({ onSelect, onAddToWatchlist, showAddButton = false }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen]   = useState(false);
  const wrapperRef            = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setIsOpen(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/search/${encodeURIComponent(query)}`);
        setResults(data.suggestions || []);
        setIsOpen(true);
      } catch {}
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (symbol, exchange) => {
    onSelect(symbol, exchange); setQuery(''); setIsOpen(false);
  };
  const handleAdd = (e, symbol, exchange) => {
    e.stopPropagation();
    onAddToWatchlist?.(symbol, exchange); setQuery(''); setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search size={15} className="absolute left-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder="Search NSE / BSE stocks…"
          className="w-full border rounded-xl py-2 pl-9 pr-4 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
        />
        {loading && <Loader2 size={13} className="absolute right-3 text-indigo-400 animate-spin pointer-events-none" />}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full border rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto"
             style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)' }}>
          {results.map((item, i) => (
            <div key={i}
              className="flex items-center justify-between px-4 py-3 border-b last:border-0 group transition-colors cursor-pointer hover:bg-indigo-600/5"
              style={{ borderColor: 'var(--border-base)' }}
              onClick={() => handleSelect(item.symbol, item.exchange)}>
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-bold group-hover:text-indigo-400 transition-colors" style={{ color: 'var(--text-primary)' }}>
                  {item.symbol}
                </p>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{item.shortname}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-mono px-2 py-1 rounded"
                      style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                  {item.exchange}
                </span>
                {showAddButton && (
                  <button onClick={(e) => handleAdd(e, item.symbol, item.exchange)} title="Add to watchlist"
                    className="p-1 text-slate-600 hover:text-indigo-400 cursor-pointer transition-colors opacity-0 group-hover:opacity-100">
                    <Plus size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
