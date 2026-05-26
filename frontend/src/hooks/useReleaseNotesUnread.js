import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { builtinUpdateUnreadCount } from '../lib/releaseNotesRead';

/**
 * Số bản cập nhật chưa đọc: release_notes (DB) + builtin (localStorage).
 *
 * Phần builtin (localStorage) vẫn cập nhật bình thường khi chưa đăng nhập;
 * phần DB chỉ gọi khi đã đăng nhập để tránh spam 401.
 */
export function useReleaseNotesUnread() {
  const { user } = useAuth();
  const [dbUnread, setDbUnread] = useState(0);
  const [builtinUnread, setBuiltinUnread] = useState(() => builtinUpdateUnreadCount());

  const refresh = useCallback(async () => {
    setBuiltinUnread(builtinUpdateUnreadCount());
    if (!user) {
      setDbUnread(0);
      return;
    }
    try {
      const { data } = await api.get('/release-notes/unread-count');
      setDbUnread(Number(data?.unread) || 0);
    } catch {
      setDbUnread(0);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const onStorage = (e) => {
      if (e.key === 'release_notes_read_builtin_ids') {
        setBuiltinUnread(builtinUpdateUnreadCount());
      }
    };
    window.addEventListener('storage', onStorage);
    const t = setInterval(() => setBuiltinUnread(builtinUpdateUnreadCount()), 5000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
  }, [refresh]);

  const total = dbUnread + builtinUnread;

  return { dbUnread, builtinUnread, total, refresh };
}
