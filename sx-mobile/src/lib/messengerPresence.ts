import { api } from '../api/client';

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

export function formatPresenceLabel(p?: UserPresence | null): string {
  if (!p) return 'Offline';
  if (p.online) return 'Đang hoạt động';
  if (p.last_ping_at) {
    const diff = Date.now() - new Date(p.last_ping_at).getTime();
    if (Number.isFinite(diff) && diff < 3600000) {
      const mins = Math.max(1, Math.floor(diff / 60000));
      return `Offline · ${mins} phút trước`;
    }
  }
  return 'Offline';
}
