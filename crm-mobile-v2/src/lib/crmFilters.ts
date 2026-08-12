import type { CrmStageFetchOpts } from '../api/crm';
import type { CrmKanbanItem, PlannerItem } from '../types';
import {
  lockCrmAssigneeScope,
  lockCrmCompanyScope,
  scopedCompanyId,
} from './crmAssignee';
import { vnTodayYmd, vnDefaultMonthRange, ymdFromLocalDate } from './vnDate';

type FilterUser = {
  role?: string | null;
  company_id?: string | null;
} | null | undefined;

export type PhoneFilter = '' | 'has_phone' | 'no_phone';
export type AssigneeFilter = 'all' | 'mine' | 'user';
export type DueFilter = 'all' | 'overdue' | 'today';
export type TimePreset = '' | 'this_week' | 'this_month' | 'last_week' | 'last_month' | 'custom';
export type SearchField = 'all' | 'title' | 'phone' | 'code' | 'assignee';

/** Cột ảo: lead/deal chưa có giai đoạn hợp lệ. */
export const ORPHAN_STAGE_ID = '__orphan_no_stage__';
export const REGION_NONE = '__none__';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CrmHubFilters = {
  phone: PhoneFilter;
  assignee: AssigneeFilter;
  assigneeUserId: string;
  departmentId: string;
  due: DueFilter;
  timePreset: TimePreset;
  /** Khoảng ngày tạo tùy chọn (ymd) — dùng khi timePreset = 'custom'. */
  dateFrom: string;
  dateTo: string;
  companyId: string;
  regionId: string;
  showOrphan: boolean;
  /** Ẩn cột pipeline có count = 0 (giảm 67–92 cột trên mobile). */
  hideEmptyStages: boolean;
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
  dateFrom: '',
  dateTo: '',
  companyId: '',
  regionId: '',
  showOrphan: false,
  hideEmptyStages: true,
  searchField: 'all',
};

export const TIME_PRESET_VALUES: TimePreset[] = [
  '',
  'this_week',
  'this_month',
  'last_week',
  'last_month',
  'custom',
];

export function sanitizeCrmHubFilters(raw: Partial<CrmHubFilters> | null | undefined): CrmHubFilters {
  const f = { ...DEFAULT_CRM_FILTERS, ...(raw || {}) };
  const phoneOk = f.phone === '' || f.phone === 'has_phone' || f.phone === 'no_phone';
  const assigneeOk = f.assignee === 'all' || f.assignee === 'mine' || f.assignee === 'user';
  const dueOk = f.due === 'all' || f.due === 'overdue' || f.due === 'today';
  const timeOk = TIME_PRESET_VALUES.includes(f.timePreset as TimePreset);
  const searchOk = ['all', 'title', 'phone', 'code', 'assignee'].includes(f.searchField);
  const dateFrom = YMD_RE.test(String(f.dateFrom || '')) ? String(f.dateFrom) : '';
  const dateTo = YMD_RE.test(String(f.dateTo || '')) ? String(f.dateTo) : '';
  let timePreset = timeOk ? (f.timePreset as TimePreset) : DEFAULT_CRM_FILTERS.timePreset;
  if (timePreset === 'custom' && !dateFrom && !dateTo) timePreset = '';
  return {
    phone: phoneOk ? f.phone : DEFAULT_CRM_FILTERS.phone,
    assignee: assigneeOk ? f.assignee : DEFAULT_CRM_FILTERS.assignee,
    assigneeUserId: String(f.assigneeUserId || ''),
    departmentId: String(f.departmentId || ''),
    due: dueOk ? f.due : DEFAULT_CRM_FILTERS.due,
    timePreset,
    dateFrom: timePreset === 'custom' ? dateFrom : '',
    dateTo: timePreset === 'custom' ? dateTo : '',
    companyId: String(f.companyId || ''),
    regionId: String(f.regionId || ''),
    showOrphan: !!f.showOrphan,
    hideEmptyStages: f.hideEmptyStages !== false,
    searchField: searchOk ? f.searchField : DEFAULT_CRM_FILTERS.searchField,
  };
}

/** Khóa công ty / «Của tôi» theo vai trò — mọi màn CRM dùng chung. */
export function applyCrmFilterLocks(user: FilterUser, filters: CrmHubFilters): CrmHubFilters {
  const next = sanitizeCrmHubFilters(filters);
  if (lockCrmAssigneeScope(user)) {
    next.assignee = 'mine';
    next.assigneeUserId = '';
  }
  if (lockCrmCompanyScope(user)) {
    next.companyId = scopedCompanyId(user) || String(user?.company_id || '').trim() || next.companyId;
  }
  return next;
}

/** Xóa lọc → về mặc định web (Có SĐT) + khóa phạm vi user. */
export function resetSharedCrmFilters(user: FilterUser): CrmHubFilters {
  return applyCrmFilterLocks(user, {
    ...DEFAULT_CRM_FILTERS,
    companyId: scopedCompanyId(user) || String(user?.company_id || '').trim(),
    assignee: lockCrmAssigneeScope(user) ? 'mine' : 'all',
    assigneeUserId: '',
  });
}

export function looksLikePhoneSearch(q: string): boolean {
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Tuần trước = Mon–Sun của tuần liền trước (lịch VN, tuần bắt đầu T2). */
export function getLastWeekRange(ref: Date = new Date()): { from: string; to: string } {
  const todayYmd = vnTodayYmd(ref);
  const [y, m, d] = todayYmd.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  const dayOfWeek = today.getDay();
  const mondayThis = new Date(today);
  mondayThis.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayLast = new Date(mondayThis);
  mondayLast.setDate(mondayThis.getDate() - 7);
  const sundayLast = new Date(mondayLast);
  sundayLast.setDate(mondayLast.getDate() + 6);
  return { from: ymdFromLocalDate(mondayLast), to: ymdFromLocalDate(sundayLast) };
}

/** Tháng trước — từ ngày 1 đến hết tháng. */
export function getLastMonthRange(ref: Date = new Date()): { from: string; to: string } {
  const todayYmd = vnTodayYmd(ref);
  const [y, m] = todayYmd.split('-').map(Number);
  let ly = y;
  let lm = m - 1;
  if (lm < 1) {
    ly -= 1;
    lm = 12;
  }
  const from = `${ly}-${pad2(lm)}-01`;
  const last = new Date(Date.UTC(ly, lm, 0));
  const to = `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`;
  return { from, to };
}

export function getDateRange(preset: TimePreset): { from: string; to: string } {
  const todayYmd = vnTodayYmd();
  const [y, m, d] = todayYmd.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  switch (preset) {
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        from: ymdFromLocalDate(monday),
        to: ymdFromLocalDate(sunday),
      };
    }
    case 'this_month':
      return vnDefaultMonthRange();
    case 'last_week':
      return getLastWeekRange();
    case 'last_month':
      return getLastMonthRange();
    default:
      return { from: '', to: '' };
  }
}

export function resolveFilterDateRange(filters: CrmHubFilters): { from: string; to: string } {
  if (filters.timePreset === 'custom') {
    const from = YMD_RE.test(filters.dateFrom) ? filters.dateFrom : '';
    const to = YMD_RE.test(filters.dateTo) ? filters.dateTo : '';
    if (from && to && from > to) return { from: to, to: from };
    return { from, to };
  }
  if (filters.timePreset) return getDateRange(filters.timePreset);
  return { from: '', to: '' };
}

export function timePresetLabel(preset: TimePreset, dateFrom = '', dateTo = ''): string {
  switch (preset) {
    case 'this_week': return 'Tạo tuần này';
    case 'this_month': return 'Tạo tháng này';
    case 'last_week': return 'Tạo tuần trước';
    case 'last_month': return 'Tạo tháng trước';
    case 'custom': {
      if (dateFrom && dateTo && dateFrom === dateTo) {
        if (dateFrom === vnTodayYmd()) return 'Tạo hôm nay';
        const [, m, d] = dateFrom.split('-');
        return `Tạo ${d}/${m}`;
      }
      if (dateFrom && dateTo) return `Tạo ${dateFrom.slice(5)} → ${dateTo.slice(5)}`;
      if (dateFrom) return `Tạo từ ${dateFrom}`;
      if (dateTo) return `Tạo đến ${dateTo}`;
      return 'Ngày tạo';
    }
    default: return '';
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
    f.dateFrom,
    f.dateTo,
    f.companyId,
    f.regionId,
    f.showOrphan ? '1' : '0',
    f.searchField,
  ].join('|');
}

export function buildStageFetchOpts(
  filters: CrmHubFilters,
  search: string,
  myId: string,
): CrmStageFetchOpts {
  const range = resolveFilterDateRange(filters);
  let assignedTo: string | undefined;
  if (filters.assignee === 'mine' && myId) assignedTo = myId;
  else if (filters.assignee === 'user' && filters.assigneeUserId) assignedTo = filters.assigneeUserId;

  return {
    search: buildSearchForApi(search, filters.searchField),
    assignedTo,
    phoneFilter: filters.phone || undefined,
    dateFrom: range.from || undefined,
    dateTo: range.to || undefined,
    companyId: filters.companyId || undefined,
    regionId: filters.regionId || undefined,
    lite: true,
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
  // hideEmptyStages mặc định bật — chỉ đếm khi user tắt (hiện cột trống).
  if (!filters.hideEmptyStages) n += 1;
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
  lockScope = false,
  lockCompany?: boolean,
  lockAssignee?: boolean,
): ActiveFilterChip[] {
  const lockCo = lockCompany ?? lockScope;
  const lockAs = lockAssignee ?? lockScope;
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
  // Khi bị khóa công ty, không hiển thị chip xóa nhanh cho Công ty.
  if (!lockCo && filters.companyId) {
    chips.push({
      key: 'co',
      label: labels.companyName || 'Công ty đã chọn',
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
    // Nhân viên bị khóa "Của tôi" → không cho xóa chip này.
    chips.push({
      key: 'mine',
      label: 'Của tôi',
      onClear: lockAs ? () => {} : () => onPatch({ assignee: 'all', assigneeUserId: '' }),
    });
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
  if (filters.timePreset) {
    chips.push({
      key: 'time',
      label: timePresetLabel(filters.timePreset, filters.dateFrom, filters.dateTo) || 'Ngày tạo',
      onClear: () => onPatch({ timePreset: '', dateFrom: '', dateTo: '' }),
    });
  }
  if (filters.showOrphan) {
    chips.push({ key: 'orphan', label: 'Chưa có GD', onClear: () => onPatch({ showOrphan: false }) });
  }
  if (!filters.hideEmptyStages) {
    chips.push({
      key: 'hideEmpty',
      label: 'Hiện cột trống',
      onClear: () => onPatch({ hideEmptyStages: true }),
    });
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

/** Lọc client cho tab Deadline (PlannerItem) — due + searchField giống Hub. */
export function clientFilterDeadlineItems(
  items: PlannerItem[],
  filters: CrmHubFilters,
  search: string,
): PlannerItem[] {
  let result = items;
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');

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

  if (!q) return result;

  if (filters.searchField === 'assignee') {
    return result.filter((i) => (i.ownerName || '').toLowerCase().includes(q));
  }
  if (filters.searchField === 'title') {
    return result.filter((i) =>
      (i.title || '').toLowerCase().includes(q)
      || (i.contactName || '').toLowerCase().includes(q),
    );
  }
  if (filters.searchField === 'code') {
    return result.filter((i) => (i.code || '').toLowerCase().includes(q));
  }
  if (filters.searchField === 'phone') {
    return result.filter((i) => (i.phone || '').replace(/\D/g, '').includes(qDigits));
  }
  // searchField === 'all'
  return result.filter((i) => {
    if ((i.title || '').toLowerCase().includes(q)) return true;
    if ((i.contactName || '').toLowerCase().includes(q)) return true;
    if ((i.code || '').toLowerCase().includes(q)) return true;
    if ((i.ownerName || '').toLowerCase().includes(q)) return true;
    if ((i.status || '').toLowerCase().includes(q)) return true;
    if (qDigits.length >= 3 && (i.phone || '').replace(/\D/g, '').includes(qDigits)) return true;
    return false;
  });
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
