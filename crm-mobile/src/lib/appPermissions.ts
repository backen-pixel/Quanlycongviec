import { Alert, Linking, NativeModules, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';

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

/** Lần đầu sau đăng nhập — hiện hộp cấp quyền đầy đủ */
export const CRM_PERMISSION_ONBOARDING_DONE_KEY = '@crm_perm_onboarding_v1';

export type AppPermissionGap =
  | 'microphone'
  | 'notifications'
  | 'photos'
  | 'camera'
  | 'overlay_android';

export async function getAppPermissionGaps(): Promise<AppPermissionGap[]> {
  const gaps: AppPermissionGap[] = [];
  const mic = await Audio.getPermissionsAsync();
  if (mic.status !== 'granted') gaps.push('microphone');
  const n = await Notifications.getPermissionsAsync();
  if (n.status !== 'granted') gaps.push('notifications');

  try {
    const lib = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (lib.status !== 'granted') gaps.push('photos');
  } catch {
    /* expo-web / simulator */
  }

  try {
    const cam = await ImagePicker.getCameraPermissionsAsync();
    if (cam.status !== 'granted') gaps.push('camera');
  } catch {
    /* ignore */
  }

  if (Platform.OS === 'android') {
    const mod = NativeModules.FloatingBubbleOverlay as
      | { canDrawOverlays?: () => Promise<boolean> }
      | undefined;
    try {
      const ok = await mod?.canDrawOverlays?.();
      if (ok === false) gaps.push('overlay_android');
    } catch {
      /* native module không có */
    }
  }

  return gaps;
}

function gapLabels(gaps: AppPermissionGap[]): string {
  const lines: string[] = [];
  if (gaps.includes('microphone')) lines.push('Micro — ghi âm và chat có âm thanh');
  if (gaps.includes('notifications')) lines.push('Thông báo — tin CRM / Messenger trên máy');
  if (gaps.includes('photos')) lines.push('Ảnh/thư viện — đính kèm trong chat');
  if (gaps.includes('camera')) lines.push('Camera — chụp ảnh trong chat');
  if (gaps.includes('overlay_android'))
    lines.push('Hiển thị trên app khác — bong bóng Messenger (Android)');
  return lines.join('\n• ');
}

export async function requestAppPermissionsForGaps(gaps: AppPermissionGap[]): Promise<void> {
  if (gaps.includes('microphone')) await Audio.requestPermissionsAsync();
  if (gaps.includes('notifications')) await Notifications.requestPermissionsAsync();
  if (gaps.includes('photos')) {
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    } catch {
      /* ignore */
    }
  }
  if (gaps.includes('camera')) {
    try {
      await ImagePicker.requestCameraPermissionsAsync();
    } catch {
      /* ignore */
    }
  }
  if (gaps.includes('overlay_android') && Platform.OS === 'android') {
    const mod = NativeModules.FloatingBubbleOverlay as { openOverlaySettings?: () => void } | undefined;
    mod?.openOverlaySettings?.();
  }
}

/**
 * Gọi tuần tự (không hộp thoại xen giữa) — nút «Cấp nhanh tất cả» sau đăng nhập.
 */
export async function grantAllPermissionsQuick(): Promise<void> {
  await Audio.requestPermissionsAsync();
  await Notifications.requestPermissionsAsync();
  try {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  } catch {
    /* ignore */
  }
  try {
    await ImagePicker.requestCameraPermissionsAsync();
  } catch {
    /* ignore */
  }
  if (Platform.OS === 'android') {
    const mod = NativeModules.FloatingBubbleOverlay as {
      canDrawOverlays?: () => Promise<boolean>;
      openOverlaySettings?: () => void;
    };
    try {
      const ok = await mod?.canDrawOverlays?.();
      if (ok === false) mod?.openOverlaySettings?.();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Mỗi lần gọi: nếu thiếu quyền thì hiện một hộp thoại (có thể gắn AppState / sau đăng nhập).
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
                'Có thể bạn đã từ chối vĩnh viễn. Mở Cài đặt ứng dụng để bật đầy đủ (micro, thông báo, ảnh, overlay…).',
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
