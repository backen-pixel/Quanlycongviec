import { useContext, useState, useEffect, useLayoutEffect, useRef } from 'react';
import api from '../lib/api';
import { flushNow } from '../lib/activityLogger';
import {
  clearCrmSessionFilterStorage,
  clearCrmSessionUserMarker,
  syncCrmSessionUserOnLogin,
} from '../lib/crmCompanyFilter';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { resetClientSessionState } from '../lib/sessionReset';
import { useActivityPing } from '../hooks/useActivityPing';
import { useDeviceHeartbeat } from '../hooks/useDeviceHeartbeat';
import GeoConsentBanner from '../components/GeoConsentBanner';
import { AuthCtx } from './authContext';
import {
  assertFounderLocalLoginAttested,
  clearFounderLocalCompanyScopeLock,
  isFounderLocalReadOnlyActive,
} from '../business-os/founderLocalReadOnly';

const AUTH_STORAGE_KEYS = Object.freeze(['token', 'user', 'session_id', 'login_ts']);

function authStorage(readOnly) {
  return readOnly ? window.sessionStorage : window.localStorage;
}

function clearAuthStorage(storage) {
  for (const key of AUTH_STORAGE_KEYS) storage.removeItem(key);
}

function ActivityPingGate({ user, readOnlyMode, children }) {
  const automaticWritesEnabled = !!user && !readOnlyMode;
  useActivityPing(automaticWritesEnabled);
  useDeviceHeartbeat(automaticWritesEnabled);
  return (
    <>
      {children}
      <GeoConsentBanner enabled={automaticWritesEnabled} />
    </>
  );
}

export function AuthProvider({ children, readOnlyMode = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const readOnlyRef = useRef(readOnlyMode);
  const previousReadOnlyRef = useRef(readOnlyMode);
  const founderAttestedTokenRef = useRef(null);
  readOnlyRef.current = readOnlyMode;
  if (!readOnlyMode) founderAttestedTokenRef.current = null;

  // ═══ INIT ═══
  useEffect(() => {
    // Founder-local sessions are initialized by the attested effect below.
    // Do not publish a cached user before the guarded backend has verified it.
    if (readOnlyRef.current) return undefined;
    const u = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (u && token) {
      try {
        const parsed = JSON.parse(u);
        syncCrmSessionUserOnLogin(parsed?.id);
        setUser(parsed);
      } catch {}
      // Xác thực token trước khi mở socket — tránh connect_error "server error" khi token hết hạn.
      (async () => {
        try {
          const { data } = await api.get('/auth/me');
          if (data?.user) {
            const merged = { ...JSON.parse(u || '{}'), ...data.user };
            localStorage.setItem('user', JSON.stringify(merged));
            setUser(merged);
          }
          if (!readOnlyRef.current && !isFounderLocalReadOnlyActive()) {
            const s = connectSocket();
            setSocket(s);
          }
        } catch (err) {
          // 401 → interceptor đã logout. Mạng lỗi → vẫn thử socket với token cache.
          if (err?.response?.status !== 401) {
            if (!readOnlyRef.current && !isFounderLocalReadOnlyActive()) {
              const s = connectSocket();
              setSocket(s);
            }
          }
        }
      })();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!readOnlyMode) return undefined;
    let active = true;
    // A Founder credential may never survive the browser session. Remove any
    // legacy persistent copy before considering the tab-scoped session.
    clearAuthStorage(window.localStorage);
    const founderStorage = authStorage(true);
    const cachedUser = founderStorage.getItem('user');
    const token = founderStorage.getItem('token');

    disconnectSocket();
    setSocket(null);
    // Loading, rather than the cached role, owns the protected route while the
    // runtime-profile header and current database user are being attested.
    setUser(null);
    if (!cachedUser || !token) {
      clearFounderLocalCompanyScopeLock({ storage: founderStorage });
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get('/auth/me', { timeout: 10_000 });
        if (!data?.user) throw new Error('Backend không trả phiên Founder-local đã xác minh.');
        const merged = { ...JSON.parse(cachedUser || '{}'), ...data.user };
        if (!active) return;
        founderAttestedTokenRef.current = String(token).trim().replace(/^Bearer\s+/i, '');
        syncCrmSessionUserOnLogin(merged?.id);
        founderStorage.setItem('user', JSON.stringify(merged));
        setUser(merged);
      } catch (_) {
        if (!active) return;
        disconnectSocket();
        resetClientSessionState();
        clearAuthStorage(founderStorage);
        clearFounderLocalCompanyScopeLock({ storage: founderStorage });
        clearCrmSessionFilterStorage();
        clearCrmSessionUserMarker();
        founderAttestedTokenRef.current = null;
        setUser(null);
        setSocket(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [readOnlyMode]);

  // Layout timing closes an existing normal-session socket before the
  // Founder-local page can paint. Leaving the explicit profile restores the
  // normal realtime behavior without changing other routes.
  useLayoutEffect(() => {
    const wasReadOnly = previousReadOnlyRef.current;
    previousReadOnlyRef.current = readOnlyMode;
    if (readOnlyMode) {
      disconnectSocket();
      setSocket(null);
      return;
    }
    if (wasReadOnly && user && localStorage.getItem('token')) {
      const nextSocket = connectSocket();
      setSocket(nextSocket);
    }
  }, [readOnlyMode, user]);

  const login = async (email, password) => {
    // session_id sinh ở client → ghép cặp login → logout audit. Lưu cùng token để khi logout gửi lại.
    const sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { data } = await api.post(
      '/auth/login',
      { email, password, session_id: sessionId },
      { founderLocalAuth: readOnlyRef.current },
    );
    if (readOnlyRef.current) {
      assertFounderLocalLoginAttested(data);
      founderAttestedTokenRef.current = String(data?.token || '').trim().replace(/^Bearer\s+/i, '');
    }
    return applyAuthSession(data, sessionId);
  };

  const loginWithGoogle = async (credential, options = {}) => {
    const sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const body = { credential, session_id: sessionId };
    if (options.plan_id) body.plan_id = options.plan_id;
    const { data } = await api.post('/auth/google', body);
    return applyAuthSession(data, sessionId);
  };

  const applyAuthSession = async (auth, fallbackSessionId) => {
    disconnectSocket();
    resetClientSessionState();
    const sessionId = auth.session_id || fallbackSessionId
      || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    syncCrmSessionUserOnLogin(auth.user?.id);
    const storage = authStorage(readOnlyRef.current);
    if (readOnlyRef.current) {
      // A new token/session is a new scope-attestation boundary, even when the
      // same admin signs in again in the same browser tab.
      clearFounderLocalCompanyScopeLock({ storage });
      clearAuthStorage(window.localStorage);
    }
    storage.setItem('token', String(auth.token || '').trim().replace(/^Bearer\s+/i, ''));
    storage.setItem('user', JSON.stringify(auth.user));
    storage.setItem('session_id', sessionId);
    storage.setItem('login_ts', String(Date.now()));
    setUser(auth.user);
    if (!readOnlyRef.current && !isFounderLocalReadOnlyActive()) {
      const s = connectSocket();
      setSocket(s);
    } else {
      setSocket(null);
    }
    return auth.user;
  };

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/auth/me');
      if (data?.user) {
        const storage = authStorage(readOnlyRef.current);
        const prev = JSON.parse(storage.getItem('user') || '{}');
        const merged = { ...prev, ...data.user };
        storage.setItem('user', JSON.stringify(merged));
        setUser(merged);
        return merged;
      }
    } catch (_) {}
    return user;
  };

  const logout = async (reason = 'manual') => {
    const storage = authStorage(readOnlyRef.current);
    // Ngắt realtime ngay — không chờ API logout (tránh nhận tin tài khoản cũ).
    disconnectSocket();
    resetClientSessionState();
    setUser(null);
    setSocket(null);
    founderAttestedTokenRef.current = null;

    try {
      await flushNow();
    } catch (_) {}
    try {
      const sessionId = storage.getItem('session_id') || null;
      const loginTs = Number(storage.getItem('login_ts')) || null;
      const msSession = loginTs ? Date.now() - loginTs : null;
      await api.post('/auth/logout', {
        reason,
        session_id: sessionId,
        ms_session_duration: msSession,
      });
    } catch (_) { /* token hết hạn / mất mạng — vẫn logout cục bộ */ }
    clearAuthStorage(storage);
    if (readOnlyRef.current) {
      clearFounderLocalCompanyScopeLock({ storage });
      clearAuthStorage(window.localStorage);
    }
    clearCrmSessionFilterStorage();
    clearCrmSessionUserMarker();
  };

  const storedToken = String(authStorage(readOnlyMode).getItem('token') || '').trim().replace(/^Bearer\s+/i, '');
  const founderAttestationPending = readOnlyMode
    && Boolean(storedToken)
    && founderAttestedTokenRef.current !== storedToken;

  return (
    <AuthCtx.Provider value={{ user, loading: loading || founderAttestationPending, login, loginWithGoogle, logout, applyAuthSession, refreshUser, socket }}>
      <ActivityPingGate user={user} readOnlyMode={readOnlyMode}>{children}</ActivityPingGate>
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
