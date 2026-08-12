import {
  EMPTY_NOTIFICATION_COUNTS,
  setNotificationCounts,
  type NotificationCounts,
} from '../lib/notificationCountsStore';
import { api } from './client';

export type { NotificationCounts };
export { EMPTY_NOTIFICATION_COUNTS };

export type NotificationChannel = 'activity' | 'assignments' | 'events' | 'deadlines';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ApiNotification = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const COUNTS_TTL_MS = 45_000;

let countsCache: { data: NotificationCounts; at: number } | null = null;
let countsInflight: Promise<NotificationCounts> | null = null;

export function invalidateNotificationCountsCache(): void {
  countsCache = null;
}

function mapNotification(n: ApiNotification): AppNotification {
  return {
    id: n.id,
    title: n.title || 'Thông báo',
    message: n.message || '',
    type: n.type ?? null,
    entity_type: n.entity_type ?? null,
    entity_id: n.entity_id ?? null,
    is_read: !!n.is_read,
    created_at: n.created_at ?? null,
    metadata: n.metadata ?? null,
  };
}

export async function fetchNotifications(opts: {
  channel: NotificationChannel;
  onlyUnread?: boolean;
  date?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<AppNotification[]> {
  const { channel, onlyUnread, date, limit = 80, signal } = opts;

  if (channel === 'deadlines') {
    const { data } = await api.get<{ notifications?: ApiNotification[] }>(
      '/dashboard/notifications/deadlines',
      { params: { module: 'all', limit }, signal },
    );
    return (data?.notifications || []).map(mapNotification);
  }

  const params: Record<string, string | number> = { channel, limit };
  if (onlyUnread) params.unread = 'true';
  if (channel === 'activity' && date) {
    params.from_date = date;
    params.to_date = date;
  }
  const { data } = await api.get<{ notifications?: ApiNotification[] }>('/dashboard/notifications', {
    params,
    signal,
  });
  return (data?.notifications || []).map(mapNotification);
}

/** GET /dashboard — chỉ stats unread (nhẹ). Cache 45s + gộp request trùng. */
export async function fetchNotificationCounts(
  signal?: AbortSignal,
  opts?: { force?: boolean },
): Promise<NotificationCounts> {
  if (!opts?.force && countsCache && Date.now() - countsCache.at < COUNTS_TTL_MS) {
    setNotificationCounts(countsCache.data);
    return countsCache.data;
  }
  if (!opts?.force && countsInflight) return countsInflight;

  const run = (async () => {
    try {
      const { data } = await api.get<{
        stats?: {
          unread_activity?: number;
          unread_events?: number;
          unread_assignments?: number;
          unread_deadlines?: number;
        };
      }>('/dashboard', {
        signal,
        params: opts?.force ? { _: Date.now() } : undefined,
      });
      const s = data?.stats || {};
      const activity = s.unread_activity ?? 0;
      const assignments = s.unread_assignments ?? 0;
      const events = s.unread_events ?? 0;
      const deadlines = s.unread_deadlines ?? 0;
      const next: NotificationCounts = {
        activity,
        assignments,
        events,
        deadlines,
        total: activity + assignments + events + deadlines,
      };
      countsCache = { data: next, at: Date.now() };
      setNotificationCounts(next);
      return next;
    } catch {
      const fallback = countsCache?.data || EMPTY_NOTIFICATION_COUNTS;
      setNotificationCounts(fallback);
      return fallback;
    }
  })().finally(() => {
    if (countsInflight === run) countsInflight = null;
  });

  countsInflight = run;
  return run;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`/dashboard/notifications/${id}/read`);
  invalidateNotificationCountsCache();
}

/** Bỏ channel → đánh dấu đã đọc toàn bộ thông báo (mọi kênh). */
export async function markAllNotificationsRead(channel?: NotificationChannel): Promise<void> {
  const params = channel ? { channel } : undefined;
  await api.put('/dashboard/notifications/read-all', {}, params ? { params } : undefined);
  invalidateNotificationCountsCache();
  if (!channel) setNotificationCounts(EMPTY_NOTIFICATION_COUNTS);
}
