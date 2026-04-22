import { resolveAttachmentUrl } from './resolveMediaUrl';
import type { CrmActivity } from '../types/crm';

/** Nội dung hiển thị của hoạt động loại ghi chú (ưu tiên description). */
export function getLeadActivityNoteBody(a: CrmActivity): string {
  if (a.description != null && String(a.description).trim()) return String(a.description);
  if (a.notes != null && String(a.notes).trim()) return String(a.notes);
  if (a.title != null && String(a.title).trim()) return String(a.title);
  return '—';
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg)(\?|#|$)/i;

export function stripTrailingUrlPunct(url: string): string {
  return url.replace(/[.,;:!?)\\\]}>]+$/, '');
}

/** ![alt](url) → chèn URL (giữ thứ tự để segment parse được) */
export function expandMarkdownImageLinks(text: string): string {
  if (!text) return '';
  return text.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, '\n$1\n');
}

export type TextUrlSegment = { kind: 'text' | 'url'; value: string };

export function segmentTextWithUrls(text: string): TextUrlSegment[] {
  try {
    const expanded = expandMarkdownImageLinks(text);
    const re = /https?:\/\/[^\s\]<>"')]+/gi;
    const segments: TextUrlSegment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(expanded)) !== null) {
      if (m.index > last) {
        segments.push({ kind: 'text', value: expanded.slice(last, m.index) });
      }
      segments.push({ kind: 'url', value: stripTrailingUrlPunct(m[0]) });
      last = m.index + m[0].length;
    }
    if (last < expanded.length) {
      segments.push({ kind: 'text', value: expanded.slice(last) });
    }
    if (segments.length === 0 && expanded.trim()) {
      return [{ kind: 'text', value: expanded }];
    }
    return segments;
  } catch {
    return text.trim() ? [{ kind: 'text', value: text }] : [];
  }
}

export function classifyUrlMediaKind(url: string, mimeType?: string | null): MediaKind {
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'audio';
  const path = (url.split(/[?#]/)[0] || url).toLowerCase();
  if (IMAGE_EXT.test(path)) return 'image';
  if (VIDEO_EXT.test(path)) return 'video';
  if (AUDIO_EXT.test(path)) return 'audio';
  return 'file';
}

export type SlideshowItem = { uri: string; kind: MediaKind };

/** Ảnh / video / audio trong ghi chú — thứ tự xuất hiện, bỏ qua link file thường */
export function slideshowItemsFromNoteText(text: string): SlideshowItem[] {
  const expanded = expandMarkdownImageLinks(text || '');
  const re = /https?:\/\/[^\s\]<>"')]+/gi;
  const items: SlideshowItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(expanded)) !== null) {
    const raw = stripTrailingUrlPunct(m[0]);
    const uri = resolveAttachmentUrl(raw) || raw;
    const kind = classifyUrlMediaKind(raw);
    if (kind === 'file') continue;
    const key = `${kind}:${uri}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ uri, kind });
  }
  return items;
}

export function slideshowItemsFromDocuments(
  rows: { file_url?: string | null; mime_type?: string | null; name?: string | null }[],
): SlideshowItem[] {
  const items: SlideshowItem[] = [];
  for (const r of rows) {
    const raw = r.file_url;
    if (!raw) continue;
    const uri = resolveAttachmentUrl(raw) || raw;
    const kind = classifyUrlMediaKind(raw, r.mime_type);
    if (kind === 'file') continue;
    items.push({ uri, kind });
  }
  return items;
}
