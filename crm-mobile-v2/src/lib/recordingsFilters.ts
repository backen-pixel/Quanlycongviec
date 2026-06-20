import type { RecordingItem } from '../api/recordings';

export type RecordingLinkFilter = 'all' | 'unlinked' | 'linked';
export type RecordingSearchField = 'all' | 'title' | 'phone' | 'owner' | 'customer';

export type RecordingFilters = {
  link: RecordingLinkFilter;
  searchField: RecordingSearchField;
};

export const DEFAULT_RECORDING_FILTERS: RecordingFilters = {
  link: 'all',
  searchField: 'all',
};

export function recordingSearchPlaceholder(field: RecordingSearchField): string {
  switch (field) {
    case 'title':
      return 'Tìm tên file ghi âm…';
    case 'phone':
      return 'Tìm số điện thoại…';
    case 'owner':
      return 'Tìm người ghi…';
    case 'customer':
      return 'Tìm tên khách hàng…';
    default:
      return 'Tìm ghi âm, SĐT, KH, ghi chú…';
  }
}

export function countRecordingFilters(filters: RecordingFilters, search: string): number {
  let n = 0;
  if (filters.link !== 'all') n += 1;
  if (filters.searchField !== 'all' && search.trim()) n += 1;
  return n;
}

export function linkFilterLabel(link: RecordingLinkFilter): string {
  if (link === 'linked') return 'Đã gắn CRM';
  if (link === 'unlinked') return 'Chưa gắn CRM';
  return 'Mọi trạng thái';
}

function haystack(rec: RecordingItem, field: RecordingSearchField): string {
  switch (field) {
    case 'title':
      return rec.title || '';
    case 'phone':
      return rec.phone !== '—' ? rec.phone : '';
    case 'owner':
      return rec.ownerName || '';
    case 'customer':
      return rec.customerName || rec.leadCode || rec.leadTitle || '';
    default:
      return [
        rec.title,
        rec.phone !== '—' ? rec.phone : '',
        rec.ownerName,
        rec.customerName,
        rec.leadCode,
        rec.leadTitle,
        rec.notes,
        rec.device,
      ]
        .filter(Boolean)
        .join(' ');
  }
}

export function filterRecordingItems(
  list: RecordingItem[],
  filters: RecordingFilters,
  search: string,
): RecordingItem[] {
  let rows = list;
  if (filters.link === 'linked') rows = rows.filter((r) => r.linked);
  else if (filters.link === 'unlinked') rows = rows.filter((r) => !r.linked);

  const q = search.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((r) => haystack(r, filters.searchField).toLowerCase().includes(q));
}

export function recordingFilterCounts(list: RecordingItem[]) {
  return {
    all: list.length,
    unlinked: list.filter((r) => !r.linked).length,
    linked: list.filter((r) => r.linked).length,
  };
}
