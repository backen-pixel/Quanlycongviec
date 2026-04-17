import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, DeviceEventEmitter, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from './AuthContext';
import { isNotificationTypeEnabled } from '../lib/notificationPrefs';
import { CRM_MOBILE_PREFS_CHANGED, loadCrmMobilePrefs, type CrmMobilePrefs } from '../lib/crmMobilePrefs';
import type { AppNotification, NotificationPrefs } from '../types/notifications';

type Listener = (n: AppNotification) => void;

type Ctx = {
  unreadCount: number;
  prefs: NotificationPrefs | null;
  /** Toast in-app (socket) — giống NotificationToast web */
  toast: AppNotification | null;
  dismissToast: () => void;
  refreshUnread: () => Promise<void>;
  loadPrefs: () => Promise<void>;
  updatePrefs: (patch: Partial<NotificationPrefs>) => Promise<void>;
  /** Đăng ký nhận thông báo realtime (socket), ví dụ để prepend list */
  subscribeIncoming: (fn: Listener) => () => void;
};

const Ctx = createContext<Ctx | null>(null);

const POLL_MS = 30000;

function userId(u: { id?: string; userId?: string } | null): string | undefined {
  if (!u) return undefined;
  return u.id || u.userId;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user, loading: authLoading } = useAuth();
  const uid = userId(user);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const prefsRef = useRef<NotificationPrefs | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  /** Giữ socket khi app nền — mặc định true; tắt trong Cài đặt CRM mobile. */
  const backgroundRealtimeRef = useRef(true);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await api.get<{ stats?: { unread?: number } }>('/dashboard');
      const u = data?.stats?.unread;
      setUnreadCount(typeof u === 'number' ? u : 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    try {
      const { data } = await api.get<NotificationPrefs>('/push/preferences');
      setPrefs(data || {});
    } catch {
      setPrefs({});
    }
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<NotificationPrefs>) => {
    const { data } = await api.put<NotificationPrefs>('/push/preferences', patch);
    setPrefs(data || { ...prefsRef.current, ...patch });
  }, []);

  const subscribeIncoming = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (authLoading || !token || !uid) return;
    void refreshUnread();
    void loadPrefs();
    const id = setInterval(() => void refreshUnread(), POLL_MS);
    return () => clearInterval(id);
  }, [authLoading, token, uid, refreshUnread, loadPrefs]);

  useEffect(() => {
    const syncBg = () => {
      void loadCrmMobilePrefs().then((p) => {
        backgroundRealtimeRef.current = p.backgroundRealtimeEnabled !== false;
      });
    };
    syncBg();
    const subPrefs = DeviceEventEmitter.addListener(CRM_MOBILE_PREFS_CHANGED, (p: CrmMobilePrefs) => {
      backgroundRealtimeRef.current = p.backgroundRealtimeEnabled !== false;
      if (!backgroundRealtimeRef.current && AppState.currentState !== 'active') {
        socketRef.current?.disconnect();
      }
    });
    return () => subPrefs.remove();
  }, []);

  useEffect(() => {
    if (authLoading || !token) return;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        void loadCrmMobilePrefs().then((p) => {
          backgroundRealtimeRef.current = p.backgroundRealtimeEnabled !== false;
        });
        void refreshUnread();
      }
    });
    return () => sub.remove();
  }, [authLoading, token, refreshUnread]);

  useEffect(() => {
    if (!token) setToast(null);
  }, [token]);

  useEffect(() => {
    if (authLoading || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const s = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 12,
    });

    socketRef.current = s;

    const onNotif = (raw: unknown) => {
      const n = raw as AppNotification;
      if (!isNotificationTypeEnabled(prefsRef.current, n?.type, n?.entity_type)) return;
      setUnreadCount((c) => c + 1);
      setToast(n);
      listenersRef.current.forEach((fn) => {
        try {
          fn(n);
        } catch {
          /* ignore */
        }
      });
    };

    s.on('notification', onNotif);

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        if (!s.connected) s.connect();
        return;
      }
      if (!backgroundRealtimeRef.current) {
        s.disconnect();
      }
    };

    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      appSub.remove();
      s.off('notification', onNotif);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [authLoading, token]);

  const value = useMemo(
    () => ({
      unreadCount,
      prefs,
      toast,
      dismissToast,
      refreshUnread,
      loadPrefs,
      updatePrefs,
      subscribeIncoming,
    }),
    [unreadCount, prefs, toast, dismissToast, refreshUnread, loadPrefs, updatePrefs, subscribeIncoming],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications outside NotificationProvider');
  return v;
}
