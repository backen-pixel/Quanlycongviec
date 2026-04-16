/** Ảnh thay thế khi URL gốc lỗi / 404 (tránh icon vỡ trên UI). */
export const BROKEN_MEDIA_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><rect fill="#e2e8f0" width="160" height="100" rx="8"/><text x="80" y="52" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="11">Không tải được</text></svg>',
  );

/** Chuẩn hóa URL file/ảnh từ API (đường dẫn tương đối → gốc backend). */
export function resolveMediaUrl(url) {
  if (url == null || typeof url !== 'string') return '';
  const t = url.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t) || t.startsWith('blob:') || t.startsWith('data:')) return t;
  if (t.startsWith('//')) {
    if (typeof window === 'undefined') return `https:${t}`;
    return `${window.location.protocol}${t}`;
  }
  let base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (!base && typeof window !== 'undefined') base = window.location.origin;
  if (t.startsWith('/')) return base ? `${base}${t}` : t;
  return base ? `${base}/${t}` : t;
}
