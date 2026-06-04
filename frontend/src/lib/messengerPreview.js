import { isMessengerMessageRecalled } from './messengerReactions';
import {
  isMessengerCallLogMessage,
  extractCallLogPayloadFromMessage,
  formatCallLogLine,
} from './messengerCallLog';

function collectAtts(message) {
  if (Array.isArray(message?.attachments) && message.attachments.length) return message.attachments;
  if (message?.attachment_url) {
    return [{
      url: message.attachment_url,
      name: message.attachment_name,
      type: message.attachment_mime,
      size: message.attachment_size,
    }];
  }
  return [];
}

/**
 * Preview một tin nhắn (sidebar, toast, reply…).
 * @returns {string|null} null nếu bỏ qua (system / không có nội dung hiển thị)
 */
export function buildMessengerMessagePreview(message, { forUserId, maxLen = 80 } = {}) {
  if (!message) return null;
  if (isMessengerCallLogMessage(message)) {
    const parsed = extractCallLogPayloadFromMessage(message);
    const line = parsed
      ? formatCallLogLine(parsed, forUserId)
      : (message.message_type === 'call' ? String(message.content || '').trim() : null);
    if (line) {
      const oneLine = line.replace(/\s+/g, ' ');
      return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen - 1)}…` : oneLine;
    }
  }
  if (message.is_system && message.message_type !== 'call') return null;

  if (isMessengerMessageRecalled(message)) {
    const mine =
      forUserId != null && String(message.recalled_by || message.user_id) === String(forUserId);
    return mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';
  }

  let raw = String(message.content ?? '').trim();
  if (raw.startsWith(':sticker:')) {
    const emoji = raw.slice(':sticker:'.length).trim();
    raw = emoji ? `Sticker ${emoji}` : 'Sticker';
  }

  if (!raw) {
    const atts = collectAtts(message);
    if (atts.length) {
      const a0 = atts[0];
      const mime = a0.type || message.attachment_mime || '';
      if (mime.startsWith('image/') || message.message_type === 'image') return '📷 Ảnh';
      if (mime.startsWith('video/') || message.message_type === 'video') return '🎬 Video';
      if (mime.startsWith('audio/') || message.message_type === 'audio') return '🎤 Âm thanh';
      const name = a0.name || message.attachment_name;
      return name ? `📎 ${name}` : '📎 Tệp đính kèm';
    }
    if (message.message_type === 'file' || message.attachment_url) return '📎 Tệp đính kèm';
    return null;
  }

  const oneLine = raw.replace(/\s+/g, ' ');
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen - 1)}…` : oneLine;
}

/** Preview tin cuối trong danh sách (từ mới → cũ). */
export function previewFromMessengerMessages(messages, { forUserId, maxLen = 80 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = buildMessengerMessagePreview(list[i], { forUserId, maxLen });
    if (p) return p;
  }
  return null;
}

/** Chuẩn hóa preview từ API / localStorage (đã là chuỗi). */
export function normalizeMessengerPreviewText(text, { forUserId } = {}) {
  let raw = String(text ?? '').trim();
  if (!raw) return '';

  if (/^Đã thu hồi tin nhắn$/i.test(raw)) return 'Đã thu hồi tin nhắn';
  if (/^Tin nhắn bị thu hồi$/i.test(raw)) return 'Tin nhắn bị thu hồi';

  if (raw.startsWith(':sticker:')) {
    const emoji = raw.slice(':sticker:'.length).trim();
    raw = emoji ? `Sticker ${emoji}` : 'Sticker';
  }

  const oneLine = raw.replace(/\s+/g, ' ');
  return oneLine.length > 80 ? `${oneLine.slice(0, 79)}…` : oneLine;
}

/** Hiển thị preview trên sidebar — không ghi đè bằng placeholder khi đang tải. */
export function resolveThreadPreviewLabel(thread, { loadingGroupId, forUserId } = {}) {
  const preview = normalizeMessengerPreviewText(thread?.lastPreview, { forUserId });
  if (preview) return preview;
  if (loadingGroupId && thread?.groupId === loadingGroupId) {
    return thread?.messageCount > 0 ? '…' : '';
  }
  if ((thread?.messageCount ?? 0) > 0) return '';
  return 'Chưa có tin nhắn';
}
