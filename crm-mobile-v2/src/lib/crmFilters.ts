import type { CrmStageFetchOpts } from '../api/crm';
import type { CrmKanbanItem } from '../types';

export type PhoneFilter = '' | 'has_phone' | 'no_phone';
export type AssigneeFilter = 'all' | 'mine' | 'user';
export type DueFilter = 'all' | 'overdue' | 'today';
export type TimePreset = '' | 'this_week' | 'this_month';
export type SearchField = 'all' | 'title' | 'phone' | 'code' | 'assignee';

/** Cột ảo: lead/deal chưa có giai đoạn hợp lệ. */
export const ORPHAN_STAGE_ID = '__orphan_no_stage__';
export const REGION_NONE = '__none__';

export type CrmHubFilters = {
  phone: PhoneFilter;
  assignee: AssigneeFilter;
  assigneeUserId: string;
  departmentId: string;
  due: DueFilter;
  timePreset: TimePreset;
  companyId: string;
  regionId: string;
  showOrphan: boolean;
  searchField: SearchField;
};

/** Mặc định giống web CRM: ưu tiên bản ghi có SĐT. */
export const DEFAULT_CRM_FILTERS: CrmHubFilters = {
  phone: 'has_phone',
  assignee: 'all',
  assigneeUserId: '',
  departmentId: '',
  due: 'all',
  timePreset: '',
  companyId: '',
  regionId: '',
  showOrphan: false,
  searchField: 'all',
};

export function looksLikePhoneSearch(q: string): boolean {
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3;
}

export function getDateRange(preset: TimePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        from: monday.toISOString().split('T')[0],
        to: sunday.toISOString().split('T')[0],
      };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        from: firstDay.toISOString().split('T')[0],
        to: lastDay.toISOString().split('T')[0],
      };
    }
    default:
      return { from: '', to: '' };
  }
}

export function buildSearchForApi(search: string, field: SearchField): string | undefined {
  const q = search.trim();
  if (!q) return undefined;
  if (field === 'assignee') return undefined;
  return q;
}

export function serverFilterKey(f: CrmHubFilters, q: string): string {
  return [
    q,
    f.phone,
    f.assignee,
    f.assigneeUserId,
    f.timePreset,
    f.companyId,
    f.regionId,
    f.showOrphan ? '1' : '0',
    f.searchField,
  ].join('|');
}

/** Gắn company_id từ user khi state filter chưa kịp cập nhật (tránh load rỗng lần đầu). */
export function withEffectiveCompanyId(
  filters: CrmHubFilters,
  fallbackCompanyId?: string | null,
): CrmHubFilters {
  const cid = filters.companyId || fallbackCompanyId || '';
  if (cid === filters.companyId) return filters;
  return { ...filters, companyId: cid };
}

export function buildStageFetchOpts(
  filters: CrmHubFilters,
  search: string,
  myId: string,
  fallbackCompanyId?: string | null,
): CrmStageFetchOpts {
  const f = withEffectiveCompanyId(filters, fallbackCompanyId);
  const range = f.timePreset ? getDateRange(f.timePreset) : { from: '', to: '' };
  let assignedTo: string | undefined;
  if (f.assignee === 'mine' && myId) assignedTo = myId;
  else if (f.assignee === 'user' && f.assigneeUserId) assignedTo = f.assigneeUserId;

  return {
    search: buildSearchForApi(search, f.searchField),
    assignedTo,
    phoneFilter: f.phone || undefined,
    dateFrom: range.from || undefined,
    dateTo: range.to || undefined,
    companyId: f.companyId || undefined,
    regionId: f.regionId || undefined,
  };
}

export function countActiveFilters(filters: CrmHubFilters, search: string): number {
  let n = 0;
  if (search.trim()) n += 1;
  if (filters.phone !== DEFAULT_CRM_FILTERS.phone) n += 1;
  if (filters.assignee !== 'all') n += 1;
  if (filters.due !== 'all') n += 1;
  if (filters.timePreset) n += 1;
  if (filters.companyId) n += 1;
  if (filters.regionId) n += 1;
  if (filters.showOrphan) n += 1;
  if (filters.searchField !== 'all') n += 1;
  if (filters.departmentId) n += 1;
  return n;
}

export type ActiveFilterChip = { key: string; label: string; onClear: () => void };

export function activeFilterChips(
  filters: CrmHubFilters,
  search: string,
  labels: {
    companyName?: string;
    regionName?: string;
    assigneeName?: string;
  },
  onPatch: (patch: Partial<CrmHubFilters>) => void,
  onClearSearch: () => void,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (search.trim()) {
    const fieldLabel =
      filters.searchField === 'title' ? 'Tên'
      : filters.searchField === 'phone' ? 'SĐT'
      : filters.searchField === 'code' ? 'Mã'
      : filters.searchField === 'assignee' ? 'NV'
      : 'Tìm';
    chips.push({
      key: 'search',
      label: `${fieldLabel}: ${search.trim().length > 12 ? `${search.trim().slice(0, 12)}…` : search.trim()}`,
      onClear: onClearSearch,
    });
  }
  if (filters.phone === 'no_phone') {
    chips.push({ key: 'phone', label: 'Chưa có SĐT', onClear: () => onPatch({ phone: DEFAULT_CRM_FILTERS.phone }) });
  } else if (filters.phone === '') {
    chips.push({ key: 'phone-all', label: 'Mọi SĐT', onClear: () => onPatch({ phone: DEFAULT_CRM_FILTERS.phone }) });
  }
  if (filters.companyId && labels.companyName) {
    chips.push({
      key: 'co',
      label: labels.companyName,
      onClear: () => onPatch({ companyId: '', regionId: '', departmentId: '', assigneeUserId: '', assignee: 'all' }),
    });
  }
  if (filters.regionId) {
    chips.push({
      key: 'reg',
      label: labels.regionName || (filters.regionId === REGION_NONE ? 'Chưa gán KV' : 'Khu vực'),
      onClear: () => onPatch({ regionId: '' }),
    });
  }
  if (filters.assignee === 'mine') {
    chips.push({ key: 'mine', label: 'Của tôi', onClear: () => onPatch({ assignee: 'all', assigneeUserId: '' }) });
  } else if (filters.assignee === 'user' && filters.assigneeUserId) {
    chips.push({
      key: 'user',
      label: labels.assigneeName || 'NV đã chọn',
      onClear: () => onPatch({ assignee: 'all', assigneeUserId: '', departmentId: '' }),
    });
  }
  if (filters.due === 'overdue') {
    chips.push({ key: 'due', label: 'Quá hạn', onClear: () => onPatch({ due: 'all' }) });
  } else if (filters.due === 'today') {
    chips.push({ key: 'due', label: 'Hôm nay', onClear: () => onPatch({ due: 'all' }) });
  }
  if (filters.timePreset === 'this_week') {
    chips.push({ key: 'time', label: 'Tuần này', onClear: () => onPatch({ timePreset: '' }) });
  } else if (filters.timePreset === 'this_month') {
    chips.push({ key: 'time', label: 'Tháng này', onClear: () => onPatch({ timePreset: '' }) });
  }
  if (filters.showOrphan) {
    chips.push({ key: 'orphan', label: 'Chưa có GD', onClear: () => onPatch({ showOrphan: false }) });
  }
  return chips;
}

export function clientFilterKanbanItems(
  items: CrmKanbanItem[],
  filters: CrmHubFilters,
  search: string,
): CrmKanbanItem[] {
  let result = items;
  const q = search.trim().toLowerCase();

  if (filters.due === 'overdue') result = result.filter((i) => i.overdue);
  else if (filters.due === 'today') {
    result = result.filter((i) => {
      if (!i.dueIso) return false;
      try {
        const d = new Date(i.dueIso);
        const now = new Date();
        return d.getFullYear() === now.getFullYear()
          && d.getMonth() === now.getMonth()
          && d.getDate() === now.getDate();
      } catch {
        return false;
      }
    });
  }

  if (filters.regionId) {
    if (filters.regionId === REGION_NONE) {
      result = result.filter((i) => !i.regionId);
    } else {
      result = result.filter((i) => i.regionId === filters.regionId);
    }
  }

  if (q && filters.searchField === 'assignee') {
    result = result.filter((i) => (i.ownerName || '').toLowerCase().includes(q));
  } else if (q && filters.searchField === 'title') {
    result = result.filter((i) =>
      (i.title || '').toLowerCase().includes(q)
      || (i.contactName || '').toLowerCase().includes(q),
    );
  } else if (q && filters.searchField === 'code') {
    result = result.filter((i) => (i.code || '').toLowerCase().includes(q));
  } else if (q && filters.searchField === 'phone') {
    result = result.filter((i) => (i.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')));
  }

  return result;
}

export function isOrphanKanbanItem(item: CrmKanbanItem, validStageIds: Set<string>): boolean {
  const sid = item.stageId || '';
  return sid === '' || !validStageIds.has(sid);
}

export function orphanVirtualStage() {
  return {
    id: ORPHAN_STAGE_ID,
    name: 'Chưa có giai đoạn',
    icon: '🗂️',
    color: '#94a3b8',
    orderIndex: 9999,
  };
}

export function searchPlaceholder(field: SearchField, kind: 'lead' | 'deal'): string {
  switch (field) {
    case 'title': return `Tên khách / ${kind}...`;
    case 'phone': return 'Số điện thoại...';
    case 'code': return 'Mã LEAD / DEAL...';
    case 'assignee': return 'Tên người phụ trách...';
    default: return `Tìm mã, tên, SĐT ${kind}...`;
  }
}
