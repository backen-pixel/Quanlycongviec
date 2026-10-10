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
import {
  fetchMessengerGroups,
  fetchMessengerMessages,
  mapMessageRow,
  markMessengerGroupRead,
  patchThreadFromMessage,
  resolveMediaUrl,
  sendMessengerText,
} from '../lib/messengerApi';
import { fetchUserPresence, type UserPresence } from '../lib/messengerPresence';
import { setMessengerActiveGroupId } from '../lib/messengerActiveGroup';
import type { MessengerMessage, MessengerThread } from '../types/messenger';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';

type GroupMessageListener = (groupId: string, message: MessengerMessage) => void;

type MessengerMetaListener = (evt: {
  type: 'reaction' | 'recall' | 'read' | 'members' | 'updated';
  groupId: string;
  messageId?: string;
  reactions?: MessengerMessage['reactions'];
  message?: MessengerMessage;
  userId?: string;
  lastReadAt?: string;
  name?: string | null;
  avatar?: string | null;
}) => void;

type MessengerCtx = {
  threads: MessengerThread[];
  loading: boolean;
  error: string;
  unreadTotal: number;
  refreshThreads: (silent?: boolean) => Promise<void>;
  markThreadRead: (groupId: string) => Promise<void>;
  /** Chỉ xoá số chưa đọc trong bộ nhớ (máy chủ đã được báo ở nơi khác, vd. khung chat bong bóng native). */
  clearThreadUnread: (groupId: string) => void;
  sendText: (
    groupId: string,
    content: string,
    opts?: { replyTo?: string | null; mentionUserIds?: string[] },
  ) => Promise<MessengerMessage>;
  loadMessages: (groupId: string) => Promise<MessengerMessage[]>;
  subscribeGroupMessage: (fn: GroupMessageListener) => () => void;
  subscribeMessengerMeta: (fn: MessengerMetaListener) => () => void;
  upsertLocalMessage: (groupId: string, message: MessengerMessage) => void;
  patchThreadMeta: (
    groupId: string,
    patch: { name?: string | null; avatarUrl?: string | null },
  ) => void;
  getPeerPresence: (peerId: string) => UserPresence | null;
  activeGroupId: string | null;
  setActiveGroupId: (groupId: string | null) => void;
};

const Ctx = createContext<MessengerCtx | null>(null);

function applyPresenceToThreads(
  threads: MessengerThread[],
  presence: Record<string, UserPresence>,
): MessengerThread[] {
  if (!Object.keys(presence).length) return threads;
  return threads.map((t) => {
    if (!t.peerId || !presence[t.peerId]) return t;
    return { ...t, online: !!presence[t.peerId]!.online };
  });
}

export function MessengerProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const myUserId = user?.id || user?.userId || null;
  const {
    subscribeMessengerChat,
    subscribeMessengerMeta: subscribeMessengerMetaRaw,
    subscribePresenceUpdate,
    emitPresencePing,
    joinMessengerGroups,
    joinMessengerGroup,
    leaveMessengerGroup,
  } = useNotifications();

  const [threads, setThreads] = useState<MessengerThread[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, UserPresence>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroupRef = useRef<string | null>(null);
  const threadsRef = useRef<MessengerThread[]>([]);
  const groupListenersRef = useRef<Set<GroupMessageListener>>(new Set());
  const metaListenersRef = useRef<Set<MessengerMetaListener>>(new Set());
  const joinedRef = useRef<Set<string>>(new Set());

  activeGroupRef.current = activeGroupId;
  threadsRef.current = threads;
  setMessengerActiveGroupId(activeGroupId);

  const syncPresence = useCallback(async (list: MessengerThread[]) => {
    const peerIds = list.map((t) => t.peerId).filter(Boolean) as string[];
    if (!peerIds.length) return;
    const presence = await fetchUserPresence(peerIds);
    if (!Object.keys(presence).length) return;
    setPresenceMap((prev) => ({ ...prev, ...presence }));
    setThreads((prev) => applyPresenceToThreads(prev, presence));
  }, []);

  const subscribeGroupMessage = useCallback((fn: GroupMessageListener) => {
    groupListenersRef.current.add(fn);
    return () => groupListenersRef.current.delete(fn);
  }, []);

  const subscribeMessengerMeta = useCallback((fn: MessengerMetaListener) => {
    metaListenersRef.current.add(fn);
    return () => metaListenersRef.current.delete(fn);
  }, []);

  const emitGroupMessage = useCallback((groupId: string, message: MessengerMessage) => {
    for (const fn of groupListenersRef.current) fn(groupId, message);
  }, []);

  const refreshThreads = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const list = await fetchMessengerGroups(myUserId);
      setThreads(list);
      void syncPresence(list);
      const ids = list.map((t) => t.id).filter(Boolean);
      const newIds = ids.filter((id) => !joinedRef.current.has(id));
      if (newIds.length) {
        joinMessengerGroups(newIds);
        newIds.forEach((id) => joinedRef.current.add(id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tin nhắn');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, myUserId, joinMessengerGroups, syncPresence]);

  const patchThreadMeta = useCallback((
    groupId: string,
    patch: { name?: string | null; avatarUrl?: string | null },
  ) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== groupId) return t;
        return {
          ...t,
          name:
            patch.name != null && patch.name.trim()
              ? patch.name.trim()
              : t.name,
          avatarUrl:
            patch.avatarUrl !== undefined
              ? resolveMediaUrl(patch.avatarUrl)
              : t.avatarUrl,
        };
      }),
    );
  }, []);

  const upsertLocalMessage = useCallback((groupId: string, message: MessengerMessage) => {
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === groupId);
      if (idx < 0) {
        void refreshThreads(true);
        return prev;
      }
      const active = activeGroupRef.current === groupId;
      const next = [...prev];
      next[idx] = patchThreadFromMessage(
        next[idx]!,
        message,
        myUserId,
        !active,
      );
      next.sort((a, b) => {
        const ta = new Date(a.lastMessageAt || 0).getTime();
        const tb = new Date(b.lastMessageAt || 0).getTime();
        return tb - ta;
      });
      return next;
    });
    emitGroupMessage(groupId, message);
  }, [myUserId, emitGroupMessage, refreshThreads]);

  useEffect(() => {
    if (!token) {
      setThreads([]);
      setPresenceMap({});
      joinedRef.current.clear();
      return undefined;
    }
    void refreshThreads(false);
    let lastActiveRefresh = 0;
    const onState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = Date.now();
      // Tránh spam API mỗi lần chạm app (throttle 45s).
      if (now - lastActiveRefresh < 45_000) {
        emitPresencePing();
        return;
      }
      lastActiveRefresh = now;
      void refreshThreads(true);
      emitPresencePing();
    };
    const sub = AppState.addEventListener('change', onState);
    emitPresencePing();
    return () => sub.remove();
  }, [token, refreshThreads, emitPresencePing]);

  useEffect(() => {
    if (!token) return undefined;
    return subscribeMessengerChat((raw) => {
      const gid = raw.group_id ?? raw.groupId;
      if (gid == null) return;
      const groupId = String(gid);
      const message = mapMessageRow({ ...raw, group_id: groupId });
      upsertLocalMessage(groupId, message);
    });
  }, [token, subscribeMessengerChat, upsertLocalMessage]);

  useEffect(() => {
    if (!token) return undefined;
    return subscribeMessengerMetaRaw((evt) => {
      if (evt.type === 'members') {
        void refreshThreads(true);
      }
      // Chính tôi vừa đọc đoạn này (ở bong bóng chat, máy khác hoặc web) → bỏ số chưa đọc ở app.
      if (evt.type === 'read' && myUserId && evt.userId && String(evt.userId) === String(myUserId)) {
        setThreads((prev) =>
          prev.some((t) => t.id === evt.groupId && t.unread)
            ? prev.map((t) => (t.id === evt.groupId ? { ...t, unread: 0 } : t))
            : prev,
        );
      }
      if (evt.type === 'updated') {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === evt.groupId
              ? {
                  ...t,
                  name: evt.name != null && evt.name.trim() ? evt.name : t.name,
                  avatarUrl:
                    evt.avatar !== undefined ? resolveMediaUrl(evt.avatar) : t.avatarUrl,
                }
              : t,
          ),
        );
      }
      for (const fn of metaListenersRef.current) fn(evt);
    });
  }, [token, myUserId, subscribeMessengerMetaRaw, refreshThreads]);

  useEffect(() => {
    if (!token) return undefined;
    return subscribePresenceUpdate((userId, online, lastPingAt) => {
      const presence: UserPresence = { online, last_ping_at: lastPingAt || null };
      setPresenceMap((prev) => ({ ...prev, [userId]: presence }));
      setThreads((prev) =>
        prev.map((t) =>
          t.peerId === userId ? { ...t, online } : t,
        ),
      );
    });
  }, [token, subscribePresenceUpdate]);

  const markThreadRead = useCallback(async (groupId: string) => {
    setThreads((prev) => prev.map((t) => (t.id === groupId ? { ...t, unread: 0 } : t)));
    try {
      await markMessengerGroupRead(groupId);
    } catch {
      /* best-effort */
    }
  }, []);

  const clearThreadUnread = useCallback((groupId: string) => {
    setThreads((prev) =>
      prev.some((t) => t.id === groupId && t.unread)
        ? prev.map((t) => (t.id === groupId ? { ...t, unread: 0 } : t))
        : prev,
    );
  }, []);

  const sendText = useCallback(async (
    groupId: string,
    content: string,
    opts?: { replyTo?: string | null; mentionUserIds?: string[] },
  ) => {
    const message = await sendMessengerText(groupId, content, opts);
    upsertLocalMessage(groupId, message);
    return message;
  }, [upsertLocalMessage]);

  const loadMessages = useCallback(async (groupId: string) => {
    return fetchMessengerMessages(groupId);
  }, []);

  const getPeerPresence = useCallback(
    (peerId: string) => presenceMap[peerId] || null,
    [presenceMap],
  );

  useEffect(() => {
    if (!activeGroupId) return undefined;
    joinMessengerGroup(activeGroupId);
    void markThreadRead(activeGroupId);
    return () => leaveMessengerGroup(activeGroupId);
  }, [activeGroupId, joinMessengerGroup, leaveMessengerGroup, markThreadRead]);

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (t.unread || 0), 0),
    [threads],
  );

  const value = useMemo(
    () => ({
      threads,
      loading,
      error,
      unreadTotal,
      refreshThreads,
      markThreadRead,
      clearThreadUnread,
      sendText,
      loadMessages,
      subscribeGroupMessage,
      subscribeMessengerMeta,
      upsertLocalMessage,
      patchThreadMeta,
      getPeerPresence,
      activeGroupId,
      setActiveGroupId,
    }),
    [
      threads,
      loading,
      error,
      unreadTotal,
      refreshThreads,
      markThreadRead,
      clearThreadUnread,
      sendText,
      loadMessages,
      subscribeGroupMessage,
      subscribeMessengerMeta,
      upsertLocalMessage,
      patchThreadMeta,
      getPeerPresence,
      activeGroupId,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMessenger() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMessenger phải nằm trong MessengerProvider');
  return v;
}
