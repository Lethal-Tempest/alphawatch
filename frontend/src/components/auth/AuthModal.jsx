
import { useState } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import api from '../../services/api';

export default function AuthModal({ onSuccess, onClose }) {
  const [mode, setMode]       = useState('login');
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        await api.post('/auth/register', { email, password });
        setMode('login'); setLoading(false); return;
      }
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      onSuccess(data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full border rounded-xl px-4 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors";
  const inputStyle = { background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-sm border rounded-2xl p-8 shadow-2xl"
           style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-muted)' }}>
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer transition-colors hover:text-slate-200"
                  style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        )}

        <h2 className="text-2xl font-black text-indigo-400 mb-1">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          {mode === 'login' ? 'Access your AlphaWatch dashboard.' : 'Free, forever. No credit card needed.'}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 bg-rose-900/30 border border-rose-700/50 rounded-lg text-xs text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} required minLength={6}
                value={password} onChange={e => setPass(e.target.value)}
                placeholder="Min. 6 characters" className={`${inputCls} pr-10`} style={inputStyle} />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors hover:text-slate-300"
                style={{ color: 'var(--text-muted)' }}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer transition-colors flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer">
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
