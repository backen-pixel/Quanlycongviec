import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { isChatNotification, useNotifications } from '../context/NotificationContext';
import { navigationRef } from '../navigation/navigationRef';
import {
  CRM_MOBILE_PREFS_CHANGED,
  loadCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import { API_ORIGIN, WEB_APP_ORIGIN } from '../config';
import { toBubbleStorageKey, parseBubbleStorageKey } from '../lib/bubbleNativeEvents';
import { markLeadChatRead, markMessengerGroupRead } from '../lib/markChatRead';
import type { AppNotification } from '../types/notifications';
import { api } from '../api/client';
import { io, type Socket } from 'socket.io-client';
import { getForegroundLead } from '../lib/bubbleRealtimeSocket';

const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      canDrawOverlays?: () => Promise<boolean>;
      startOverlay?: () => Promise<boolean>;
      stopOverlay?: () => Promise<boolean>;
      setBadgeCount?: (n: number) => void;
      consumeOpenMessenger?: () => Promise<boolean>;
      saveAuthToken?: (token: string) => void;
      saveWebOrigin?: (origin: string) => void;
      setPreferBubblesApi?: (prefer: boolean) => void;
      showConvBubble?: (groupId: string, title: string, avatarLetter: string) => void;
      hideConvBubble?: (groupId: string) => void;
      showPeek?: (sender: string, message: string, bubbleKey: string | null) => void;
      noteConv?: (groupId: string, title: string, avatarLetter: string) => void;
      noteConvWithAvatar?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
      ) => void;
      pushIncomingMessage?: (
        bubbleKey: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
        senderName: string,
        message: string,
      ) => void;
      seedConversationMessages?: (bubbleKey: string, msgsJson: string) => void;
      saveApiOrigin?: (origin: string) => void;
      consumePendingGroup?: () => Promise<string | null>;
      minimizeApp?: () => void;
      // Phase 3: Android Bubbles API
      areBubblesSupported?: () => Promise<boolean>;
      postBubbleNotification?: (
        bubbleKey: string,
        title: string,
        senderName: string,
        message: string,
        avatarLetter: string,
        autoExpand: boolean,
      ) => void;
      cancelBubbleNotification?: (bubbleKey: string) => void;
      isBubbleExpanded?: (bubbleKey: string) => Promise<boolean>;
      saveUserAvatarUrl?: (url: string) => void;
      showConvBubbleWithAvatar?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
      ) => void;
      // Phase 2+5: native bridges cho FCM & reactions
      consumeFcmToken?: () => Promise<string | null>;
      saveUserId?: (userId: string) => void;
      applyReactions?: (bubbleKey: string, messageId: string, reactionsJson: string) => void;
      // Phase 4 (notif): local heads-up notification khi app foreground
      postChatNotification?: (
        bubbleKey: string,
        title: string,
        sender: string,
        avatar: string | null,
        message: string,
        messageId: string | null,
        messageType: string | null,
      ) => void;
      cancelChatNotification?: (bubbleKey: string) => void;
    }
  | undefined;

function absoluteAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const u = raw.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base = (API_ORIGIN || '').replace(/\/$/, '');
  return base ? `${base}/${u.replace(/^\//, '')}` : u;
}

function metaRecord(n: AppNotification): Record<string, unknown> {
  return n.metadata && typeof n.metadata === 'object'
    ? (n.metadata as Record<string, unknown>)
    : {};
}

function displayTitleForChat(n: AppNotification): {
  bubbleKey: string;
  title: string;
  letter: string;
  senderName: string;
  senderLetter: string;
  senderAvatarUrl: string;
} {
  const meta = metaRecord(n);
  const entityId = String(n.entity_id || '');
  const bubbleKey = toBubbleStorageKey(n.type, entityId);
  const senderName =
    typeof meta.sender_name === 'string'
      ? meta.sender_name
      : typeof meta.sender === 'string'
        ? meta.sender
        : 'Tin nhắn mới';
  const senderLetter = senderName.trim()[0]?.toUpperCase() ?? '?';
  const senderAvatarUrl = absoluteAvatarUrl(meta.sender_avatar);

  if (n.type === 'lead_chat') {
    const leadTitle = n.title || 'Lead';
    const display = `🤝 ${leadTitle}`;
    const letter = display.trim()[0]?.toUpperCase() ?? 'L';
    return { bubbleKey, title: display, letter, senderName, senderLetter, senderAvatarUrl };
  }

  if (n.type === 'department_chat') {
    const deptName =
      typeof meta.dept_name === 'string'
        ? meta.dept_name
        : (n.title ?? 'Phòng ban');
    const letter = String(deptName).trim()[0]?.toUpperCase() ?? 'P';
    return { bubbleKey, title: deptName, letter, senderName, senderLetter, senderAvatarUrl };
  }

  const groupName = typeof meta.group_name === 'string' ? meta.group_name : (n.title ?? entityId);
  const letter = String(groupName).trim()[0]?.toUpperCase() ?? '?';
  return { bubbleKey, title: groupName, letter, senderName, senderLetter, senderAvatarUrl };
}

function pushOverlayBubble(
  bubbleKey: string,
  title: string,
  avatarLetter: string,
  senderAvatarUrl: string,
) {
  if (!Overlay) return;
  if (senderAvatarUrl && Overlay.showConvBubbleWithAvatar) {
    Overlay.showConvBubbleWithAvatar(bubbleKey, title, avatarLetter, senderAvatarUrl);
  } else {
    Overlay.showConvBubble?.(bubbleKey, title, avatarLetter);
  }
}

function noteOverlayConv(
  bubbleKey: string,
  title: string,
  avatarLetter: string,
  senderAvatarUrl: string,
) {
  if (!Overlay) return;
  if (senderAvatarUrl && Overlay.noteConvWithAvatar) {
    Overlay.noteConvWithAvatar(bubbleKey, title, avatarLetter, senderAvatarUrl);
  } else {
    Overlay.noteConv?.(bubbleKey, title, avatarLetter);
  }
}

/** Hiện bong bóng overlay khi có tin chat (cần quyền «Hiển thị trên app khác»). */
async function showChatBubbleForMessage(
  n: AppNotification,
  prefs: CrmMobilePrefs | null,
  opts?: { isActive?: boolean },
) {
  if (Platform.OS !== 'android' || !Overlay) return;
  if (!prefs?.floatingChatBubbleEnabled || !prefs?.floatingChatBubbleSystemOverlay) return;

  const { bubbleKey, title, letter, senderName, senderLetter, senderAvatarUrl } =
    displayTitleForChat(n);
  if (!bubbleKey) return;

  const bubbleAvatarLetter = senderLetter || letter;
  const msgContent = n.message ?? '';
  const meta = metaRecord(n);
  const messageId =
    typeof meta.message_id === 'string'
      ? meta.message_id
      : typeof n.id === 'string' || typeof n.id === 'number'
        ? String(n.id)
        : null;
  const messageType = typeof meta.message_type === 'string' ? meta.message_type : null;
  const isActive = opts?.isActive ?? AppState.currentState === 'active';

  if (isActive) {
    const fgLead = getForegroundLead();
    if (fgLead && bubbleKey === `lead:${fgLead}`) {
      try {
        Overlay.cancelChatNotification?.(bubbleKey);
      } catch {
        /* */
      }
      return;
    }
  }

  const can = await Overlay.canDrawOverlays?.().catch(() => false);
  if (!can) return;

  pushOverlayBubble(bubbleKey, title, bubbleAvatarLetter, senderAvatarUrl);
  noteOverlayConv(bubbleKey, title, bubbleAvatarLetter, senderAvatarUrl);

  if (isActive) {
    try {
      Overlay.postChatNotification?.(
        bubbleKey,
        title,
        senderName,
        senderAvatarUrl || null,
        msgContent,
        messageId,
        messageType,
      );
    } catch {
      /* ignore */
    }
  } else {
    try {
      Overlay.showPeek?.(senderName, msgContent, bubbleKey);
    } catch {
      /* ignore */
    }
  }
}

function notificationFromPushData(
  data: Record<string, unknown>,
  body: string,
  title: string,
): AppNotification | null {
  const type = typeof data.type === 'string' ? data.type : '';
  if (!isChatNotification({ type })) return null;
  const meta =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : data;
  return {
    id: `push-${Date.now()}`,
    type: type as AppNotification['type'],
    entity_type: typeof data.entity_type === 'string' ? data.entity_type : null,
    entity_id:
      typeof data.entity_id === 'string' || typeof data.entity_id === 'number'
        ? String(data.entity_id)
        : null,
    message: body,
    title,
    metadata: meta,
    is_read: false,
    created_at: new Date().toISOString(),
  };
}

/**
 * Đồng bộ bong bóng native (Android overlay) với prefs + badge + mở chat khi chạm bubble.
 */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const { chatUnreadCount, subscribeIncoming, refreshUnread } = useNotifications();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const lastTokenRef = useRef<string | null>(null);

  const badge = Math.max(0, Number(chatUnreadCount) || 0);

  useEffect(() => {
    let cancelled = false;
    void loadCrmMobilePrefs().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    const sub = DeviceEventEmitter.addListener(CRM_MOBILE_PREFS_CHANGED, (p: CrmMobilePrefs) =>
      setPrefs(p),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;
    if (token && token !== lastTokenRef.current) {
      lastTokenRef.current = token;
      Overlay.saveAuthToken?.(token);
      const webOrigin = WEB_APP_ORIGIN || API_ORIGIN;
      if (webOrigin) Overlay.saveWebOrigin?.(webOrigin);
      if (API_ORIGIN) Overlay.saveApiOrigin?.(API_ORIGIN);
      const uid = (user as unknown as { id?: string; userId?: string } | null)?.id
        || (user as unknown as { id?: string; userId?: string } | null)?.userId;
      if (uid) Overlay.saveUserId?.(String(uid));
    }
  }, [token, user]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;

    const sync = () => {
      void (async () => {
        if (!token || !user || !prefs) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        const master = prefs.floatingChatBubbleEnabled;
        const sys = prefs.floatingChatBubbleSystemOverlay;
        const onlyUnread = prefs.floatingChatBubbleOnlyWhenUnread;
        if (!master || !sys) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        if (onlyUnread && badge === 0) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        const can = await Overlay.canDrawOverlays?.().catch(() => false);
        if (!can) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        await Overlay.startOverlay?.().catch(() => {});
      })();
    };

    sync();
    // Khi app rời foreground (kéo về home / vuốt khỏi Recents), gọi startOverlay lại để
    // re-attach bubble — quan trọng cho trường hợp user đã ẩn bubble (kéo xuống đáy) hoặc
    // service mới được Android restart sau khi swipe app khỏi Recents.
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') sync();
    });
    return () => sub.remove();
  }, [token, user, prefs, badge]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.setBadgeCount) return;
    Overlay.setBadgeCount(badge);
  }, [badge]);

  /**
   * Realtime reaction cho LEAD chat:
   * Tạo 1 socket riêng (chỉ join các lead room có bubble đang hiển thị) để forward
   * `lead:reactions` → `Overlay.applyReactions` (refresh panel native).
   *
   * Socket chỉ tồn tại khi:
   *  - đăng nhập (token + user)
   *  - có ít nhất 1 lead bubble trong stack
   */
  const joinedLeadsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.applyReactions) return;
    if (!token) return;

    let socket: Socket | null = null;
    let cancelled = false;

    const refresh = async () => {
      try {
        if (!Overlay?.applyReactions) return;
        // Lấy stack hiện tại từ native (giữ "đồng bộ" với những gì bubble đang hiển thị)
        const stack = await ((NativeModules.FloatingBubbleOverlay as unknown) as {
          getBubbleStack?: () => Promise<Array<{ key: string }>>;
        })?.getBubbleStack?.();
        const leadIds = (Array.isArray(stack) ? stack : [])
          .map((e) => e.key)
          .filter((k) => k.startsWith('lead:'))
          .map((k) => k.slice('lead:'.length));
        if (cancelled) return;
        if (leadIds.length === 0) {
          if (socket) {
            socket.disconnect();
            socket = null;
            joinedLeadsRef.current.clear();
          }
          return;
        }
        if (!socket) {
          socket = io(API_ORIGIN, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000,
          });
          socket.on('connect', () => {
            for (const id of joinedLeadsRef.current) socket?.emit('join:lead', id);
          });
          socket.on('lead:reactions', (p: { message_id?: string; reactions?: unknown[] }) => {
            const msgId = p?.message_id;
            const rxs = Array.isArray(p?.reactions) ? p.reactions : [];
            if (!msgId) return;
            // Tin nhắn có thể thuộc 1 trong các lead bubble đang stack → broadcast cho tất cả.
            for (const id of joinedLeadsRef.current) {
              Overlay?.applyReactions?.(`lead:${id}`, String(msgId), JSON.stringify(rxs));
            }
          });
        }
        const cur = joinedLeadsRef.current;
        for (const id of leadIds) {
          if (!cur.has(id)) {
            cur.add(id);
            socket?.emit('join:lead', id);
          }
        }
        for (const id of Array.from(cur)) {
          if (!leadIds.includes(id)) {
            cur.delete(id);
            socket?.emit('leave:lead', id);
          }
        }
      } catch {
        /* ignore */
      }
    };

    void refresh();
    // Refresh khi panel mở (key mới) hoặc khi bubble stack thay đổi
    const sub1 = DeviceEventEmitter.addListener('BubblePanelOpened', () => void refresh());
    const sub2 = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    const interval = setInterval(refresh, 30000);

    return () => {
      cancelled = true;
      sub1.remove();
      sub2.remove();
      clearInterval(interval);
      socket?.disconnect();
      joinedLeadsRef.current.clear();
    };
  }, [token]);

  /**
   * Khi user tap bong bóng → native phát "BubblePanelOpened" → ta fetch lịch sử
   * chat của conversation đó rồi seed vào panel native.
   */
  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.seedConversationMessages) return;
    const sub = DeviceEventEmitter.addListener(
      'BubblePanelOpened',
      (p: { key?: string } | null) => {
        const key = p?.key;
        if (!key) return;
        void seedBubbleHistory(key);
        // Native panel mở = user đã đọc → mark read + refresh badge để giảm số trên bubble.
        void (async () => {
          try {
            const parsed = parseBubbleStorageKey(key);
            if (parsed.kind === 'lead') await markLeadChatRead(parsed.entityId);
            else if (parsed.kind === 'messenger') await markMessengerGroupRead(parsed.entityId);
          } catch { /* ignore */ }
          void refreshUnread();
        })();
      },
    );
    return () => sub.remove();
  }, [refreshUnread]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;
    const unsub = subscribeIncoming((n) => {
      if (!isChatNotification(n)) return;
      void showChatBubbleForMessage(n, prefs, {
        isActive: AppState.currentState === 'active',
      });
    });
    return unsub;
  }, [subscribeIncoming, prefs]);

  /** Push/FCM khi app nền — socket có thể đã ngắt. */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      if (AppState.currentState === 'active') return;
      const data = notification.request.content.data;
      if (!data || typeof data !== 'object') return;
      const n = notificationFromPushData(
        data as Record<string, unknown>,
        notification.request.content.body || '',
        notification.request.content.title || '',
      );
      if (n) void showChatBubbleForMessage(n, prefs, { isActive: false });
    });
    return () => sub.remove();
  }, [prefs]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;

    const navigateFromBubbleKey = async (bubbleKey: string) => {
      const parsed = parseBubbleStorageKey(bubbleKey);
      try {
        if (parsed.kind === 'lead') {
          await markLeadChatRead(parsed.entityId);
          void refreshUnread();
          if (!navigationRef.isReady()) return;
          navigationRef.navigate('Main', {
            screen: 'CrmTab',
            params: {
              screen: 'LeadDetail',
              params: { id: parsed.entityId, openLeadChat: true },
            },
          });
          return;
        }
        await markMessengerGroupRead(parsed.entityId);
        void refreshUnread();
        if (!navigationRef.isReady()) return;
        navigationRef.navigate('BubbleChat', { groupId: parsed.entityId });
      } catch {
        if (!navigationRef.isReady()) return;
        if (parsed.kind === 'lead') {
          navigationRef.navigate('Main', {
            screen: 'CrmTab',
            params: {
              screen: 'LeadDetail',
              params: { id: parsed.entityId, openLeadChat: true },
            },
          });
        } else {
          navigationRef.navigate('BubbleChat', { groupId: parsed.entityId });
        }
      }
    };

    const tryNavigate = () => {
      void (async () => {
        try {
          const pendingKey = await Overlay.consumePendingGroup?.();
          if (pendingKey) {
            let tries = 0;
            const go = () => {
              if (!navigationRef.isReady()) {
                if (tries++ < 50) setTimeout(go, 80);
                return;
              }
              void navigateFromBubbleKey(pendingKey);
            };
            go();
            return;
          }

          const open = await Overlay.consumeOpenMessenger?.();
          if (!open) return;

          let tries = 0;
          const go = () => {
            if (!navigationRef.isReady()) {
              if (tries++ < 50) setTimeout(go, 80);
              return;
            }
            navigationRef.navigate('Main', {
              screen: 'MoreTab',
              params: { screen: 'MessengerGroupList' },
            });
          };
          go();
        } catch {
          /* */
        }
      })();
    };

    tryNavigate();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') tryNavigate();
    });
    return () => sub.remove();
  }, [refreshUnread]);

  return null;
}

type ChatAttachmentRow = { url?: string | null };
type ChatReactionRow = {
  emoji?: string | null;
  user_id?: string | null;
  user?: { id?: string | null; full_name?: string | null } | null;
};
type ChatRow = {
  id?: string | null;
  content?: string | null;
  created_at?: string | null;
  is_system?: boolean;
  message_type?: string | null;
  attachment_url?: string | null;
  attachments?: ChatAttachmentRow[] | null;
  reply?: { content?: string | null } | null;
  reply_to?: { content?: string | null } | string | null;
  user?: { id?: string | null; full_name?: string | null; avatar?: string | null } | null;
  reactions?: ChatReactionRow[] | null;
};

function absolutize(rel: string | null | undefined): string {
  if (!rel) return '';
  const u = String(rel).trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base = (API_ORIGIN || '').replace(/\/$/, '');
  return base ? `${base}/${u.replace(/^\//, '')}` : u;
}

async function seedBubbleHistory(bubbleKey: string) {
  try {
    const parsed = parseBubbleStorageKey(bubbleKey);
    let rows: ChatRow[] = [];
    if (parsed.kind === 'messenger') {
      const { data } = await api.get<ChatRow[]>(`/messenger/groups/${parsed.entityId}/chat`);
      rows = Array.isArray(data) ? data : [];
    } else if (parsed.kind === 'lead') {
      const { data } = await api.get<ChatRow[]>(`/crm/leads/${parsed.entityId}/chat`);
      rows = Array.isArray(data) ? data : [];
    }
    const last = rows.slice(-50);
    const mapped = last.map((m) => {
      const sender = m.is_system
        ? 'Hệ thống'
        : m.user?.full_name?.trim() || 'Người dùng';
      const avatarAbs = absolutize(m.user?.avatar);
      const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
      const attachmentUrl =
        absolutize(m.attachment_url) ||
        absolutize(Array.isArray(m.attachments) ? m.attachments?.[0]?.url : null);
      const replyToText =
        (typeof m.reply === 'object' && m.reply?.content) ||
        (typeof m.reply_to === 'object' && m.reply_to ? m.reply_to.content : '') ||
        '';
      const reactions = Array.isArray(m.reactions)
        ? m.reactions
            .map((r) => ({
              emoji: r.emoji || '',
              user_id: r.user_id || r.user?.id || '',
              user_name: r.user?.full_name || '',
            }))
            .filter((r) => r.emoji && r.user_id)
        : [];
      return {
        id: m.id ? String(m.id) : '',
        user_id: m.user?.id ? String(m.user.id) : '',
        sender,
        text: m.content || '',
        avatar: avatarAbs,
        ts,
        reply_to_text: replyToText || '',
        attachment_url: attachmentUrl,
        message_type: m.message_type || '',
        reactions,
      };
    });
    Overlay?.seedConversationMessages?.(bubbleKey, JSON.stringify(mapped));
  } catch {
    /* ignore */
  }
}
