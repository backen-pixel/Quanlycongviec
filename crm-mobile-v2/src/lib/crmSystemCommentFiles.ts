/**
 * File nhúng trong bình luận hệ thống CRM: «Tên.png|https://…»
 * (khớp frontend CommentsPanels.jsx).
 */

export const SYSTEM_COMMENT_PREFIXES = ['🔄', '⏰', '📎', '👤', '📋', '✅', '🗑️', '🔀', '🚚'];
export const SYSTEM_FILE_HIDDEN_PREFIX = 'hidden:';

export type SystemFileLink = { label: string; url: string };

export function isSystemCommentBody(body?: string | null): boolean {
  if (!body) return false;
  const trimmed = String(body).trim();
  return SYSTEM_COMMENT_PREFIXES.some((p) => trimmed.startsWith(p));
}

export function isSystemImageFileName(name?: string | null): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i.test(String(name || ''));
}

export function isSystemVideoFileName(name?: string | null): boolean {
  return /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(String(name || ''));
}

/** Mọi file «tên|url» còn hiện (không hidden:). */
export function extractAllSystemFileLinks(text?: string | null): SystemFileLink[] {
  if (!text) return [];
  const out: SystemFileLink[] = [];
  const re = /«([^»|]+)\|([^»]+)»/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text))) !== null) {
    const label = String(m[1] || '').trim();
    const url = String(m[2] || '').trim();
    if (!label || !url) continue;
    if (url.startsWith(SYSTEM_FILE_HIDDEN_PREFIX)) continue;
    out.push({ label, url });
  }
  return out;
}

export function extractSystemFileLink(text?: string | null): SystemFileLink | null {
  return extractAllSystemFileLinks(text)[0] || null;
}
