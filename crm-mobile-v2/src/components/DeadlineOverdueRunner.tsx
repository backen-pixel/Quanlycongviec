import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { currentUserId, useAuth } from '../context/AuthContext';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import { runDeadlineOverdueCheckOnce } from '../lib/deadlineOverdueBackgroundSync';
import {
  registerDeadlineOverdueBackgroundTask,
  unregisterDeadlineOverdueBackgroundTask,
} from '../lib/deadlineOverdueBackgroundTask';
import {
  maybeNotifyDeadlineOverdue,
} from '../lib/deadlineOverdueNotify';
import {
  clearDeadlineOverdueBreakdown,
  subscribeDeadlineOverdue,
} from '../lib/deadlineOverdueStore';

/** Quét định kỳ khi app mở (bổ sung background task ~15 phút). */
const FOREGROUND_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Sau đăng nhập: đếm Deadline quá hạn → badge + nhắc tray mỗi 3 giờ khi còn quá hạn.
 */
export default function DeadlineOverdueRunner() {
  const { token, loading, user } = useAuth();
  const userId = currentUserId(user);
  const userRef = useRef(user);
  userRef.current = user;

  const tick = useCallback((forceFetch = false) => {
    const u = userRef.current;
    if (!u || !currentUserId(u)) return;
    void runDeadlineOverdueCheckOnce({
      forceFetch,
      user: {
        id: currentUserId(u),
        company_id: u.company_id,
        role: u.role,
      },
    });
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    if (!token || !userId) {
      clearDeadlineOverdueBreakdown();
      void unregisterDeadlineOverdueBackgroundTask();
      return undefined;
    }

    tick(true);
    if (Platform.OS === 'android') {
      void registerDeadlineOverdueBackgroundTask();
    }

    const timer = setInterval(() => tick(false), FOREGROUND_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick(false);
    });
    const unsubStore = subscribeDeadlineOverdue((b) => {
      // Số tạm từ DeadlineScreen (chưa tải đủ) chỉ để cập nhật badge, không nhắc tray.
      if (b?.partial) return;
      void maybeNotifyDeadlineOverdue(b);
    });

    return () => {
      clearInterval(timer);
      sub.remove();
      unsubStore();
    };
  }, [loading, token, userId, tick]);

  useCrmRealtimeRefresh(
    useCallback(() => {
      // Dùng cache nếu vừa quét / DeadlineScreen vừa publish (<90s).
      tick(false);
    }, [tick]),
    Boolean(token && userId),
  );

  return null;
}
