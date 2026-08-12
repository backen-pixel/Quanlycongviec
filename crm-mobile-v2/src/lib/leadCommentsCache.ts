import type { LeadComment } from '../api/leadDetail';
import { fetchLeadComments } from '../api/leadDetail';

type Entry = { items: LeadComment[]; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<LeadComment[]>>();

/** Cache trong bộ nhớ — hiển thị ngay khi mở lại tab, rồi refresh nền. */
export function getCachedLeadComments(leadId: string): LeadComment[] | null {
  const row = cache.get(String(leadId));
  return row ? row.items : null;
}

export function setCachedLeadComments(leadId: string, items: LeadComment[]) {
  cache.set(String(leadId), { items: items || [], at: Date.now() });
}

/** Một request đang chạy được dùng chung (badge + tab bình luận). */
export function fetchLeadCommentsShared(leadId: string): Promise<LeadComment[]> {
  const key = String(leadId);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = fetchLeadComments(key)
    .then((items) => {
      setCachedLeadComments(key, items);
      return items;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function patchCachedLeadComment(leadId: string, row: LeadComment) {
  const key = String(leadId);
  const prev = cache.get(key)?.items || [];
  const i = prev.findIndex((c) => String(c.id) === String(row.id));
  const next =
    i >= 0
      ? prev.map((c, idx) => (idx === i ? { ...c, ...row } : c))
      : [...prev, row];
  cache.set(key, { items: next, at: Date.now() });
}

export function removeCachedLeadComment(leadId: string, commentId: string | number) {
  const key = String(leadId);
  const prev = cache.get(key)?.items;
  if (!prev) return;
  cache.set(key, {
    items: prev.filter((c) => String(c.id) !== String(commentId)),
    at: Date.now(),
  });
}
