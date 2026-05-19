import { useEffect, useState } from 'react';
import api from '../lib/api';

/** Poll presence thường xuyên hơn ngưỡng online 2 phút để UI cập nhật kịp */
const DEFAULT_POLL_MS = 45 * 1000;

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
      try {
        const { data } = await api.post('/users/presence', { user_ids: ids });
        if (!cancelled) setPresenceByUser(normalizePresenceMap(data?.presence || {}));
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

/** Chuẩn hóa key UUID → string để khớp user.id từ API */
function normalizePresenceMap(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[String(k)] = v;
  }
  return out;
}
