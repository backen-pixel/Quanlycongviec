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
