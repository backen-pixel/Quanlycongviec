import { BUILTIN_UPDATES } from '../content/builtinUpdates';

const LS_BUILTIN_READ = 'release_notes_read_builtin_ids';
const LS_LOGIN_POPUP_OFF = 'release_notes_login_popup_off';

function readBuiltinReadSet() {
  try {
    const raw = localStorage.getItem(LS_BUILTIN_READ);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeBuiltinReadSet(set) {
  try {
    localStorage.setItem(LS_BUILTIN_READ, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

/** Lấy company_id từ user object / chuỗi / localStorage.user. */
export function resolveBuiltinAudienceCompanyId(userOrCompanyId) {
  if (userOrCompanyId !== undefined && userOrCompanyId !== null && userOrCompanyId !== '') {
    if (typeof userOrCompanyId === 'object') {
      return String(userOrCompanyId.company_id || '');
    }
    return String(userOrCompanyId);
  }
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return String(u?.company_id || '');
  } catch {
    return '';
  }
}

/** Bản có companyIds chỉ hiện khi user thuộc đúng công ty; không scope = hiện mọi người. */
export function isBuiltinVisibleToCompany(item, companyId) {
  const scope = item?.companyIds || item?.company_ids;
  if (!Array.isArray(scope) || scope.length === 0) return true;
  const cid = String(companyId || '');
  if (!cid) return false;
  return scope.map(String).includes(cid);
}

export function getVisibleBuiltinUpdates(userOrCompanyId) {
  const companyId = resolveBuiltinAudienceCompanyId(userOrCompanyId);
  return BUILTIN_UPDATES.filter((item) => isBuiltinVisibleToCompany(item, companyId));
}

export function isBuiltinUpdateRead(id) {
  return readBuiltinReadSet().has(String(id));
}

export function markBuiltinUpdateRead(id) {
  if (!id) return;
  const set = readBuiltinReadSet();
  set.add(String(id));
  writeBuiltinReadSet(set);
}

export function markAllBuiltinUpdatesRead(userOrCompanyId) {
  const set = readBuiltinReadSet();
  for (const item of getVisibleBuiltinUpdates(userOrCompanyId)) set.add(String(item.id));
  writeBuiltinReadSet(set);
}

export function getUnreadBuiltinUpdates(userOrCompanyId) {
  const read = readBuiltinReadSet();
  return getVisibleBuiltinUpdates(userOrCompanyId).filter((item) => !read.has(String(item.id)));
}

/** Bản builtin chưa đọc mới nhất (theo publishedAt). */
export function getLatestUnreadBuiltinUpdate(userOrCompanyId) {
  const sorted = getSortedUnreadBuiltinUpdates(userOrCompanyId);
  return sorted[0] || null;
}

/** Tất cả builtin chưa đọc, mới → cũ. */
export function getSortedUnreadBuiltinUpdates(userOrCompanyId) {
  return [...getUnreadBuiltinUpdates(userOrCompanyId)].sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
  );
}

export function builtinUpdateUnreadCount(userOrCompanyId) {
  return getUnreadBuiltinUpdates(userOrCompanyId).length;
}

/** Chuẩn hóa để dùng chung với popup release note từ DB. */
export function builtinToNoteShape(item) {
  if (!item) return null;
  return {
    id: `builtin:${item.id}`,
    builtinId: item.id,
    is_builtin: true,
    title: item.title,
    content: item.content,
    category: item.category || 'feature',
    version: item.version || null,
    published_at: item.publishedAt || null,
    created_at: item.publishedAt || null,
    companyIds: item.companyIds || item.company_ids || null,
  };
}

export function markNoteRead(note) {
  if (!note) return;
  if (note.is_builtin || String(note.id || '').startsWith('builtin:')) {
    markBuiltinUpdateRead(note.builtinId || String(note.id).replace(/^builtin:/, ''));
  }
}

/** Đánh dấu đã đọc nhiều bản (builtin + DB id thuần). */
export function markNotesReadLocally(notes) {
  for (const note of notes || []) {
    markNoteRead(note);
  }
}

/** User tắt popup «Có gì mới» khi đăng nhập (chỉ sau khi đã cuộn đọc hết). */
export function isLoginPopupDisabled() {
  try {
    return localStorage.getItem(LS_LOGIN_POPUP_OFF) === '1';
  } catch {
    return false;
  }
}

export function setLoginPopupDisabled(disabled) {
  try {
    if (disabled) localStorage.setItem(LS_LOGIN_POPUP_OFF, '1');
    else localStorage.removeItem(LS_LOGIN_POPUP_OFF);
  } catch { /* ignore */ }
}
