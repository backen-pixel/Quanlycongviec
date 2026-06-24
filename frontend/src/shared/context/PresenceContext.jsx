import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../../lib/auth';
import { useUserPresence } from '../../hooks/useUserPresence';
import OnlineStatusDot, { isUserOnline } from '../../components/OnlineStatusDot';

const PresenceContext = createContext(null);

function normalizeLiveEntry(payload) {
  if (!payload?.user_id) return null;
  return {
    online: payload.online !== false,
    last_ping_at: payload.last_ping_at || null,
  };
}

export function PresenceProvider({ children }) {
  const { socket } = useAuth();
  const [liveMap, setLiveMap] = useState({});

  useEffect(() => {
    if (!socket) {
      setLiveMap({});
      return undefined;
    }
    const onUpdate = (payload) => {
      const entry = normalizeLiveEntry(payload);
      if (!entry) return;
      const id = String(payload.user_id);
      setLiveMap((prev) => ({ ...prev, [id]: { ...prev[id], ...entry } }));
    };
    socket.on('presence:update', onUpdate);
    return () => {
      socket.off('presence:update', onUpdate);
    };
  }, [socket]);

  const patchLive = useCallback((userId, patch) => {
    const id = String(userId || '');
    if (!id) return;
    setLiveMap((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const value = useMemo(
    () => ({ liveMap, patchLive }),
    [liveMap, patchLive],
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

/**
 * Presence theo danh sách user: poll định kỳ + cập nhật realtime qua socket.
 */
export function usePresence(userIds, opts) {
  const ctx = useContext(PresenceContext);
  const polled = useUserPresence(userIds, opts);

  return useMemo(() => {
    const out = { ...polled };
    const live = ctx?.liveMap || {};
    for (const id of userIds || []) {
      const k = String(id);
      if (!k) continue;
      if (live[k]) {
        out[k] = { ...out[k], ...live[k], online: live[k].online ?? out[k]?.online };
      }
    }
    return out;
  }, [polled, ctx?.liveMap, userIds]);
}

/** Avatar + chấm online (dùng chung Social, Messenger, KPI…). */
export function UserPresenceAvatar({
  user,
  size = 'md',
  className = '',
  avatarClassName = 'h-10 w-10',
  showPresence = true,
  children,
}) {
  const uid = user?.id || user?.user_id;
  const presence = usePresence(uid && showPresence ? [uid] : [], {
    enabled: showPresence && !!uid,
  });
  const online = isUserOnline(presence, uid);

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {children}
      {showPresence && uid ? (
        <OnlineStatusDot
          online={online}
          size={size}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
        />
      ) : null}
    </span>
  );
}

export { isUserOnline };
