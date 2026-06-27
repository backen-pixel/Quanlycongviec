import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { fetchNotificationCounts } from '../api/notifications';
import { useCrmRealtimeRefresh } from './useCrmRealtimeRefresh';

/** Số thông báo chưa đọc — refresh khi focus + realtime CRM/notification. */
export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    void fetchNotificationCounts()
      .then((c) => setCount(c.total))
      .catch(() => setCount(0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useCrmRealtimeRefresh(refresh);

  return count;
}
