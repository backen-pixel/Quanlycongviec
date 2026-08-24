/**
 * Điều hướng từ payload thông báo hệ thống / inbox.
 * Backend (FCM) gửi `metadata` dạng JSON string; inbox API trả object.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate, navigationRef } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/types';
import { requestOpenUpdateGate } from './appUpdateNotify';

const PENDING_KEY = 'crmv2_pending_notif_nav_v1';
const LOG = '[crmv2 notif-nav]';

export type NotificationNavPayload = Record<string, unknown>;

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/** Parse metadata từ FCM (string) hoặc API (object). */
export function parseNotificationMetadata(data: NotificationNavPayload | undefined | null): Record<string, unknown> {
  if (!data) return {};
  const raw = data.metadata;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return asRecord(raw);
}

function str(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function isMessenger(type: string, entity: string, meta: Record<string, unknown>, data: NotificationNavPayload): boolean {
  if (type === 'messenger_chat' || type === 'messenger_group' || type === 'department_chat') return true;
  if (entity === 'messenger_group' || entity === 'messenger_chat') return true;
  if (data.group_id || meta.group_id) return true;
  return false;
}

function isDeadline(type: string, entity: string): boolean {
  return (
    type === 'deadline_overdue_local'
    || entity === 'deadline_tab'
    || type === 'crm_deadline_overdue'
    || type === 'crm_kanban_deadline_overdue'
    || type === 'crm_deadline_reminder'
    || type === 'crm_deadline_set'
    || type === 'ai_crm_deadline_digest'
    || type.includes('deadline')
  );
}

function isComment(type: string, meta: Record<string, unknown>): boolean {
  if (type === 'comment_added') return true;
  if (String(meta.nav_tab || '').toLowerCase() === 'comments') return true;
  if (meta.comment_id) return true;
  return false;
}

function resolveLeadKind(entity: string, type: string, meta: Record<string, unknown>): 'lead' | 'deal' {
  const metaType = String(meta.lead_type || '').toLowerCase();
  if (metaType === 'deal' || metaType === 'lead') return metaType;
  if (entity === 'crm_deal' || entity === 'deal' || type.includes('deal')) return 'deal';
  return 'lead';
}

function resolveLeadId(entity: string, type: string, data: NotificationNavPayload, meta: Record<string, unknown>): string {
  const fromMeta = str(meta.lead_id);
  if (fromMeta) return fromMeta;
  // entity_id của comment / assign / stage = lead/deal id
  if (
    entity === 'crm_lead'
    || entity === 'crm_deal'
    || entity === 'lead'
    || entity === 'deal'
    || entity === 'crm_task'
    || type === 'comment_added'
    || type.startsWith('lead_')
    || type.includes('deal')
    || type.includes('lead')
  ) {
    return str(data.entity_id);
  }
  return '';
}

function doNavigate(name: keyof RootStackParamList, params?: RootStackParamList[keyof RootStackParamList]): boolean {
  if (!navigationRef.isReady()) return false;
  // @ts-expect-error union params
  navigate(name, params);
  return true;
}

/**
 * Mở đúng màn hình theo payload.
 * Trả về true nếu đã điều hướng (hoặc đã xếp hàng chờ).
 */
export function openFromNotificationPayload(
  data: NotificationNavPayload | undefined | null,
  opts?: { allowPending?: boolean },
): boolean {
  if (!data || typeof data !== 'object') return false;
  const allowPending = opts?.allowPending !== false;
  const meta = parseNotificationMetadata(data);
  const type = str(data.type).toLowerCase();
  const entity = str(data.entity_type).toLowerCase();

  if (type === 'app_update' || entity === 'app_update') {
    requestOpenUpdateGate();
    return true;
  }

  // Cuộc gọi: IncomingCallBridge xử lý riêng — không điều hướng ở đây.
  if (type === 'incoming_call' || type === 'call_dismiss') {
    return false;
  }

  if (!navigationRef.isReady()) {
    if (allowPending) {
      void stashPendingNotificationNav(data);
    }
    return false;
  }

  if (isDeadline(type, entity)) {
    return doNavigate('Tabs', { screen: 'Deadline' });
  }

  if (isMessenger(type, entity, meta, data)) {
    const groupId = str(
      data.group_id,
      meta.group_id,
      meta.bubble_key,
      entity === 'messenger_group' || type === 'messenger_chat' || type === 'department_chat'
        ? data.entity_id
        : '',
    );
    const title = str(meta.group_name, data.group_name, meta.title, data.title, 'Tin nhắn');
    if (groupId) {
      return doNavigate('ChatDetail', { threadId: groupId, title });
    }
  }

  if (type === 'lead_chat') {
    const leadId = resolveLeadId(entity, type, data, meta) || str(data.entity_id);
    if (leadId) {
      return doNavigate('LeadDealDetail', {
        leadId,
        kind: resolveLeadKind(entity, type, meta),
        code: str(meta.lead_code) || undefined,
        title: str(meta.lead_title, meta.group_name) || undefined,
        initialTab: 'shared-workspace',
      });
    }
  }

  if (isComment(type, meta)) {
    const leadId = resolveLeadId(entity, type, data, meta);
    if (leadId) {
      return doNavigate('LeadDealDetail', {
        leadId,
        kind: resolveLeadKind(entity, type, meta),
        code: str(meta.lead_code) || undefined,
        title: str(meta.lead_title) || undefined,
        initialTab: 'comments',
        focusCommentId: str(meta.comment_id) || undefined,
      });
    }
  }

  const leadId = resolveLeadId(entity, type, data, meta);
  if (leadId) {
    const kind = resolveLeadKind(entity, type, meta);
    const navTab = str(meta.nav_tab).toLowerCase();
    const initialTab =
      navTab === 'comments'
      || navTab === 'tasks'
      || navTab === 'shared-workspace'
      || navTab === 'info'
      || navTab === 'documents'
      || navTab === 'drive'
      || navTab === 'members'
      || navTab === 'facebook'
      || navTab === 'zalo'
        ? navTab
        : navTab === 'chat'
          ? 'shared-workspace'
          : undefined;
    return doNavigate('LeadDealDetail', {
      leadId,
      kind,
      code: str(meta.lead_code) || undefined,
      title: str(meta.lead_title) || undefined,
      initialTab,
      focusCommentId: str(meta.comment_id) || undefined,
      focusAssignmentId: str(meta.assignment_id, meta.focus_assignment_id) || undefined,
      focusTaskId: str(meta.task_id, meta.focus_task_id) || undefined,
    });
  }

  if (entity === 'event' || type.includes('event')) {
    return doNavigate('Events');
  }

  // Fallback: mở hộp thư thông báo trong app
  return doNavigate('Notifications');
}

export async function stashPendingNotificationNav(data: NotificationNavPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ data, at: Date.now() }));
  } catch (e) {
    console.warn(LOG, 'stash pending', e);
  }
}

export async function consumePendingNotificationNav(): Promise<NotificationNavPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(PENDING_KEY);
    const parsed = JSON.parse(raw) as { data?: NotificationNavPayload; at?: number };
    // Bỏ qua pending quá cũ (> 10 phút)
    if (parsed.at && Date.now() - parsed.at > 10 * 60 * 1000) return null;
    return parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Gọi khi nav sẵn sàng + đã đăng nhập — mở thông báo cold-start còn treo. */
export async function flushPendingNotificationNav(): Promise<void> {
  if (!navigationRef.isReady()) return;
  const data = await consumePendingNotificationNav();
  if (!data) return;
  openFromNotificationPayload(data, { allowPending: false });
}
