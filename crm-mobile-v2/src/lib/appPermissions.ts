import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { canDrawOverlays } from './floatingBubbleOverlay';
import { registerPushTokenV2 } from './pushNotifications';

export const CRMV2_PERMISSION_ONBOARDING_DONE_KEY = '@crmv2_perm_onboarding_done';

/**
 * Quyền hiện trên modal lần đầu đăng nhập.
 * Micro / overlay xin khi dùng tính năng (tab Ghi âm / bong bóng chat).
 */
export type AppPermissionKind = 'notifications' | 'microphone' | 'overlay';

export type AppPermissionItem = {
  kind: AppPermissionKind;
  label: string;
  description: string;
  granted: boolean;
};

/** Chỉ thông báo là bắt buộc để đóng modal sau khi cấp; còn lại tùy chọn. */
const OPTIONAL_PERMISSION_KINDS = new Set<AppPermissionKind>(['microphone', 'overlay']);

export { OPTIONAL_PERMISSION_KINDS };

export const APP_PERMISSION_CATALOG: Omit<AppPermissionItem, 'granted'>[] = [
  {
    kind: 'notifications',
    label: 'Thông báo',
    description: 'Nhận tin nhắn, nhắc việc CRM (Android 13+)',
  },
  {
    kind: 'microphone',
    label: 'Micro',
    description: 'Ghi âm tư vấn / tin nhắn thoại — có thể cấp sau ở tab Ghi âm',
  },
  {
    kind: 'overlay',
    label: 'Hiển thị trên app khác',
    description: 'Bong bóng chat nổi — cấp khi bạn bật tính năng này',
  },
];

/** Modal lần đầu: thông báo + micro ghi âm. Overlay xin khi bật bong bóng chat. */
export const INTRO_PERMISSION_CATALOG = APP_PERMISSION_CATALOG.filter(
  (c) => c.kind === 'notifications' || c.kind === 'microphone',
);

async function androidPermGranted(perm: string): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await PermissionsAndroid.check(perm as never);
  } catch {
    return false;
  }
}

async function checkKind(kind: AppPermissionKind): Promise<boolean> {
  if (kind === 'microphone') {
    const mic = await Audio.getPermissionsAsync();
    return mic.status === 'granted';
  }
  if (Platform.OS !== 'android') return true;

  const api = Number(Platform.Version) || 0;
  if (kind === 'notifications') {
    if (api >= 33) return androidPermGranted(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return true;
  }
  if (kind === 'overlay') return canDrawOverlays();
  return true;
}

export async function getAppPermissionStatus(
  kinds: AppPermissionKind[] = APP_PERMISSION_CATALOG.map((c) => c.kind),
): Promise<AppPermissionItem[]> {
  const catalog = APP_PERMISSION_CATALOG.filter((c) => kinds.includes(c.kind));
  return Promise.all(
    catalog.map(async (item) => ({ ...item, granted: await checkKind(item.kind) })),
  );
}

export async function getAppPermissionGaps(): Promise<AppPermissionKind[]> {
  const status = await getAppPermissionStatus();
  return status.filter((s) => !s.granted).map((s) => s.kind);
}

/** Xin quyền tối thiểu khi mở app: thông báo + micro ghi âm. */
export async function grantEssentialPermissionsQuick(): Promise<void> {
  if (Platform.OS === 'android') {
    const api = Number(Platform.Version) || 0;
    const list: string[] = [];
    if (api >= 33) list.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    list.push(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    try {
      await PermissionsAndroid.requestMultiple(list as never);
    } catch {
      /* ignore */
    }
  } else {
    try {
      await Audio.requestPermissionsAsync();
    } catch {
      /* ignore */
    }
  }
  // Đăng ký token nền — không chặn đóng modal.
  void registerPushTokenV2();
}

/** @deprecated dùng grantEssentialPermissionsQuick — giữ alias để chỗ cũ không gãy. */
export async function grantAllPermissionsQuick(): Promise<void> {
  await grantEssentialPermissionsQuick();
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
