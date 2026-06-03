import type { Socket } from 'socket.io-client';

export type MessengerRealtimeEvent =
  | 'messenger_group:chat'
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
  'messenger_group:reactions',
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

  const onConnect = () => rejoinAll();
  s.off('connect', onConnect);
  s.on('connect', onConnect);

  for (const ev of EVENTS) {
    s.off(ev);
    s.on(ev, (payload: unknown) => dispatch(ev, payload));
  }

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
