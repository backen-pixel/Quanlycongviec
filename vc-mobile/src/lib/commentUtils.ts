import type { ProjectComment } from './logisticsApi';

export const COMMENT_REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

const AVATAR_PALETTE = [
  '#6366F1', '#0D9488', '#0891B2', '#D97706', '#DB2777',
  '#7C3AED', '#2563EB', '#059669', '#EA580C', '#4F46E5',
];

export function avatarColor(name?: string | null): string {
  if (!name) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function userInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export function formatCommentTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ms = Date.now() - t;
  if (ms < 15_000) return 'Vừa xong';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Hôm qua';
  if (day < 7) return `${day} ngày trước`;
  return new Date(iso).toLocaleString('vi-VN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function groupCommentsByParent(flat: ProjectComment[]): Map<string, ProjectComment[]> {
  const map = new Map<string, ProjectComment[]>();
  for (const c of flat) {
    const pk = c.parent_id != null && c.parent_id !== '' ? String(c.parent_id) : '__root__';
    if (!map.has(pk)) map.set(pk, []);
    map.get(pk)!.push(c);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return map;
}

export function flattenCommentTree(
  byParent: Map<string, ProjectComment[]>,
  sort: 'newest' | 'oldest',
): { comment: ProjectComment; depth: number }[] {
  const result: { comment: ProjectComment; depth: number }[] = [];
  const roots = [...(byParent.get('__root__') || [])];
  roots.sort((a, b) => {
    const cmp = String(a.created_at || '').localeCompare(String(b.created_at || ''));
    return sort === 'newest' ? -cmp : cmp;
  });
  const walk = (c: ProjectComment, depth: number) => {
    result.push({ comment: c, depth });
    for (const child of byParent.get(String(c.id)) || []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return result;
}

export function reactionTotal(comment: ProjectComment): number {
  return (comment.reactions?.summary || []).reduce((acc, s) => acc + (s.count || 0), 0);
}

export function reactionTopEmojis(comment: ProjectComment, limit = 3): string[] {
  return (comment.reactions?.summary || [])
    .filter((s) => s.count > 0)
    .slice(0, limit)
    .map((s) => s.emoji);
}

export type SystemFileLink = { label: string; url: string };

const SYSTEM_FILE_HIDDEN_PREFIX = 'hidden:';

/** Link file dạng «label|url» trong tin hệ thống (giống web CommentsPanels). */
export function extractSystemFileLinks(text?: string | null): SystemFileLink[] {
  const src = String(text || '');
  if (!src.includes('«')) return [];
  const out: SystemFileLink[] = [];
  const re = /«([^»|]+)\|([^»]+)»/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const label = String(m[1] || '').trim();
    let url = String(m[2] || '').trim();
    if (!label || !url) continue;
    if (url.startsWith(SYSTEM_FILE_HIDDEN_PREFIX)) continue;
    out.push({ label, url });
  }
  return out;
}

export function extractSystemFileLink(text?: string | null): SystemFileLink | null {
  return extractSystemFileLinks(text)[0] || null;
}

export function isImageFileName(name?: string | null): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif)$/i.test(String(name || ''));
}

export type SystemBodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; label: string; url: string }
  | { kind: 'strong'; text: string }
  | { kind: 'deleted'; label: string };

/** Chia body hệ thống: text / «label|url» / «text» đậm. */
export function parseSystemCommentBody(text?: string | null): SystemBodySegment[] {
  const src = String(text || '');
  if (!src) return [];
  const segments: SystemBodySegment[] = [];
  const regex = /«([^»]+)»/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(src)) !== null) {
    if (m.index > lastIdx) segments.push({ kind: 'text', text: src.slice(lastIdx, m.index) });
    const inner = m[1];
    const pipeIdx = inner.indexOf('|');
    if (pipeIdx > 0 && pipeIdx < inner.length - 1) {
      const label = inner.slice(0, pipeIdx);
      const url = inner.slice(pipeIdx + 1);
      if (String(url).startsWith(SYSTEM_FILE_HIDDEN_PREFIX)) {
        segments.push({ kind: 'deleted', label });
      } else {
        segments.push({ kind: 'link', label, url });
      }
    } else {
      segments.push({ kind: 'strong', text: inner });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < src.length) segments.push({ kind: 'text', text: src.slice(lastIdx) });
  return segments;
}
