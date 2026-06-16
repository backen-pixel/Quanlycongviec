import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../api/client';
import { invalidatePlannerCache, invalidateCrmHubCache } from '../api/crm';
import {
  stopVoiceBackgroundSyncLoop,
  syncVoiceBackgroundTaskWithPrefs,
} from '../lib/voiceBackgroundSync';
import { registerPushTokenV2, unregisterPushTokenV2 } from '../lib/pushNotifications';

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
};

type AuthCtx = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  useEffect(() => {
    if (!token) return;
    // Đăng ký FCM token để nhận thông báo trên thanh hệ thống (kể cả khi app đóng).
    void registerPushTokenV2();
    const controller = new AbortController();
    void (async () => {
      try {
        const { data } = await api.get<{ user?: AuthUser }>('/auth/me', { signal: controller.signal });
        if (data?.user) {
          const merged = { ...(user || {}), ...data.user };
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
          setUser(merged);
        }
      } catch {
        /* giữ cache cũ */
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    invalidatePlannerCache();
    invalidateCrmHubCache();
    const { data } = await api.post('/auth/login', { email: email.trim(), password });
    await setStoredToken(data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    void syncVoiceBackgroundTaskWithPrefs();
  }, []);

  const logout = useCallback(async () => {
    invalidatePlannerCache();
    invalidateCrmHubCache();
    stopVoiceBackgroundSyncLoop();
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
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout],
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
