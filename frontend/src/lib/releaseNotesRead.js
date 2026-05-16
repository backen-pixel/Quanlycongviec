import { BUILTIN_UPDATES } from '../content/builtinUpdates';

const LS_BUILTIN_READ = 'release_notes_read_builtin_ids';

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

export function isBuiltinUpdateRead(id) {
  return readBuiltinReadSet().has(String(id));
}

export function markBuiltinUpdateRead(id) {
  if (!id) return;
  const set = readBuiltinReadSet();
  set.add(String(id));
  writeBuiltinReadSet(set);
}

export function markAllBuiltinUpdatesRead() {
  const set = readBuiltinReadSet();
  for (const item of BUILTIN_UPDATES) set.add(String(item.id));
  writeBuiltinReadSet(set);
}

export function getUnreadBuiltinUpdates() {
  const read = readBuiltinReadSet();
  return BUILTIN_UPDATES.filter((item) => !read.has(String(item.id)));
}

/** Bản builtin chưa đọc mới nhất (theo publishedAt). */
export function getLatestUnreadBuiltinUpdate() {
  const unread = getUnreadBuiltinUpdates();
  if (!unread.length) return null;
  return [...unread].sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
  )[0];
}

export function builtinUpdateUnreadCount() {
  return getUnreadBuiltinUpdates().length;
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
  };
}

export function markNoteRead(note) {
  if (!note) return;
  if (note.is_builtin || String(note.id || '').startsWith('builtin:')) {
    markBuiltinUpdateRead(note.builtinId || String(note.id).replace(/^builtin:/, ''));
    return;
  }
}
