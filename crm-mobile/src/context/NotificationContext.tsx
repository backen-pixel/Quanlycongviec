import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, DeviceEventEmitter, Platform, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from './AuthContext';
import { isNotificationTypeEnabled } from '../lib/notificationPrefs';
import { isExpiryDeadlineNotificationType } from '../lib/operationalNotifications';
import { CRM_MOBILE_PREFS_CHANGED, loadCrmMobilePrefs, type CrmMobilePrefs } from '../lib/crmMobilePrefs';
import { rememberMessengerTargetFromNotification } from '../lib/messengerBubbleTarget';
import { navigateFromAppNotification } from '../lib/navigateFromAppNotification';
import {
  NOTIF_CHANNEL_CHAT,
  NOTIF_CHANNEL_SYSTEM,
  ensureAndroidPostNotificationsPermission,
} from '../lib/appPermissions';
import type { AppNotification, NotificationPrefs } from '../types/notifications';

/** Khi vừa bấm Home / tắt màn, AppState đôi khi còn "active" 1–2 frame — trì hoãn rồi mới quyết định toast trong app hay đẩy ra khay thông báo. */
const APP_VS_TRAY_DELAY_MS = Platform.OS === 'ios' ? 72 : 48;

/**
 * Đẩy thông báo local ra khay hệ thống / thanh trạng thái (app không ở foreground).
 * Android 13+: cần quyền POST_NOTIFICATIONS (Expo gộp trong requestPermissionsAsync).
 */
async function postLocalNotification(n: AppNotification): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const postOk = await ensureAndroidPostNotificationsPermission();
      if (!postOk) return;
    }
    const { status: perm } = await Notifications.getPermissionsAsync();
    if (perm !== 'granted') {
      const { status: req } = await Notifications.requestPermissionsAsync();
      if (req !== 'granted') return;
    }

    const isChat = n.type === 'messenger_chat' || n.type === 'lead_chat';
    const meta = n.metadata && typeof n.metadata === 'object'
      ? (n.metadata as Record<string, unknown>)
      : {};

    let title = n.title || 'CRM';
    let body = n.message || '';

    if (n.type === 'messenger_chat') {
      const sender = typeof meta.sender_name === 'string' ? meta.sender_name
        : typeof meta.sender === 'string' ? meta.sender : '';
      const group = typeof meta.group_name === 'string' ? meta.group_name : title;
      title = group;
      body = sender ? `${sender}: ${body}` : body;
    } else if (n.type === 'lead_chat') {
      const sender = typeof meta.sender_name === 'string' ? meta.sender_name : '';
      body = sender ? `${sender}: ${body}` : body;
    }

    const channelId = isChat ? NOTIF_CHANNEL_CHAT : NOTIF_CHANNEL_SYSTEM;

    const dataPayload = {
      notifId: n.id,
      type: n.type,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
      metadata: n.metadata,
      channelId,
    };

    if (Platform.OS === 'android') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          subtitle: 'TuBep CRM',
          data: dataPayload,
          // expo-notifications typings thay đổi theo version; Android-specific fields vẫn chạy thực tế.
          ...( {
            android: {
              channelId,
              color: '#0068FF',
              // Luôn bật âm mặc định — kênh cũng có sound: default (user có thể tắt trong Cài đặt TB)
              sound: true,
              // HIGH + kênh IMPORTANCE_HIGH → heads-up trên khay / khóa (tùy OEM & cài đặt user)
              priority: Notifications.AndroidNotificationPriority.HIGH,
              vibrate: isChat ? [0, 200, 100, 200] : [0, 120, 80, 120],
            },
          } as unknown as Record<string, unknown>),
        },
        trigger: null,
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: isChat ? 'default' : undefined,
          data: dataPayload,
        },
        trigger: null,
      });
    }
  } catch {
    /* ignore — không block socket handler */
  }
}

type Listener = (n: AppNotification) => void;

/** Thông báo tin nhắn (lead chat + Messenger nhóm/1–1) — không gồm task/deadline/hệ thống */
export function isChatNotification(n: { type?: string } | null | undefined): boolean {
  const t = n?.type;
  return t === 'lead_chat' || t === 'messenger_chat';
}

type Ctx = {
  /** Tất cả thông báo chưa đọc (tab / Trung tâm thông báo) */
  unreadCount: number;
  /** Chỉ tin nhắn chat lead — dùng cho bong bóng chat */
  chatUnreadCount: number;
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
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
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
      const { data } = await api.get<{ stats?: { unread?: number; unread_chat?: number } }>('/dashboard');
      const u = data?.stats?.unread;
      const uc = data?.stats?.unread_chat;
      setUnreadCount(typeof u === 'number' ? u : 0);
      setChatUnreadCount(typeof uc === 'number' ? uc : 0);
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
    if (!token) {
      setToast(null);
      setUnreadCount(0);
      setChatUnreadCount(0);
    }
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

    const trayDelayTimers: ReturnType<typeof setTimeout>[] = [];

    const onNotif = (raw: unknown) => {
      const n = raw as AppNotification;
      if (isExpiryDeadlineNotificationType(n?.type)) return;
      if (!isNotificationTypeEnabled(prefsRef.current, n?.type, n?.entity_type)) return;
      setUnreadCount((c) => c + 1);
      if (isChatNotification(n)) setChatUnreadCount((c) => c + 1);
      if (n?.type === 'messenger_chat') rememberMessengerTargetFromNotification(n);

      const decideToastOrTray = () => {
        const state = AppState.currentState;
        // Android: luôn đăng TB hệ thống (âm + rung + khay). Trước đây chỉ toast khi app mở → không có âm/khay.
        if (Platform.OS === 'android') {
          void postLocalNotification(n);
          if (state === 'active') setToast(n);
          return;
        }
        if (state === 'active') {
          setToast(n);
        } else {
          void postLocalNotification(n);
        }
      };

      const tid = setTimeout(decideToastOrTray, APP_VS_TRAY_DELAY_MS);
      trayDelayTimers.push(tid);

      listenersRef.current.forEach((fn) => {
        try {
          fn(n);
        } catch {
          /* ignore */
        }
      });
    };

    s.on('notification', onNotif);

    // Xử lý tap vào notification → điều hướng đến màn hình đúng
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (!data) return;
      const fakeNotif: AppNotification = {
        id: String(data.notifId || ''),
        type: String(data.type || ''),
        title: String(response.notification.request.content.title || ''),
        message: String(response.notification.request.content.body || ''),
        entity_type: data.entity_type as string | null,
        entity_id: data.entity_id as string | null,
        is_read: false,
        created_at: new Date().toISOString(),
        metadata: data.metadata as Record<string, unknown> | undefined,
      };
      // Chờ navigation sẵn sàng (app có thể vừa khởi động từ notification tap)
      let tries = 0;
      const tryNav = () => {
        try {
          navigateFromAppNotification(fakeNotif);
        } catch {
          if (tries++ < 20) setTimeout(tryNav, 150);
        }
      };
      setTimeout(tryNav, 300);
    });

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
      trayDelayTimers.forEach((id) => clearTimeout(id));
      appSub.remove();
      tapSub.remove();
      s.off('notification', onNotif);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [authLoading, token]);

  const value = useMemo(
    () => ({
      unreadCount,
      chatUnreadCount,
      prefs,
      toast,
      dismissToast,
      refreshUnread,
      loadPrefs,
      updatePrefs,
      subscribeIncoming,
    }),
    [unreadCount, chatUnreadCount, prefs, toast, dismissToast, refreshUnread, loadPrefs, updatePrefs, subscribeIncoming],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications outside NotificationProvider');
  return v;
}
