import { useEffect, useRef } from 'react';
import { subscribeCrmRealtime } from '../lib/crmRealtimeBus';

const DEBOUNCE_MS = 2500;

/** Gọi `refresh` khi CRM thay đổi (socket hoặc poll live-version). */
export function useCrmRealtimeRefresh(refresh: () => void, enabled = true): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeCrmRealtime(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        refreshRef.current();
      }, DEBOUNCE_MS);
    });
  }, [enabled]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
}
