import type { MessengerGroupMember } from '../lib/messengerApi';
import type { MessengerMessage, MessengerReadReceipt } from '../types/messenger';

export type MessageViewer = {
  userId: string;
  name: string;
  avatar?: string | null;
  readAt: string;
};

export function getSeenByForMessage(
  message: MessengerMessage,
  readReceipts: MessengerReadReceipt[],
  myUserId: string,
  members: MessengerGroupMember[],
): MessageViewer[] {
  const created = new Date(message.created_at).getTime();
  if (!Number.isFinite(created)) return [];

  return readReceipts
    .filter((r) => {
      if (String(r.user_id) === String(myUserId)) return false;
      const rt = new Date(r.last_read_at).getTime();
      return Number.isFinite(rt) && rt >= created;
    })
    .map((r) => {
      const mem = members.find((m) => String(m.id) === String(r.user_id));
      return {
        userId: r.user_id,
        name: mem?.name || 'Thành viên',
        avatar: mem?.avatar ?? null,
        readAt: r.last_read_at,
      };
    })
    .sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime());
}

export function formatMessageSeenLabel(
  count: number,
  isDirect: boolean,
  isLastMine: boolean,
): string {
  if (count > 0) {
    if (isDirect) return 'Đã xem';
    return `Đã xem · ${count}`;
  }
  return isLastMine ? 'Đã gửi' : '';
}

export function formatReadTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
  } catch {
    return '';
  }
}

export function senderDisplayName(message: MessengerMessage): string {
  return message.user?.full_name?.trim() || 'Thành viên';
}

export function senderAvatarUrl(message: MessengerMessage): string | null {
  return message.user?.avatar ?? null;
}
