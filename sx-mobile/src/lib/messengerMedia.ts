import type { MessengerMessage } from '../types/messenger';
import { resolveMediaUrl } from './messengerApi';

export const MESSENGER_MAX_UPLOAD_MB = 50;
export const MESSENGER_MAX_FILE_BYTES = MESSENGER_MAX_UPLOAD_MB * 1024 * 1024;

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|avif)(\?|$)/i;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export type PendingChatFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

export type MessengerLinkItem = { url: string; message: MessengerMessage };

export function isSameDay(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toDateString() === db.toDateString();
}

export function formatChatDateLabel(date?: string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function isImageMimeOrUrl(
  type?: string | null,
  url?: string | null,
  name?: string | null,
  messageType?: string | null,
): boolean {
  if (messageType === 'image') return true;
  if ((type || '').toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXT_RE.test(`${url || ''} ${name || ''}`);
}

export function isVideoMimeOrUrl(
  type?: string | null,
  url?: string | null,
  messageType?: string | null,
): boolean {
  if (messageType === 'video') return true;
  if ((type || '').toLowerCase().startsWith('video/')) return true;
  return /\.(mp4|mov|webm|mkv|avi)(\?|$)/i.test(String(url || ''));
}

export function collectAttachments(msg: MessengerMessage) {
  if (Array.isArray(msg.attachments) && msg.attachments.length) {
    return msg.attachments as { url?: string; name?: string; type?: string; size?: number }[];
  }
  if (msg.attachment_url) {
    return [{
      url: msg.attachment_url,
      name: msg.attachment_name ?? undefined,
      type: msg.attachment_mime ?? undefined,
      size: undefined,
    }];
  }
  return [];
}

export function resolvePrimaryAttachment(msg: MessengerMessage) {
  const atts = collectAttachments(msg);
  const first = atts[0];
  return {
    url: msg.attachment_url || first?.url || null,
    name: msg.attachment_name || first?.name || null,
    type: msg.attachment_mime || first?.type || null,
  };
}

export function isImageMessage(msg: MessengerMessage): boolean {
  if (msg.is_recalled || msg.recalled_at) return false;
  const { url, name, type } = resolvePrimaryAttachment(msg);
  return isImageMimeOrUrl(type, url, name, msg.message_type);
}

export function isVideoMessage(msg: MessengerMessage): boolean {
  if (msg.is_recalled || msg.recalled_at) return false;
  const { url, type } = resolvePrimaryAttachment(msg);
  return isVideoMimeOrUrl(type, url, msg.message_type);
}

export function isStickerContent(text?: string | null): boolean {
  return String(text || '').trim().startsWith(':sticker:');
}

export function buildStickerContent(emoji: string): string {
  return `:sticker:${emoji.trim()}`;
}

export function stripStickerPrefix(text?: string | null): string {
  const s = String(text || '').trim();
  if (!s.startsWith(':sticker:')) return s;
  return s.slice(':sticker:'.length).trim();
}

export function extractLinksFromMessages(messages: MessengerMessage[]): MessengerLinkItem[] {
  const seen = new Set<string>();
  const out: MessengerLinkItem[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]!;
    if (msg.is_recalled || msg.recalled_at) continue;
    const text = String(msg.content || '');
    const matches = text.match(URL_IN_TEXT_RE) || [];
    for (const raw of matches) {
      const url = raw.replace(/[.,;:!?)]+$/, '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, message: msg });
    }
    for (const a of collectAttachments(msg)) {
      const u = resolveMediaUrl(a.url);
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push({ url: u, message: msg });
      }
    }
  }
  return out;
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validatePendingFiles(files: PendingChatFile[]): string | null {
  for (const f of files) {
    if (f.size != null && f.size > MESSENGER_MAX_FILE_BYTES) {
      return `File "${f.name}" vượt quá ${MESSENGER_MAX_UPLOAD_MB}MB`;
    }
  }
  return null;
}
