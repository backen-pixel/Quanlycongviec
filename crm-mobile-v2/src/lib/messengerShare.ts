import { Alert, Share } from 'react-native';
import type { MessengerMessage } from '../types/messenger';
import { resolveMediaUrl } from './messengerApi';
import { messageDisplayText } from './messengerPreview';

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

export function buildShareText(msg: MessengerMessage, groupTitle?: string): string {
  const header = groupTitle ? `[${groupTitle}] ` : '';
  const who = msg.user?.full_name || 'Ai đó';
  const preview = messageDisplayText(msg);
  const lines = [`${header}${who}:`, preview || ''];
  for (const u of collectAttachmentUrls(msg)) lines.push(u);
  return lines.filter(Boolean).join('\n').trim();
}

export async function shareMessengerMessage(msg: MessengerMessage, groupTitle?: string): Promise<void> {
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

export function canRecallMessage(msg: MessengerMessage, myUserId: string): boolean {
  if (String(msg.user_id) !== String(myUserId) || msg.recalled_at || msg.is_recalled || msg.is_system) {
    return false;
  }
  const t = msg.created_at ? new Date(msg.created_at).getTime() : 0;
  return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
}
