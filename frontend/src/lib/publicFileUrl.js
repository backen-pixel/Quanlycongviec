/**
 * Chuẩn hoá URL file tĩnh (/uploads/...) khi frontend và API khác origin
 * hoặc khi VITE_API_URL trỏ thẳng tới backend.
 * Hỗ trợ data:/blob: (fallback upload) — không strip.
 */
export function publicFileUrl(pathOrUrl) {
  if (pathOrUrl == null || pathOrUrl === '') return '';
  const s = String(pathOrUrl).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:/i.test(s) || /^blob:/i.test(s)) return s;
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (base && s.startsWith('/')) return `${base}${s}`;
  if (base && !s.startsWith('//')) {
    const path = s.startsWith('/') ? s : `/${s.replace(/^\//, '')}`;
    return `${base}${path}`;
  }
  if (s.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${s}`;
  }
  return s;
}

/**
 * Chrome thường chặn tab mới (about:blank#blocked) với href data:/blob: + target=_blank.
 * Với URL thường vẫn mở tab mới.
 */
export function getFileOpenAnchorProps(pathOrUrl, opts = {}) {
  const href = publicFileUrl(pathOrUrl);
  if (!href) return null;
  const fileName = opts.fileName;
  const lower = href.trim().toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:')) {
    return {
      href,
      target: '_self',
      rel: 'noopener noreferrer',
      ...(fileName ? { download: fileName } : {}),
    };
  }
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
  };
}
