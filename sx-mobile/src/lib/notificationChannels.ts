import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SX_NOTIF_CHANNEL = 'sx_comments';
/** Khớp backend pushSender CHANNEL_CHAT — FCM hiển thị đúng kênh tin nhắn */
export const SX_CHAT_CHANNEL = 'crm_chat';
/** Khớp backend pushSender CHANNEL_CALL — cuộc gọi đến */
export const SX_CALL_CHANNEL = 'crm_call';
/** Khớp backend pushSender CHANNEL_SYSTEM — deal / giao việc / thông báo chung */
export const SX_SYSTEM_CHANNEL = 'crm_system_tray_v3';

export const SX_NOTIF_CHANNELS = {
  comments: SX_NOTIF_CHANNEL,
  chat: SX_CHAT_CHANNEL,
  call: SX_CALL_CHANNEL,
  system: SX_SYSTEM_CHANNEL,
} as const;

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SX_NOTIF_CHANNEL, {
    name: 'Bình luận xưởng SX',
    description: 'Thông báo khi có bình luận mới trên dự án sản xuất',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(SX_CHAT_CHANNEL, {
    name: 'Tin nhắn Messenger',
    description: 'Thông báo khi có tin nhắn mới trong nhóm chat',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#6C5CE7',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(SX_CALL_CHANNEL, {
    name: 'Cuộc gọi đến',
    description: 'Thông báo khi có cuộc gọi Messenger',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 200, 600],
    lightColor: '#2563EB',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync(SX_SYSTEM_CHANNEL, {
    name: 'Thông báo hệ thống SX',
    description: 'Deal xưởng, giao việc và thông báo chung',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0EA5E9',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}
