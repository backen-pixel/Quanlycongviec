import { io } from 'socket.io-client';
import { resolveApiOrigin } from './apiOrigin';
import api from './api';

const API_URL = resolveApiOrigin();

let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket.id);
    api.post('/users/ping').catch(() => {});
    socket.emit('presence:ping');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.id) socket.emit('join:user', user.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('⚠️ Socket error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
