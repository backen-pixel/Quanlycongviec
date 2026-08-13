import type { Socket } from 'socket.io-client';

/** Handler có thể trả cleanup để gỡ listener khi unsubscribe / đổi socket. */
type Handler = (socket: Socket) => void | (() => void);

let currentSocket: Socket | null = null;
const handlers = new Set<Handler>();
/** Cleanup gắn với từng handler trên socket hiện tại. */
const cleanups = new Map<Handler, () => void>();

function runCleanup(fn: Handler) {
  const c = cleanups.get(fn);
  if (!c) return;
  cleanups.delete(fn);
  try {
    c();
  } catch {
    /* ignore */
  }
}

function bindHandler(fn: Handler, socket: Socket) {
  runCleanup(fn);
  try {
    const cleanup = fn(socket);
    if (typeof cleanup === 'function') {
      cleanups.set(fn, cleanup);
    }
  } catch {
    /* ignore */
  }
}

export function setAppSocket(socket: Socket | null) {
  // Gỡ listener trên socket cũ trước khi gắn socket mới.
  for (const fn of handlers) {
    runCleanup(fn);
  }
  currentSocket = socket;
  if (socket) {
    for (const fn of handlers) {
      bindHandler(fn, socket);
    }
  }
}

export function getAppSocket(): Socket | null {
  return currentSocket;
}

export function subscribeAppSocket(fn: Handler) {
  handlers.add(fn);
  if (currentSocket) {
    bindHandler(fn, currentSocket);
  }
  return () => {
    runCleanup(fn);
    handlers.delete(fn);
  };
}
