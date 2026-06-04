/**
 * Setup các Notification Channel cho Android (gọi 1 lần khi app khởi động).
 *
 * Channel ID phải KHỚP backend [pushSender.js](backend/src/services/pushSender.js):
 *   - crm_chat         : channel cho tin chat (IMPORTANCE_HIGH, heads-up, vibrate, sound)
 *   - crm_system_tray_v3 : channel cho thông báo hệ thống (IMPORTANCE_DEFAULT)
 *   - crm_bubble_wake  : channel im lặng cho data-only push wake bubble (IMPORTANCE_LOW)
 *
 * iOS không cần channel — chỉ Android (API 26+).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let initialized = false;

export const CRM_NOTIF_CHANNELS = {
  chat: 'crm_chat',
  system: 'crm_system_tray_v3',
  bubbleWake: 'crm_bubble_wake',
  call: 'crm_call',
} as const;

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (initialized) return;
  initialized = true;
  try {
    await Notifications.setNotificationChannelAsync(CRM_NOTIF_CHANNELS.chat, {
      name: 'Tin nhắn',
      description: 'Thông báo tin nhắn chat và bong bóng',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#0068FF',
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync(CRM_NOTIF_CHANNELS.system, {
      name: 'Hệ thống',
      description: 'Cập nhật, công việc, sự kiện hệ thống',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync(CRM_NOTIF_CHANNELS.bubbleWake, {
      name: 'Bong bóng (im lặng)',
      description: 'Đánh thức bong bóng chat khi có tin mới — không hiển thị',
      importance: Notifications.AndroidImportance.LOW,
      enableLights: false,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
      showBadge: false,
    });
    await Notifications.setNotificationChannelAsync(CRM_NOTIF_CHANNELS.call, {
      name: 'Cuộc gọi',
      description: 'Thông báo cuộc gọi đến từ Messenger CRM',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: '#0068FF',
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      showBadge: true,
      bypassDnd: true,
    });
  } catch {
    /* ignore — re-tries không cần */
  }
}
