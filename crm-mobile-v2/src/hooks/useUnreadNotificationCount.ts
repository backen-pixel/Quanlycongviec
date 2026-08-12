import { useCallback, useEffect, useState } from 'react';
import { fetchNotificationCounts } from '../api/notifications';
import {
  bellUnreadCount,
  getNotificationCounts,
  subscribeNotificationCounts,
} from '../lib/notificationCountsStore';
import { useCrmRealtimeRefresh } from './useCrmRealtimeRefresh';

/** Số chuông header/Menu — không gồm nhắc hạn (trùng tab Deadline). */
export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(() => bellUnreadCount(getNotificationCounts()));

  useEffect(
    () => subscribeNotificationCounts((next) => setCount(bellUnreadCount(next))),
    [],
  );

  const refresh = useCallback(() => {
    void fetchNotificationCounts().catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, 5000);
    return () => clearTimeout(t);
  }, [refresh]);

  useCrmRealtimeRefresh(refresh);

  return count;
}
