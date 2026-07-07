/** Tiện ích dashboard Tổng hợp nhiệm vụ — kanban theo module, deadline, lọc. */

export const LS_WORK_TASKS_FILTERS = 'work_tasks_dashboard_filters_v1';

export const MODULE_COLUMNS = [
  { key: 'crm', label: 'CRM', emoji: '💼', color: '#10B981', bg: 'bg-emerald-50 border-emerald-200' },
  { key: 'production', label: 'Sản xuất', emoji: '🏭', color: '#F97316', bg: 'bg-orange-50 border-orange-200' },
  { key: 'logistics', label: 'Vận chuyển', emoji: '🚚', color: '#8B5CF6', bg: 'bg-violet-50 border-violet-200' },
  { key: 'assignment', label: 'Giao việc', emoji: '📋', color: '#3B82F6', bg: 'bg-blue-50 border-blue-200' },
  { key: 'personal', label: 'Cá nhân', emoji: '👤', color: '#64748B', bg: 'bg-slate-50 border-slate-200' },
  { key: 'other', label: 'Khác', emoji: '📦', color: '#94A3B8', bg: 'bg-gray-50 border-gray-200' },
];

export const MODULE_ACCESS_MAP = {
  crm: 'crm',
  production: 'production',
  logistics: 'logistics',
  assignment: 'crm',
  personal: 'tasks',
  other: null,
};

export const TASK_KIND_OPTIONS = [
  { value: '', label: 'Mọi loại' },
  { value: 'CRM-Deal', label: 'CRM Deal' },
  { value: 'CRM-Lead', label: 'CRM Lead' },
  { value: 'SX', label: 'Sản xuất' },
  { value: 'VC', label: 'Vận chuyển' },
  { value: 'Giao việc', label: 'Giao việc CRM' },
  { value: 'Cá nhân', label: 'Cá nhân' },
  { value: 'Dự án', label: 'Dự án' },
];

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Mọi trạng thái' },
  { value: 'pending', label: 'Chờ' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'done', label: 'Xong (SX)' },
];

export const DONE_STATUSES = new Set(['done', 'completed', 'cancelled']);

export function isTaskDone(status) {
  return DONE_STATUSES.has(String(status || '').toLowerCase());
}

export function resolveModuleKey(task) {
  const kind = String(task?.task_kind || '');
  const source = String(task?.source || '');
  if (kind === 'CRM-Deal' || kind === 'CRM-Lead' || source === 'crm_task') return 'crm';
  if (kind === 'SX' || kind === 'Dự án') return 'production';
  if (kind === 'VC') return 'logistics';
  if (kind === 'Giao việc' || source === 'crm_assignment') return 'assignment';
  if (kind === 'Cá nhân') return 'personal';
  return 'other';
}

export function groupTasksByModule(tasks, { openOnly = true } = {}) {
  const map = Object.fromEntries(MODULE_COLUMNS.map((c) => [c.key, []]));
  for (const t of tasks || []) {
    if (openOnly && isTaskDone(t.status)) continue;
    const key = resolveModuleKey(t);
    if (map[key]) map[key].push(t);
    else map.other.push(t);
  }
  return map;
}

export function groupTasksByDeadline(tasks, { openOnly = true } = {}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };

  for (const t of tasks || []) {
    if (openOnly && isTaskDone(t.status)) continue;
    if (!t.deadline) {
      groups.noDeadline.push(t);
      continue;
    }
    const d = new Date(t.deadline);
    if (d < today) groups.overdue.push(t);
    else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
    else if (d < weekEnd) groups.thisWeek.push(t);
    else groups.later.push(t);
  }
  return groups;
}

export function readStoredWorkTasksFilters() {
  try {
    const raw = localStorage.getItem(LS_WORK_TASKS_FILTERS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function storeWorkTasksFilters(filters) {
  try {
    localStorage.setItem(LS_WORK_TASKS_FILTERS, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function filterVisibleModuleColumns(canAccessModule) {
  return MODULE_COLUMNS.filter((col) => {
    const modKey = MODULE_ACCESS_MAP[col.key];
    if (!modKey) return true;
    return canAccessModule(modKey);
  });
}

export const DEADLINE_BUCKETS = [
  { key: 'overdue', label: '🔴 Quá hạn', color: 'border-red-300 bg-red-50' },
  { key: 'today', label: '🟡 Hôm nay', color: 'border-amber-300 bg-amber-50' },
  { key: 'thisWeek', label: '🔵 Tuần này', color: 'border-blue-300 bg-blue-50' },
  { key: 'later', label: '⚪ Sau đó', color: 'border-gray-200 bg-gray-50' },
  { key: 'noDeadline', label: '⏳ Chưa có hạn', color: 'border-gray-200 bg-gray-50' },
];
