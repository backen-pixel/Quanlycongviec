import { useCallback, useEffect, useState } from 'react';
import {
  getDeadlineOverdueTotal,
  subscribeDeadlineOverdue,
} from '../lib/deadlineOverdueStore';

/** Số Lead+Deal quá hạn — badge tab Deadline. */
export function useDeadlineOverdueCount(): number {
  const [count, setCount] = useState(() => getDeadlineOverdueTotal());

  const sync = useCallback(() => {
    setCount(getDeadlineOverdueTotal());
  }, []);

  useEffect(() => subscribeDeadlineOverdue(() => sync()), [sync]);

  return count;
}
