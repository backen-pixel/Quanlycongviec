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
import { mapMessageRow, resolveMediaUrl, fetchMessengerGroupIds } from '../lib/messengerApi';
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
  joinLeadRoom: (leadId: string) => void;
  leaveLeadRoom: (leadId: string) => void;
  joinLeadRooms: (leadIds: string[]) => void;
  projectMetaRef: React.MutableRefObject<Map<string, {
    code?: string | null;
    name?: string | null;
    deal_id?: string | null;
  }>>;
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
  const projectMetaRef = useRef(new Map<string, {
    code?: string | null;
    name?: string | null;
    deal_id?: string | null;
  }>());
  const dealToProjectRef = useRef(new Map<string, string>());
  const recentMessengerNotifRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const syncDealMap = () => {
      const next = new Map<string, string>();
      for (const [pid, meta] of projectMetaRef.current.entries()) {
        if (meta.deal_id) next.set(String(meta.deal_id), String(pid));
      }
      dealToProjectRef.current = next;
    };
    syncDealMap();
    const t = setInterval(syncDealMap, 2000);
    return () => clearInterval(t);
  }, []);

  const refreshUnread = useCallback(() => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    void fetchCommentUnreadCount()
      .then((count) => setUnreadCount(Math.max(0, Number(count) || 0)))
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

  const leadRoomCountsRef = useRef(new Map<string, number>());
  /** Tập lead đang join bởi joinLeadRooms (Kanban) — sync leave khi viewport đổi. */
  const kanbanLeadBatchRef = useRef(new Set<string>());

  const joinLeadRoom = useCallback((leadId: string) => {
    if (!leadId) return;
    const id = String(leadId);
    const next = (leadRoomCountsRef.current.get(id) || 0) + 1;
    leadRoomCountsRef.current.set(id, next);
    if (next === 1) socketRef.current?.emit('join:lead', id);
  }, []);

  const leaveLeadRoom = useCallback((leadId: string) => {
    if (!leadId) return;
    const id = String(leadId);
    const next = (leadRoomCountsRef.current.get(id) || 0) - 1;
    if (next <= 0) {
      leadRoomCountsRef.current.delete(id);
      socketRef.current?.emit('leave:lead', id);
    } else {
      leadRoomCountsRef.current.set(id, next);
    }
  }, []);

  const joinLeadRooms = useCallback((leadIds: string[]) => {
    const next = new Set(leadIds.map(String).filter(Boolean));
    const prev = kanbanLeadBatchRef.current;
    for (const id of prev) {
      if (!next.has(id)) leaveLeadRoom(id);
    }
    for (const id of next) {
      if (!prev.has(id)) joinLeadRoom(id);
    }
    kanbanLeadBatchRef.current = next;
  }, [joinLeadRoom, leaveLeadRoom]);

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
      reconnectionDelayMax: 15_000,
      randomizationFactor: 0.5,
      reconnectionAttempts: Infinity,
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

    const onLeadComment = (raw: unknown) => {
      const evt = raw as {
        lead_id?: string;
        action?: string;
        comment?: { user_id?: string; body?: string; content?: string };
      };
      const lid = evt.lead_id ? String(evt.lead_id) : '';
      if (!lid) return;
      const pid = dealToProjectRef.current.get(lid) || '';
      // Cùng nguồn crm_lead_comments với web — emit cả lead + project để modal/tab reload kịp.
      emitSync({
        type: 'lead:comment_changed',
        payload: { lead_id: lid, action: evt.action || 'created' },
      });
      emitSync({
        type: 'project:comment_changed',
        payload: {
          project_id: pid || undefined,
          lead_id: lid,
          action: evt.action || 'created',
        },
      });

      if (!pid || !projectMetaRef.current.has(pid)) return;
      const commentUserId = evt.comment?.user_id;
      void (async () => {
        const myId = uid || (await getCurrentUserIdForNotifications());
        if (commentUserId && myId && String(commentUserId) === String(myId)) return;
        const meta = projectMetaRef.current.get(pid);
        const preview = String(evt.comment?.body || evt.comment?.content || '').trim().slice(0, 120);
        const built = {
          id: `lead-cmt:${lid}:${Date.now()}`,
          type: 'comment_added' as const,
          title: `${meta?.code || meta?.name || 'Deal'} · Bình luận mới`,
          message: preview ? `Vừa bình luận: ${preview}` : 'Có bình luận mới trên deal',
          entity_type: 'lead',
          entity_id: lid,
          is_read: false,
          created_at: new Date().toISOString(),
          metadata: {
            project_id: pid,
            project_code: meta?.code,
            project_name: meta?.name,
            lead_id: lid,
            comment_preview: preview || null,
            ecosystem_module_key: 'logistics',
          },
        };
        setUnreadCount((c) => c + 1);
        emitComment(built);
      })();
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
          'task_assigned',
          'vc_handover_request',
          'vc_handover_assigned',
          'vc_handover_confirmed',
        ]);
        if (dealTypes.has(String(n?.type || ''))) {
          const eco = String(n.metadata?.ecosystem_module_key || '').toLowerCase();
          const type = String(n.type || '');
          // Chỉ nhận hoạt động VC — bỏ SX / CRM và workshop intake xưởng
          if (eco === 'production' || eco === 'crm' || eco === 'sales' || eco === 'sx') return;
          if (type === 'workshop_new_deal') {
            if (eco !== 'logistics' && !n.metadata?.vc_handover) return;
          } else if (type.startsWith('logistics_') || type.startsWith('vc_handover_')) {
            // OK
          } else if (type === 'task_assigned') {
            if (eco !== 'logistics') return;
          } else if (type === 'project_assigned' || type === 'project_created') {
            if (eco && eco !== 'logistics') return;
            const metaPid = (n.metadata as Record<string, unknown> | undefined)?.project_id;
            const pid = metaPid != null
              ? String(metaPid)
              : n.entity_type === 'project' && n.entity_id
                ? String(n.entity_id)
                : '';
            // Không có eco logistics → chỉ nhận nếu dự án đang trong board VC
            if (eco !== 'logistics' && (!pid || !projectMetaRef.current.has(pid))) return;
          } else if (eco && eco !== 'logistics') {
            return;
          }
          const enriched = enrichNotificationPreview({
            id: String(n.id || `srv:${Date.now()}`),
            type: type || 'workshop_new_deal',
            title: String(n.title || 'Lắp đặt'),
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
      const eco = String(n.metadata?.ecosystem_module_key || '').toLowerCase();
      // App VC: chỉ bình luận module logistics (bỏ production / crm / SX)
      if (eco === 'production' || eco === 'crm' || eco === 'sales' || eco === 'sx') return;
      if (eco && eco !== 'logistics') return;
      const et = String(n.entity_type || '').toLowerCase();
      if (et === 'lead' || et === 'crm_lead' || et === 'crm_deal') return;
      // Thiếu eco → chỉ nhận nếu đã biết dự án trên board VC
      if (!eco) {
        const metaPid = (n.metadata as Record<string, unknown> | undefined)?.project_id;
        const pid = metaPid != null
          ? String(metaPid)
          : n.entity_type === 'project' && n.entity_id
            ? String(n.entity_id)
            : '';
        if (!pid || !projectMetaRef.current.has(pid)) return;
      }
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
    s.on('lead:comment', onLeadComment);
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
    s.on('logistics:board_changed', onBoardChanged);
    s.on('logistics:project_trashed', onBoardChanged);
    s.on('logistics:project_restored', onBoardChanged);
    s.on('logistics:project_purged', onBoardChanged);
    s.on('crm:task_changed', onTaskChanged);
    const onCalendarEventChanged = (raw: unknown) => {
      const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      emitSync({
        type: 'calendar:event_changed',
        payload: {
          event_id: p.event_id != null ? String(p.event_id) : null,
          company_id: p.company_id != null ? String(p.company_id) : null,
          action: p.action != null ? String(p.action) : undefined,
        },
      });
    };
    const onKpiLeaveChanged = (raw: unknown) => {
      const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      emitSync({
        type: 'kpi:leave_changed',
        payload: {
          leave_id: p.leave_id != null ? String(p.leave_id) : null,
          user_id: p.user_id != null ? String(p.user_id) : null,
          status: p.status != null ? String(p.status) : null,
          action: p.action != null ? String(p.action) : undefined,
        },
      });
    };
    s.on('calendar:event_changed', onCalendarEventChanged);
    s.on('kpi:leave_changed', onKpiLeaveChanged);
    s.on('messenger_group:chat', onMessengerChat);
    s.on('messenger_group:read', onMessengerRead);
    s.on('messenger_group:members', onMessengerMembers);
    s.on('messenger_group:updated', onMessengerUpdated);

    s.on('connect', () => {
      void fetchMessengerGroupIds()
        .then((ids) => {
          for (const id of ids) {
            if (id) s.emit('join:messenger_group', id);
          }
        })
        .catch(() => {});
    });

    return () => {
      s.off('project:comment', onProjectComment);
      s.off('project:comment:updated', onProjectCommentUpdated);
      s.off('project:comment:deleted', onProjectCommentDeleted);
      s.off('lead:comment', onLeadComment);
      s.off('notification', onServerNotif);
      s.off('project:stage_changed', onStageChanged);
      s.off('project:updated', onBoardChanged);
      s.off('approval:updated', onBoardChanged);
      s.off('crm:badge_updated', onBoardChanged);
      s.off('notify:badge', onBoardChanged);
      s.off('crm:dashboard_changed', onBoardChanged);
      s.off('production:board_changed', onBoardChanged);
      s.off('logistics:board_changed', onBoardChanged);
      s.off('logistics:project_trashed', onBoardChanged);
      s.off('logistics:project_restored', onBoardChanged);
      s.off('logistics:project_purged', onBoardChanged);
      s.off('crm:task_changed', onTaskChanged);
      s.off('calendar:event_changed', onCalendarEventChanged);
      s.off('kpi:leave_changed', onKpiLeaveChanged);
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
      joinLeadRoom,
      leaveLeadRoom,
      joinLeadRooms,
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
      joinLeadRoom,
      leaveLeadRoom,
      joinLeadRooms,
      projectMetaRef,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications phải nằm trong NotificationProvider');
  return v;
}
