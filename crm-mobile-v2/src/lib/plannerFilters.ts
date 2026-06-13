import type { PlannerItem } from '../types';

/** Bộ lọc nhanh trên Planner — chỉ các trạng thái hay dùng hàng ngày. */
export type PlannerQuickFilter = 'all' | 'overdue' | 'today' | 'no_due' | 'has_phone';

export const PLANNER_PAGE_SIZE = 8;
export const PLANNER_FETCH_BATCH = 40;

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  } catch {
    return false;
  }
}

export function filterPlannerItems(
  items: PlannerItem[],
  search: string,
  quick: PlannerQuickFilter,
): PlannerItem[] {
  let result = items;
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');

  switch (quick) {
    case 'overdue':
      result = result.filter((i) => i.overdue);
      break;
    case 'today':
      result = result.filter((i) => isToday(i.dueIso));
      break;
    case 'no_due':
      result = result.filter((i) => !i.dueIso);
      break;
    case 'has_phone':
      result = result.filter((i) => !!(i.phone || '').replace(/\D/g, ''));
      break;
    default:
      break;
  }

  if (!q) return result;

  return result.filter((i) =>
    (i.code || '').toLowerCase().includes(q)
    || (i.title || '').toLowerCase().includes(q)
    || (i.contactName || '').toLowerCase().includes(q)
    || (i.status || '').toLowerCase().includes(q)
    || (qDigits.length >= 3 && (i.phone || '').replace(/\D/g, '').includes(qDigits)),
  );
}

export function plannerSearchPlaceholder(kind: 'lead' | 'deal'): string {
  return `Tìm mã, tên khách, SĐT ${kind}...`;
}
