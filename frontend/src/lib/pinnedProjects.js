export const PINNED_PROJECTS_KEY = 'tubep_pinned_projects';
export const PINNED_PROJECTS_HIDDEN_KEY = 'tubep_pinned_projects_hidden';
export const PINNED_CHANGED_EVENT = 'pinned-changed';
export const MAX_PINNED_PROJECTS = 5;

function emitChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PINNED_CHANGED_EVENT));
}

function normalizeId(id) {
  return id == null ? '' : String(id);
}

function normalizeItem(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const id = normalizeId(raw);
    if (!id) return null;
    return {
      id,
      code: '',
      name: '',
      href: `/management/work-unified/${id}`,
      module: 'project',
    };
  }
  const id = normalizeId(raw.id || raw.project_id);
  if (!id) return null;
  return {
    id,
    code: String(raw.code || '').trim(),
    name: String(raw.name || raw.title || '').trim(),
    href: String(raw.href || `/management/work-unified/${id}`),
    module: String(raw.module || 'project'),
  };
}

export function getPinnedProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_PROJECTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const items = [];
    for (const raw of parsed) {
      const item = normalizeItem(raw);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= MAX_PINNED_PROJECTS) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function setPinnedProjects(items) {
  const next = [];
  const seen = new Set();
  for (const raw of items || []) {
    const item = normalizeItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
    if (next.length >= MAX_PINNED_PROJECTS) break;
  }
  localStorage.setItem(PINNED_PROJECTS_KEY, JSON.stringify(next));
  emitChanged();
  return next;
}

export function isProjectPinned(projectId) {
  const id = normalizeId(projectId);
  return !!id && getPinnedProjects().some((p) => p.id === id);
}

export function unpinProject(projectId) {
  const id = normalizeId(projectId);
  return setPinnedProjects(getPinnedProjects().filter((p) => p.id !== id));
}

/** @returns {{ ok: boolean, pinned: boolean, reason?: string, items: object[] }} */
export function pinProject(meta) {
  const item = normalizeItem(meta);
  if (!item) return { ok: false, pinned: false, reason: 'missing', items: getPinnedProjects() };
  const current = getPinnedProjects();
  if (current.some((p) => p.id === item.id)) {
    const items = current.map((p) => (p.id === item.id ? { ...p, ...item } : p));
    return { ok: true, pinned: true, items: setPinnedProjects(items) };
  }
  if (current.length >= MAX_PINNED_PROJECTS) {
    return { ok: false, pinned: false, reason: 'limit', items: current };
  }
  return { ok: true, pinned: true, items: setPinnedProjects([...current, item]) };
}

/** @returns {{ ok: boolean, pinned: boolean, reason?: string, items: object[] }} */
export function togglePinnedProject(meta) {
  const item = normalizeItem(meta);
  if (!item) return { ok: false, pinned: false, reason: 'missing', items: getPinnedProjects() };
  if (isProjectPinned(item.id)) {
    return { ok: true, pinned: false, items: unpinProject(item.id) };
  }
  return pinProject(item);
}

export function getPinnedListHidden() {
  try {
    return localStorage.getItem(PINNED_PROJECTS_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPinnedListHidden(hidden) {
  try {
    localStorage.setItem(PINNED_PROJECTS_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    /* ignore */
  }
  emitChanged();
}

export const PIN_MODULE_LABEL = {
  crm: 'CRM',
  sx: 'SX',
  vc: 'VC',
  project: 'DA',
};
