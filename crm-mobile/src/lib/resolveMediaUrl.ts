import { API_ORIGIN } from '../config';

/** Chuẩn hóa URL ảnh/video/file từ API (đường dẫn tương đối → gốc server). */
export function resolveAttachmentUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  return `${API_ORIGIN}${path}`;
}
