import { api } from '../api/client';
import { formatActivityAgo } from './media';

export type UserPresence = {
  online: boolean;
  last_ping_at?: string | null;
};

export async function fetchUserPresence(userIds: string[]): Promise<Record<string, UserPresence>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  try {
    const { data } = await api.post<{ presence?: Record<string, UserPresence> }>('/users/presence', {
      user_ids: ids,
    });
    return data?.presence && typeof data.presence === 'object' ? data.presence : {};
  } catch {
    return {};
  }
}

/** Online: chấm xanh trên avatar; offline: nhãn thời gian hoạt động. */
export function formatPresenceLabel(p?: UserPresence | null): string {
  if (!p || p.online) return '';
  return formatActivityAgo(p.last_ping_at);
}

/** Header cuộc trò chuyện 1-1: online → "Đang hoạt động", offline → thời gian hoạt động. */
export function formatChatHeaderPresenceLabel(p?: UserPresence | null): string {
  if (p?.online) return 'Đang hoạt động';
  return formatActivityAgo(p?.last_ping_at) || 'Offline';
}
