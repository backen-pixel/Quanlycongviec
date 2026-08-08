import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const VC_NOTIF_CHANNEL = 'vc_comments';
/** Khớp backend pushSender CHANNEL_CHAT — FCM hiển thị đúng kênh tin nhắn */
export const VC_CHAT_CHANNEL = 'crm_chat';
/** Khớp backend pushSender CHANNEL_CALL — cuộc gọi đến */
export const VC_CALL_CHANNEL = 'crm_call';
/** Khớp backend pushSender CHANNEL_SYSTEM — tray hệ thống (không phải SX) */
export const VC_SYSTEM_CHANNEL = 'crm_system_tray_v3';

export const VC_NOTIF_CHANNELS = {
  comments: VC_NOTIF_CHANNEL,
  chat: VC_CHAT_CHANNEL,
  call: VC_CALL_CHANNEL,
  system: VC_SYSTEM_CHANNEL,
} as const;

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(VC_NOTIF_CHANNEL, {
    name: 'Bình luận Lắp đặt',
    description: 'Thông báo khi có bình luận mới trên dự án vận chuyển lắp đặt',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#EA580C',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(VC_CHAT_CHANNEL, {
    name: 'Tin nhắn Messenger',
    description: 'Thông báo khi có tin nhắn mới trong nhóm chat',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#6C5CE7',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(VC_CALL_CHANNEL, {
    name: 'Cuộc gọi đến',
    description: 'Thông báo khi có cuộc gọi Messenger',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 200, 600],
    lightColor: '#EA580C',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync(VC_SYSTEM_CHANNEL, {
    name: 'Thông báo hệ thống',
    description: 'Thông báo chung từ hệ thống Lắp đặt',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: '#EA580C',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}
