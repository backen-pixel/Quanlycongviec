import type { Socket } from 'socket.io-client';

export type MessengerRealtimeEvent =
  | 'messenger_group:chat'
  | 'messenger_group:reaction'
  | 'messenger_group:reactions'
  | 'messenger_group:recalled'
  | 'messenger_group:read'
  | 'messenger_group:members'
  | 'messenger_group:updated';

type Handler = (payload: unknown) => void;

const joinedGroups = new Set<string>();
const handlers = new Map<MessengerRealtimeEvent, Set<Handler>>();

let socket: Socket | null = null;
let bound = false;

const EVENTS: MessengerRealtimeEvent[] = [
  'messenger_group:chat',
  'messenger_group:recalled',
  'messenger_group:read',
  'messenger_group:members',
  'messenger_group:updated',
];

function dispatch(event: MessengerRealtimeEvent, payload: unknown) {
  const set = handlers.get(event);
  if (!set?.size) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  }
}

function rejoinAll() {
  if (!socket?.connected) return;
  for (const gid of joinedGroups) {
    socket.emit('join:messenger_group', gid);
  }
}

/** Gắn socket app-wide (NotificationContext) — 1 kết nối duy nhất cho mọi màn chat. */
export function bindMessengerSocket(s: Socket) {
  if (socket === s && bound) return;
  socket = s;
  bound = true;
  typingBound = false;

  const onConnect = () => rejoinAll();
  s.off('connect', onConnect);
  s.on('connect', onConnect);

  for (const ev of EVENTS) {
    s.off(ev);
    s.on(ev, (payload: unknown) => dispatch(ev, payload));
  }
  const onReaction = (payload: unknown) => {
    dispatch('messenger_group:reaction', payload);
    dispatch('messenger_group:reactions', payload);
  };
  s.off('messenger_group:reaction');
  s.off('messenger_group:reactions');
  s.on('messenger_group:reaction', onReaction);
  s.on('messenger_group:reactions', onReaction);

  if (s.connected) rejoinAll();
}

export function joinMessengerGroup(groupId: string) {
  const gid = String(groupId);
  if (!gid) return;
  joinedGroups.add(gid);
  socket?.emit('join:messenger_group', gid);
}

export function leaveMessengerGroup(groupId: string) {
  const gid = String(groupId);
  joinedGroups.delete(gid);
  socket?.emit('leave:messenger_group', gid);
}

export function subscribeMessengerEvent(event: MessengerRealtimeEvent, fn: Handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(fn);
  return () => {
    handlers.get(event)?.delete(fn);
  };
}

export function getJoinedMessengerGroups() {
  return [...joinedGroups];
}

export function getMessengerSocket() {
  return socket;
}

export type MessengerTypingPayload = {
  group_id?: string;
  user_id?: string;
  is_typing?: boolean;
  full_name?: string;
};

type TypingHandler = (payload: MessengerTypingPayload) => void;
const typingHandlers = new Set<TypingHandler>();
let typingBound = false;

function bindTypingListener() {
  if (!socket || typingBound) return;
  typingBound = true;
  socket.on('messenger_group:typing', (payload: MessengerTypingPayload) => {
    for (const fn of typingHandlers) {
      try {
        fn(payload);
      } catch {
        /* ignore */
      }
    }
  });
}

export function subscribeMessengerTyping(fn: TypingHandler) {
  bindTypingListener();
  typingHandlers.add(fn);
  return () => {
    typingHandlers.delete(fn);
  };
}

export function emitMessengerTyping(groupId: string, isTyping: boolean) {
  if (!socket?.connected || !groupId) return;
  socket.emit('messenger_group:typing', { group_id: groupId, is_typing: isTyping });
}
