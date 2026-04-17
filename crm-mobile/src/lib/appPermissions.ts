import { Alert, Linking } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  /* ignore (web / older) */
}

export type AppPermissionGap = 'microphone' | 'notifications';

export async function getAppPermissionGaps(): Promise<AppPermissionGap[]> {
  const gaps: AppPermissionGap[] = [];
  const mic = await Audio.getPermissionsAsync();
  if (mic.status !== 'granted') gaps.push('microphone');
  const n = await Notifications.getPermissionsAsync();
  if (n.status !== 'granted') gaps.push('notifications');
  return gaps;
}

function gapLabels(gaps: AppPermissionGap[]): string {
  const lines: string[] = [];
  if (gaps.includes('microphone')) lines.push('Micro — ghi âm và gửi file âm thanh trong chat');
  if (gaps.includes('notifications')) lines.push('Thông báo — hiển thị tin CRM / Messenger trên thanh trạng thái');
  return lines.join('\n• ');
}

export async function requestAppPermissionsForGaps(gaps: AppPermissionGap[]): Promise<void> {
  if (gaps.includes('microphone')) await Audio.requestPermissionsAsync();
  if (gaps.includes('notifications')) await Notifications.requestPermissionsAsync();
}

/**
 * Mỗi lần gọi: nếu thiếu micro hoặc thông báo thì hiện một hộp thoại (có thể gắn AppState / sau đăng nhập).
 */
export function promptAppPermissionsIfNeeded(): void {
  void (async () => {
    const gaps = await getAppPermissionGaps();
    if (!gaps.length) return;
    Alert.alert(
      'Cấp quyền cho ứng dụng',
      `Một số quyền chưa được bật:\n\n• ${gapLabels(gaps)}\n\nBạn có muốn mở hộp thoại hệ thống để cấp quyền ngay?`,
      [
        { text: 'Để sau', style: 'cancel' },
        {
          text: 'Cấp quyền',
          onPress: async () => {
            await requestAppPermissionsForGaps(gaps);
            const still = await getAppPermissionGaps();
            if (still.length) {
              Alert.alert(
                'Vẫn thiếu quyền',
                'Có thể bạn đã từ chối vĩnh viễn. Mở Cài đặt ứng dụng để bật micro và thông báo.',
                [
                  { text: 'Đóng', style: 'cancel' },
                  { text: 'Mở cài đặt', onPress: () => void Linking.openSettings() },
                ],
              );
            }
          },
        },
      ],
    );
  })();
}
