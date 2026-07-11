import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '../config';
import { setAppSocket } from '../lib/appSocket';
import { mapMessageRow, resolveMediaUrl, fetchMessengerGroups } from '../lib/messengerApi';
import { buildNotificationFromCommentEvent, type ProjectCommentSocketEvent } from '../lib/commentRealtime';
import { showLocalCommentNotification } from '../lib/localCommentNotification';
import { clearFloatingBubbleHidden } from '../lib/floatingChatBubbleStorage';
import { showLocalMessengerNotification, type MessengerNotifPayload } from '../lib/localMessengerNotification';
import { getMessengerActiveGroupId } from '../lib/messengerActiveGroup';
import { buildMessengerNotifFromSocket } from '../lib/messengerNotifFromSocket';
import {
  enrichNotificationPreview,
  fetchCommentUnreadCount,
  getCurrentUserIdForNotifications,
  notificationProjectId,
  type SxCommentNotification,
} from '../lib/notificationApi';
import type { CrmTaskChangedPayload, SyncEvent } from '../lib/realtimeSync';
import { useAuth } from './AuthContext';

type CommentListener = (n: SxCommentNotification) => void;
type SyncListener = (evt: SyncEvent) => void;
type MessengerChatListener = (msg: Record<string, unknown>) => void;

export type CommentToast = {
  notification: SxCommentNotification;
};

export type MessengerToast = MessengerNotifPayload;

type MessengerNotifListener = (payload: MessengerNotifPayload) => void;

type MessengerMetaListener = (evt: {
  type: 'reaction' | 'recall' | 'read' | 'members' | 'updated';
  groupId: string;
  messageId?: string;
  reactions?: import('../types/messenger').MessengerReaction[];
  message?: import('../types/messenger').MessengerMessage;
  userId?: string;
  lastReadAt?: string;
  name?: string | null;
  avatar?: string | null;
}) => void;

type PresenceListener = (userId: string, online: boolean, lastPingAt?: string) => void;

type NotificationCtx = {
  unreadCount: number;
  refreshUnread: () => void;
  commentToast: CommentToast | null;
  dismissCommentToast: () => void;
  messengerToast: MessengerToast | null;
  dismissMessengerToast: () => void;
  notifyMessengerIncoming: (payload: MessengerNotifPayload) => void;
  subscribeMessengerNotif: (fn: MessengerNotifListener) => () => void;
  liveNotifications: SxCommentNotification[];
  markLiveNotificationsRead: () => void;
  adjustUnreadCount: (delta: number) => void;
  subscribeComment: (fn: CommentListener) => () => void;
  subscribeSync: (fn: SyncListener) => () => void;
  subscribeMessengerChat: (fn: MessengerChatListener) => () => void;
  joinMessengerGroup: (groupId: string) => void;
  leaveMessengerGroup: (groupId: string) => void;
  joinMessengerGroups: (groupIds: string[]) => void;
  subscribeMessengerMeta: (fn: MessengerMetaListener) => () => void;
  subscribePresenceUpdate: (fn: PresenceListener) => () => void;
  emitPresencePing: () => void;
  joinProjectRoom: (projectId: string) => void;
  leaveProjectRoom: (projectId: string) => void;
  projectMetaRef: React.MutableRefObject<Map<string, { code?: string | null; name?: string | null }>>;
};

const Ctx = createContext<NotificationCtx | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const uid = user?.id || user?.userId || null;
  const [unreadCount, setUnreadCount] = useState(0);
  const [commentToast, setCommentToast] = useState<CommentToast | null>(null);
  const [messengerToast, setMessengerToast] = useState<MessengerToast | null>(null);
  const [liveNotifications, setLiveNotifications] = useState<SxCommentNotification[]>([]);
  const busyRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Set<CommentListener>>(new Set());
  const syncListenersRef = useRef<Set<SyncListener>>(new Set());
  const messengerChatListenersRef = useRef<Set<MessengerChatListener>>(new Set());
  const messengerNotifListenersRef = useRef<Set<MessengerNotifListener>>(new Set());
  const messengerMetaListenersRef = useRef<Set<MessengerMetaListener>>(new Set());
  const presenceListenersRef = useRef<Set<PresenceListener>>(new Set());
  const projectMetaRef = useRef(new Map<string, { code?: string | null; name?: string | null }>());
  const recentMessengerNotifRef = useRef<Map<string, number>>(new Map());

  const refreshUnread = useCallback(() => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    void fetchCommentUnreadCount()
      .then((count) => setUnreadCount((c) => Math.max(c, count)))
      .catch(() => {})
      .finally(() => {
        busyRef.current = false;
      });
  }, [token]);

  const subscribeComment = useCallback((fn: CommentListener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const subscribeSync = useCallback((fn: SyncListener) => {
    syncListenersRef.current.add(fn);
    return () => syncListenersRef.current.delete(fn);
  }, []);

  const subscribeMessengerChat = useCallback((fn: MessengerChatListener) => {
    messengerChatListenersRef.current.add(fn);
    return () => messengerChatListenersRef.current.delete(fn);
  }, []);

  const subscribeMessengerMeta = useCallback((fn: MessengerMetaListener) => {
    messengerMetaListenersRef.current.add(fn);
    return () => messengerMetaListenersRef.current.delete(fn);
  }, []);

  const subscribePresenceUpdate = useCallback((fn: PresenceListener) => {
    presenceListenersRef.current.add(fn);
    return () => presenceListenersRef.current.delete(fn);
  }, []);

  const emitPresencePing = useCallback(() => {
    socketRef.current?.emit('presence:ping');
  }, []);

  const emitMessengerChat = useCallback((msg: Record<string, unknown>) => {
    for (const fn of messengerChatListenersRef.current) fn(msg);
  }, []);

  const emitMessengerMeta = useCallback((evt: Parameters<MessengerMetaListener>[0]) => {
    for (const fn of messengerMetaListenersRef.current) fn(evt);
  }, []);

  const joinMessengerGroup = useCallback((groupId: string) => {
    if (!groupId) return;
    socketRef.current?.emit('join:messenger_group', groupId);
  }, []);

  const leaveMessengerGroup = useCallback((groupId: string) => {
    if (!groupId) return;
    socketRef.current?.emit('leave:messenger_group', groupId);
  }, []);

  const joinMessengerGroups = useCallback((groupIds: string[]) => {
    for (const id of groupIds) {
      if (id) socketRef.current?.emit('join:messenger_group', id);
    }
  }, []);

  const joinProjectRoom = useCallback((projectId: string) => {
    if (!projectId) return;
    socketRef.current?.emit('join:project', projectId);
  }, []);

  const leaveProjectRoom = useCallback((projectId: string) => {
    if (!projectId) return;
    socketRef.current?.emit('leave:project', projectId);
  }, []);

  const emitSync = useCallback((evt: SyncEvent) => {
    syncListenersRef.current.forEach((fn) => {
      try {
        fn(evt);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const dismissCommentToast = useCallback(() => setCommentToast(null), []);
  const dismissMessengerToast = useCallback(() => setMessengerToast(null), []);

  const subscribeMessengerNotif = useCallback((fn: MessengerNotifListener) => {
    messengerNotifListenersRef.current.add(fn);
    return () => messengerNotifListenersRef.current.delete(fn);
  }, []);

  const notifyMessengerIncoming = useCallback((payload: MessengerNotifPayload) => {
    if (getMessengerActiveGroupId() === payload.groupId) return;
    const dedupeKey = payload.messageId || `${payload.groupId}:${payload.message}`;
    const now = Date.now();
    const last = recentMessengerNotifRef.current.get(dedupeKey);
    if (last != null && now - last < 12000) return;
    recentMessengerNotifRef.current.set(dedupeKey, now);
    if (recentMessengerNotifRef.current.size > 40) {
      for (const [k, t] of recentMessengerNotifRef.current) {
        if (now - t > 60000) recentMessengerNotifRef.current.delete(k);
      }
    }
    void clearFloatingBubbleHidden();
    const isActive = AppState.currentState === 'active';
    if (!isActive) {
      setMessengerToast(payload);
      void showLocalMessengerNotification(payload);
    }
    messengerNotifListenersRef.current.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const upsertLive = useCallback((n: SxCommentNotification) => {
    setLiveNotifications((prev) => {
      const pid = notificationProjectId(n);
      const isComment = n.type === 'comment_added';
      const rest = prev.filter((x) => {
        if (x.id === n.id) return false;
        if (isComment && pid && x.type === 'comment_added' && notificationProjectId(x) === pid) return false;
        return true;
      });
      return [n, ...rest].slice(0, 80);
    });
  }, []);

  const markLiveNotificationsRead = useCallback(() => {
    setLiveNotifications((prev) => prev.map((x) => (x.is_read ? x : { ...x, is_read: true })));
  }, []);

  const adjustUnreadCount = useCallback((delta: number) => {
    if (!delta) return;
    setUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  const emitComment = useCallback((n: SxCommentNotification) => {
    const enriched = enrichNotificationPreview(n);
    upsertLive(enriched);
    listenersRef.current.forEach((fn) => {
      try {
        fn(enriched);
      } catch {
        /* ignore */
      }
    });
    const appState = AppState.currentState;
    if (appState === 'active') {
      setCommentToast({ notification: enriched });
    }
    void showLocalCommentNotification(enriched);
  }, [upsertLive]);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      setCommentToast(null);
      setLiveNotifications([]);
      return undefined;
    }
    refreshUnread();
    const timer = setInterval(refreshUnread, 45000);
    const onState = (state: AppStateStatus) => {
      if (state === 'active') refreshUnread();
    };
    const sub = AppState.addEventListener('change', onState);
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [token, refreshUnread]);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return undefined;
    }

    const s = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 12,
    });
    socketRef.current = s;
    setAppSocket(s);

    const onProjectComment = async (raw: unknown) => {
      const evt = raw as ProjectCommentSocketEvent;
      const pid = evt.project_id ? String(evt.project_id) : '';
      if (pid) {
        emitSync({
          type: 'project:comment_changed',
          payload: { project_id: pid, action: evt.action || 'created' },
        });
      }

      // Chỉ hiện thông báo bình luận cho dự án đang trong phạm vi VC (đã load board)
      if (!pid || !projectMetaRef.current.has(pid)) return;

      const commentUserId = evt.comment?.user_id;
      const myId = uid || (await getCurrentUserIdForNotifications());
      if (commentUserId && myId && String(commentUserId) === String(myId)) return;

      const meta = projectMetaRef.current.get(pid);
      const built = buildNotificationFromCommentEvent(evt, meta);
      if (!built) return;

      setUnreadCount((c) => c + 1);
      emitComment(built);
    };

    const onProjectCommentUpdated = (raw: unknown) => {
      const evt = raw as ProjectCommentSocketEvent;
      const pid = evt.project_id ? String(evt.project_id) : '';
      if (!pid) return;
      emitSync({ type: 'project:comment_changed', payload: { project_id: pid, action: 'updated' } });
    };

    const onProjectCommentDeleted = (raw: unknown) => {
      const evt = raw as ProjectCommentSocketEvent;
      const pid = evt.project_id ? String(evt.project_id) : '';
      if (!pid) return;
      emitSync({ type: 'project:comment_changed', payload: { project_id: pid, action: 'deleted' } });
    };

    const onServerNotif = (raw: unknown) => {
      const n = raw as SxCommentNotification & {
        metadata?: { ecosystem_module_key?: string; sender_name?: string; group_name?: string };
      };
      const notifType = String(n?.type || '');
      if (
        notifType.startsWith('crm_assignment')
        || notifType.startsWith('crm_task')
        || notifType === 'crm_task_assigned'
        || notifType === 'crm_task_completed'
      ) {
        emitSync({
          type: 'crm:task_changed',
          payload: {
            action: notifType,
            project_id:
              (n.metadata as Record<string, unknown> | undefined)?.project_id != null
                ? String((n.metadata as Record<string, unknown>).project_id)
                : undefined,
            lead_id:
              (n.metadata as Record<string, unknown> | undefined)?.lead_id != null
                ? String((n.metadata as Record<string, unknown>).lead_id)
                : undefined,
          },
        });
      }
      if (n?.type === 'messenger_chat' && n.entity_type === 'messenger_group' && n.entity_id) {
        const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
        const senderName = typeof meta.sender_name === 'string' ? meta.sender_name : '';
        const groupName =
          typeof meta.group_name === 'string' && meta.group_name.trim()
            ? meta.group_name
            : String(n.title || 'Tin nhắn').replace(/^Messenger\s*·\s*/i, '');
        const rawMsg = String(n.message || '');
        const messageBody = rawMsg.includes(': ')
          ? rawMsg.slice(rawMsg.indexOf(': ') + 2)
          : rawMsg;
        const avatarUrl = resolveMediaUrl(
          typeof (meta as Record<string, unknown>).sender_avatar === 'string'
            ? (meta as Record<string, unknown>).sender_avatar as string
            : typeof (meta as Record<string, unknown>).group_avatar === 'string'
              ? (meta as Record<string, unknown>).group_avatar as string
              : null,
        );
        notifyMessengerIncoming({
          groupId: String(n.entity_id),
          title: groupName,
          senderName,
          message: messageBody,
          messageId: typeof (meta as { message_id?: string }).message_id === 'string'
            ? (meta as { message_id: string }).message_id
            : undefined,
          avatarUrl,
        });
        return;
      }
      if (n?.type !== 'comment_added') {
        const dealTypes = new Set([
          'workshop_new_deal',
          'logistics_stage_changed',
          'logistics_task_deadline_warning',
          'logistics_task_deadline_overdue',
          'project_assigned',
          'project_created',
        ]);
        if (dealTypes.has(String(n?.type || ''))) {
          const eco = String(n.metadata?.ecosystem_module_key || '');
          // Chỉ nhận hoạt động VC — bỏ SX / CRM
          if (eco === 'production' || eco === 'crm') return;
          if (eco && eco !== 'logistics' && String(n.type) !== 'logistics_stage_changed') return;
          if (String(n.type) === 'workshop_new_deal' && eco !== 'logistics' && !n.metadata?.vc_handover) return;
          const enriched = enrichNotificationPreview({
            id: String(n.id || `srv:${Date.now()}`),
            type: String(n.type || 'workshop_new_deal'),
            title: String(n.title || 'Vận chuyển'),
            message: String(n.message || ''),
            entity_type: n.entity_type,
            entity_id: n.entity_id,
            is_read: false,
            created_at: String(n.created_at || new Date().toISOString()),
            metadata: { ...(n.metadata || {}), ecosystem_module_key: 'logistics' },
          });
          setUnreadCount((c) => c + 1);
          emitComment(enriched);
          emitSync({
            type: 'project:board_changed',
            payload: {
              project_id:
                (n.metadata as Record<string, unknown> | undefined)?.project_id != null
                  ? String((n.metadata as Record<string, unknown>).project_id)
                  : n.entity_type === 'project' && n.entity_id
                    ? String(n.entity_id)
                    : null,
              reason: 'notification',
            },
          });
        }
        return;
      }
      const eco = n.metadata?.ecosystem_module_key;
      // App VC: chỉ bình luận module logistics (bỏ production / crm)
      if (eco === 'production' || eco === 'crm') return;
      if (eco && eco !== 'logistics' && eco !== 'projects') return;
      const enriched = enrichNotificationPreview({
        id: String(n.id || `srv:${Date.now()}`),
        type: 'comment_added',
        title: String(n.title || 'Bình luận'),
        message: String(n.message || ''),
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        is_read: false,
        created_at: String(n.created_at || new Date().toISOString()),
        metadata: { ...(n.metadata || {}), ecosystem_module_key: 'logistics' },
      });
      setUnreadCount((c) => c + 1);
      emitComment(enriched);
    };

    s.on('project:comment', onProjectComment);
    s.on('project:comment:updated', onProjectCommentUpdated);
    s.on('project:comment:deleted', onProjectCommentDeleted);
    s.on('notification', onServerNotif);

    const onStageChanged = (raw: unknown) => {
      emitSync({ type: 'project:stage_changed', payload: (raw || {}) as Record<string, unknown> });
    };
    const onBoardChanged = (raw: unknown) => {
      const p = (raw || {}) as Record<string, unknown>;
      emitSync({
        type: 'project:board_changed',
        payload: {
          ...p,
          project_id:
            p.project_id != null
              ? String(p.project_id)
              : p.id != null
                ? String(p.id)
                : p.projectId != null
                  ? String(p.projectId)
                  : null,
        },
      });
    };
    const onTaskChanged = (raw: unknown) => {
      emitSync({ type: 'crm:task_changed', payload: (raw || {}) as CrmTaskChangedPayload });
    };
    const onMessengerChat = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Record<string, unknown>;
      emitMessengerChat(row);
      const built = buildMessengerNotifFromSocket(row, uid);
      if (built) notifyMessengerIncoming(built);
    };
    const onMessengerReaction = (raw: unknown) => {
      const p = raw as { group_id?: string; message_id?: string; reactions?: unknown[] };
      if (!p?.group_id || !p?.message_id) return;
      emitMessengerMeta({
        type: 'reaction',
        groupId: String(p.group_id),
        messageId: String(p.message_id),
        reactions: Array.isArray(p.reactions)
          ? p.reactions.map((r) => {
              const row = r as Record<string, unknown>;
              return {
                emoji: String(row.emoji || ''),
                user_id: row.user_id != null ? String(row.user_id) : null,
                user: row.user as { full_name?: string | null } | null,
              };
            })
          : [],
      });
    };
    const onMessengerRecalled = (raw: unknown) => {
      const p = raw as Record<string, unknown>;
      const gid = p.group_id ?? p.groupId;
      if (!gid) return;
      if (p.message_id && !p.id) {
        emitMessengerMeta({
          type: 'recall',
          groupId: String(gid),
          messageId: String(p.message_id),
          message: mapMessageRow({ ...p, group_id: gid, id: p.message_id, is_recalled: true }),
        });
        return;
      }
      emitMessengerMeta({
        type: 'recall',
        groupId: String(gid),
        message: mapMessageRow({ ...p, group_id: gid }),
      });
    };
    const onPresenceUpdate = (raw: unknown) => {
      const p = raw as { user_id?: string; userId?: string; online?: boolean; last_ping_at?: string };
      const uid = p.user_id ?? p.userId;
      if (!uid) return;
      for (const fn of presenceListenersRef.current) {
        fn(String(uid), !!p.online, p.last_ping_at);
      }
    };
    const onMessengerRead = (raw: unknown) => {
      const p = raw as { group_id?: string; user_id?: string; last_read_at?: string };
      if (!p?.group_id) return;
      emitMessengerMeta({
        type: 'read',
        groupId: String(p.group_id),
        userId: p.user_id != null ? String(p.user_id) : undefined,
        lastReadAt: p.last_read_at != null ? String(p.last_read_at) : undefined,
      });
    };
    const onMessengerMembers = (raw: unknown) => {
      const p = raw as { group_id?: string };
      if (!p?.group_id) return;
      emitMessengerMeta({ type: 'members', groupId: String(p.group_id) });
    };
    const onMessengerUpdated = (raw: unknown) => {
      const p = raw as { group_id?: string; name?: string; avatar?: string | null };
      if (!p?.group_id) return;
      emitMessengerMeta({
        type: 'updated',
        groupId: String(p.group_id),
        name: p.name != null ? String(p.name) : undefined,
        avatar: p.avatar ?? undefined,
      });
    };

    s.on('messenger_group:reaction', onMessengerReaction);
    s.on('messenger_group:reactions', onMessengerReaction);
    s.on('messenger_group:recalled', onMessengerRecalled);
    s.on('presence:update', onPresenceUpdate);

    s.on('project:stage_changed', onStageChanged);
    s.on('project:updated', onBoardChanged);
    s.on('approval:updated', onBoardChanged);
    s.on('crm:badge_updated', onBoardChanged);
    s.on('notify:badge', onBoardChanged);
    s.on('crm:dashboard_changed', onBoardChanged);
    s.on('production:board_changed', onBoardChanged);
    s.on('logistics:project_trashed', onBoardChanged);
    s.on('logistics:project_restored', onBoardChanged);
    s.on('logistics:project_purged', onBoardChanged);
    s.on('crm:task_changed', onTaskChanged);
    s.on('messenger_group:chat', onMessengerChat);
    s.on('messenger_group:read', onMessengerRead);
    s.on('messenger_group:members', onMessengerMembers);
    s.on('messenger_group:updated', onMessengerUpdated);

    s.on('connect', () => {
      void fetchMessengerGroups(uid)
        .then((list) => {
          for (const t of list) {
            if (t.id) s.emit('join:messenger_group', t.id);
          }
        })
        .catch(() => {});
    });

    return () => {
      s.off('project:comment', onProjectComment);
      s.off('project:comment:updated', onProjectCommentUpdated);
      s.off('project:comment:deleted', onProjectCommentDeleted);
      s.off('notification', onServerNotif);
      s.off('project:stage_changed', onStageChanged);
      s.off('project:updated', onBoardChanged);
      s.off('approval:updated', onBoardChanged);
      s.off('crm:badge_updated', onBoardChanged);
      s.off('notify:badge', onBoardChanged);
      s.off('crm:dashboard_changed', onBoardChanged);
      s.off('production:board_changed', onBoardChanged);
      s.off('logistics:project_trashed', onBoardChanged);
      s.off('logistics:project_restored', onBoardChanged);
      s.off('logistics:project_purged', onBoardChanged);
      s.off('crm:task_changed', onTaskChanged);
      s.off('messenger_group:chat', onMessengerChat);
      s.off('messenger_group:read', onMessengerRead);
      s.off('messenger_group:members', onMessengerMembers);
      s.off('messenger_group:updated', onMessengerUpdated);
      s.off('messenger_group:reaction', onMessengerReaction);
      s.off('messenger_group:reactions', onMessengerReaction);
      s.off('messenger_group:recalled', onMessengerRecalled);
      s.off('presence:update', onPresenceUpdate);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
      setAppSocket(null);
    };
  }, [token, uid, emitComment, emitSync, emitMessengerChat, emitMessengerMeta, notifyMessengerIncoming]);

  const value = useMemo(
    () => ({
      unreadCount,
      refreshUnread,
      commentToast,
      dismissCommentToast,
      messengerToast,
      dismissMessengerToast,
      notifyMessengerIncoming,
      subscribeMessengerNotif,
      liveNotifications,
      markLiveNotificationsRead,
      adjustUnreadCount,
      subscribeComment,
      subscribeSync,
      subscribeMessengerChat,
      joinMessengerGroup,
      leaveMessengerGroup,
      joinMessengerGroups,
      subscribeMessengerMeta,
      subscribePresenceUpdate,
      emitPresencePing,
      joinProjectRoom,
      leaveProjectRoom,
      projectMetaRef,
    }),
    [
      unreadCount,
      refreshUnread,
      commentToast,
      dismissCommentToast,
      messengerToast,
      dismissMessengerToast,
      notifyMessengerIncoming,
      subscribeMessengerNotif,
      liveNotifications,
      markLiveNotificationsRead,
      adjustUnreadCount,
      subscribeComment,
      subscribeSync,
      subscribeMessengerChat,
      joinMessengerGroup,
      leaveMessengerGroup,
      joinMessengerGroups,
      subscribeMessengerMeta,
      subscribePresenceUpdate,
      emitPresencePing,
      joinProjectRoom,
      leaveProjectRoom,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications phải nằm trong NotificationProvider');
  return v;
}
