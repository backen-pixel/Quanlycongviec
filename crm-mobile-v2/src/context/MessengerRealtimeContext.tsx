import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '../config';
import { setAppSocket } from '../lib/appSocket';
import { mapMessageRow, resolveMediaUrl } from '../lib/messengerApi';
import { getMessengerActiveGroupId } from '../lib/messengerActiveGroup';
import { buildMessengerNotifFromSocket } from '../lib/messengerNotifFromSocket';
import {
  showLocalMessengerNotification,
  type MessengerNotifPayload,
} from '../lib/localMessengerNotification';
import { showChatBubbleForMessage } from '../lib/floatingBubbleOverlay';
import type { MessengerMessage, MessengerReaction } from '../types/messenger';
import { useAuth } from './AuthContext';

type MessengerChatListener = (msg: Record<string, unknown>) => void;

type MessengerMetaListener = (evt: {
  type: 'reaction' | 'recall' | 'read' | 'members' | 'updated';
  groupId: string;
  messageId?: string;
  reactions?: MessengerReaction[];
  message?: MessengerMessage;
  userId?: string;
  lastReadAt?: string;
  name?: string | null;
  avatar?: string | null;
}) => void;

type PresenceListener = (userId: string, online: boolean, lastPingAt?: string) => void;

type Ctx = {
  subscribeMessengerChat: (fn: MessengerChatListener) => () => void;
  joinMessengerGroup: (groupId: string) => void;
  leaveMessengerGroup: (groupId: string) => void;
  joinMessengerGroups: (groupIds: string[]) => void;
  subscribeMessengerMeta: (fn: MessengerMetaListener) => () => void;
  subscribePresenceUpdate: (fn: PresenceListener) => () => void;
  emitPresencePing: () => void;
};

const RealtimeCtx = createContext<Ctx | null>(null);

export function MessengerRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const uid = user?.id || user?.userId || null;
  const socketRef = useRef<Socket | null>(null);
  const chatListenersRef = useRef<Set<MessengerChatListener>>(new Set());
  const metaListenersRef = useRef<Set<MessengerMetaListener>>(new Set());
  const presenceListenersRef = useRef<Set<PresenceListener>>(new Set());
  const recentNotifRef = useRef<Map<string, number>>(new Map());
  const joinedGroupsRef = useRef<Set<string>>(new Set());

  const subscribeMessengerChat = useCallback((fn: MessengerChatListener) => {
    chatListenersRef.current.add(fn);
    return () => chatListenersRef.current.delete(fn);
  }, []);

  const subscribeMessengerMeta = useCallback((fn: MessengerMetaListener) => {
    metaListenersRef.current.add(fn);
    return () => metaListenersRef.current.delete(fn);
  }, []);

  const subscribePresenceUpdate = useCallback((fn: PresenceListener) => {
    presenceListenersRef.current.add(fn);
    return () => presenceListenersRef.current.delete(fn);
  }, []);

  const emitMessengerChat = useCallback((msg: Record<string, unknown>) => {
    for (const fn of chatListenersRef.current) fn(msg);
  }, []);

  const emitMessengerMeta = useCallback((evt: Parameters<MessengerMetaListener>[0]) => {
    for (const fn of metaListenersRef.current) fn(evt);
  }, []);

  const notifyIncoming = useCallback((payload: MessengerNotifPayload) => {
    if (getMessengerActiveGroupId() === payload.groupId) return;
    const dedupeKey = payload.messageId || `${payload.groupId}:${payload.message}`;
    const now = Date.now();
    const last = recentNotifRef.current.get(dedupeKey);
    if (last != null && now - last < 12_000) return;
    recentNotifRef.current.set(dedupeKey, now);
    const isActive = AppState.currentState === 'active';
    void showChatBubbleForMessage(payload, null, { isActive });
    if (!isActive) {
      void showLocalMessengerNotification(payload);
    }
  }, []);

  const joinMessengerGroup = useCallback((groupId: string) => {
    if (!groupId) return;
    joinedGroupsRef.current.add(groupId);
    socketRef.current?.emit('join:messenger_group', groupId);
  }, []);

  const leaveMessengerGroup = useCallback((groupId: string) => {
    if (!groupId) return;
    joinedGroupsRef.current.delete(groupId);
    socketRef.current?.emit('leave:messenger_group', groupId);
  }, []);

  const joinMessengerGroups = useCallback((groupIds: string[]) => {
    for (const id of groupIds) {
      if (!id) continue;
      joinedGroupsRef.current.add(id);
      socketRef.current?.emit('join:messenger_group', id);
    }
  }, []);

  const emitPresencePing = useCallback(() => {
    socketRef.current?.emit('presence:ping');
  }, []);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setAppSocket(null);
      joinedGroupsRef.current.clear();
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

    const onMessengerChat = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Record<string, unknown>;
      emitMessengerChat(row);
      const built = buildMessengerNotifFromSocket(row, uid);
      if (built) notifyIncoming(built);
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
      const id = p.user_id ?? p.userId;
      if (!id) return;
      for (const fn of presenceListenersRef.current) {
        fn(String(id), !!p.online, p.last_ping_at);
      }
    };

    const onServerNotif = (raw: unknown) => {
      const n = raw as {
        type?: string;
        entity_type?: string;
        entity_id?: string;
        title?: string;
        message?: string;
        metadata?: Record<string, unknown>;
      };
      if (n?.type !== 'messenger_chat' || n.entity_type !== 'messenger_group' || !n.entity_id) return;
      const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
      const senderName = typeof meta.sender_name === 'string' ? meta.sender_name : '';
      const groupName =
        typeof meta.group_name === 'string' && meta.group_name.trim()
          ? meta.group_name
          : String(n.title || 'Tin nhắn').replace(/^Messenger\s*·\s*/i, '');
      const rawMsg = String(n.message || '');
      const messageBody = rawMsg.includes(': ') ? rawMsg.slice(rawMsg.indexOf(': ') + 2) : rawMsg;
      notifyIncoming({
        groupId: String(n.entity_id),
        title: groupName,
        senderName,
        message: messageBody,
        messageId: typeof meta.message_id === 'string' ? meta.message_id : undefined,
        avatarUrl: resolveMediaUrl(
          typeof meta.sender_avatar === 'string'
            ? meta.sender_avatar
            : typeof meta.group_avatar === 'string'
              ? meta.group_avatar
              : null,
        ),
      });
    };

    s.on('messenger_group:chat', onMessengerChat);
    s.on('messenger_group:reaction', onMessengerReaction);
    s.on('messenger_group:reactions', onMessengerReaction);
    s.on('messenger_group:recalled', onMessengerRecalled);
    s.on('messenger_group:read', (raw: unknown) => {
      const p = raw as { group_id?: string; user_id?: string; last_read_at?: string };
      if (!p?.group_id) return;
      emitMessengerMeta({
        type: 'read',
        groupId: String(p.group_id),
        userId: p.user_id != null ? String(p.user_id) : undefined,
        lastReadAt: p.last_read_at != null ? String(p.last_read_at) : undefined,
      });
    });
    s.on('messenger_group:members', (raw: unknown) => {
      const p = raw as { group_id?: string };
      if (p?.group_id) emitMessengerMeta({ type: 'members', groupId: String(p.group_id) });
    });
    s.on('messenger_group:updated', (raw: unknown) => {
      const p = raw as { group_id?: string; name?: string; avatar?: string | null };
      if (!p?.group_id) return;
      emitMessengerMeta({
        type: 'updated',
        groupId: String(p.group_id),
        name: p.name != null ? String(p.name) : undefined,
        avatar: p.avatar != null ? resolveMediaUrl(p.avatar) : p.avatar ?? undefined,
      });
    });
    s.on('presence:update', onPresenceUpdate);
    s.on('notification', onServerNotif);

    s.on('connect', () => {
      // Re-join rooms đã biết — không refetch full groups (MessengerProvider lo list).
      for (const id of joinedGroupsRef.current) {
        s.emit('join:messenger_group', id);
      }
    });

    const onState = (state: AppStateStatus) => {
      if (state === 'active') emitPresencePing();
    };
    const sub = AppState.addEventListener('change', onState);
    emitPresencePing();

    return () => {
      sub.remove();
      s.off('messenger_group:chat', onMessengerChat);
      s.off('messenger_group:reaction', onMessengerReaction);
      s.off('messenger_group:reactions', onMessengerReaction);
      s.off('messenger_group:recalled', onMessengerRecalled);
      s.off('presence:update', onPresenceUpdate);
      s.off('notification', onServerNotif);
      s.disconnect();
      socketRef.current = null;
      setAppSocket(null);
    };
  }, [token, uid, emitMessengerChat, emitMessengerMeta, notifyIncoming, emitPresencePing]);

  const value = useMemo(
    () => ({
      subscribeMessengerChat,
      joinMessengerGroup,
      leaveMessengerGroup,
      joinMessengerGroups,
      subscribeMessengerMeta,
      subscribePresenceUpdate,
      emitPresencePing,
    }),
    [
      subscribeMessengerChat,
      joinMessengerGroup,
      leaveMessengerGroup,
      joinMessengerGroups,
      subscribeMessengerMeta,
      subscribePresenceUpdate,
      emitPresencePing,
    ],
  );

  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

export function useMessengerRealtime() {
  const v = useContext(RealtimeCtx);
  if (!v) throw new Error('useMessengerRealtime phải nằm trong MessengerRealtimeProvider');
  return v;
}

/** Alias tương thích MessengerContext từ sx-mobile. */
export function useNotifications() {
  return useMessengerRealtime();
}
