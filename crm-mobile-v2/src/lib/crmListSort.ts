import type { CrmKanbanItem } from '../types';

export type CrmListSort =
  | 'newest'
  | 'oldest'
  | 'last_week'
  | 'last_month'
  | 'value_desc'
  | 'value_asc'
  | 'name_asc'
  | 'name_desc';

export const CRM_LIST_SORT_OPTIONS: { id: CrmListSort; name: string }[] = [
  { id: 'newest', name: 'Mới nhất' },
  { id: 'oldest', name: 'Cũ nhất' },
  { id: 'last_week', name: 'Tuần trước' },
  { id: 'last_month', name: 'Tháng trước' },
  { id: 'value_desc', name: 'Giá trị cao → thấp' },
  { id: 'value_asc', name: 'Giá trị thấp → cao' },
  { id: 'name_asc', name: 'Tên A → Z' },
  { id: 'name_desc', name: 'Tên Z → A' },
];

/** Sort modes that also set Ngày tạo filter. */
export function isPeriodListSort(sort: CrmListSort): boolean {
  return sort === 'last_week' || sort === 'last_month';
}

export function crmListSortLabel(sort: CrmListSort): string {
  return CRM_LIST_SORT_OPTIONS.find((o) => o.id === sort)?.name || 'Mới nhất';
}

export function isCrmListSort(v: string | null | undefined): v is CrmListSort {
  return !!v && CRM_LIST_SORT_OPTIONS.some((o) => o.id === v);
}

function ts(iso?: string | null): number {
  if (!iso) return 0;
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : 0;
}

function valueOf(it: CrmKanbanItem): number {
  const n = Number(it.estimatedValue);
  return Number.isFinite(n) ? n : -1;
}

function nameOf(it: CrmKanbanItem): string {
  return (it.title || it.contactName || '').trim().toLocaleLowerCase('vi');
}

/** Sắp xếp bản ghi đã tải (client). Period sorts dùng thứ tự «mới nhất» (lọc ngày do API). */
export function sortCrmListItems(items: CrmKanbanItem[], sort: CrmListSort): CrmKanbanItem[] {
  if (sort === 'newest' || sort === 'last_week' || sort === 'last_month' || !items.length) {
    return items;
  }
  const arr = [...items];
  switch (sort) {
    case 'oldest':
      return arr.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    case 'value_desc':
      return arr.sort((a, b) => valueOf(b) - valueOf(a) || ts(b.createdAt) - ts(a.createdAt));
    case 'value_asc':
      return arr.sort((a, b) => valueOf(a) - valueOf(b) || ts(b.createdAt) - ts(a.createdAt));
    case 'name_asc':
      return arr.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'vi') || ts(b.createdAt) - ts(a.createdAt));
    case 'name_desc':
      return arr.sort((a, b) => nameOf(b).localeCompare(nameOf(a), 'vi') || ts(b.createdAt) - ts(a.createdAt));
    default:
      return items;
  }
}
