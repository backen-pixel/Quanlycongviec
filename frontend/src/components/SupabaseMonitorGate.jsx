import { useState, useEffect, useCallback } from 'react';
import { Database, Lock, Loader2, MapPin } from 'lucide-react';
import api from '../lib/api';
import { getCachedActivityContext, requestBrowserGeolocation } from '../lib/deviceHeartbeat';
import {
  setSupabaseMonitorToken,
  clearSupabaseMonitorToken,
  SUPABASE_MONITOR_UNLOCK_EVENT,
  SUPABASE_MONITOR_LOCK_EVENT,
} from '../lib/supabaseMonitorAuth';

export default function SupabaseMonitorGate({ children }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    clearSupabaseMonitorToken();
    setUnlocked(false);
    return () => {
      clearSupabaseMonitorToken();
    };
  }, []);

  const onUnlock = useCallback(() => setUnlocked(true), []);
  const onLock = useCallback(() => setUnlocked(false), []);

  useEffect(() => {
    window.addEventListener(SUPABASE_MONITOR_UNLOCK_EVENT, onUnlock);
    window.addEventListener(SUPABASE_MONITOR_LOCK_EVENT, onLock);
    return () => {
      window.removeEventListener(SUPABASE_MONITOR_UNLOCK_EVENT, onUnlock);
      window.removeEventListener(SUPABASE_MONITOR_LOCK_EVENT, onLock);
    };
  }, [onUnlock, onLock]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ctx = getCachedActivityContext();
      const { data } = await api.post('/production/backup-sync/unlock', {
        password,
        device_id: ctx.device_id,
        device_name: ctx.device_name,
        ...(ctx.geo_lat != null ? { geo_lat: ctx.geo_lat, geo_lng: ctx.geo_lng } : {}),
      });
      if (data?.token) {
        setSupabaseMonitorToken(data.token);
        setUnlocked(true);
        setPassword('');
      } else {
        setError('Không nhận được token');
      }
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const msg = err.response?.data?.error;
      if (status === 401 || code === 'MONITOR_PASSWORD_INVALID') {
        setError(msg || 'Mật khẩu không đúng');
      } else if (msg) {
        setError(msg);
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Không kết nối được backend — kiểm tra backend đang chạy (port 4000) và tải lại trang.');
      } else {
        setError(err.message || 'Không thực hiện được — thử lại sau.');
      }
    }
    setLoading(false);
  };

  const requestGeo = async () => {
    setError('');
    try {
      await requestBrowserGeolocation();
      setError('');
    } catch {
      setError('Không lấy được vị trí — kiểm tra quyền GPS của trình duyệt.');
    }
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
          <p className="text-sm text-slate-500 mt-1">
            Nhập mật khẩu mỗi khi vào trang này — kể cả khi load lại trình duyệt hoặc quay lại từ trang khác.
            Nên bật định vị để nhật ký ghi đủ thiết bị và vị trí.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu giám sát"
              autoComplete="current-password"
              autoFocus
              className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void requestGeo()}
            className="w-full py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 inline-flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            Bật quyền định vị
          </button>
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
