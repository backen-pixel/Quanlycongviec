import { Alert, Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import type { MessengerMessage } from '../types/messenger';
import { formatMessagePreview } from './messengerPreview';
import { API_ORIGIN } from '../config';

function mediaUrl(u?: string | null): string | null {
  if (!u) return null;
  const s = u.trim();
  if (s.startsWith('http')) return s;
  return `${API_ORIGIN}${s.startsWith('/') ? '' : '/'}${s}`;
}

export function collectAttachments(msg: MessengerMessage) {
  if (Array.isArray(msg.attachments) && msg.attachments.length) return msg.attachments;
  if (msg.attachment_url) {
    return [{
      url: msg.attachment_url,
      name: msg.attachment_name,
      type: msg.attachment_mime,
    }];
  }
  return [];
}

export function getFirstImage(msg: MessengerMessage) {
  for (const a of collectAttachments(msg)) {
    if ((a.type || '').startsWith('image/')) return a;
  }
  if ((msg.attachment_mime || '').startsWith('image/') && msg.attachment_url) {
    return { url: msg.attachment_url, name: msg.attachment_name, type: msg.attachment_mime };
  }
  return null;
}

export function getDownloadTarget(msg: MessengerMessage) {
  const img = getFirstImage(msg);
  if (img) return img;
  const atts = collectAttachments(msg);
  if (atts[0]?.url) return atts[0];
  return null;
}

export function buildShareText(msg: MessengerMessage, groupTitle?: string) {
  const header = groupTitle ? `[${groupTitle}] ` : '';
  const who = msg.user?.full_name || 'Ai đó';
  const preview = formatMessagePreview(msg);
  const lines = [`${header}${who}:`, preview || ''];
  const atts = collectAttachments(msg);
  for (const a of atts) {
    const u = mediaUrl(a.url);
    if (u) lines.push(u);
  }
  return lines.filter(Boolean).join('\n').trim();
}

export async function shareMessengerMessage(msg: MessengerMessage, groupTitle?: string) {
  const text = buildShareText(msg, groupTitle);
  if (!text) {
    Alert.alert('Chia sẻ', 'Không có nội dung để chia sẻ');
    return;
  }
  try {
    await Share.share({ message: text });
  } catch {
    /* user cancelled */
  }
}

export async function copyMessengerText(msg: MessengerMessage, groupTitle?: string) {
  const text = buildShareText(msg, groupTitle);
  if (!text) {
    Alert.alert('Sao chép', 'Không có nội dung');
    return;
  }
  await Clipboard.setStringAsync(text);
  Alert.alert('Đã sao chép', 'Nội dung tin nhắn đã được sao chép.');
}

export async function copyMessengerImage(url?: string | null) {
  const full = mediaUrl(url);
  if (!full) {
    Alert.alert('Copy ảnh', 'Không có URL ảnh');
    return;
  }
  await Clipboard.setStringAsync(full);
  Alert.alert('Đã sao chép', 'Đã sao chép link ảnh vào clipboard.');
}

export async function downloadMessengerMedia(url?: string | null, name?: string | null) {
  const full = mediaUrl(url);
  if (!full) {
    Alert.alert('Tải xuống', 'Không có file');
    return;
  }
  const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(full) || (name || '').match(/\.(jpe?g|png|gif|webp)$/i);
  if (isImage) {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      await Linking.openURL(full);
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(full);
      Alert.alert('Đã lưu', 'Ảnh đã được lưu vào thư viện ảnh.');
      return;
    } catch {
      /* fallback */
    }
  }
  await Linking.openURL(full);
}

function forwardSourceLabel(sourceTitle?: string, msg?: MessengerMessage): string {
  const who = msg?.user?.full_name || '';
  const title = String(sourceTitle || '')
    .trim()
    .replace(/^«\s*|\s*»$/g, '');
  return title || who || '';
}

export function normalizeForwardDisplayContent(content?: string | null): string {
  if (!content || typeof content !== 'string') return content || '';
  return content
    .replace(/^↪ Chia sẻ((?: \d+ tin)? từ) «([^»]+)» — \2:\s*/i, '↪ Chia sẻ$1 $2\n\n')
    .replace(/^↪ Chia sẻ((?: \d+ tin)? từ) ([^\n—]+?) — \2:\s*/i, '↪ Chia sẻ$1 $2\n\n');
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
  for (const a of collectAttachments(msg)) {
    const u = mediaUrl(a.url);
    if (u) lines.push(u);
  }
  if (!text && !collectAttachments(msg).length && msg.attachment_url) {
    const u = mediaUrl(msg.attachment_url);
    if (u) lines.push(u);
  }
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
    for (const a of collectAttachments(msg)) {
      const u = mediaUrl(a.url);
      if (u) lines.push(u);
    }
    if (!text && !collectAttachments(msg).length && msg.attachment_url) {
      const u = mediaUrl(msg.attachment_url);
      if (u) lines.push(u);
    }
  });
  return lines.filter(Boolean).join('\n').trim();
}

export function isStickerContent(text?: string | null): boolean {
  return String(text || '').trim().startsWith(':sticker:');
}

export function isImageOnlyMessengerMessage(msg: MessengerMessage): boolean {
  const text = String(msg.content || '').trim();
  if (text && !isStickerContent(text)) return false;
  const items = collectAttachments(msg);
  if (!items.length && !msg.attachment_url) return false;
  const { images, videos, audios, files } = groupAttachmentsByKind(items, msg);
  return images.length > 0 && !videos.length && !audios.length && !files.length;
}

export function isFileOnlyMessengerMessage(msg: MessengerMessage): boolean {
  const text = String(msg.content || '').trim();
  if (text && !isStickerContent(text)) return false;
  const items = collectAttachments(msg);
  if (!items.length && !msg.attachment_url) return false;
  const { images, videos, audios, files } = groupAttachmentsByKind(items, msg);
  return files.length > 0 && !images.length && !videos.length && !audios.length;
}

function groupAttachmentsByKind(
  items: { url?: string | null; name?: string | null; type?: string | null; size?: number | null }[],
  msg: MessengerMessage,
) {
  const images: typeof items = [];
  const videos: typeof items = [];
  const audios: typeof items = [];
  const files: typeof items = [];
  const push = (a: { url?: string | null; name?: string | null; type?: string | null }) => {
    const t = (a.type || '').toLowerCase();
    if (t.startsWith('image/')) images.push(a);
    else if (t.startsWith('video/')) videos.push(a);
    else if (t.startsWith('audio/')) audios.push(a);
    else files.push(a);
  };
  for (const a of items) push(a);
  if (msg.attachment_url) {
    const mime = (msg.attachment_mime || '').toLowerCase();
    const a = { url: msg.attachment_url, name: msg.attachment_name, type: mime };
    if (mime.startsWith('image/') || msg.message_type === 'image') images.push(a);
    else if (mime.startsWith('video/')) videos.push(a);
    else if (mime.startsWith('audio/')) audios.push(a);
    else files.push(a);
  }
  return { images, videos, audios, files };
}
