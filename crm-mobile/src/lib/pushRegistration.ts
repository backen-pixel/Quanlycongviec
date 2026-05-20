import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { ensureAndroidPostNotificationsPermission } from './appPermissions';
import { getDeviceId } from './deviceHeartbeat';

const STORED_PUSH_TOKEN_KEY = 'crm_expo_push_token_v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getExpoProjectId(): Promise<string | undefined> {
  const c = Constants.expoConfig ?? Constants.manifest2?.extra?.expoClient;
  const id =
    (c as { extra?: { eas?: { projectId?: string } } })?.extra?.eas?.projectId
    ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!id) return undefined;
  // Bỏ qua placeholder để không gọi Expo API với UUID rác.
  if (/^REPLACE_WITH/i.test(id) || id.length < 16) return undefined;
  return id;
}

/**
 * Đăng ký Expo push token với backend — nhận TB khi app bị kill.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    if (Platform.OS === 'android') {
      const ok = await ensureAndroidPostNotificationsPermission();
      if (!ok) {
        console.warn('[pushRegistration] POST_NOTIFICATIONS permission denied');
        return;
      }
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('[pushRegistration] Notifications permission =', finalStatus);
      return;
    }

    const projectId = await getExpoProjectId();
    if (!projectId) {
      console.warn(
        '[pushRegistration] Bỏ qua đăng ký push: chưa cấu hình EAS projectId trong app.json (extra.eas.projectId). ' +
          'Push khi tắt app sẽ không hoạt động cho đến khi cấu hình xong — xem docs/PUSH_SETUP.md',
      );
      return;
    }
    let tokenRes;
    try {
      tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    } catch (err) {
      console.warn(
        '[pushRegistration] getExpoPushTokenAsync thất bại — kiểm tra google-services.json và EAS projectId.',
        err,
      );
      return;
    }
    const token = tokenRes?.data;
    if (!token || !token.startsWith('ExponentPushToken')) {
      console.warn('[pushRegistration] Token không hợp lệ:', token);
      return;
    }

    const deviceId = await getDeviceId();
    const body = {
      token,
      platform: 'expo',
      device_id: deviceId,
    };
    await api.post('/push/device-token', body);
    await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, token);
    if (__DEV__) console.log('[pushRegistration] Đã đăng ký', token.slice(0, 30) + '…');
  } catch (e) {
    console.warn('[pushRegistration]', e);
  }
}

/** Kết quả kiểm tra cấu hình push — dùng để hiển thị tình trạng ở MyDevicesScreen. */
export type PushSetupStatus = {
  notificationPermission: 'granted' | 'denied' | 'undetermined';
  hasProjectId: boolean;
  hasPushToken: boolean;
  hint?: string;
};

export async function getPushSetupStatus(): Promise<PushSetupStatus> {
  let perm: 'granted' | 'denied' | 'undetermined' = 'undetermined';
  try {
    const res = await Notifications.getPermissionsAsync();
    perm = (res.status as PushSetupStatus['notificationPermission']) || 'undetermined';
  } catch {
    /* ignore */
  }
  const projectId = await getExpoProjectId();
  const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  let hint: string | undefined;
  if (perm !== 'granted') {
    hint = 'Quyền thông báo chưa được cấp — vào «Thiết lập bong bóng» để cấp.';
  } else if (!projectId) {
    hint =
      'Chưa có EAS projectId trong app.json (extra.eas.projectId). Push khi tắt app sẽ không hoạt động — đọc docs/PUSH_SETUP.md.';
  } else if (!token) {
    hint = 'Chưa lấy được Expo Push Token — kiểm tra google-services.json và build lại APK.';
  }
  return {
    notificationPermission: perm,
    hasProjectId: !!projectId,
    hasPushToken: !!token,
    hint,
  };
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
    if (token) {
      await api.delete('/push/device-token', { data: { token } }).catch(() => {});
    }
    await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
