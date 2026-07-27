import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchOrgActivityFeed,
  type EmployeeReportQuery,
} from '../api/employeeReport';
import { useCrmRealtimeRefresh } from './useCrmRealtimeRefresh';
import {
  mapApiActivityFeedItem,
  type ActivityFeedItem,
} from '../lib/reportActivityFeed';

export function useOrgActivityFeed(query: EmployeeReportQuery, enabled = true) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestAtRef = useRef<string | null>(null);

  const itemsLenRef = useRef(0);

  const load = useCallback(async (incremental = false) => {
    if (!enabled) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (!incremental || itemsLenRef.current === 0) setLoading(true);
    setError(null);
    try {
      const res = await fetchOrgActivityFeed(query, {
        limit: 30,
        since: incremental && latestAtRef.current ? latestAtRef.current : undefined,
        signal: ac.signal,
      });
      const mapped = (res.items || []).map(mapApiActivityFeedItem);
      if (incremental && latestAtRef.current && mapped.length) {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const merged = [...mapped.filter((x) => !seen.has(x.id)), ...prev];
          return merged.slice(0, 30);
        });
      } else {
        setItems(mapped);
      }
      if (mapped.length) {
        latestAtRef.current = mapped[0].occurredAt || latestAtRef.current;
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Không tải được hoạt động');
    } finally {
      if (abortRef.current === ac) setLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    itemsLenRef.current = items.length;
  }, [items.length]);

  useEffect(() => {
    if (!enabled) return;
    latestAtRef.current = null;
    void load(false);
    return () => abortRef.current?.abort();
  }, [enabled, load]);

  useCrmRealtimeRefresh(() => {
    void load(true);
  }, enabled);

  return { items, loading, error, refresh: () => load(false) };
}
