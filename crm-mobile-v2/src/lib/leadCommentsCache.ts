import type { LeadComment } from '../api/leadDetail';
import { fetchLeadComments, type FetchLeadCommentsResult } from '../api/leadDetail';

type Entry = { items: LeadComment[]; hasMore: boolean; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<FetchLeadCommentsResult>>();

const COMMENT_CACHE_TTL_MS = 30 * 60_000;
const MAX_COMMENT_CACHE = 40;
/** Trang đầu — đủ để mở tab nhanh, không dump full thread. */
export const LEAD_COMMENTS_PAGE_SIZE = 50;

function pruneCommentCache() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.at > COMMENT_CACHE_TTL_MS) cache.delete(k);
  }
  if (cache.size <= MAX_COMMENT_CACHE) return;
  const ordered = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  const drop = cache.size - MAX_COMMENT_CACHE;
  for (let i = 0; i < drop; i += 1) {
    const key = ordered[i]?.[0];
    if (key) cache.delete(key);
  }
}

/** Cache trang đã tải (thường là trang mới nhất + các trang cũ đã merge). */
export function getCachedLeadComments(leadId: string): LeadComment[] | null {
  const row = cache.get(String(leadId));
  if (!row) return null;
  if (Date.now() - row.at > COMMENT_CACHE_TTL_MS) {
    cache.delete(String(leadId));
    return null;
  }
  return row.items;
}

export function getCachedLeadCommentsMeta(
  leadId: string,
): { items: LeadComment[]; hasMore: boolean } | null {
  const row = cache.get(String(leadId));
  if (!row) return null;
  if (Date.now() - row.at > COMMENT_CACHE_TTL_MS) {
    cache.delete(String(leadId));
    return null;
  }
  return { items: row.items, hasMore: row.hasMore };
}

export function setCachedLeadComments(
  leadId: string,
  items: LeadComment[],
  hasMore = false,
) {
  cache.set(String(leadId), { items: items || [], hasMore: !!hasMore, at: Date.now() });
  pruneCommentCache();
}

/** Trang đầu (không `before`) — dùng chung badge/tab nếu cần; mặc định limit trang. */
export function fetchLeadCommentsShared(
  leadId: string,
  opts?: { limit?: number },
): Promise<FetchLeadCommentsResult> {
  const key = String(leadId);
  const existing = inflight.get(key);
  if (existing) return existing;
  const limit = opts?.limit ?? LEAD_COMMENTS_PAGE_SIZE;
  const p = fetchLeadComments(key, { limit })
    .then((res) => {
      setCachedLeadComments(key, res.items, res.hasMore);
      return res;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function patchCachedLeadComment(leadId: string, row: LeadComment) {
  const key = String(leadId);
  const prev = cache.get(key);
  const list = prev?.items || [];
  const i = list.findIndex((c) => String(c.id) === String(row.id));
  const next =
    i >= 0
      ? list.map((c, idx) => (idx === i ? { ...c, ...row } : c))
      : [...list, row];
  cache.set(key, { items: next, hasMore: prev?.hasMore ?? false, at: Date.now() });
  pruneCommentCache();
}

export function removeCachedLeadComment(leadId: string, commentId: string | number) {
  const key = String(leadId);
  const prev = cache.get(key);
  if (!prev) return;
  cache.set(key, {
    items: prev.items.filter((c) => String(c.id) !== String(commentId)),
    hasMore: prev.hasMore,
    at: Date.now(),
  });
}
