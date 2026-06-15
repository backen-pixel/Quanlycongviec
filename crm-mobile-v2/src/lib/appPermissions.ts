import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { buildAndroidVoicePermissions, requestVoicePermissionsQuick } from './voicePermissions';

export const CRMV2_PERMISSION_ONBOARDING_DONE_KEY = '@crmv2_perm_onboarding_done';

export type AppPermissionKind =
  | 'microphone'
  | 'phoneState'
  | 'callLog'
  | 'readMediaAudio'
  | 'notifications';

export type AppPermissionItem = {
  kind: AppPermissionKind;
  label: string;
  description: string;
  granted: boolean;
};

export const APP_PERMISSION_CATALOG: Omit<AppPermissionItem, 'granted'>[] = [
  {
    kind: 'microphone',
    label: 'Micro',
    description: 'Ghi âm tư vấn và gửi lên CRM',
  },
  {
    kind: 'phoneState',
    label: 'Trạng thái cuộc gọi',
    description: 'Biết khi đang gọi để gắn metadata (Android)',
  },
  {
    kind: 'callLog',
    label: 'Nhật ký cuộc gọi',
    description: 'Gắn số & hướng gọi khi upload (Android)',
  },
  {
    kind: 'readMediaAudio',
    label: 'File âm thanh trên máy',
    description: 'Chọn file ghi sẵn từ máy (Android)',
  },
  {
    kind: 'notifications',
    label: 'Thông báo',
    description: 'Thông báo đồng bộ & dịch vụ nền (Android 13+)',
  },
];

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

  const P = PermissionsAndroid.PERMISSIONS;
  const api = Number(Platform.Version) || 0;

  if (kind === 'phoneState') return androidPermGranted(P.READ_PHONE_STATE);
  if (kind === 'callLog') return androidPermGranted(P.READ_CALL_LOG);
  if (kind === 'readMediaAudio') {
    if (Platform.OS !== 'android') return true;
    try {
      const lib = await MediaLibrary.getPermissionsAsync();
      if (lib.granted) return true;
    } catch {
      /* ignore */
    }
    if (api >= 33) return androidPermGranted(P.READ_MEDIA_AUDIO);
    return androidPermGranted(P.READ_EXTERNAL_STORAGE);
  }
  if (kind === 'notifications') {
    if (api >= 33) return androidPermGranted(P.POST_NOTIFICATIONS);
    return true;
  }
  return true;
}

export async function getAppPermissionStatus(): Promise<AppPermissionItem[]> {
  const results: AppPermissionItem[] = [];
  for (const item of APP_PERMISSION_CATALOG) {
    results.push({ ...item, granted: await checkKind(item.kind) });
  }
  return results;
}

export async function getAppPermissionGaps(): Promise<AppPermissionKind[]> {
  const status = await getAppPermissionStatus();
  return status.filter((s) => !s.granted).map((s) => s.kind);
}

export async function grantAllPermissionsQuick(): Promise<void> {
  await requestVoicePermissionsQuick();
  if (Platform.OS === 'android') {
    try {
      await MediaLibrary.requestPermissionsAsync();
    } catch {
      /* ignore */
    }
  }
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
