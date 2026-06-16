import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { fetchNotificationCounts } from '../api/notifications';

/** Số thông báo chưa đọc (đồng bộ web qua /dashboard). Tự làm mới khi màn hình được focus. */
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

  return count;
}
