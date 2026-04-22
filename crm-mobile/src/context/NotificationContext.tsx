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
import { CRM_MOBILE_PREFS_CHANGED, loadCrmMobilePrefs, type CrmMobilePrefs } from '../lib/crmMobilePrefs';
import { rememberMessengerTargetFromNotification } from '../lib/messengerBubbleTarget';
import { navigateFromAppNotification } from '../lib/navigateFromAppNotification';
import { NOTIF_CHANNEL_CHAT, NOTIF_CHANNEL_SYSTEM } from '../lib/appPermissions';
import type { AppNotification, NotificationPrefs } from '../types/notifications';

/**
 * Post Android Heads-up notification khi socket nhận tin nhắn mà app đang ở background.
 * - messenger_chat / lead_chat → kênh crm_chat (IMPORTANCE_HIGH → Heads-up + âm thanh + rung)
 * - khác → kênh crm_system (IMPORTANCE_DEFAULT → chỉ status bar icon)
 */
async function postLocalNotification(n: AppNotification): Promise<void> {
  try {
    const isChat = n.type === 'messenger_chat' || n.type === 'lead_chat';
    const meta = n.metadata && typeof n.metadata === 'object'
      ? (n.metadata as Record<string, unknown>)
      : {};

    // Tạo title / body thân thiện
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

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: isChat ? 'default' : undefined,
        badge: 1,
        // channelId — Android only, expo-notifications tự bỏ qua trên iOS
        channelId,
        // color + priority + vibrate — Android specific fields trong NotificationContentInput
        color: '#0068FF',
        priority: isChat
          ? Notifications.AndroidNotificationPriority.HIGH
          : Notifications.AndroidNotificationPriority.DEFAULT,
        vibrate: isChat ? [0, 200, 100, 200] : undefined,
        data: {
          notifId: n.id,
          type: n.type,
          entity_type: n.entity_type,
          entity_id: n.entity_id,
          metadata: n.metadata,
          channelId,
        },
      },
      trigger: null, // Hiển thị ngay lập tức
    });
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

    const onNotif = (raw: unknown) => {
      const n = raw as AppNotification;
      if (!isNotificationTypeEnabled(prefsRef.current, n?.type, n?.entity_type)) return;
      setUnreadCount((c) => c + 1);
      if (isChatNotification(n)) setChatUnreadCount((c) => c + 1);
      if (n?.type === 'messenger_chat') rememberMessengerTargetFromNotification(n);

      const appState = AppState.currentState;
      if (appState === 'active') {
        // App đang mở → chỉ hiện in-app toast, KHÔNG post system notification
        // (tránh Heads-up notification làm "bị out khỏi app" khi vô tình tap)
        setToast(n);
      } else {
        // App background / inactive → post local notification (Heads-up / Lock Screen)
        // API 30+: ChatBubbleOverlayService cũng post bubble notification từ background
        // nhưng bubble notification là dạng bubble (khác), còn local notification hiển thị
        // trong notification tray — hai loại này bổ sung cho nhau, không xung đột.
        void postLocalNotification(n);
      }

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
