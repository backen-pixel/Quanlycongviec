import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  isWorkshopDealNotification,
  type SxCommentNotification,
} from './notificationApi';
import { SX_NOTIF_CHANNEL, SX_SYSTEM_CHANNEL } from './notificationChannels';

function channelFor(n: SxCommentNotification): string {
  if (isWorkshopDealNotification(n)) return SX_SYSTEM_CHANNEL;
  const t = String(n.type || '');
  if (
    t.startsWith('crm_assignment')
    || t.startsWith('crm_task')
    || t === 'crm_task_assigned'
    || t === 'crm_task_completed'
  ) {
    return SX_SYSTEM_CHANNEL;
  }
  return SX_NOTIF_CHANNEL;
}

/** Hiện trên thanh thông báo hệ thống (kể cả khi app đang mở). */
export async function showLocalCommentNotification(n: SxCommentNotification): Promise<void> {
  try {
    const body =
      n.metadata?.comment_preview?.trim() ||
      n.message?.trim() ||
      'Có thông báo mới';
    const meta = (n.metadata || {}) as Record<string, unknown>;
    const pid = meta.project_id != null ? String(meta.project_id) : n.entity_id ? String(n.entity_id) : '';
    const commentId = meta.comment_id != null ? String(meta.comment_id) : '';
    // Identifier ổn định theo dự án/comment — tránh 2 tiếng khi socket + notification cùng lúc.
    const identifier = commentId && pid
      ? `sx-cmt:${pid}:${commentId}`
      : pid && n.type === 'comment_added'
        ? `sx-cmt:${pid}:${String(n.created_at || '').slice(0, 19)}`
        : (String(n.id || '').trim() || undefined);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: n.title || 'Thông báo',
        body,
        sound: 'default',
        data: {
          type: n.type,
          entity_type: n.entity_type,
          entity_id: n.entity_id,
          metadata: n.metadata,
          notifId: n.id,
        },
        ...(Platform.OS === 'android' ? { channelId: channelFor(n) } : {}),
      },
      trigger: null,
    });
  } catch {
    /* ignore — quyền hoặc channel chưa sẵn sàng */
  }
}
