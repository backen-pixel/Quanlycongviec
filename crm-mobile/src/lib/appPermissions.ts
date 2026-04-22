import { Alert, Linking, NativeModules, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';

/** ID 2 kênh thông báo Android */
export const NOTIF_CHANNEL_CHAT = 'crm_chat';
export const NOTIF_CHANNEL_SYSTEM = 'crm_system';

/**
 * Tạo notification channels Android + cài handler.
 * Gọi một lần khi app khởi động (appPermissions đã import ở App.tsx qua PermissionBootstrap).
 *
 * crm_chat   → IMPORTANCE_HIGH → Heads-up (nổi trên màn hình) + âm thanh + rung
 * crm_system → IMPORTANCE_DEFAULT → không Heads-up, chỉ icon thanh trạng thái
 */
export async function setupNotificationChannels(): Promise<void> {
  // Notification handler: chat có âm thanh, hệ thống không
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const channelId = notification.request.content.data?.channelId as string | undefined;
        const isChat = channelId === NOTIF_CHANNEL_CHAT;
        return {
          shouldShowAlert: true,
          shouldPlaySound: isChat,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    /* ignore (web / simulator) */
  }

  if (Platform.OS !== 'android') return;

  try {
    // Kênh tin nhắn chat — IMPORTANCE_HIGH → Heads-up Notification
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_CHAT, {
      name: 'Tin nhắn',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 200, 100, 200],
      enableLights: true,
      lightColor: '#0068FF',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      bypassDnd: false,
    });

    // Kênh thông báo hệ thống — IMPORTANCE_DEFAULT → không Heads-up
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_SYSTEM, {
      name: 'Thông báo hệ thống',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: undefined,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      showBadge: true,
    });
  } catch {
    /* ignore on older / web */
  }
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
 * Cấp tất cả quyền: in-app permissions song song, rồi TỰ ĐỘNG mở overlay settings nếu chưa cấp.
 * Không có Alert hay Dialog trung gian — seamless 1-tap.
 */
export async function grantAllPermissionsQuick(): Promise<void> {
  // Tất cả in-app permissions song song
  await Promise.allSettled([
    Audio.requestPermissionsAsync(),
    Notifications.requestPermissionsAsync(),
    ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => {}),
    ImagePicker.requestCameraPermissionsAsync().catch(() => {}),
  ]);

  // Overlay: không thể grant in-app, mở Settings luôn nếu chưa có
  if (Platform.OS === 'android') {
    const mod = NativeModules.FloatingBubbleOverlay as {
      canDrawOverlays?: () => Promise<boolean>;
      openOverlaySettings?: () => void;
    };
    try {
      const ok = await mod?.canDrawOverlays?.();
      if (ok === false) {
        // Chờ 600ms để OS permission dialogs đóng trước khi mở Settings
        await new Promise<void>((r) => setTimeout(r, 600));
        mod?.openOverlaySettings?.();
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Yêu cầu quyền tự động (không Alert trung gian):
 * - In-app permissions: request thẳng
 * - Overlay: nếu thiếu thì mở Settings luôn (được gọi bởi PermissionBootstrap)
 */
export async function silentlyRequestMissingPermissions(): Promise<AppPermissionGap[]> {
  const gaps = await getAppPermissionGaps();
  if (!gaps.length) return [];
  const nonOverlay = gaps.filter((g) => g !== 'overlay_android');
  if (nonOverlay.length) await requestAppPermissionsForGaps(nonOverlay);
  return await getAppPermissionGaps();
}

/**
 * @deprecated Dùng PermissionBootstrap / silentlyRequestMissingPermissions.
 */
export function promptAppPermissionsIfNeeded(): void {
  void (async () => {
    const gaps = await getAppPermissionGaps();
    if (!gaps.length) return;
    const onlyOverlay = gaps.length === 1 && gaps[0] === 'overlay_android';
    if (onlyOverlay) {
      // Chỉ còn thiếu overlay → không show Alert, mở Settings thẳng
      if (Platform.OS === 'android') {
        const mod = NativeModules.FloatingBubbleOverlay as { openOverlaySettings?: () => void };
        mod?.openOverlaySettings?.();
      }
      return;
    }
    Alert.alert(
      'Cấp quyền cho ứng dụng',
      `Một số quyền chưa được bật:\n\n• ${gapLabels(gaps)}\n\nNhấn «Cấp quyền» để bật ngay.`,
      [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Cấp quyền', onPress: () => void grantAllPermissionsQuick() },
      ],
    );
  })();
}
