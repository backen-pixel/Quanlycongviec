import type { MessengerMessage } from '../types/messenger';
import { resolveMediaUrl } from './messengerApi';

function collectAttachmentUrls(msg: MessengerMessage): string[] {
  const urls: string[] = [];
  if (Array.isArray(msg.attachments)) {
    for (const a of msg.attachments) {
      const row = a as { url?: string };
      const u = resolveMediaUrl(row.url);
      if (u) urls.push(u);
    }
  }
  const primary = resolveMediaUrl(msg.attachment_url);
  if (primary && !urls.includes(primary)) urls.push(primary);
  return urls;
}

function forwardSourceLabel(sourceTitle?: string, msg?: MessengerMessage): string {
  const who = msg?.user?.full_name || '';
  const title = String(sourceTitle || '')
    .trim()
    .replace(/^«\s*|\s*»$/g, '');
  return title || who || '';
}

export function buildForwardMessageContent(
  msg: MessengerMessage,
  opts?: { sourceTitle?: string; note?: string },
): string {
  if (!msg) return '';
  const from = forwardSourceLabel(opts?.sourceTitle, msg);
  const lines: string[] = [];
  if (opts?.note?.trim()) lines.push(opts.note.trim());
  lines.push(from ? `↪ Chia sẻ từ ${from}` : '↪ Chia sẻ tin nhắn');
  const text = (msg.content || '').trim();
  if (text) lines.push(text);
  for (const u of collectAttachmentUrls(msg)) lines.push(u);
  return lines.filter(Boolean).join('\n\n');
}

export function buildBulkForwardMessageContent(
  messages: MessengerMessage[],
  opts?: { sourceTitle?: string; note?: string },
): string {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return buildForwardMessageContent(list[0], opts);
  const lines: string[] = [];
  if (opts?.note?.trim()) lines.push(opts.note.trim());
  const from = forwardSourceLabel(opts?.sourceTitle, list[0]);
  lines.push(from ? `↪ Chia sẻ ${list.length} tin từ ${from}` : `↪ Chia sẻ ${list.length} tin nhắn`);
  list.forEach((msg, i) => {
    const text = (msg.content || '').trim();
    lines.push(`\n${i + 1}.`);
    if (text) lines.push(text);
    for (const u of collectAttachmentUrls(msg)) lines.push(u);
  });
  return lines.filter(Boolean).join('\n').trim();
}

export type ForwardTarget =
  | { type: 'group'; id: string; name?: string }
  | { type: 'user'; id: string; name?: string };

export function forwardTargetKey(t: ForwardTarget): string {
  return t.type === 'group' ? `g:${t.id}` : `u:${t.id}`;
}

export function buildForwardMessageFromAttachment(
  url: string,
  opts?: { name?: string | null; mime?: string | null; sourceTitle?: string; note?: string },
): MessengerMessage {
  const mime = String(opts?.mime || '').toLowerCase();
  let message_type = 'file';
  if (mime.startsWith('audio/')) message_type = 'audio';
  else if (mime.startsWith('image/')) message_type = 'image';
  else if (mime.startsWith('video/')) message_type = 'video';

  const name = opts?.name?.trim() || '';
  const lines: string[] = [];
  if (opts?.note?.trim()) lines.push(opts.note.trim());
  const from = String(opts?.sourceTitle || '').trim();
  lines.push(from ? `↪ Chia sẻ từ ${from}` : '↪ Chia sẻ tệp');
  if (name) lines.push(name);
  lines.push(url);

  return {
    id: `forward-file-${Date.now()}`,
    group_id: '',
    content: lines.filter(Boolean).join('\n\n'),
    message_type,
    attachment_url: url,
    attachment_name: name || null,
    attachment_mime: opts?.mime || null,
    created_at: new Date().toISOString(),
  };
}
