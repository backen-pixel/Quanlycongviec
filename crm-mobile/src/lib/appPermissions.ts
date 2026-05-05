import { Alert, Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';

/** ID kênh Android — đổi hậu tố khi cần ép tạo lại kênh (Android không cho sửa importance sau khi tạo). */
export const NOTIF_CHANNEL_CHAT = 'crm_chat';
/** Kênh CRM (không chat) — đổi id khi đổi âm/rung mặc định (Android cache kênh cũ). */
export const NOTIF_CHANNEL_SYSTEM = 'crm_system_tray_v3';

/**
 * Android 13+ (API 33): quyền POST_NOTIFICATIONS — bắt buộc để hiện thông báo trên thanh / khay.
 * Expo `requestPermissionsAsync` đôi khi chưa đủ; gọi thêm API hệ thống để chắc chắn.
 */
export async function ensureAndroidPostNotificationsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted) return true;
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Tạo notification channels Android + cài handler.
 * Gọi một lần khi app khởi động (appPermissions đã import ở App.tsx qua PermissionBootstrap).
 *
 * crm_chat → IMPORTANCE_HIGH — tin nhắn (âm + rung)
 * crm_system_tray_v3 → HIGH + âm mặc định + rung — CRM (khay / khóa / nền)
 */
export async function setupNotificationChannels(): Promise<void> {
  // Foreground: chat có âm; kênh hệ thống hầu như không play sound (tùy OEM)
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const channelId = notification.request.content.data?.channelId as string | undefined;
        const isOurChannel =
          channelId === NOTIF_CHANNEL_CHAT || channelId === NOTIF_CHANNEL_SYSTEM;
        return {
          shouldShowAlert: true,
          // Cả chat + CRM hệ thống: có âm/rung khi TB tới (app foreground — Expo điều khiển hiển thị)
          shouldPlaySound: isOurChannel,
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

    // Kênh CRM không phải chat — HIGH + PUBLIC để hiện trên khay kéo và màn hình khóa (Settings user vẫn có thể ẩn)
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_SYSTEM, {
      name: 'Thông báo CRM',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 120, 80, 120],
      enableLights: true,
      lightColor: '#0068FF',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      bypassDnd: false,
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
  let needNotifications = n.status !== 'granted';
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const postOk = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (!postOk) needNotifications = true;
    } catch {
      /* ignore */
    }
  }
  if (needNotifications) gaps.push('notifications');

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
  if (gaps.includes('notifications')) {
    await Notifications.requestPermissionsAsync();
    if (Platform.OS === 'android') await ensureAndroidPostNotificationsPermission();
  }
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
  if (Platform.OS === 'android') await ensureAndroidPostNotificationsPermission();

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
