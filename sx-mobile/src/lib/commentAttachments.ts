import { resolveMediaUrl } from './mediaUtils';
import { openMessengerAttachment, saveMessengerAttachment } from './messengerFileOpen';

export type CommentAttachment = {
  url: string;
  name: string;
  type: string;
  size: number;
};

export function normalizeCommentAttachments(raw: unknown): CommentAttachment[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }
  const out: CommentAttachment[] = [];
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const row = a as Record<string, unknown>;
    const url = String(row.url ?? row.file_url ?? '').trim();
    if (!url || url.startsWith('data:')) continue;
    out.push({
      url: url.slice(0, 600),
      name: String(row.name ?? row.file_name ?? 'file').slice(0, 400),
      type: String(row.type ?? row.mime_type ?? '').slice(0, 120),
      size: Number.isFinite(Number(row.size ?? row.file_size))
        ? Number(row.size ?? row.file_size)
        : 0,
    });
  }
  return out;
}

export function isCommentImage(att: CommentAttachment): boolean {
  const mime = String(att.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif)$/i.test(att.name || att.url);
}

export function commentAttachmentHref(att: CommentAttachment): string | null {
  return resolveMediaUrl(att.url);
}

export function humanFileSize(bytes?: number): string {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fileExtLabel(name: string, mime?: string): string {
  const s = String(name || '');
  const idx = s.lastIndexOf('.');
  const ext = idx >= 0 ? s.slice(idx + 1).toLowerCase() : '';
  const mm = String(mime || '').toLowerCase();
  if (ext) return ext;
  if (mm.includes('pdf')) return 'pdf';
  if (mm.includes('sheet') || mm.includes('excel')) return 'xls';
  if (mm.includes('word') || mm.includes('document')) return 'doc';
  if (mm.includes('presentation') || mm.includes('powerpoint')) return 'ppt';
  if (mm.startsWith('image/')) return 'img';
  return 'file';
}

export function fileKindColor(name: string, mime?: string): { bg: string; fg: string; label: string } {
  const label = fileExtLabel(name, mime);
  const ext = label;
  const mm = String(mime || '').toLowerCase();
  if (mm.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return { bg: '#DBEAFE', fg: '#1D4ED8', label: ext || 'img' };
  }
  if (ext === 'pdf' || mm.includes('pdf')) return { bg: '#FEE2E2', fg: '#DC2626', label: 'pdf' };
  if (['xls', 'xlsx', 'csv'].includes(ext) || mm.includes('sheet') || mm.includes('excel')) {
    return { bg: '#D1FAE5', fg: '#047857', label: ext || 'xls' };
  }
  if (['doc', 'docx'].includes(ext) || mm.includes('word')) {
    return { bg: '#E0F2FE', fg: '#0369A1', label: ext || 'doc' };
  }
  if (['ppt', 'pptx'].includes(ext) || mm.includes('presentation')) {
    return { bg: '#FFEDD5', fg: '#C2410C', label: ext || 'ppt' };
  }
  if (['zip', 'rar', '7z'].includes(ext)) return { bg: '#FEF3C7', fg: '#B45309', label: ext };
  return { bg: '#F1F5F9', fg: '#475569', label: ext || 'file' };
}

export function toCommentAttachmentPayload(uploaded: {
  file_url?: string;
  url?: string;
  file_name?: string;
  name?: string;
  mime_type?: string;
  type?: string;
  file_size?: number;
  size?: number;
}): CommentAttachment | null {
  const url = String(uploaded.file_url || uploaded.url || '').trim();
  if (!url || url.startsWith('data:')) return null;
  return {
    url,
    name: String(uploaded.file_name || uploaded.name || 'file'),
    type: String(uploaded.mime_type || uploaded.type || ''),
    size: Number(uploaded.file_size || uploaded.size || 0) || 0,
  };
}

/** Mở file đính kèm ngay trong máy (tải về cache rồi mở bằng app phù hợp), không chuyển hướng qua web. */
export async function openCommentAttachment(att: CommentAttachment): Promise<void> {
  const href = commentAttachmentHref(att);
  if (!href) return;
  await openMessengerAttachment(href, { name: att.name, mime: att.type });
}

/** Tải/lưu file đính kèm về máy (ảnh → thư viện; tài liệu → Downloads công khai). */
export async function saveCommentAttachment(
  att: CommentAttachment,
  opts?: { onProgress?: import('./messengerFileOpen').SaveAttachmentOptions['onProgress'] },
): Promise<import('./messengerFileOpen').SaveAttachmentResult> {
  const href = commentAttachmentHref(att);
  if (!href) throw new Error('Không có đường dẫn file');
  return saveMessengerAttachment(href, {
    name: att.name,
    mime: att.type,
    onProgress: opts?.onProgress,
  });
}

export async function uploadCommentFiles(
  files: { uri: string; name: string; mime: string }[],
): Promise<CommentAttachment[]> {
  if (!files.length) return [];
  const { postMultipart } = await import('../api/client');
  const form = new FormData();
  for (const f of files) {
    form.append('files', { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
  }
  const { data } = await postMultipart<{
    files?: {
      file_url?: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
      error?: string;
    }[];
  }>('/upload', form);
  const out: CommentAttachment[] = [];
  for (const u of data?.files || []) {
    const mapped = toCommentAttachmentPayload(u);
    if (mapped) out.push(mapped);
  }
  return out;
}
