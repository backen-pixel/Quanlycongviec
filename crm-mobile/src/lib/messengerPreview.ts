import type { MessengerMessage } from '../types/messenger';

/** Emoji phản ứng nhanh — dùng cho preview "👍 Đã thích tin nhắn" nếu cần. */
const URL_RE = /https?:\/\/[^\s]+/i;

type PreviewInput =
  | string
  | null
  | undefined
  | Pick<
      MessengerMessage,
      | 'content'
      | 'message_type'
      | 'attachment_mime'
      | 'attachment_name'
      | 'attachment_url'
      | 'attachments'
      | 'recalled_at'
    >;

/**
 * Chuỗi preview ngắn cho danh sách hội thoại (nhóm + 1-1).
 * Hỗ trợ: text, sticker, emoji, ảnh, video, âm thanh, file, link, tin thu hồi.
 */
export function formatMessagePreview(input: PreviewInput, opts?: { mine?: boolean; recalled?: boolean }): string {
  if (typeof input === 'string' || input == null) {
    const raw = (input || '').trim();
    if (!raw) return '';
    if (raw === '[recalled]' || raw === 'Đã thu hồi tin nhắn' || raw === 'Tin nhắn bị thu hồi') {
      return opts?.mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';
    }
    return previewFromText(raw);
  }

  const m = input;
  if (m.recalled_at || m.is_recalled || opts?.recalled) {
    return opts?.mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';
  }

  const raw = (m.content || '').trim();
  if (raw) return previewFromText(raw);

  const mime = (m.attachment_mime || '').toLowerCase();
  const mt = (m.message_type || '').toLowerCase();
  if (mt === 'image' || mime.startsWith('image/')) return '📷 Ảnh';
  if (mt === 'video' || mime.startsWith('video/')) return '🎬 Video';
  if (mt === 'audio' || mt === 'voice' || mime.startsWith('audio/')) return '🎤 Ghi âm';
  if (mime || m.attachment_url) return `📎 ${m.attachment_name || 'Tệp đính kèm'}`;

  const arr = Array.isArray(m.attachments) ? m.attachments : [];
  if (arr.length) {
    const a0 = arr[0] || {};
    const t = (a0.type || '').toLowerCase();
    if (t.startsWith('image/')) return '📷 Ảnh';
    if (t.startsWith('video/')) return '🎬 Video';
    if (t.startsWith('audio/')) return '🎤 Ghi âm';
    return `📎 ${a0.name || 'Tệp đính kèm'}`;
  }

  return '';
}

function previewFromText(raw: string): string {
  if (raw.startsWith(':sticker:')) {
    const emoji = raw.slice(':sticker:'.length).trim();
    return emoji ? `🏷️ ${emoji}` : '🏷️ Nhãn dán';
  }
  if (URL_RE.test(raw) && raw.length < 200) {
    const onlyUrl = raw.replace(URL_RE, '').trim();
    if (!onlyUrl) return '🔗 Link';
    return `🔗 ${onlyUrl.slice(0, 60)}${onlyUrl.length > 60 ? '…' : ''}`;
  }
  if (/^[\p{Emoji}\p{Extended_Pictographic}\s]+$/u.test(raw) && raw.length <= 8) {
    return raw;
  }
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

/** Preview cho chip trả lời (1 dòng). */
export function formatReplyPreview(m: MessengerMessage): string {
  if (m.recalled_at || m.is_recalled) return 'Tin nhắn đã thu hồi';
  const p = formatMessagePreview(m);
  return p || '[Tệp / ảnh]';
}
