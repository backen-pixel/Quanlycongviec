import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api/client';

const EXPO_TOKEN_KEY = 'sx_expo_push_token_v1';
const FCM_TOKEN_KEY = 'sx_fcm_push_token_v1';

function getProjectId(): string | null {
  const fromExpo = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  if (fromExpo && fromExpo !== 'REPLACE_WITH_EAS_PROJECT_ID') return fromExpo;
  const fromManifest = (Constants?.easConfig as { projectId?: string } | undefined)?.projectId;
  return fromManifest || null;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return req.status === 'granted';
  } catch {
    return false;
  }
}

async function postDeviceToken(token: string, platform: 'expo' | 'fcm'): Promise<void> {
  await api.post('/push/device-token', { token, platform });
}

/** FCM native — hiển thị notification trên thanh hệ thống khi app nền/kill (không cần EAS projectId). */
export async function registerFcmTokenOnly(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  try {
    let fcmToken: string | null = null;
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      fcmToken = typeof device?.data === 'string' ? device.data : null;
    } catch {
      /* ignore */
    }
    if (!fcmToken) return false;
    const prev = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (prev !== fcmToken) await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
    await postDeviceToken(fcmToken, 'fcm');
    return true;
  } catch (e) {
    console.warn('[sx pushRegistration] FCM', e);
    return false;
  }
}

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const granted = await ensureNotificationPermission();
  await registerFcmTokenOnly();
  if (!granted) return;
  try {
    const projectId = getProjectId();
    const tokenRes = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const expoToken = tokenRes?.data;
    if (!expoToken) return;
    const prev = await AsyncStorage.getItem(EXPO_TOKEN_KEY);
    if (prev !== expoToken) await AsyncStorage.setItem(EXPO_TOKEN_KEY, expoToken);
    await postDeviceToken(expoToken, 'expo');
  } catch (e) {
    console.warn('[sx pushRegistration] Expo', e);
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const expoToken = await AsyncStorage.getItem(EXPO_TOKEN_KEY);
    if (expoToken) await api.delete('/push/device-token', { data: { token: expoToken } });
    const fcmToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (fcmToken) await api.delete('/push/device-token', { data: { token: fcmToken } });
    await AsyncStorage.multiRemove([EXPO_TOKEN_KEY, FCM_TOKEN_KEY]);
  } catch {
    /* ignore */
  }
}

export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const r = await Notifications.getPermissionsAsync();
    if (r.status === 'granted') return 'granted';
    if (r.status === 'denied') return 'denied';
  } catch {
    /* */
  }
  return 'undetermined';
}
