import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../api/client';
import { stopVoiceForegroundSyncLogout } from '../lib/voiceBackgroundSync';
import { registerPushToken, unregisterPushToken } from '../lib/pushRegistration';
import { startDeviceHeartbeat, stopDeviceHeartbeat } from '../lib/deviceHeartbeat';

const USER_KEY = 'crm_user_json';

export type AuthUser = {
  id: string;
  userId?: string;
  email: string;
  full_name?: string;
  fullName?: string;
  role?: string;
  company_id?: string | null;
  avatar?: string | null;
  phone?: string | null;
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
    (async () => {
      try {
        const [t, u] = await Promise.all([getStoredToken(), AsyncStorage.getItem(USER_KEY)]);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
          void registerPushToken();
          startDeviceHeartbeat();
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sau khi khôi phục từ AsyncStorage, gọi /auth/me để cập nhật avatar/profile mới —
  // tránh phải đăng xuất/đăng nhập lại khi đổi avatar trên web.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ user?: AuthUser }>('/auth/me');
        if (cancelled || !data?.user) return;
        const merged: AuthUser = { ...(user || {}), ...data.user };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
        setUser(merged);
      } catch {
        /* token hết hạn / offline → giữ cache cũ */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Chỉ chạy 1 lần khi token sẵn sàng — bỏ qua `user` để tránh loop khi merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email: email.trim(), password });
    await setStoredToken(data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    void registerPushToken();
    startDeviceHeartbeat();
  }, []);

  const logout = useCallback(async () => {
    stopDeviceHeartbeat();
    await unregisterPushToken();
    await stopVoiceForegroundSyncLogout();
    await setStoredToken(null);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void (async () => {
        stopDeviceHeartbeat();
        await unregisterPushToken();
        await stopVoiceForegroundSyncLogout();
        await AsyncStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
