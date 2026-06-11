import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, X, Edit2 } from 'lucide-react';
import api from '../../services/api';
import AlertModal from './AlertModal';

export default function AlertsPanel({ symbol, exchange, socket }) {
  const [alerts, setAlerts] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);

  const fetchAlerts = async () => {
    try {
      const { data } = await api.get('/alerts');
      setAlerts(data.alerts || []);
    } catch {}
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const playLoudSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc1.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.35);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn("Failed to play audio:", e);
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handler = (payload) => {
      setToasts(prev => [...prev, { ...payload, id: Date.now() }]);
      playLoudSound();
      fetchAlerts();
    };
    socket.on('alert_triggered', handler);
    return () => socket.off('alert_triggered', handler);
  }, [socket]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/alerts/${id}`);
      fetchAlerts();
    } catch {}
  };

  const handleToggleStatus = async (alert) => {
    try {
      const nextStatus = alert.status === 'active' ? 'dismissed' : 'active';
      await api.patch(`/alerts/${alert._id}/dismiss`, { status: nextStatus });
      fetchAlerts();
    } catch {}
  };

  const handleEdit = (alert) => {
    setEditingAlert(alert);
    setShowModal(true);
  };

  const handleCreate = () => {
    setEditingAlert(null);
    setShowModal(true);
  };

  const handleSaveSuccess = () => {
    setShowModal(false);
    setEditingAlert(null);
    fetchAlerts();
  };

  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {/* Toast notifications */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto bg-amber-950/95 border border-amber-600 text-amber-100 rounded-2xl px-4 py-3 text-xs shadow-2xl flex items-start gap-3 max-w-sm backdrop-blur-md">
            <Bell size={16} className="mt-0.5 shrink-0 text-amber-400 animate-bounce" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold uppercase tracking-wide text-amber-300">Alert Triggered</p>
              <p className="font-black mt-0.5 text-slate-100">{t.alertName}</p>
              <p className="text-[10px] font-mono text-amber-400 mt-1">Symbol: {t.exchange}:{t.symbol} · LTP: ₹{Number(t.ltp).toFixed(2)}</p>
              
              <div className="mt-2 space-y-1 border-t border-amber-800/50 pt-1.5">
                {t.conditions?.map((c, i) => {
                  const rhs = c.rightType === 'value' ? Number(c.rightValue).toFixed(2) : c.rightIndicator;
                  return (
                    <p key={i} className="text-[10px] text-amber-200/90 leading-tight">
                      • {c.leftIndicator} ({c.timeframe}): {Number(c.leftActual).toFixed(2)} {c.operator} {c.rightType === 'value' ? rhs : `${rhs} (${Number(c.rightActual).toFixed(2)})`} ✓
                    </p>
                  );
                })}
              </div>
            </div>
            <button onClick={() => dismissToast(t.id)} className="cursor-pointer text-amber-500 hover:text-amber-200 p-0.5 rounded hover:bg-amber-900/30 transition-colors">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Set alert button */}
      <button onClick={handleCreate}
        className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-600/20 cursor-pointer transition-colors w-full">
        <Plus size={13} /> Set Alert
      </button>

      {/* Alerts list */}
      <div className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
        {alerts.length === 0 && (
          <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-faint)' }}>No alerts set.</p>
        )}
        {alerts.map(a => {
          const isTriggered = a.status === 'triggered';
          const isDismissed = a.status === 'dismissed';

          return (
            <div key={a._id}
              className={`flex items-start justify-between rounded-xl px-3 py-2 border text-xs transition-all ${
                isTriggered ? 'bg-amber-950/20 border-amber-800/40' :
                isDismissed ? 'opacity-40 hover:opacity-60 border-dashed' : 'hover:border-indigo-500/30'
              }`}
              style={!['triggered','dismissed'].includes(a.status) ? {
                background: 'var(--bg-base)', borderColor: 'var(--border-base)'
              } : {}}>
              <div className="flex-1 min-w-0 mr-2">
                <p className="font-black text-slate-200 truncate">{a.name}</p>
                <p className="text-[9px] text-slate-500 font-bold truncate mt-0.5">
                  Target: {a.targetType === 'watchlist' ? `Watchlist: ${a.watchlistId?.name || 'Deleted Watchlist'}` : a.stocks.map(s => s.symbol).join(', ')}
                </p>
                
                {/* Short conditions summary */}
                <div className="mt-1 space-y-0.5">
                  {a.conditions?.map((c, i) => (
                    <p key={i} className="text-[9px] text-slate-400/80 font-mono leading-none">
                      {c.leftIndicator} ({c.timeframe}) {c.operator} {c.rightType === 'value' ? c.rightValue : c.rightIndicator}
                    </p>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(a)}
                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                      a.status === 'triggered' ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40' :
                      a.status === 'active' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/30' : 'bg-slate-800/30 text-slate-400 border border-slate-700/30'
                    }`}
                  >
                    {a.status}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 mt-0.5 shrink-0">
                <button onClick={() => handleEdit(a)} title="Edit alert"
                  className="p-1 hover:text-indigo-400 cursor-pointer rounded hover:bg-slate-800/20 transition-all text-slate-500">
                  <Edit2 size={11} />
                </button>
                <button onClick={() => handleDelete(a._id)} title="Delete alert"
                  className="p-1 hover:text-rose-400 cursor-pointer rounded hover:bg-slate-800/20 transition-all text-slate-500">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <AlertModal
          alert={editingAlert}
          onClose={() => { setShowModal(false); setEditingAlert(null); }}
          onSave={handleSaveSuccess}
        />
      )}
    </div>
  );
}
