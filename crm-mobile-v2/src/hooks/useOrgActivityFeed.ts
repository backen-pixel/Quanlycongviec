import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchOrgActivityFeed,
  type EmployeeReportQuery,
} from '../api/employeeReport';
import { formatApiError } from '../api/client';
import { useCrmRealtimeRefresh } from './useCrmRealtimeRefresh';
import {
  mapApiActivityFeedItem,
  type ActivityFeedItem,
} from '../lib/reportActivityFeed';

function isAbortLike(e: unknown): boolean {
  const name = (e as { name?: string })?.name;
  const code = (e as { code?: string })?.code;
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED';
}

function queryKey(q: EmployeeReportQuery): string {
  return [
    q.date_from,
    q.date_to,
    q.company_id || '',
    q.region_id || '',
    q.type || 'all',
  ].join('|');
}

export function useOrgActivityFeed(query: EmployeeReportQuery, enabled = true) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestAtRef = useRef<string | null>(null);
  const genRef = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const qKey = queryKey(query);

  const itemsLenRef = useRef(0);

  const load = useCallback(async (incremental = false) => {
    if (!enabled) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = ++genRef.current;
    let timedOut = false;
    const kill = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, 12_000);
    if (!incremental || itemsLenRef.current === 0) setLoading(true);
    setError(null);
    try {
      const res = await fetchOrgActivityFeed(queryRef.current, {
        limit: 30,
        since: incremental && latestAtRef.current ? latestAtRef.current : undefined,
        signal: ac.signal,
        timeoutMs: 12_000,
      });
      if (gen !== genRef.current) return;
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
      if (gen !== genRef.current) return;
      if (isAbortLike(e)) {
        if (timedOut) {
          setError('Hết thời gian tải hoạt động. Kéo xuống để thử lại.');
        }
        return;
      }
      setError(formatApiError(e) || 'Không tải được hoạt động');
    } finally {
      clearTimeout(kill);
      if (gen === genRef.current) setLoading(false);
    }
  }, [enabled, qKey]);

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
