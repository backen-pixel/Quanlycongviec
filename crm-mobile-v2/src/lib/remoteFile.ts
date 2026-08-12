/**
 * URL truy cập / tải file CRM (uploads local + URL tuyệt đối).
 * Khớp web fetchUploadBlob: /uploads/... → /api/upload/serve-local?path=...
 */
import { getStoredToken } from '../api/client';
import { API_ORIGIN, API_PREFIX } from '../config';
import { resolveMediaUrl } from './media';

export function extractUploadsPath(urlOrPath?: string | null): string | null {
  const s = String(urlOrPath || '').trim();
  if (!s) return null;
  if (s.startsWith('/uploads/')) return s.split('?')[0].split('#')[0];
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (u.pathname.startsWith('/uploads/')) return u.pathname;
      // Backend origin + /uploads/...
      if (API_ORIGIN && s.startsWith(API_ORIGIN) && u.pathname.startsWith('/uploads/')) {
        return u.pathname;
      }
    }
  } catch {
    /* ignore */
  }
  const m = s.match(/(\/uploads\/[^?#]+)/i);
  return m ? m[1] : null;
}

export function buildServeLocalUrl(
  uploadsPath: string,
  opts?: { name?: string | null; token?: string | null },
): string {
  const qs = new URLSearchParams({ path: uploadsPath });
  const name = String(opts?.name || '').trim();
  if (name) qs.set('name', name);
  const token = String(opts?.token || '').trim();
  if (token) qs.set('access_token', token);
  return `${API_PREFIX}/upload/serve-local?${qs.toString()}`;
}

/** Guess MIME đầy đủ cho Office / media / PDF. */
export function guessFileMime(name?: string | null, mime?: string | null): string {
  const given = String(mime || '').trim();
  if (given && given !== 'application/octet-stream') return given;
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.rar')) return 'application/vnd.rar';
  if (lower.endsWith('.7z')) return 'application/x-7z-compressed';
  if (/\.(jpe?g)$/i.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.dwg')) return 'application/acad';
  if (lower.endsWith('.dxf')) return 'image/vnd.dxf';
  return given || 'application/octet-stream';
}

/**
 * URL để tải/mở file (Bearer hoặc access_token trên serve-local).
 * Public Supabase HTTPS giữ nguyên.
 */
export async function resolveFileAccessUrl(
  raw?: string | null,
  opts?: { name?: string | null; preferServeLocal?: boolean },
): Promise<string | null> {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^data:|^blob:/i.test(s)) return s;

  const uploadsPath = extractUploadsPath(s);
  const preferLocal = opts?.preferServeLocal !== false;
  if (uploadsPath && preferLocal) {
    const token = await getStoredToken();
    return buildServeLocalUrl(uploadsPath, { name: opts?.name, token });
  }

  return resolveMediaUrl(s);
}

/** Drive authenticated download URL. */
export function driveFileDownloadUrl(fileId: string, token?: string | null): string {
  const base = `${API_PREFIX}/drive/files/${encodeURIComponent(fileId)}/download`;
  return token ? `${base}?access_token=${encodeURIComponent(token)}` : base;
}
