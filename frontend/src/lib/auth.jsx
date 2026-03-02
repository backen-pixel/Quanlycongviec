import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';

const AuthCtx = createContext(null);

const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 tiếng
const ACTIVITY_KEY = 'last_activity';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const timerRef = useRef(null);

  // ═══ ACTIVITY TRACKING ═══
  const updateActivity = useCallback(() => {
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }, []);

  const checkExpiry = useCallback(() => {
    const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0');
    const token = localStorage.getItem('token');
    if (!token) return;
    
    if (lastActivity && Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
      // Session expired
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem(ACTIVITY_KEY);
      disconnectSocket();
      setUser(null);
      setSocket(null);
      window.location.href = '/login?expired=1';
    }
  }, []);

  // Setup activity listeners
  useEffect(() => {
    if (!user) return;
    
    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    let throttleTimer = null;
    const handleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 30000); // throttle 30s
      updateActivity();
    };
    
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    updateActivity(); // Mark initial activity
    
    // Check expiry every 60 seconds
    timerRef.current = setInterval(checkExpiry, 60000);
    
    // Also check on visibility change (tab focus)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkExpiry();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, updateActivity, checkExpiry]);

  // ═══ INIT ═══
  useEffect(() => {
    const u = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (u && token) {
      // Check if session already expired
      const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0');
      if (lastActivity && Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem(ACTIVITY_KEY);
        setLoading(false);
        return;
      }
      
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
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    setUser(data.user);
    const s = connectSocket();
    setSocket(s);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(ACTIVITY_KEY);
    disconnectSocket();
    setUser(null);
    setSocket(null);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, socket }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
