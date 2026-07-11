import { resolveMediaUrl, mapMessageRow } from './messengerApi';
import { buildMessengerMessagePreview } from './messengerPreview';
import type { MessengerNotifPayload } from './localMessengerNotification';

export function buildMessengerNotifFromSocket(
  raw: Record<string, unknown>,
  myUserId?: string | null,
): MessengerNotifPayload | null {
  const gid = raw.group_id ?? raw.groupId;
  if (gid == null) return null;
  const groupId = String(gid);
  const message = mapMessageRow({ ...raw, group_id: groupId });
  if (message.is_system) return null;
  if (message.user_id && myUserId && String(message.user_id) === String(myUserId)) return null;

  const preview = buildMessengerMessagePreview(message, { forUserId: myUserId, maxLen: 120 });
  if (!preview) return null;

  const groupMeta = (raw.group && typeof raw.group === 'object'
    ? raw.group
    : null) as Record<string, unknown> | null;
  const groupName =
    (groupMeta?.name != null ? String(groupMeta.name) : '')
    || (raw.group_name != null ? String(raw.group_name) : '')
    || 'Tin nhắn';
  const senderName = message.user?.full_name?.trim() || groupName;
  const isDirect = groupMeta?.is_direct === true || raw.is_direct === true;
  const isGroup = !isDirect;
  const avatarUrl =
    resolveMediaUrl(
      isGroup
        ? (groupMeta?.avatar as string) || (groupMeta?.peer_avatar as string) || null
        : message.user?.avatar || null,
    ) || resolveMediaUrl(message.user?.avatar);

  return {
    groupId,
    title: groupName,
    senderName,
    message: preview,
    messageId: message.id || undefined,
    avatarUrl,
    isGroup,
  };
}
