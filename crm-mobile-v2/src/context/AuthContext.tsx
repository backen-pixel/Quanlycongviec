import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getStoredToken, setStoredToken, setUnauthorizedHandler, hydrateMemoryToken } from '../api/client';
import { invalidatePlannerCache, invalidateCrmHubCache } from '../api/crm';
import {
  stopVoiceBackgroundSyncLoop,
  syncVoiceBackgroundTaskWithPrefs,
} from '../lib/voiceBackgroundSync';
import { startDeviceHeartbeat, stopDeviceHeartbeat } from '../lib/deviceHeartbeat';
import { registerPushTokenV2, unregisterPushTokenV2 } from '../lib/pushNotifications';
import { syncNativeAuthPrefs } from '../lib/nativeAuthSync';

const USER_KEY = 'crmv2_user_json';

export type AuthUser = {
  id: string;
  userId?: string;
  email: string;
  full_name?: string;
  fullName?: string;
  role?: string;
  avatar?: string | null;
  phone?: string | null;
  company_id?: string | null;
  position?: string | null;
  department_id?: string | null;
};

function mergeAuthUser(prev: AuthUser | null, next: Partial<AuthUser>): AuthUser {
  return {
    id: next.id || prev?.id || next.userId || prev?.userId || '',
    email: next.email || prev?.email || '',
    ...prev,
    ...next,
  };
}

type AuthCtx = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithSession: (auth: { token: string; user: AuthUser; session_id?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: (next?: AuthUser | null) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [t, u] = await Promise.all([getStoredToken(), AsyncStorage.getItem(USER_KEY)]);
        hydrateMemoryToken(t);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshProfile = useCallback(async (next?: AuthUser | null) => {
    try {
      if (next) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(next));
        setUser(next);
        return;
      }
      const { data } = await api.get<{ user?: AuthUser }>('/auth/me');
      if (data?.user) {
        setUser((prev) => {
          const merged = mergeAuthUser(prev, data.user!);
          void AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
          return merged;
        });
      }
    } catch {
      /* giữ cache cũ */
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    startDeviceHeartbeat();
    // Đăng ký FCM token để nhận thông báo trên thanh hệ thống (kể cả khi app đóng).
    void registerPushTokenV2();
    syncNativeAuthPrefs({
      token,
      userId: user?.id || user?.userId || null,
    });
    const controller = new AbortController();
    void (async () => {
      try {
        const { data } = await api.get<{ user?: AuthUser }>('/auth/me', { signal: controller.signal });
        if (data?.user) {
          setUser((prev) => {
            const merged = mergeAuthUser(prev, data.user!);
            void AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
            return merged;
          });
        }
      } catch {
        /* giữ cache cũ */
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id, user?.userId]);

  const loginWithSession = useCallback(async (auth: { token: string; user: AuthUser; session_id?: string }) => {
    invalidatePlannerCache();
    invalidateCrmHubCache();
    await setStoredToken(auth.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    setToken(auth.token);
    setUser(auth.user);
    startDeviceHeartbeat();
    syncNativeAuthPrefs({
      token: auth.token,
      userId: auth.user?.id || auth.user?.userId || null,
    });
    void syncVoiceBackgroundTaskWithPrefs();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    invalidatePlannerCache();
    invalidateCrmHubCache();
    const { data } = await api.post('/auth/login', { email: email.trim(), password });
    await loginWithSession({ token: data.token, user: data.user, session_id: data.session_id });
  }, [loginWithSession]);

  const logout = useCallback(async () => {
    invalidatePlannerCache();
    invalidateCrmHubCache();
    stopVoiceBackgroundSyncLoop();
    stopDeviceHeartbeat();
    await unregisterPushTokenV2();
    await setStoredToken(null);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void AsyncStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, loginWithSession, logout, refreshProfile }),
    [user, token, loading, login, loginWithSession, logout, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider');
  return v;
}

export function currentUserId(user: AuthUser | null): string {
  return user?.id || user?.userId || '';
}
