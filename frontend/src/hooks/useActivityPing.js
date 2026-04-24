import { useEffect } from 'react';
import api from '../lib/api';

const PING_MS = 2 * 60 * 1000;

/** Báo hoạt động lên server; client khác dùng POST /users/presence để biết online/offline (ngưỡng 2 phút). */
const PING_ENABLED = false; // tạm tắt để giảm egress

export function useActivityPing(enabled) {
  useEffect(() => {
    if (!enabled || !PING_ENABLED) return undefined;
    const ping = () => {
      api.post('/users/ping').catch(() => {});
    };
    ping();
    const id = setInterval(ping, PING_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);
}
