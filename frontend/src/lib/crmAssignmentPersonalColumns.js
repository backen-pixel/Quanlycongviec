/** Cột cá nhân cho Planner / Deadline — lưu local theo user (không dùng chung Kanban). */

function colsKey(userId, view) {
  return `crm_assign_personal_cols_${userId}_${view}`;
}

function mapKey(userId, view) {
  return `crm_assign_personal_task_map_${userId}_${view}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export function loadPersonalColumns(userId, view) {
  if (!userId || !view) return [];
  const arr = readJson(colsKey(userId, view), []);
  return Array.isArray(arr) ? arr : [];
}

export function savePersonalColumns(userId, view, columns) {
  if (!userId || !view) return;
  writeJson(colsKey(userId, view), columns);
}

export function loadPersonalTaskMap(userId, view) {
  if (!userId || !view) return {};
  const obj = readJson(mapKey(userId, view), {});
  return obj && typeof obj === 'object' ? obj : {};
}

export function savePersonalTaskMap(userId, view, map) {
  if (!userId || !view) return;
  writeJson(mapKey(userId, view), map);
}

export function setTaskPersonalColumn(userId, view, taskId, columnId) {
  const map = loadPersonalTaskMap(userId, view);
  const id = String(taskId);
  if (!columnId) delete map[id];
  else map[id] = String(columnId);
  savePersonalTaskMap(userId, view, map);
  return map;
}

export function newPersonalColumnId() {
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
