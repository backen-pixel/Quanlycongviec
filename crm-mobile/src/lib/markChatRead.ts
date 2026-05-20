import { api } from '../api/client';

/** Đánh dấu đã đọc nhóm Messenger — giảm badge. */
export async function markMessengerGroupRead(groupId: string): Promise<void> {
  if (!groupId) return;
  await api.patch(`/messenger/groups/${groupId}/read`);
}

/**
 * Đánh dấu đã xem lead (lead_seen_by) — gọi nhẹ qua detail endpoint.
 * Backend cập nhật lead_seen_by khi GET detail.
 */
export async function markLeadChatRead(leadId: string): Promise<void> {
  if (!leadId) return;
  await api.get(`/crm/leads/${leadId}/detail`);
}

export function bubbleKeyForNotification(
  type: string | undefined,
  entityId: string | undefined,
): string | null {
  if (!entityId) return null;
  if (type === 'lead_chat') return `lead:${entityId}`;
  if (type === 'messenger_chat') return entityId;
  return null;
}

export function parseBubbleKey(key: string): { kind: 'messenger' | 'lead'; id: string } | null {
  if (key.startsWith('lead:')) return { kind: 'lead', id: key.slice(5) };
  if (key) return { kind: 'messenger', id: key };
  return null;
}
