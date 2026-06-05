import { Alert, Linking, NativeModules, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

/** Lần đầu sau đăng nhập — hiện hộp cấp quyền đầy đủ */
export const CRM_PERMISSION_ONBOARDING_DONE_KEY = '@crm_perm_onboarding_v1';

export type AppPermissionGap =
  | 'microphone'
  | 'photos'
  | 'camera'
  | 'location'
  | 'notification'
  | 'fullScreenCall'
  | 'batteryOptimization'
  | 'systemOverlay';

const OverlayModule = NativeModules.FloatingBubbleOverlay as
  | { canDrawOverlays?: () => Promise<boolean>; openOverlaySettings?: () => void }
  | undefined;

const BatteryModule = NativeModules.CrmBatteryOptimization as
  | {
      isIgnoringBatteryOptimizations?: () => Promise<boolean>;
      requestIgnoreBatteryOptimizations?: () => void;
      canUseFullScreenIntent?: () => Promise<boolean>;
      openFullScreenIntentSettings?: () => void;
      openAppNotificationSettings?: () => void;
      openOemAutoStartSettings?: () => Promise<boolean>;
    }
  | undefined;

export async function getAppPermissionGaps(): Promise<AppPermissionGap[]> {
  const gaps: AppPermissionGap[] = [];
  const mic = await Audio.getPermissionsAsync();
  if (mic.status !== 'granted') gaps.push('microphone');

  try {
    const loc = await Location.getForegroundPermissionsAsync();
    if (loc.status !== 'granted') gaps.push('location');
  } catch {
    /* ignore */
  }

  try {
    const lib = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (lib.status !== 'granted') gaps.push('photos');
  } catch {
    /* ignore */
  }

  try {
    const cam = await ImagePicker.getCameraPermissionsAsync();
    if (cam.status !== 'granted') gaps.push('camera');
  } catch {
    /* ignore */
  }

  try {
    const notif = await Notifications.getPermissionsAsync();
    if (notif.status !== 'granted') gaps.push('notification');
  } catch {
    /* ignore */
  }

  if (Platform.OS === 'android' && BatteryModule?.canUseFullScreenIntent) {
    try {
      const ok = await BatteryModule.canUseFullScreenIntent();
      if (!ok) gaps.push('fullScreenCall');
    } catch {
      /* ignore */
    }
  }

  if (Platform.OS === 'android' && BatteryModule?.isIgnoringBatteryOptimizations) {
    try {
      const ok = await BatteryModule.isIgnoringBatteryOptimizations();
      if (!ok) gaps.push('batteryOptimization');
    } catch {
      /* ignore */
    }
  }

  if (Platform.OS === 'android' && OverlayModule?.canDrawOverlays) {
    try {
      const ok = await OverlayModule.canDrawOverlays();
      if (!ok) gaps.push('systemOverlay');
    } catch {
      /* ignore */
    }
  }

  return gaps;
}

function gapLabels(gaps: AppPermissionGap[]): string {
  const lines: string[] = [];
  if (gaps.includes('microphone')) lines.push('Micro — ghi âm và chat có âm thanh');
  if (gaps.includes('photos')) lines.push('Ảnh/thư viện — đính kèm trong chat');
  if (gaps.includes('camera')) lines.push('Camera — chụp ảnh trong chat');
  if (gaps.includes('location')) lines.push('Vị trí — ghi nhận nơi làm việc khi đăng nhập');
  return lines.join('\n• ');
}

export async function requestAppPermissionsForGaps(gaps: AppPermissionGap[]): Promise<void> {
  if (gaps.includes('microphone')) await Audio.requestPermissionsAsync();
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
  if (gaps.includes('location')) {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      /* ignore */
    }
  }
  if (gaps.includes('notification')) {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      /* ignore */
    }
  }
  if (gaps.includes('fullScreenCall') && Platform.OS === 'android') {
    try {
      BatteryModule?.openFullScreenIntentSettings?.();
    } catch {
      /* ignore */
    }
  }
  if (gaps.includes('batteryOptimization') && Platform.OS === 'android') {
    try {
      BatteryModule?.requestIgnoreBatteryOptimizations?.();
    } catch {
      /* ignore */
    }
  }
  // systemOverlay phải mở Settings — không có dialog hệ thống.
  if (gaps.includes('systemOverlay') && Platform.OS === 'android') {
    try { OverlayModule?.openOverlaySettings?.(); } catch { /* ignore */ }
  }
}

export async function grantAllPermissionsQuick(): Promise<void> {
  await Promise.allSettled([
    Audio.requestPermissionsAsync(),
    Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'undetermined' })),
    ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => {}),
    ImagePicker.requestCameraPermissionsAsync().catch(() => {}),
    Notifications.requestPermissionsAsync().catch(() => {}),
  ]);
  if (Platform.OS === 'android') {
    try {
      const fsOk = await BatteryModule?.canUseFullScreenIntent?.();
      if (fsOk === false) BatteryModule?.openFullScreenIntentSettings?.();
    } catch {
      /* ignore */
    }
    try {
      const batOk = await BatteryModule?.isIgnoringBatteryOptimizations?.();
      if (batOk === false) BatteryModule?.requestIgnoreBatteryOptimizations?.();
    } catch {
      /* ignore */
    }
  }
  // SYSTEM_ALERT_WINDOW: mở Settings nếu chưa có (Android hiển thị toggle, user tự bật).
  if (Platform.OS === 'android' && OverlayModule?.canDrawOverlays) {
    try {
      const ok = await OverlayModule.canDrawOverlays();
      if (!ok) OverlayModule.openOverlaySettings?.();
    } catch { /* ignore */ }
  }
}

export async function silentlyRequestMissingPermissions(): Promise<AppPermissionGap[]> {
  const gaps = await getAppPermissionGaps();
  if (!gaps.length) return [];
  await requestAppPermissionsForGaps(gaps);
  return await getAppPermissionGaps();
}

/**
 * @deprecated Dùng PermissionBootstrap / silentlyRequestMissingPermissions.
 */
export function promptAppPermissionsIfNeeded(): void {
  void (async () => {
    const gaps = await getAppPermissionGaps();
    if (!gaps.length) return;
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

/** Mở App Settings (dùng khi user từ chối permissions). */
export function openAppSettings(): void {
  void Linking.openSettings();
}

/** Mở cài đặt thông báo / full-screen cuộc gọi. */
export function openCallNotificationSettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    BatteryModule?.openFullScreenIntentSettings?.();
  } catch {
    openAppSettings();
  }
}

/** Mở cài đặt tắt tối ưu pin cho app. */
export function openBatteryOptimizationSettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    BatteryModule?.requestIgnoreBatteryOptimizations?.();
  } catch {
    openAppSettings();
  }
}

/** Mở cài đặt overlay Android (SYSTEM_ALERT_WINDOW). */
export function openOverlaySettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    OverlayModule?.openOverlaySettings?.();
  } catch {
    openAppSettings();
  }
}
