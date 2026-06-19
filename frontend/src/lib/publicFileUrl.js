/**
 * Chuẩn hoá URL file tĩnh (/uploads/...) khi frontend và API khác origin
 * hoặc khi VITE_API_URL trỏ thẳng tới backend.
 * Hỗ trợ data:/blob: (fallback upload) — không strip.
 *
 * Ảnh minh họa Kiến thức: ưu tiên Supabase Storage (bucket attachments/knowledge/).
 */
const DEFAULT_KNOWLEDGE_STORAGE =
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge';

function knowledgeStorageBase() {
  return (import.meta.env.VITE_KNOWLEDGE_STORAGE_URL || DEFAULT_KNOWLEDGE_STORAGE).replace(/\/$/, '');
}

/** /uploads/knowledge-screenshots/lead-01.png → URL public trên Supabase */
function resolveKnowledgeScreenshotUrl(path) {
  const m = String(path || '').trim().match(
    /^(?:\/uploads\/knowledge-screenshots\/|uploads\/knowledge-screenshots\/)([^/?#]+)$/i,
  );
  if (!m) return null;
  return `${knowledgeStorageBase()}/${m[1]}`;
}

export function publicFileUrl(pathOrUrl) {
  if (pathOrUrl == null || pathOrUrl === '') return '';
  const s = String(pathOrUrl).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:/i.test(s) || /^blob:/i.test(s)) return s;

  const knowledgeUrl = resolveKnowledgeScreenshotUrl(s);
  if (knowledgeUrl) return knowledgeUrl;

  let base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (!base && typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname.includes('tubep-frontend') && hostname.endsWith('.onrender.com')) {
      base = 'https://tubep-backend.onrender.com';
    }
  }
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

/** Đường dẫn /uploads/... cùng origin (Vite proxy dev → backend). */
export function sameOriginUploadPath(pathOrUrl) {
  const s = String(pathOrUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.pathname.startsWith('/uploads/')) return u.pathname;
    } catch {
      /* ignore */
    }
  }
  return '';
}

/** Tải file upload về ArrayBuffer — ưu tiên same-origin /uploads (tránh CORS). */
export async function fetchUploadArrayBuffer(pathOrUrl) {
  const candidates = [];
  const local = typeof window !== 'undefined' ? sameOriginUploadPath(pathOrUrl) : '';
  if (local) candidates.push(local);
  const absolute = publicFileUrl(pathOrUrl);
  if (absolute) candidates.push(absolute);
  const urls = [...new Set(candidates.filter(Boolean))];

  let lastErr = null;
  for (const href of urls) {
    try {
      const res = await fetch(href, { credentials: 'omit', cache: 'no-store' });
      if (res.ok) return res.arrayBuffer();
      lastErr = new Error(`Không tải được file (HTTP ${res.status})`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr?.message === 'Failed to fetch') {
    throw new Error('Không tải được file — kiểm tra kết nối hoặc thử «Tab mới» / «Tải».');
  }
  throw lastErr || new Error('Không tải được file');
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

/** Anchor props ưu tiên tải file về máy (không chỉ mở tab mới). */
export function getFileDownloadAnchorProps(pathOrUrl, opts = {}) {
  const href = publicFileUrl(pathOrUrl);
  if (!href) return null;
  const fileName = opts.fileName;
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    ...(fileName ? { download: fileName } : {}),
  };
}

