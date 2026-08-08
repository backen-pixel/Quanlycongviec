import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import {
  fetchProductionBoard,
  fetchProjectCommentIndex,
  fetchProjectComments,
} from './logisticsApi';

const USER_KEY = 'vc_user_json';
const SEEN_KEY = 'vc_comment_seen_v1';
const DISMISSED_KEY = 'vc_comment_dismissed_v1';

export type SxCommentNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read: boolean;
  created_at: string;
  metadata?: {
    project_id?: string;
    project_code?: string | null;
    project_name?: string | null;
    comment_preview?: string | null;
    author_name?: string | null;
    deal_title?: string | null;
    nav_tab?: string;
    ecosystem_module_key?: string;
    vc_handover?: boolean;
  } | null;
};

const WORKSHOP_DEAL_TYPES = new Set([
  'workshop_new_deal',
  'logistics_stage_changed',
  'logistics_task_deadline_warning',
  'logistics_task_deadline_overdue',
  'project_assigned',
  'project_created',
]);

export function isWorkshopDealNotification(n: Pick<SxCommentNotification, 'type'>): boolean {
  return WORKSHOP_DEAL_TYPES.has(String(n.type || ''));
}

/** Thông báo thuộc module VC — loại trừ SX (production) / CRM. */
export function isVcRelevantNotification(
  n: Pick<SxCommentNotification, 'type' | 'metadata'> | null | undefined,
): boolean {
  if (!n) return false;
  const type = String(n.type || '');
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const eco = String(meta.ecosystem_module_key || '').trim();
  if (eco === 'production' || eco === 'crm') return false;

  if (type === 'comment_added') {
    return !eco || eco === 'logistics' || eco === 'projects';
  }
  if (type === 'workshop_new_deal') {
    return eco === 'logistics' || Boolean(meta.vc_handover);
  }
  if (
    type === 'logistics_stage_changed'
    || type === 'logistics_task_deadline_warning'
    || type === 'logistics_task_deadline_overdue'
  ) {
    return true;
  }
  if (type === 'project_assigned' || type === 'project_created') {
    return !eco || eco === 'logistics';
  }
  if (type === 'messenger_chat' || type === 'incoming_call') return true;
  return false;
}

/** Payload FCM/Expo — quyết định có hiện trên app VC không. */
export function isVcRelevantPushData(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return true;
  const type = String(data.type || '');
  if (!type) return true;
  const metaRaw = data.metadata;
  const meta = metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
    ? metaRaw as Record<string, unknown>
    : {};
  const channelId = String(data.channelId || data.channel_id || '');
  if (channelId === 'sx_comments') return false;
  return isVcRelevantNotification({
    type,
    metadata: {
      ecosystem_module_key: meta.ecosystem_module_key != null
        ? String(meta.ecosystem_module_key)
        : undefined,
      vc_handover: Boolean(meta.vc_handover),
    },
  });
}

export function notificationCategoryLabel(n: SxCommentNotification): string {
  if (isWorkshopDealNotification(n)) return 'Lắp đặt';
  return 'Bình luận';
}

export function notificationIconName(n: SxCommentNotification): 'chatbubble-ellipses' | 'briefcase-outline' {
  return isWorkshopDealNotification(n) ? 'briefcase-outline' : 'chatbubble-ellipses';
}

export function notificationActionLabel(n: SxCommentNotification): string {
  if (isWorkshopDealNotification(n)) {
    return notificationProjectId(n) ? 'Xem dự án' : 'Đóng';
  }
  return 'Xem bình luận';
}

export function trimCommentPreview(text: string, max = 120): string {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function mapRow(raw: Record<string, unknown>): SxCommentNotification {
  const meta = (raw.metadata || {}) as SxCommentNotification['metadata'];
  const row = {
    id: String(raw.id || ''),
    type: String(raw.type || ''),
    title: String(raw.title || ''),
    message: String(raw.message || ''),
    entity_type: raw.entity_type != null ? String(raw.entity_type) : null,
    entity_id: raw.entity_id != null ? String(raw.entity_id) : null,
    is_read: Boolean(raw.is_read),
    created_at: String(raw.created_at || ''),
    metadata: meta && typeof meta === 'object' ? { ...meta } : null,
  };
  return enrichNotificationPreview(row);
}

function extractQuotedMessage(message: string): string | null {
  const m = String(message || '').match(/:\s*"([\s\S]*)"\s*\.{0,3}$/);
  return m ? trimCommentPreview(m[1], 120) : null;
}

function extractAuthorFromMessage(message: string): string | null {
  const m = String(message || '').match(/^([^:]+)\s+(trong|đã)/i);
  return m ? m[1].trim() : null;
}

export function enrichNotificationPreview(n: SxCommentNotification): SxCommentNotification {
  const meta = { ...(n.metadata || {}) };
  if (!meta.comment_preview) {
    const quoted = extractQuotedMessage(n.message);
    if (quoted) meta.comment_preview = quoted;
  }
  if (!meta.author_name) {
    const fromMsg = extractAuthorFromMessage(n.message);
    if (fromMsg) meta.author_name = fromMsg;
  }
  if (meta.author_name && meta.project_code && !n.title.includes('·')) {
    return {
      ...n,
      title: `${meta.author_name} · ${meta.project_code}`,
      metadata: meta,
    };
  }
  return { ...n, metadata: meta };
}

function isNotFoundError(e: unknown): boolean {
  const ex = e as { response?: { status?: number } };
  return ex?.response?.status === 404;
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as { id?: string; userId?: string };
    return u?.id || u?.userId || null;
  } catch {
    return null;
  }
}

async function getSeenMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function setSeenAt(projectId: string, at: string): Promise<void> {
  const map = await getSeenMap();
  map[String(projectId)] = at;
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(map));
}

/** Map projectId → ISO thời điểm đã xem bình luận (local). */
export async function loadCommentSeenMap(): Promise<Record<string, string>> {
  return getSeenMap();
}

/** Đánh dấu đã xem bình luận dự án — badge Kanban sẽ ẩn. */
export async function markProjectCommentsSeen(projectId: string, at?: string): Promise<void> {
  const pid = String(projectId || '').trim();
  if (!pid) return;
  await setSeenAt(pid, at || new Date().toISOString());
}

export function notificationDismissKey(n: SxCommentNotification): string {
  const pid = notificationProjectId(n);
  if (pid) return `pid:${pid}:${n.created_at}`;
  return n.id;
}

async function getDismissedKeys(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export async function filterDismissedNotifications(
  items: SxCommentNotification[],
): Promise<SxCommentNotification[]> {
  const dismissed = await getDismissedKeys();
  if (!dismissed.size) return items;
  return items.filter((n) => !dismissed.has(notificationDismissKey(n)));
}

/** Ẩn tất cả thông báo đã đọc khỏi danh sách (lưu local). */
export async function dismissAllReadCommentNotifications(
  items: SxCommentNotification[],
): Promise<number> {
  const readItems = items.filter((n) => n.is_read);
  if (!readItems.length) return 0;
  const dismissed = await getDismissedKeys();
  for (const n of readItems) dismissed.add(notificationDismissKey(n));
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  return readItems.length;
}

function localNotifId(projectId: string, lastAt: string): string {
  return `local:${projectId}:${lastAt}`;
}

async function enrichWithLatestComments(
  items: SxCommentNotification[],
): Promise<SxCommentNotification[]> {
  const need = items.filter((i) => !i.metadata?.comment_preview).slice(0, 20);
  if (!need.length) return items.map(enrichNotificationPreview);

  await Promise.all(
    need.map(async (item) => {
      const pid = notificationProjectId(item);
      if (!pid) return;
      try {
        const comments = await fetchProjectComments(pid);
        const latest = comments[0];
        if (!latest?.content) return;
        const author = latest.user?.full_name || 'Thành viên';
        const code = item.metadata?.project_code || item.metadata?.project_name || 'dự án';
        item.metadata = {
          ...item.metadata,
          project_id: pid,
          comment_preview: trimCommentPreview(latest.content),
          author_name: author,
        };
        item.message = `${author} trong ${code}: "${trimCommentPreview(latest.content, 80)}"`;
        item.title = `${author} · ${code}`;
      } catch {
        /* ignore per project */
      }
    }),
  );

  return items.map(enrichNotificationPreview);
}

/** Fallback khi server chưa deploy API /logistics/notifications/comments */
async function buildLocalCommentNotifications(
  unreadOnly: boolean,
): Promise<{ notifications: SxCommentNotification[]; unread_count: number }> {
  const currentUserId = await getCurrentUserId();
  const board = await fetchProductionBoard(true);
  const projectIds = board.projects.map((p) => p.id).filter(Boolean);
  const index = projectIds.length ? await fetchProjectCommentIndex(projectIds) : {};
  const seen = await getSeenMap();

  const items: SxCommentNotification[] = [];
  for (const p of board.projects) {
    const entry = index[p.id];
    if (!entry?.last_at || !entry.last_user_id) continue;
    if (currentUserId && String(entry.last_user_id) === String(currentUserId)) continue;

    const seenAt = seen[p.id];
    const isUnread = !seenAt || new Date(entry.last_at).getTime() > new Date(seenAt).getTime();
    if (unreadOnly && !isUnread) continue;

    const code = p.code || p.name || 'dự án';
    items.push({
      id: localNotifId(p.id, entry.last_at),
      type: 'comment_added',
      title: `Bình luận · ${code}`,
      message: `Có bình luận mới trong ${code}`,
      entity_type: 'project',
      entity_id: p.id,
      is_read: !isUnread,
      created_at: entry.last_at,
      metadata: {
        project_id: p.id,
        project_code: p.code || null,
        project_name: p.name || null,
        ecosystem_module_key: 'logistics',
      },
    });
  }

  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const enriched = await filterDismissedNotifications(await enrichWithLatestComments(items));
  const unreadCount = enriched.filter((n) => !n.is_read).length;
  return { notifications: enriched, unread_count: unreadCount };
}

export async function fetchCommentNotifications(
  unreadOnly = false,
): Promise<{ notifications: SxCommentNotification[]; unread_count: number }> {
  try {
    const { data } = await api.get<{ notifications?: unknown[]; unread_count?: number }>(
      '/logistics/notifications/comments',
      { params: unreadOnly ? { unread: 'true' } : {} },
    );
    const list = Array.isArray(data?.notifications) ? data.notifications : [];
    const notifications = await filterDismissedNotifications(
      await enrichWithLatestComments(list.map((row) => mapRow(row as Record<string, unknown>))),
    );
    return {
      notifications,
      unread_count: Number(data?.unread_count || notifications.filter((n) => !n.is_read).length),
    };
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
    return buildLocalCommentNotifications(unreadOnly);
  }
}

export async function fetchCommentUnreadCount(): Promise<number> {
  try {
    const { data } = await api.get<{ unread_count?: number }>(
      '/logistics/notifications/comments/unread-count',
    );
    return Number(data?.unread_count || 0);
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
    const { unread_count } = await buildLocalCommentNotifications(true);
    return unread_count;
  }
}

export async function markNotificationReadForItem(n: SxCommentNotification): Promise<void> {
  const pid = notificationProjectId(n);
  if (pid && n.created_at) {
    await setSeenAt(pid, n.created_at);
  }
  if (!n.id.startsWith('local:') && !n.id.startsWith('rt:')) {
    try {
      await api.put(`/dashboard/notifications/${n.id}/read`);
    } catch (e) {
      if (!isNotFoundError(e)) throw e;
    }
  }
}

export async function markAllCommentNotificationsRead(): Promise<number> {
  try {
    const { data } = await api.put<{ marked?: number }>('/logistics/notifications/comments/read-all');
    return Number(data?.marked || 0);
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
    const { notifications } = await buildLocalCommentNotifications(false);
    const now = new Date().toISOString();
    const map = await getSeenMap();
    for (const n of notifications) {
      const pid = notificationProjectId(n);
      if (pid) map[pid] = n.created_at || now;
    }
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(map));
    return notifications.filter((n) => !n.is_read).length;
  }
}

export function notificationProjectId(n: SxCommentNotification): string | null {
  if (n.metadata?.project_id) return String(n.metadata.project_id);
  if (n.entity_type === 'project' && n.entity_id) return String(n.entity_id);
  return null;
}

/** Gộp nhiều nguồn (socket, API, cache) — bình luận theo dự án, deal theo id. */
export function mergeCommentNotificationLists(
  ...lists: SxCommentNotification[][]
): SxCommentNotification[] {
  const byKey = new Map<string, SxCommentNotification>();
  for (const list of lists) {
    for (const raw of list) {
      const n = enrichNotificationPreview(raw);
      const pid = notificationProjectId(n);
      const key = n.type === 'comment_added' && pid ? `comment:${pid}` : `id:${n.id}`;
      const prev = byKey.get(key);
      if (!prev || String(n.created_at).localeCompare(String(prev.created_at)) >= 0) {
        byKey.set(key, n);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function getCurrentUserIdForNotifications(): Promise<string | null> {
  return getCurrentUserId();
}
