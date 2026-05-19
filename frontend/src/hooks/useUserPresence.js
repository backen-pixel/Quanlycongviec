import { useEffect, useState } from 'react';
import api from '../lib/api';

const DEFAULT_POLL_MS = 120 * 1000;

/**
 * Lấy trạng thái online theo user_ids (ngưỡng 2 phút kể từ last ping).
 * @param {string[]} userIds
 * @param {{ enabled?: boolean, pollMs?: number }} [opts]
 */
export function useUserPresence(userIds, { enabled = true, pollMs = DEFAULT_POLL_MS } = {}) {
  const [presenceByUser, setPresenceByUser] = useState({});

  const idsKey = [...new Set((userIds || []).filter(Boolean).map(String))].sort().join(',');

  useEffect(() => {
    if (!enabled || !idsKey) {
      setPresenceByUser({});
      return undefined;
    }
    const ids = idsKey.split(',').filter(Boolean).slice(0, 200);
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const { data } = await api.post('/users/presence', { user_ids: ids });
        if (!cancelled) setPresenceByUser(data?.presence || {});
      } catch {
        if (!cancelled) setPresenceByUser({});
      }
    };

    void tick();
    const interval = setInterval(tick, pollMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, idsKey, pollMs]);

  return presenceByUser;
}
