/** localStorage keys cho bộ lọc phạm vi dùng chung (theo prefix module). */

export function scopeStorageKey(prefix, field) {
  return `${String(prefix || 'scope').trim()}_filter_${field}`;
}

export function readScopeField(prefix, field) {
  try {
    const s = localStorage.getItem(scopeStorageKey(prefix, field));
    return s && String(s).trim() ? String(s).trim() : '';
  } catch {
    return '';
  }
}

export function writeScopeField(prefix, field, value) {
  try {
    const key = scopeStorageKey(prefix, field);
    if (value != null && String(value).trim()) {
      localStorage.setItem(key, String(value).trim());
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
