import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SxCommentNotification } from './notificationApi';
import { VC_NOTIF_CHANNEL } from './notificationChannels';

export async function showLocalCommentNotification(n: SxCommentNotification): Promise<void> {
  try {
    const body =
      n.metadata?.comment_preview?.trim() ||
      n.message?.trim() ||
      'Có bình luận mới';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: n.title || 'Bình luận mới',
        body,
        sound: 'default',
        data: {
          type: n.type,
          entity_type: n.entity_type,
          entity_id: n.entity_id,
          metadata: n.metadata,
        },
        ...(Platform.OS === 'android' ? { channelId: VC_NOTIF_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch {
    /* ignore — quyền hoặc channel chưa sẵn sàng */
  }
}
