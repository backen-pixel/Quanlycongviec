import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SX_NOTIF_CHANNEL = 'sx_comments';

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
}
