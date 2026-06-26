import { useState } from 'react';
import { Database, Lock, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { setSupabaseMonitorToken, isSupabaseMonitorUnlocked } from '../lib/supabaseMonitorAuth';

export default function SupabaseMonitorGate({ children }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isSupabaseMonitorUnlocked());

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/production/backup-sync/unlock', { password });
      if (data?.token) {
        setSupabaseMonitorToken(data.token, data.expires_in_ms);
        setUnlocked(true);
      } else {
        setError('Không nhận được token');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Mật khẩu không đúng');
    }
    setLoading(false);
  };

  if (unlocked) return children;

  return (
    <div className="max-w-md mx-auto mt-16 p-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 text-teal-700 mb-3">
            <Database className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Giám sát Supabase</h2>
          <p className="text-sm text-slate-500 mt-1">Nhập mật khẩu để truy cập</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu"
              autoComplete="off"
              className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-lg bg-teal-700 text-white font-medium hover:bg-teal-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Vào trang giám sát
          </button>
        </form>
      </div>
    </div>
  );
}
