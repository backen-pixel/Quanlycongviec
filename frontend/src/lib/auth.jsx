import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useActivityPing } from '../hooks/useActivityPing';

const AuthCtx = createContext(null);

function ActivityPingGate({ user, children }) {
  useActivityPing(!!user);
  return children;
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
      <ActivityPingGate user={user}>{children}</ActivityPingGate>
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
