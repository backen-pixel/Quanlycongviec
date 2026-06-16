import { colorFromName, resolveMediaUrl } from '../lib/media';
import { api } from './client';

type ActivityUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  online?: boolean;
  last_ping_at?: string | null;
};

export type ActivityUserItem = {
  id: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  online: boolean;
  lastPingAt: string | null;
};

export type UserPresence = {
  online: boolean;
  lastPingAt: string | null;
};

function mapActivityUser(u: ActivityUser): ActivityUserItem {
  const name = u.full_name || u.email || 'Nhân viên';
  return {
    id: u.id,
    name,
    color: colorFromName(name),
    avatarUrl: resolveMediaUrl(u.avatar),
    online: !!u.online,
    lastPingAt: u.last_ping_at || null,
  };
}

export async function fetchActivityUsers(signal?: AbortSignal): Promise<ActivityUserItem[]> {
  const { data } = await api.get<{ users?: ActivityUser[] }>('/users/activity', { signal });
  const list = Array.isArray(data?.users) ? data.users : [];
  return list.filter((u) => u?.id).map(mapActivityUser);
}

/** @deprecated dùng fetchActivityUsers */
export async function fetchOnlineUsers(signal?: AbortSignal): Promise<ActivityUserItem[]> {
  const users = await fetchActivityUsers(signal);
  return users.filter((u) => u.online);
}

export async function fetchPresenceForUserIds(
  userIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, UserPresence>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await api.post<{
    presence?: Record<string, { online?: boolean; last_ping_at?: string | null }>;
  }>('/users/presence', { user_ids: ids }, { signal });
  const raw = data?.presence || {};
  const out: Record<string, UserPresence> = {};
  for (const id of ids) {
    const p = raw[id] || raw[String(id)];
    out[String(id)] = {
      online: !!p?.online,
      lastPingAt: p?.last_ping_at || null,
    };
  }
  return out;
}

export function presenceByUserId(
  users: ActivityUserItem[],
): Record<string, UserPresence> {
  const out: Record<string, UserPresence> = {};
  for (const u of users) {
    out[String(u.id)] = { online: u.online, lastPingAt: u.lastPingAt };
  }
  return out;
}
