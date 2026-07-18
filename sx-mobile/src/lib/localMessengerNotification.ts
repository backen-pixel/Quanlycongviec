import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { SX_CHAT_CHANNEL } from './notificationChannels';

export type MessengerNotifPayload = {
  groupId: string;
  title: string;
  senderName: string;
  message: string;
  messageId?: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
};

export async function showLocalMessengerNotification(p: MessengerNotifPayload): Promise<void> {
  try {
    const body = p.message?.trim() || 'Có tin nhắn mới';
    const title = p.senderName ? `${p.title} · ${p.senderName}` : p.title || 'Tin nhắn mới';
    const identifier = p.messageId
      ? `msg:${p.messageId}`
      : `msg:${p.groupId}:${String(body).slice(0, 40)}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: 'default',
        data: {
          type: 'messenger_chat',
          entity_type: 'messenger_group',
          entity_id: p.groupId,
          group_id: p.groupId,
          group_name: p.title,
          sender_name: p.senderName,
          message_id: p.messageId || '',
        },
        ...(Platform.OS === 'android' ? { channelId: SX_CHAT_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch {
    /* quyền hoặc channel chưa sẵn sàng */
  }
}
