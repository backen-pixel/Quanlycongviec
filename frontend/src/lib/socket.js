import { io } from 'socket.io-client';
import { resolveApiOrigin } from './apiOrigin';

const API_URL = resolveApiOrigin();

let socket = null;
let boundToken = null;

function normalizeToken(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim();
  return s;
}

/** Tùy chọn Socket.IO — ổn định trên Render (cold start, proxy). Polling trước, sau đó upgrade WS. */
function socketClientOptions(token) {
  const clean = normalizeToken(token);
  return {
    auth: { token: clean },
    ...(clean ? { extraHeaders: { Authorization: `Bearer ${clean}` } } : {}),
    transports: ['polling', 'websocket'],
    upgrade: true,
    withCredentials: false,
    timeout: 20_000,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10_000,
    reconnectionAttempts: Infinity,
  };
}

function authErrorNeedsLogout(err) {
  const code = err?.data?.code;
  const msg = String(err?.message || '');
  return code === 'session_expired_midnight'
    || code === 'no_token'
    || msg === 'session_expired_midnight'
    || msg === 'no_token'
    || msg === 'Invalid token'
    || msg === 'jwt expired';
}

function attachSocketHandlers(sock) {
  sock.on('connect', () => {
    const current = normalizeToken(localStorage.getItem('token'));
    if (!current || current !== boundToken) {
      disconnectSocket();
      return;
    }
    console.log('🔌 Socket connected:', sock.id);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const uid = user.userId || user.id;
    if (uid) sock.emit('join:user', uid);
  });

  sock.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
  });

  sock.on('connect_error', (err) => {
    const detail = err?.data?.code ? ` (${err.data.code})` : '';
    console.warn('⚠️ Socket error:', err.message + detail);
    const token = normalizeToken(localStorage.getItem('token'));
    if (!token) {
      disconnectSocket();
      return;
    }
    if (authErrorNeedsLogout(err)) {
      disconnectSocket();
    }
  });
}

export function connectSocket() {
  const token = normalizeToken(localStorage.getItem('token'));
  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socket) {
    if (boundToken === token) {
      return socket;
    }
    disconnectSocket();
  }

  boundToken = token;
  socket = io(API_URL, socketClientOptions(token));
  attachSocketHandlers(socket);
  return socket;
}

export function disconnectSocket() {
  if (!socket) {
    boundToken = null;
    return;
  }
  const sock = socket;
  socket = null;
  boundToken = null;
  try {
    sock.removeAllListeners();
    if (sock.io) sock.io.reconnection(false);
    if (sock.connected) {
      sock.disconnect();
    } else {
      sock.close();
    }
  } catch {
    /* ignore */
  }
}

export function getSocket() {
  if (!normalizeToken(localStorage.getItem('token'))) return null;
  return socket;
}
