/** Tiện ích dashboard Tổng hợp nhiệm vụ — kanban theo module, deadline, lọc. */

export const LS_WORK_TASKS_FILTERS = 'work_tasks_dashboard_filters_v1';
export const LS_WORK_TASKS_FILTER_PANEL_POS = 'work_tasks_filter_panel_pos_v1';

export function readStoredWorkTasksFilterPanelPos() {
  try {
    const raw = localStorage.getItem(LS_WORK_TASKS_FILTER_PANEL_POS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function storeWorkTasksFilterPanelPos(pos) {
  try {
    if (pos) localStorage.setItem(LS_WORK_TASKS_FILTER_PANEL_POS, JSON.stringify(pos));
    else localStorage.removeItem(LS_WORK_TASKS_FILTER_PANEL_POS);
  } catch {
    /* ignore */
  }
}

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

/** Cột Kanban theo trạng thái — kéo thả đổi trạng thái nhiệm vụ. */
export const STATUS_KANBAN_COLUMNS = [
  { key: 'pending', label: 'Chờ', dot: 'bg-slate-400', border: 'border-slate-200', bg: 'bg-slate-50/80' },
  { key: 'in_progress', label: 'Đang làm', dot: 'bg-blue-500', border: 'border-blue-200', bg: 'bg-blue-50/80' },
  { key: 'done', label: 'Hoàn thành', dot: 'bg-emerald-500', border: 'border-emerald-200', bg: 'bg-emerald-50/80' },
  { key: 'cancelled', label: 'Hủy', dot: 'bg-red-400', border: 'border-red-200', bg: 'bg-red-50/80' },
];

export function isCrmLikeUnifiedTask(task) {
  return task?.source === 'crm_task' || task?.source === 'crm_assignment';
}

/** Chuẩn hóa status về 4 cột Kanban. */
export function normalizeKanbanStatus(status) {
  const st = String(status || 'pending').toLowerCase();
  if (st === 'cancelled') return 'cancelled';
  if (st === 'done' || st === 'completed') return 'done';
  if (st === 'in_progress' || st === 'review' || st === 'blocked') return 'in_progress';
  return 'pending';
}

/** Map cột Kanban → status API theo nguồn nhiệm vụ. */
export function resolveStatusForApi(task, kanbanKey) {
  const key = String(kanbanKey || 'pending');
  if (key === 'cancelled') return 'cancelled';
  if (key === 'in_progress') return 'in_progress';
  if (key === 'pending') return 'pending';
  if (key === 'done') return isCrmLikeUnifiedTask(task) ? 'completed' : 'done';
  return 'pending';
}

export function groupTasksByKanbanStatus(tasks, { openOnly = true } = {}) {
  const map = Object.fromEntries(STATUS_KANBAN_COLUMNS.map((c) => [c.key, []]));
  for (const t of tasks || []) {
    if (openOnly && isTaskDone(t.status)) continue;
    const col = normalizeKanbanStatus(t.status);
    if (map[col]) map[col].push(t);
    else map.pending.push(t);
  }
  return map;
}

/** Nhóm nhiệm vụ trong cột theo deal / dự án. */
export function groupTasksByDeal(tasks) {
  const map = new Map();
  for (const t of tasks || []) {
    const key = t.lead_id
      ? `lead:${t.lead_id}`
      : (t.project_id ? `proj:${t.project_id}` : '__other__');
    if (!map.has(key)) {
      map.set(key, {
        key,
        leadId: t.lead_id || null,
        projectCode: t.project_code || '',
        label: t.lead_title || (t.project_code ? `DA ${t.project_code}` : '') || t.project_name || 'Khác / không gắn deal',
        tasks: [],
      });
    }
    map.get(key).tasks.push(t);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === '__other__') return 1;
    if (b.key === '__other__') return -1;
    return String(a.label).localeCompare(String(b.label), 'vi');
  });
}

export function visibleKanbanStatusColumns(openOnly) {
  if (!openOnly) return STATUS_KANBAN_COLUMNS;
  return STATUS_KANBAN_COLUMNS.filter((c) => c.key === 'pending' || c.key === 'in_progress');
}
