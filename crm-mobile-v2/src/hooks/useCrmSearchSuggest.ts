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
const SUGGEST_LIMIT = 40;
const SUGGEST_FETCH = 80;
const DEBOUNCE_MS = 280;

function codeSuffix(code?: string | null): string {
  const parts = String(code || '').split('-').filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

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
  return scoreCrmSearchSuggestItem(it, draft, field) > 0;
}

/** Điểm càng cao càng sát với những gì người dùng đang gõ. 0 = không khớp. */
export function scoreCrmSearchSuggestItem(
  it: {
    title?: string | null;
    code?: string | null;
    phone?: string | null;
    contactName?: string | null;
    ownerName?: string | null;
  },
  draft: string,
  field: SearchField,
): number {
  const q = draft.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  if (q.length < SUGGEST_MIN) return 0;
  const title = (it.title || '').toLowerCase();
  const name = (it.contactName || '').toLowerCase();
  const code = (it.code || '').toLowerCase();
  const suffix = codeSuffix(it.code);
  const phone = (it.phone || '').replace(/\D/g, '');
  const owner = (it.ownerName || '').toLowerCase();
  const onlyDigits = qDigits.length >= 2 && /^\d[\d\s.+-]*$/.test(q);

  const scoreTitle = () => {
    if (title === q || name === q) return 100;
    if (title.startsWith(q) || name.startsWith(q)) return 86;
    if (title.includes(q) || name.includes(q)) return 48;
    return 0;
  };
  const scoreCode = () => {
    if (!q) return 0;
    if (code === q) return 100;
    if (suffix === q || suffix === qDigits) return 94;
    if (suffix.startsWith(q) || (qDigits && suffix.startsWith(qDigits))) return 82;
    if (code.endsWith(q) || (qDigits && code.endsWith(qDigits))) return 70;
    if (!onlyDigits && code.includes(q)) return 40;
    return 0;
  };
  const scorePhone = () => {
    if (!qDigits) return 0;
    if (phone === qDigits) return 100;
    if (phone.endsWith(qDigits)) return 88;
    if (phone.startsWith(qDigits)) return 80;
    if (qDigits.length >= 4 && phone.includes(qDigits)) return 52;
    return 0;
  };
  const scoreOwner = () => {
    if (!owner) return 0;
    if (owner === q) return 90;
    if (owner.startsWith(q)) return 74;
    if (owner.includes(q)) return 42;
    return 0;
  };

  if (field === 'phone') return scorePhone();
  if (field === 'code') return scoreCode();
  if (field === 'title') return scoreTitle();
  if (field === 'assignee') return scoreOwner();

  if (onlyDigits) {
    return Math.max(scoreCode(), scoreTitle(), qDigits.length >= 4 ? scorePhone() : 0);
  }
  return Math.max(scoreTitle(), scoreCode(), scorePhone());
}

export function rankCrmSearchSuggestItems(
  items: CrmKanbanItem[],
  draft: string,
  field: SearchField,
  limit = SUGGEST_LIMIT,
): CrmKanbanItem[] {
  const seen = new Set<string>();
  const scored: Array<{ it: CrmKanbanItem; score: number }> = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    const score = scoreCrmSearchSuggestItem(it, draft, field);
    if (score <= 0) continue;
    scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.it);
}

export function useCrmSearchSuggest(opts: {
  enabled?: boolean;
  type: 'lead' | 'deal';
  /** Mặc định `[type]`. Tab Deadline tìm cả Lead và Deal. */
  types?: Array<'lead' | 'deal'>;
  searchDraft: string;
  filters: CrmHubFilters;
  myId: string;
  /** Bản ghi đã tải (cache) — gợi ý tức thì trước khi API trả. */
  localItems: CrmKanbanItem[];
  /** Chỉ giữ bản ghi có hạn (tab Deadline) — không trộn Lead/Deal chưa hẹn. */
  deadlineOnly?: boolean;
}) {
  const {
    enabled = true,
    type,
    types,
    searchDraft,
    filters,
    myId,
    localItems,
    deadlineOnly = false,
  } = opts;
  const fetchTypes = useMemo<Array<'lead' | 'deal'>>(
    () => (types?.length ? types : [type]),
    [types, type],
  );

  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remoteItems, setRemoteItems] = useState<CrmKanbanItem[]>([]);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const localMatches = useMemo(() => {
    const q = searchDraft.trim();
    if (!enabled || q.length < SUGGEST_MIN) return [] as CrmKanbanItem[];
    return rankCrmSearchSuggestItems(localItems, q, filters.searchField, SUGGEST_LIMIT);
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
    // Không tự mở lại dropdown khi draft đổi vì vừa chọn kết quả (setDismissed(true)).
    // Mở lại chỉ khi user gõ / focus (màn hình gọi setDismissed(false)).
    if (dismissed) {
      abortRef.current?.abort();
      setLoading(false);
      return undefined;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      const fetchOpts = {
        ...buildStageFetchOpts(filters, q, myId),
        search: buildSearchForApi(q, filters.searchField) || q,
        searchField: filters.searchField,
        suggest: true,
        signal: ac.signal,
        lite: true,
        skipCounts: true,
      };
      void Promise.all(fetchTypes.map((t) => fetchCrmSearchSuggest(t, q, fetchOpts, SUGGEST_FETCH)))
        .then((pages) => {
          if (ac.signal.aborted) return;
          const merged = pages.flatMap((p) => p.items);
          const scoped = deadlineOnly ? merged.filter((it) => !!it.dueIso) : merged;
          const ranked = rankCrmSearchSuggestItems(scoped, q, filters.searchField, SUGGEST_LIMIT);
          setRemoteItems(ranked);
          setTotal(ranked.length);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, searchDraft, fetchTypes, filters, myId, dismissed, deadlineOnly]);

  const items = useMemo(() => {
    if (!remoteItems.length) return localMatches;
    return rankCrmSearchSuggestItems(
      [...remoteItems, ...localMatches],
      searchDraft,
      filters.searchField,
      SUGGEST_LIMIT,
    );
  }, [remoteItems, localMatches, searchDraft, filters.searchField]);

  const open =
    enabled
    && searchDraft.trim().length >= SUGGEST_MIN
    && !dismissed
    && (loading || items.length > 0 || localMatches.length > 0);

  return {
    open,
    loading,
    items,
    total: items.length,
    dismissed,
    setDismissed,
    localMatches,
  };
}
