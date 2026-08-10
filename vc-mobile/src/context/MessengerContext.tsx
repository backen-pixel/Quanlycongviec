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
  fetchMessengerGroupsPage,
  fetchMessengerMessagesPage,
  mapMessageRow,
  markMessengerGroupRead,
  MESSENGER_INBOX_PAGE_SIZE,
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
  loadingMore: boolean;
  hasMoreThreads: boolean;
  error: string;
  unreadTotal: number;
  refreshThreads: (silent?: boolean) => Promise<void>;
  loadMoreThreads: () => Promise<void>;
  markThreadRead: (groupId: string) => Promise<void>;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [inboxUnreadTotal, setInboxUnreadTotal] = useState(0);
  const [error, setError] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroupRef = useRef<string | null>(null);
  const threadsRef = useRef<MessengerThread[]>([]);
  const groupListenersRef = useRef<Set<GroupMessageListener>>(new Set());
  const metaListenersRef = useRef<Set<MessengerMetaListener>>(new Set());
  const joinedRef = useRef<Set<string>>(new Set());
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);

  activeGroupRef.current = activeGroupId;
  threadsRef.current = threads;
  hasMoreRef.current = hasMoreThreads;
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

  const joinNewThreadIds = useCallback((list: MessengerThread[]) => {
    const ids = list.map((t) => t.id).filter(Boolean);
    const newIds = ids.filter((id) => !joinedRef.current.has(id));
    if (newIds.length) {
      joinMessengerGroups(newIds);
      newIds.forEach((id) => joinedRef.current.add(id));
    }
  }, [joinMessengerGroups]);

  const refreshThreads = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const page = await fetchMessengerGroupsPage(myUserId, { limit: MESSENGER_INBOX_PAGE_SIZE });
      setThreads((prev) => {
        if (!silent) return page.threads;
        const pageIds = new Set(page.threads.map((t) => t.id));
        const older = prev.filter((t) => !pageIds.has(t.id));
        return [...page.threads, ...older];
      });
      setHasMoreThreads(silent ? (hasMoreRef.current || page.hasMore) : page.hasMore);
      if (page.unreadTotal != null) setInboxUnreadTotal(page.unreadTotal);
      void syncPresence(page.threads);
      joinNewThreadIds(page.threads);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tin nhắn');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, myUserId, syncPresence, joinNewThreadIds]);

  const loadMoreThreads = useCallback(async () => {
    if (!token || loadingMoreRef.current || !hasMoreRef.current) return;
    const last = threadsRef.current[threadsRef.current.length - 1];
    if (!last?.lastMessageAt) {
      setHasMoreThreads(false);
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchMessengerGroupsPage(myUserId, {
        limit: MESSENGER_INBOX_PAGE_SIZE,
        before: last.lastMessageAt,
        beforeId: last.id,
      });
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const extra = page.threads.filter((t) => !seen.has(t.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
      setHasMoreThreads(page.hasMore);
      void syncPresence(page.threads);
      joinNewThreadIds(page.threads);
    } catch {
      /* giữ trang đã tải */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [token, myUserId, syncPresence, joinNewThreadIds]);

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
    const existing = threadsRef.current.find((t) => t.id === groupId);
    if (!existing) {
      void refreshThreads(true);
      emitGroupMessage(groupId, message);
      return;
    }
    const active = activeGroupRef.current === groupId;
    const mine = !!(myUserId && message.user_id && String(message.user_id) === String(myUserId));
    if (!active && !mine) setInboxUnreadTotal((n) => n + 1);
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === groupId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = patchThreadFromMessage(next[idx]!, message, myUserId, !active);
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
      setHasMoreThreads(false);
      setInboxUnreadTotal(0);
      joinedRef.current.clear();
      return undefined;
    }
    void refreshThreads(false);
    const onState = (state: AppStateStatus) => {
      if (state === 'active') {
        void refreshThreads(true);
        emitPresencePing();
      }
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
  }, [token, subscribeMessengerMetaRaw, refreshThreads]);

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
    const prevUnread = threadsRef.current.find((t) => t.id === groupId)?.unread || 0;
    if (prevUnread) setInboxUnreadTotal((n) => Math.max(0, n - prevUnread));
    setThreads((prev) => prev.map((t) => (t.id === groupId ? { ...t, unread: 0 } : t)));
    try {
      await markMessengerGroupRead(groupId);
    } catch {
      /* best-effort */
    }
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
    const page = await fetchMessengerMessagesPage(groupId, { limit: 40 });
    return page.messages;
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

  const unreadTotal = inboxUnreadTotal;

  const value = useMemo(
    () => ({
      threads,
      loading,
      loadingMore,
      hasMoreThreads,
      error,
      unreadTotal,
      refreshThreads,
      loadMoreThreads,
      markThreadRead,
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
      loadingMore,
      hasMoreThreads,
      error,
      unreadTotal,
      refreshThreads,
      loadMoreThreads,
      markThreadRead,
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
