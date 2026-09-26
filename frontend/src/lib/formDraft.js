import { useEffect, useMemo } from 'react';

export function readFormDraft(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

/** Ghi snapshot mỗi lần đổi. Bản đọc lúc mở modal dùng cho useState khởi tạo. */
export function useFormDraft(key, snapshot) {
  const saved = useMemo(() => readFormDraft(key), [key]);
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* private mode */ }
  }, [key, snapshot]);
  return saved;
}
