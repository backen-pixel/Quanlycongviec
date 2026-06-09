import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../api/client';
import {
  canDrawOverlays,
  ensureOverlayPermissionInteractive,
  isBubbleOverlaySupported,
  startSystemBubbleOverlay,
} from '../lib/floatingBubbleOverlay';
import { registerPushToken, unregisterPushToken } from '../lib/pushRegistration';
import { startDeviceHeartbeat, stopDeviceHeartbeat } from '../lib/deviceHeartbeat';

const USER_KEY = 'sx_user_json';
const OVERLAY_PROMPT_KEY = 'sx_overlay_prompt_v1';

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
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sau khi khôi phục token, refresh profile từ /auth/me (không đá user ra nếu lỗi).
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let cancelled = false;
    const tokenAtStart = token;
    (async () => {
      try {
        const { data } = await api.get<{ user?: AuthUser }>('/auth/me', { signal: controller.signal });
        if (cancelled || !data?.user || tokenAtStart !== token) return;
        const merged: AuthUser = { ...(user || {}), ...data.user };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
        setUser(merged);
      } catch {
        /* giữ cache cũ */
      }
    })();
    return () => {
      cancelled = true;
      try {
        controller.abort();
      } catch {
        /* */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email: email.trim(), password });
    await setStoredToken(data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    startDeviceHeartbeat();
    void registerPushToken();
  }, []);

  useEffect(() => {
    if (token) {
      startDeviceHeartbeat();
      void registerPushToken();
    } else {
      stopDeviceHeartbeat();
    }
  }, [token]);

  useEffect(() => {
    if (!token || !isBubbleOverlaySupported()) return;
    void (async () => {
      const done = await AsyncStorage.getItem(OVERLAY_PROMPT_KEY);
      if (done === '1') return;
      await AsyncStorage.setItem(OVERLAY_PROMPT_KEY, '1');
      const ok = await ensureOverlayPermissionInteractive({
        title: 'Bong bóng chat ngoài app',
        message:
          'Cho phép "Hiển thị trên các ứng dụng khác" để bong bóng chat xuất hiện khi bạn dùng app khác (giống Zalo/Messenger).',
      });
      if (ok && (await canDrawOverlays())) await startSystemBubbleOverlay();
    })();
  }, [token]);

  const logout = useCallback(async () => {
    stopDeviceHeartbeat();
    await unregisterPushToken();
    await setStoredToken(null);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void (async () => {
        stopDeviceHeartbeat();
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
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider');
  return v;
}
