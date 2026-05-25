import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
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
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    const s = connectSocket();
    setSocket(s);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
