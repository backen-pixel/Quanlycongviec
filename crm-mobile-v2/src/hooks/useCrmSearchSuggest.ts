import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCrmSearchSuggest } from '../api/crm';
import {
  buildSearchForApi,
  buildStageFetchOpts,
  type CrmHubFilters,
  type SearchField,
} from '../lib/crmFilters';
import type { CrmKanbanItem } from '../types';

const SUGGEST_MIN = 2;
const SUGGEST_LIMIT = 10;
const DEBOUNCE_MS = 280;

export function matchCrmSearchSuggestItem(
  it: {
    title?: string | null;
    code?: string | null;
    phone?: string | null;
    contactName?: string | null;
    ownerName?: string | null;
    stageName?: string | null;
    status?: string | null;
  },
  draft: string,
  field: SearchField,
): boolean {
  const q = draft.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  if (q.length < SUGGEST_MIN) return false;
  if (field === 'phone') {
    return !!(qDigits && (it.phone || '').replace(/\D/g, '').includes(qDigits));
  }
  if (field === 'code') return (it.code || '').toLowerCase().includes(q);
  if (field === 'title') {
    return (it.title || '').toLowerCase().includes(q)
      || (it.contactName || '').toLowerCase().includes(q);
  }
  if (field === 'assignee') return (it.ownerName || '').toLowerCase().includes(q);
  const hay = [
    it.title, it.code, it.phone, it.contactName, it.ownerName, it.stageName, it.status,
  ].join(' ').toLowerCase();
  return hay.includes(q)
    || !!(qDigits && (it.phone || '').replace(/\D/g, '').includes(qDigits));
}

export function useCrmSearchSuggest(opts: {
  enabled?: boolean;
  type: 'lead' | 'deal';
  searchDraft: string;
  filters: CrmHubFilters;
  myId: string;
  /** Bản ghi đã tải (cache) — gợi ý tức thì trước khi API trả. */
  localItems: CrmKanbanItem[];
}) {
  const {
    enabled = true,
    type,
    searchDraft,
    filters,
    myId,
    localItems,
  } = opts;

  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remoteItems, setRemoteItems] = useState<CrmKanbanItem[]>([]);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const localMatches = useMemo(() => {
    const q = searchDraft.trim();
    if (!enabled || q.length < SUGGEST_MIN) return [] as CrmKanbanItem[];
    const out: CrmKanbanItem[] = [];
    const seen = new Set<string>();
    for (const it of localItems) {
      if (seen.has(it.id)) continue;
      if (!matchCrmSearchSuggestItem(it, q, filters.searchField)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= SUGGEST_LIMIT) break;
    }
    return out;
  }, [enabled, searchDraft, localItems, filters.searchField]);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setRemoteItems([]);
      setTotal(0);
      setLoading(false);
      return undefined;
    }
    const q = searchDraft.trim();
    if (q.length < SUGGEST_MIN) {
      abortRef.current?.abort();
      setRemoteItems([]);
      setTotal(0);
      setLoading(false);
      return undefined;
    }
    setDismissed(false);
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      const fetchOpts = {
        ...buildStageFetchOpts(filters, '', myId),
        search: buildSearchForApi(q, filters.searchField) || q,
        signal: ac.signal,
        lite: true,
        skipCounts: true,
      };
      void fetchCrmSearchSuggest(type, q, fetchOpts, SUGGEST_LIMIT)
        .then((res) => {
          if (ac.signal.aborted) return;
          setRemoteItems(res.items);
          setTotal(res.total);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, searchDraft, type, filters, myId]);

  const items = remoteItems.length ? remoteItems : localMatches;
  const open =
    enabled
    && searchDraft.trim().length >= SUGGEST_MIN
    && !dismissed
    && (loading || items.length > 0 || localMatches.length > 0);

  return {
    open,
    loading,
    items,
    total: total || items.length,
    dismissed,
    setDismissed,
    localMatches,
  };
}
