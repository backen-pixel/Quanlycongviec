/** Tiện ích dashboard Tổng hợp nhiệm vụ — kanban theo module, deadline, lọc. */

export const LS_WORK_TASKS_FILTERS = 'work_tasks_dashboard_filters_v1';
export const LS_WORK_TASKS_FILTER_PANEL_POS = 'work_tasks_filter_panel_pos_v1';
export const LS_WORK_TASKS_KANBAN_COLUMNS = 'work_tasks_kanban_columns_v1';
export const LS_WORK_TASKS_KANBAN_PINS = 'work_tasks_kanban_column_pins_v1';

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

/** `for_module` cho GET /companies — theo chip module trên /work/unified. */
export function resolveCompaniesForModuleFilter(filterModuleKey) {
  if (!filterModuleKey) return 'crm';
  return MODULE_ACCESS_MAP[filterModuleKey] ?? 'crm';
}

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

/** Công ty mặc định bộ lọc — ưu tiên đã lưu nếu còn trong danh sách, không thì công ty đầu. */
export function resolveDefaultWorkTasksFilterCompany(companies, preferredId) {
  const list = Array.isArray(companies) ? companies : [];
  if (!list.length) return '';
  const pref = preferredId != null ? String(preferredId).trim() : '';
  if (pref && list.some((c) => String(c.id) === pref)) return pref;
  return String(list[0].id);
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

/** Cột Kanban mặc định — tự khởi tạo đủ trạng thái khi mở trang. */
export const DEFAULT_STATUS_KANBAN_COLUMNS = [
  { key: 'pending', label: 'Chờ', statusKey: 'pending', colorId: 'slate', isSystem: true },
  { key: 'in_progress', label: 'Đang làm', statusKey: 'in_progress', colorId: 'blue', isSystem: true },
  { key: 'review', label: 'Chờ kiểm tra', statusKey: 'review', colorId: 'violet', isSystem: true },
  { key: 'blocked', label: 'Bị chặn', statusKey: 'blocked', colorId: 'amber', isSystem: true },
  { key: 'done', label: 'Hoàn thành', statusKey: 'done', colorId: 'emerald', isSystem: true },
  { key: 'cancelled', label: 'Hủy', statusKey: 'cancelled', colorId: 'red', isSystem: true },
];

const KANBAN_STATUS_ORDER = ['pending', 'in_progress', 'review', 'blocked', 'done', 'cancelled'];

export const KANBAN_STATUS_KEY_OPTIONS = [
  { value: 'pending', label: 'Chờ (pending)' },
  { value: 'in_progress', label: 'Đang làm (in_progress)' },
  { value: 'review', label: 'Chờ kiểm tra (review)' },
  { value: 'blocked', label: 'Bị chặn (blocked)' },
  { value: 'done', label: 'Hoàn thành (done/completed)' },
  { value: 'cancelled', label: 'Hủy (cancelled)' },
];

export const KANBAN_COLUMN_COLOR_PRESETS = [
  { id: 'slate', label: 'Xám', dot: 'bg-slate-400', border: 'border-slate-200', bg: 'bg-slate-50/80' },
  { id: 'blue', label: 'Xanh dương', dot: 'bg-blue-500', border: 'border-blue-200', bg: 'bg-blue-50/80' },
  { id: 'violet', label: 'Tím', dot: 'bg-violet-500', border: 'border-violet-200', bg: 'bg-violet-50/80' },
  { id: 'amber', label: 'Vàng', dot: 'bg-amber-500', border: 'border-amber-200', bg: 'bg-amber-50/80' },
  { id: 'emerald', label: 'Xanh lá', dot: 'bg-emerald-500', border: 'border-emerald-200', bg: 'bg-emerald-50/80' },
  { id: 'red', label: 'Đỏ', dot: 'bg-red-400', border: 'border-red-200', bg: 'bg-red-50/80' },
  { id: 'orange', label: 'Cam', dot: 'bg-orange-500', border: 'border-orange-200', bg: 'bg-orange-50/80' },
  { id: 'cyan', label: 'Lam', dot: 'bg-cyan-500', border: 'border-cyan-200', bg: 'bg-cyan-50/80' },
];

export function readStoredKanbanColumns() {
  try {
    const raw = localStorage.getItem(LS_WORK_TASKS_KANBAN_COLUMNS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeKanbanColumns(columns) {
  try {
    localStorage.setItem(LS_WORK_TASKS_KANBAN_COLUMNS, JSON.stringify(columns));
  } catch {
    /* ignore */
  }
}

export function mergeKanbanColumnStyles(col) {
  if (!col.colorId && col.dot && col.border && col.bg) return { ...col };
  const preset = KANBAN_COLUMN_COLOR_PRESETS.find((p) => p.id === col.colorId)
    || KANBAN_COLUMN_COLOR_PRESETS[0];
  return {
    ...col,
    dot: preset.dot,
    border: preset.border,
    bg: preset.bg,
  };
}

export function serializeKanbanColumns(cols) {
  return (cols || []).map(({ key, label, statusKey, colorId, isSystem }) => ({
    key,
    label,
    statusKey,
    colorId: colorId || null,
    isSystem: !!isSystem,
  }));
}

/** Gộp cột lưu localStorage với cột hệ thống mặc định (tự thêm thiếu). */
export function ensureKanbanColumns(storedCols) {
  const defaults = DEFAULT_STATUS_KANBAN_COLUMNS.map((c) => mergeKanbanColumnStyles({ ...c }));
  let cols = Array.isArray(storedCols) && storedCols.length
    ? storedCols.map((c) => mergeKanbanColumnStyles({
      ...c,
      statusKey: c.statusKey || c.key,
      isSystem: c.isSystem ?? KANBAN_STATUS_ORDER.includes(c.statusKey || c.key),
    }))
    : [...defaults];

  for (const def of defaults) {
    const hasMatch = cols.some((c) => c.statusKey === def.statusKey || c.key === def.key);
    if (!hasMatch) cols.push({ ...def });
  }

  cols.sort((a, b) => {
    const ai = KANBAN_STATUS_ORDER.indexOf(a.statusKey);
    const bi = KANBAN_STATUS_ORDER.indexOf(b.statusKey);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return String(a.label).localeCompare(String(b.label), 'vi');
  });

  return cols;
}

/** Alias cột mặc định đã merge style — tương thích import cũ. */
export const STATUS_KANBAN_COLUMNS = ensureKanbanColumns(null);

const DEADLINE_KANBAN_STYLES = {
  overdue: { dot: 'bg-red-500', border: 'border-red-300', bg: 'bg-red-50/80' },
  today: { dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50/80' },
  thisWeek: { dot: 'bg-blue-500', border: 'border-blue-300', bg: 'bg-blue-50/80' },
  later: { dot: 'bg-slate-400', border: 'border-gray-200', bg: 'bg-gray-50/80' },
  noDeadline: { dot: 'bg-slate-300', border: 'border-gray-200', bg: 'bg-gray-50/80' },
};

/** Cột Kanban cho tab Deadline — luôn hiển thị đủ 5 nhóm hạn. */
export function getDeadlineKanbanColumns() {
  return DEADLINE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    statusKey: b.key,
    isSystem: true,
    isDeadlineBucket: true,
    ...(DEADLINE_KANBAN_STYLES[b.key] || DEADLINE_KANBAN_STYLES.later),
  }));
}

export function groupTasksByDeadlineColumns(tasks, columnDefs, { openOnly = true } = {}) {
  const groups = groupTasksByDeadline(tasks, { openOnly });
  return Object.fromEntries(columnDefs.map((c) => [c.key, groups[c.key] || []]));
}

/** Cột hiển thị trên board — luôn hiện đủ cột (openOnly chỉ lọc task, không ẩn cột). */
export function getEffectiveKanbanColumns(_openOnly = true, sourceCols = null) {
  if (sourceCols?.length) {
    return ensureKanbanColumns(sourceCols);
  }
  const stored = readStoredKanbanColumns();
  return ensureKanbanColumns(stored?.length ? stored : null);
}

export function createCustomKanbanColumn({ label, statusKey, colorId }) {
  const id = `col_${Date.now().toString(36)}`;
  const preset = KANBAN_COLUMN_COLOR_PRESETS.find((p) => p.id === colorId) || KANBAN_COLUMN_COLOR_PRESETS[1];
  return mergeKanbanColumnStyles({
    key: id,
    label: label.trim(),
    statusKey,
    colorId: preset.id,
    isSystem: false,
  });
}

export function resolveTaskColumnKey(task, columnDefs, columnPins = null) {
  let st = String(task?.status || 'pending').toLowerCase();
  if (st === 'completed') st = 'done';

  const exact = columnDefs.find((c) => c.statusKey === st);
  const norm = normalizeKanbanStatus(st);
  const byNorm = columnDefs.find((c) => c.key === norm || c.statusKey === norm);
  const statusColKey = exact?.key || byNorm?.key || norm;

  // Pin chỉ giữ khi vẫn khớp trạng thái thật (tránh lệch cột sau khi đổi status ở deal).
  const pin = columnPins?.[task?.unified_id];
  if (pin && columnDefs.some((c) => c.key === pin)) {
    const pinCol = columnDefs.find((c) => c.key === pin);
    const pinSt = String(pinCol?.statusKey || pin).toLowerCase();
    const pinNorm = normalizeKanbanStatus(pinSt === 'completed' ? 'done' : pinSt);
    if (pinSt === st || pinNorm === norm) return pin;
  }

  return statusColKey;
}

export function readKanbanColumnPins() {
  try {
    const raw = localStorage.getItem(LS_WORK_TASKS_KANBAN_PINS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function storeKanbanColumnPins(pins) {
  try {
    if (!pins || !Object.keys(pins).length) {
      localStorage.removeItem(LS_WORK_TASKS_KANBAN_PINS);
    } else {
      localStorage.setItem(LS_WORK_TASKS_KANBAN_PINS, JSON.stringify(pins));
    }
  } catch {
    /* ignore */
  }
}

export function setKanbanColumnPin(pins, unifiedId, columnKey) {
  const next = { ...pins, [String(unifiedId)]: columnKey };
  storeKanbanColumnPins(next);
  return next;
}

/** Xóa pin cũ khi status thật đã đổi (vd. từ tab chi tiết deal). */
export function pruneKanbanColumnPins(pins, tasks, columnDefs) {
  if (!pins || !Object.keys(pins).length) return pins || {};
  const next = { ...pins };
  let changed = false;
  for (const t of tasks || []) {
    const uid = String(t.unified_id);
    if (!next[uid]) continue;
    const expected = resolveTaskColumnKey(t, columnDefs, {});
    if (next[uid] !== expected) {
      delete next[uid];
      changed = true;
    }
  }
  if (changed) storeKanbanColumnPins(next);
  return changed ? next : pins;
}

export function groupTasksByKanbanColumns(tasks, columnDefs, { openOnly = true, columnPins = null } = {}) {
  return groupTasksByKanbanColumnsWithDeals(tasks, columnDefs, { openOnly, columnPins });
}

export function getDealKeyForTask(task) {
  if (task?.lead_id) return `lead:${task.lead_id}`;
  if (task?.project_id) return `proj:${task.project_id}`;
  return null;
}

export function getTasksForDealKey(dealKey, tasks) {
  if (!dealKey) return [];
  if (dealKey.startsWith('lead:')) {
    const lid = dealKey.slice(5);
    return (tasks || []).filter((t) => String(t.lead_id) === String(lid));
  }
  if (dealKey.startsWith('proj:')) {
    const pid = dealKey.slice(5);
    return (tasks || []).filter((t) => String(t.project_id) === String(pid));
  }
  return [];
}

export function dealSortableId(dealKey) {
  return `deal:${dealKey}`;
}

export function isDealSortableId(id) {
  return String(id || '').startsWith('deal:');
}

export function resolveDealColumnKey(dealTasks, columnDefs, pins = null) {
  const openTasks = (dealTasks || []).filter((t) => !isTaskDone(t.status));
  const refs = openTasks.length ? openTasks : (dealTasks || []);
  if (!refs.length) return columnDefs[0]?.key;
  if (openTasks.length === 0) {
    const doneCol = columnDefs.find((c) => c.statusKey === 'done');
    if (doneCol) return doneCol.key;
  }
  const keys = refs.map((t) => resolveTaskColumnKey(t, columnDefs, pins));
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  let best = keys[0];
  let bestN = 0;
  for (const [k, n] of counts) {
    const def = columnDefs.find((c) => c.key === k);
    const isTerminal = def && (def.statusKey === 'done' || def.statusKey === 'cancelled');
    if (isTerminal && openTasks.length) continue;
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best || keys[0];
}

/**
 * Kanban cột — mỗi nhiệm vụ vào đúng cột theo status.
 * Deal vẫn gom UI trong từng cột (groupTasksByDeal), không gom cả deal xuyên cột.
 */
export function groupTasksByKanbanColumnsWithDeals(tasks, columnDefs, { openOnly = true, columnPins = null } = {}) {
  const pins = columnPins || {};
  const map = Object.fromEntries(columnDefs.map((c) => [c.key, []]));
  const fallback = columnDefs.find((c) => c.statusKey === 'pending')?.key || columnDefs[0]?.key;

  for (const t of tasks || []) {
    if (openOnly && isTaskDone(t.status)) {
      // Vẫn hiện nhiệm vụ đã xong ở cột Hoàn thành / Hủy để đồng bộ trạng thái ↔ cột.
      const doneKey = resolveTaskColumnKey(t, columnDefs, pins);
      const doneDef = columnDefs.find((c) => c.key === doneKey);
      if (doneDef && (doneDef.statusKey === 'done' || doneDef.statusKey === 'cancelled')) {
        if (map[doneKey]) map[doneKey].push(t);
        continue;
      }
      continue;
    }

    const colKey = resolveTaskColumnKey(t, columnDefs, pins);
    if (map[colKey]) map[colKey].push(t);
    else if (fallback && map[fallback]) map[fallback].push(t);
  }

  return map;
}

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
export function resolveStatusForApi(task, columnOrStatusKey) {
  const key = typeof columnOrStatusKey === 'object'
    ? columnOrStatusKey.statusKey
    : String(columnOrStatusKey || 'pending');
  const source = task?.source;

  if (source === 'crm_task' || source === 'crm_assignment') {
    if (key === 'done') return 'completed';
    if (key === 'review' || key === 'blocked') return 'in_progress';
    if (key === 'cancelled') return 'cancelled';
    if (key === 'in_progress' || key === 'pending') return key;
    if (key === 'completed') return 'completed';
    return 'pending';
  }

  // tasks (SX / cá nhân / dự án)
  if (key === 'completed') return 'done';
  if (key === 'cancelled') return 'cancelled';
  if (key === 'in_progress') return 'in_progress';
  if (key === 'pending') return 'pending';
  if (key === 'review' || key === 'blocked') return key;
  if (key === 'done') return 'done';
  return key;
}

export function resolveColumnStatusKey(columnDefs, columnKey) {
  const col = columnDefs.find((c) => c.key === columnKey);
  return col?.statusKey || columnKey;
}

export function groupTasksByKanbanStatus(tasks, { openOnly = true, columnDefs } = {}) {
  const defs = columnDefs || getEffectiveKanbanColumns(openOnly);
  return groupTasksByKanbanColumns(tasks, defs, { openOnly });
}

export function visibleKanbanStatusColumns(openOnly) {
  return getEffectiveKanbanColumns(openOnly);
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
