export const TRASH_PAGE_SIZE = 25;

export function paginateItems(items, page, pageSize = TRASH_PAGE_SIZE) {
  const total = items?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: (items || []).slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
    pageSize,
  };
}

export function fmtTrashDateTime(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(s);
  }
}
