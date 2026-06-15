import { Alert, AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import { Audio } from 'expo-av';

export const VOICE_PERM_TITLE = 'Quyền ghi âm & cuộc gọi';

export const VOICE_PERM_MESSAGE_SYNC =
  'Ứng dụng cần:\n' +
  '• Micro — ghi thử hoặc ghi khi có cuộc gọi (nền).\n' +
  '• Trạng thái điện thoại — biết khi nào đang gọi.\n' +
  '• Nhật ký cuộc gọi — gắn số & hướng gọi khi upload (cùng API với web).\n' +
  '• Đọc file âm thanh — chọn file ghi sẵn trên máy.\n' +
  '• Thông báo — hiện dịch vụ nền (Android 13+).\n\n' +
  'Ghi âm “đầu dây” phụ thuộc máy; app dùng micro + đồng bộ lên server.';

function androidApi(): number {
  return Number(Platform.Version) || 0;
}

export function buildAndroidVoicePermissions(): Permission[] {
  const P = PermissionsAndroid.PERMISSIONS;
  const api = androidApi();
  const list: Permission[] = [P.RECORD_AUDIO, P.READ_PHONE_STATE, P.READ_CALL_LOG];
  if (api >= 33) {
    list.push(P.READ_MEDIA_AUDIO, P.POST_NOTIFICATIONS);
  } else {
    list.push(P.READ_EXTERNAL_STORAGE);
  }
  return list;
}

export async function requestVoicePermissionsQuick(): Promise<{ micGranted: boolean }> {
  try {
    if (Platform.OS === 'android') {
      const perms = buildAndroidVoicePermissions();
      if (perms.length) await PermissionsAndroid.requestMultiple(perms);
    }
    const r = await Audio.requestPermissionsAsync();
    const micGranted = r.status === 'granted';
    if (!micGranted) {
      Alert.alert('Micro chưa bật', 'Bật quyền micro trong Cài đặt ứng dụng để ghi âm.', [
        { text: 'Đóng', style: 'cancel' },
        { text: 'Mở cài đặt', onPress: () => void Linking.openSettings() },
      ]);
    }
    return { micGranted };
  } catch {
    Alert.alert('Không xin được quyền', 'Thử lại hoặc mở Cài đặt ứng dụng.', [
      { text: 'Đóng', style: 'cancel' },
      { text: 'Mở cài đặt', onPress: () => void Linking.openSettings() },
    ]);
    return { micGranted: false };
  }
}

export function showVoicePermissionDialogThenRequest(): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(VOICE_PERM_TITLE, VOICE_PERM_MESSAGE_SYNC, [
      {
        text: 'Cấp quyền',
        onPress: () => {
          void requestVoicePermissionsQuick().finally(() => resolve());
        },
      },
    ]);
  });
}

export async function getMicPermissionLabel(): Promise<string> {
  const { status } = await Audio.getPermissionsAsync();
  if (status === 'granted') return 'Micro: đã cấp';
  return 'Micro: chưa cấp';
}

export async function ensureMicOnlyAsync(): Promise<boolean> {
  const cur = await Audio.getPermissionsAsync();
  if (cur.status === 'granted') return true;
  const next = await Audio.requestPermissionsAsync();
  return next.status === 'granted';
}

export function onAppForeground(listener: () => void): () => void {
  const sub = AppState.addEventListener('change', (s: string) => {
    if (s === 'active') listener();
  });
  return () => sub.remove();
}
