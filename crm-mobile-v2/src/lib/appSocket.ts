import type { Socket } from 'socket.io-client';

type Handler = (socket: Socket) => void;

let currentSocket: Socket | null = null;
const handlers = new Set<Handler>();

export function setAppSocket(socket: Socket | null) {
  currentSocket = socket;
  if (socket) {
    for (const fn of handlers) {
      try {
        fn(socket);
      } catch {
        /* ignore */
      }
    }
  }
}

export function getAppSocket(): Socket | null {
  return currentSocket;
}

export function subscribeAppSocket(fn: Handler) {
  if (currentSocket) fn(currentSocket);
  handlers.add(fn);
  return () => {
    handlers.delete(fn);
  };
}
