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
import { buildNotificationFromCommentEvent, type ProjectCommentSocketEvent } from '../lib/commentRealtime';
import { showLocalCommentNotification } from '../lib/localCommentNotification';
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

export type CommentToast = {
  notification: SxCommentNotification;
};

type NotificationCtx = {
  unreadCount: number;
  refreshUnread: () => void;
  commentToast: CommentToast | null;
  dismissCommentToast: () => void;
  liveNotifications: SxCommentNotification[];
  markLiveNotificationsRead: () => void;
  adjustUnreadCount: (delta: number) => void;
  subscribeComment: (fn: CommentListener) => () => void;
  subscribeSync: (fn: SyncListener) => () => void;
  projectMetaRef: React.MutableRefObject<Map<string, { code?: string | null; name?: string | null }>>;
};

const Ctx = createContext<NotificationCtx | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const uid = user?.id || user?.userId || null;
  const [unreadCount, setUnreadCount] = useState(0);
  const [commentToast, setCommentToast] = useState<CommentToast | null>(null);
  const [liveNotifications, setLiveNotifications] = useState<SxCommentNotification[]>([]);
  const busyRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Set<CommentListener>>(new Set());
  const syncListenersRef = useRef<Set<SyncListener>>(new Set());
  const projectMetaRef = useRef(new Map<string, { code?: string | null; name?: string | null }>());

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

  const upsertLive = useCallback((n: SxCommentNotification) => {
    setLiveNotifications((prev) => {
      const pid = notificationProjectId(n);
      const rest = prev.filter((x) => x.id !== n.id && (!pid || notificationProjectId(x) !== pid));
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

    const onProjectComment = async (raw: unknown) => {
      const evt = raw as ProjectCommentSocketEvent;
      const commentUserId = evt.comment?.user_id;
      const myId = uid || (await getCurrentUserIdForNotifications());
      if (commentUserId && myId && String(commentUserId) === String(myId)) return;

      const pid = evt.project_id ? String(evt.project_id) : '';
      const meta = pid ? projectMetaRef.current.get(pid) : undefined;
      const built = buildNotificationFromCommentEvent(evt, meta);
      if (!built) return;

      setUnreadCount((c) => c + 1);
      emitComment(built);
    };

    const onServerNotif = (raw: unknown) => {
      const n = raw as SxCommentNotification & { metadata?: { ecosystem_module_key?: string } };
      if (n?.type !== 'comment_added') return;
      const eco = n.metadata?.ecosystem_module_key;
      if (eco && eco !== 'production') return;
      const enriched = enrichNotificationPreview({
        id: String(n.id || `srv:${Date.now()}`),
        type: 'comment_added',
        title: String(n.title || 'Bình luận'),
        message: String(n.message || ''),
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        is_read: false,
        created_at: String(n.created_at || new Date().toISOString()),
        metadata: n.metadata || null,
      });
      setUnreadCount((c) => c + 1);
      emitComment(enriched);
    };

    s.on('project:comment', onProjectComment);
    s.on('notification', onServerNotif);

    const onStageChanged = (raw: unknown) => {
      emitSync({ type: 'project:stage_changed', payload: (raw || {}) as Record<string, unknown> });
    };
    const onTaskChanged = (raw: unknown) => {
      emitSync({ type: 'crm:task_changed', payload: (raw || {}) as CrmTaskChangedPayload });
    };

    s.on('project:stage_changed', onStageChanged);
    s.on('crm:task_changed', onTaskChanged);

    return () => {
      s.off('project:comment', onProjectComment);
      s.off('notification', onServerNotif);
      s.off('project:stage_changed', onStageChanged);
      s.off('crm:task_changed', onTaskChanged);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [token, uid, emitComment, emitSync]);

  const value = useMemo(
    () => ({
      unreadCount,
      refreshUnread,
      commentToast,
      dismissCommentToast,
      liveNotifications,
      markLiveNotificationsRead,
      adjustUnreadCount,
      subscribeComment,
      subscribeSync,
      projectMetaRef,
    }),
    [
      unreadCount,
      refreshUnread,
      commentToast,
      dismissCommentToast,
      liveNotifications,
      markLiveNotificationsRead,
      adjustUnreadCount,
      subscribeComment,
      subscribeSync,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications phải nằm trong NotificationProvider');
  return v;
}
