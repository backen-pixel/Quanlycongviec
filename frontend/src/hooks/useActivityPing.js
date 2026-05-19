import { useEffect, useRef } from 'react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

/** Ping HTTP mỗi 60s; ngưỡng online trên server là 2 phút */
const PING_MS = 60 * 1000;

let warnedMissingTable = false;

function warnMissingPresenceTable(err) {
  if (warnedMissingTable) return;
  const status = err?.response?.status;
  const msg = err?.response?.data?.error || '';
  if (status === 503 || /user_last_activity|migration/i.test(msg)) {
    warnedMissingTable = true;
    console.warn(
      '[presence] Chưa ghi được ping — admin cần chạy migration database/67_user_activity_and_messenger_pins.sql trên Supabase',
    );
  }
}

/** HTTP + socket presence:ping */
export function sendActivityPing() {
  api.post('/users/ping').catch((err) => {
    warnMissingPresenceTable(err);
  });
  const socket = getSocket();
  if (socket?.connected) {
    socket.emit('presence:ping');
  }
}

/**
 * Báo hoạt động lên server khi đã đăng nhập.
 * Client khác dùng POST /users/presence để hiển thị online/offline.
 */
export function useActivityPing(enabled) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return undefined;

    const ping = () => {
      if (!enabledRef.current) return;
      sendActivityPing();
    };

    ping();

    const intervalId = setInterval(ping, PING_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVis);

    const onFocus = () => ping();
    window.addEventListener('focus', onFocus);

    const socket = getSocket();
    const onSocketConnect = () => ping();
    if (socket) {
      socket.on('connect', onSocketConnect);
    }

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      if (socket) socket.off('connect', onSocketConnect);
    };
  }, [enabled]);
}
