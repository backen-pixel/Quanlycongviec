import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
import { flushNow } from '../lib/activityLogger';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useActivityPing } from '../hooks/useActivityPing';
import { useDeviceHeartbeat } from '../hooks/useDeviceHeartbeat';
import { useAutoLogoutAtMidnight } from '../hooks/useAutoLogoutAtMidnight';
import GeoConsentBanner from '../components/GeoConsentBanner';

const AuthCtx = createContext(null);

function ActivityPingGate({ user, onLogout, children }) {
  useActivityPing(!!user);
  useDeviceHeartbeat(!!user);
  useAutoLogoutAtMidnight(!!user, onLogout);
  return (
    <>
      {children}
      <GeoConsentBanner enabled={!!user} />
    </>
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  // ═══ INIT ═══
  useEffect(() => {
    const u = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (u && token) {
      try {
        setUser(JSON.parse(u));
        const s = connectSocket();
        setSocket(s);
      } catch {}
      // Refresh user info (avatar, profile…) — cache localStorage có thể đã cũ
      // (avatar mới upload sau khi login → tránh phải đăng xuất rồi đăng nhập lại).
      (async () => {
        try {
          const { data } = await api.get('/auth/me');
          if (data?.user) {
            const merged = { ...JSON.parse(u || '{}'), ...data.user };
            localStorage.setItem('user', JSON.stringify(merged));
            setUser(merged);
          }
        } catch (_) { /* token hết hạn / mạng lỗi — bỏ qua, giữ cache cũ */ }
      })();
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    // session_id sinh ở client → ghép cặp login → logout audit. Lưu cùng token để khi logout gửi lại.
    const sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { data } = await api.post('/auth/login', { email, password, session_id: sessionId });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('session_id', data.session_id || sessionId);
    localStorage.setItem('login_ts', String(Date.now()));
    setUser(data.user);
    const s = connectSocket();
    setSocket(s);
    return data.user;
  };

  const logout = async (reason = 'manual') => {
    // Audit logout: gọi API trước khi xoá token. Lỗi mạng cũng vẫn xoá cục bộ.
    try {
      await flushNow();
    } catch (_) {}
    try {
      const sessionId = localStorage.getItem('session_id') || null;
      const loginTs = Number(localStorage.getItem('login_ts')) || null;
      const msSession = loginTs ? Date.now() - loginTs : null;
      await api.post('/auth/logout', {
        reason,
        session_id: sessionId,
        ms_session_duration: msSession,
      });
    } catch (_) { /* token hết hạn / mất mạng — vẫn logout cục bộ */ }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('session_id');
    localStorage.removeItem('login_ts');
    disconnectSocket();
    setUser(null);
    setSocket(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, socket }}>
      <ActivityPingGate user={user} onLogout={logout}>{children}</ActivityPingGate>
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) {
    throw new Error('useAuth phải dùng bên trong AuthProvider');
  }
  return ctx;
}
