import type { MessengerMessage } from '../types/messenger';

function collectAtts(message: MessengerMessage) {
  if (Array.isArray(message.attachments) && message.attachments.length) return message.attachments;
  if (message.attachment_url) {
    return [{
      url: message.attachment_url,
      name: message.attachment_name,
      type: message.attachment_mime,
    }];
  }
  return [];
}

export function buildMessengerMessagePreview(
  message: MessengerMessage | null | undefined,
  opts: { forUserId?: string | null; maxLen?: number } = {},
): string | null {
  if (!message) return null;
  const maxLen = opts.maxLen ?? 80;
  const forUserId = opts.forUserId;

  if (message.is_recalled || message.recalled_at) {
    const mine =
      forUserId != null
      && String(message.recalled_by || message.user_id || '') === String(forUserId);
    return mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';
  }

  if (message.is_system && message.message_type !== 'call') {
    const raw = String(message.content || '').trim();
    if (!raw) return null;
    return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
  }

  if (message.message_type === 'call') {
    const line = String(message.content || '').trim() || 'Cuộc gọi';
    return line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line;
  }

  let raw = String(message.content ?? '').trim();
  if (raw.startsWith(':sticker:')) {
    const emoji = raw.slice(':sticker:'.length).trim();
    raw = emoji ? `Sticker ${emoji}` : 'Sticker';
  }

  if (!raw) {
    const atts = collectAtts(message);
    if (atts.length) {
      const a0 = atts[0] as { type?: string; name?: string };
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

export function messageDisplayText(
  message: MessengerMessage,
  forUserId?: string | null,
): string {
  return buildMessengerMessagePreview(message, { forUserId, maxLen: 5000 }) || '';
}

import { senderDisplayName } from './messengerReadReceipts';

export function formatReplyPreview(message: MessengerMessage | null | undefined): string {
  if (!message) return 'Tin nhắn';
  if (message.is_recalled || message.recalled_at) return 'Tin nhắn đã thu hồi';
  const preview = buildMessengerMessagePreview(message, { maxLen: 80 });
  return preview || 'Tin nhắn';
}

export function formatReplyComposerLabel(message: MessengerMessage | null | undefined): string {
  if (!message) return 'Tin nhắn';
  const name = senderDisplayName(message);
  const body = formatReplyPreview(message);
  return `${name}: ${body}`;
}
