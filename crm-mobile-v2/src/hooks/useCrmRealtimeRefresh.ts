import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useRef, useState } from 'react';
import { subscribeCrmRealtime } from '../lib/crmRealtimeBus';

const DEBOUNCE_MS = 100;

export type CrmRealtimeRefreshOpts = {
  enabled?: boolean;
  /**
   * Mặc định true: tab freezeOnBlur / không focus không refetch nền.
   * Runner ngoài navigator không có NavigationContext → luôn coi như focused.
   */
  onlyWhenFocused?: boolean;
};

function useSafeIsFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) {
      setFocused(true);
      return undefined;
    }
    setFocused(navigation.isFocused());
    const unsubFocus = navigation.addListener('focus', () => setFocused(true));
    const unsubBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [navigation]);

  return focused;
}

/** Gọi `refresh` khi CRM thay đổi (socket hoặc poll live-version).
 * Provider đã debounce ~2s trước khi emit — hook chỉ coalesce ngắn (100ms), không chồng 2.5s. */
export function useCrmRealtimeRefresh(
  refresh: (payload?: import('../lib/crmRealtimeBus').CrmRealtimePayload) => void,
  enabledOrOpts: boolean | CrmRealtimeRefreshOpts = true,
): void {
  const enabled = typeof enabledOrOpts === 'boolean'
    ? enabledOrOpts
    : (enabledOrOpts.enabled ?? true);
  const onlyWhenFocused = typeof enabledOrOpts === 'boolean'
    ? true
    : (enabledOrOpts.onlyWhenFocused ?? true);

  const focused = useSafeIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const onlyWhenFocusedRef = useRef(onlyWhenFocused);
  onlyWhenFocusedRef.current = onlyWhenFocused;

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeCrmRealtime((payload) => {
      // badge_updated / stage_changed: gọi ngay — chip SX/VC & đổi cột không chờ debounce.
      const instant =
        payload.reason === 'badge_updated'
        || payload.detail?.action === 'stage_changed'
        || payload.detail?.reason === 'project_deleted';
      if (instant) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (onlyWhenFocusedRef.current && !focusedRef.current) return;
        refreshRef.current(payload);
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (onlyWhenFocusedRef.current && !focusedRef.current) return;
        refreshRef.current(payload);
      }, DEBOUNCE_MS);
    });
  }, [enabled]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
}
