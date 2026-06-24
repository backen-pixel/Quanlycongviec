import { io } from 'socket.io-client';
import { resolveApiOrigin } from './apiOrigin';

const API_URL = resolveApiOrigin();

let socket = null;
let boundToken = null;

export function connectSocket() {
  const token = localStorage.getItem('token');
  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socket) {
    if (boundToken === token && socket.connected) return socket;
    disconnectSocket();
  }

  boundToken = token;
  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    if (localStorage.getItem('token') !== boundToken) {
      disconnectSocket();
      return;
    }
    console.log('🔌 Socket connected:', socket.id);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.id) socket.emit('join:user', user.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('⚠️ Socket error:', err.message);
    if (!localStorage.getItem('token')) {
      disconnectSocket();
    }
  });

  return socket;
}

export function disconnectSocket() {
  if (!socket) {
    boundToken = null;
    return;
  }
  try {
    socket.removeAllListeners();
    if (socket.io) socket.io.reconnection(false);
    socket.disconnect();
  } catch {
    /* ignore */
  }
  socket = null;
  boundToken = null;
}

export function getSocket() {
  if (!localStorage.getItem('token')) return null;
  return socket;
}
