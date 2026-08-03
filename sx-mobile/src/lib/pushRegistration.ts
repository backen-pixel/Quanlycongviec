import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';
import { api } from '../api/client';
import { APP_KEY } from './appUpdate';

const EXPO_TOKEN_KEY = 'sx_expo_push_token_v1';
const FCM_TOKEN_KEY = 'sx_fcm_push_token_v1';

function getProjectId(): string | null {
  const fromExpo = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  if (fromExpo && fromExpo !== 'REPLACE_WITH_EAS_PROJECT_ID') return fromExpo;
  const fromManifest = (Constants?.easConfig as { projectId?: string } | undefined)?.projectId;
  return fromManifest || null;
}

/**
 * Emulator iOS không có push; Android emulator/LDPlayer thường có GMS
 * và vẫn đăng ký FCM được — không chặn bằng Device.isDevice trên Android.
 */
function canRegisterPush(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') return true;
  return Device.isDevice;
}

async function requestAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (apiLevel < 33) return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!canRegisterPush()) return false;
  try {
    await requestAndroidPostNotifications();
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return req.status === 'granted';
  } catch (e) {
    console.warn('[sx pushRegistration] permission', e);
    return false;
  }
}

async function postDeviceToken(token: string, platform: 'expo' | 'fcm'): Promise<void> {
  await api.post('/push/device-token', { token, platform, app_key: APP_KEY });
}

/** FCM native — hiển thị notification trên thanh hệ thống khi app nền/kill (không cần EAS projectId). */
export async function registerFcmTokenOnly(): Promise<boolean> {
  if (!canRegisterPush()) return false;
  try {
    let fcmToken: string | null = null;
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      fcmToken = typeof device?.data === 'string' ? device.data : null;
    } catch (e) {
      console.warn('[sx pushRegistration] getDevicePushTokenAsync', e);
    }
    if (!fcmToken) {
      console.warn('[sx pushRegistration] no FCM token (thiếu GMS hoặc google-services?)');
      return false;
    }
    const prev = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (prev !== fcmToken) await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
    await postDeviceToken(fcmToken, 'fcm');
    console.log('[sx pushRegistration] FCM registered');
    return true;
  } catch (e) {
    console.warn('[sx pushRegistration] FCM', e);
    return false;
  }
}

export async function registerPushToken(): Promise<void> {
  if (!canRegisterPush()) {
    console.log('[sx pushRegistration] skip: không hỗ trợ thiết bị này');
    return;
  }
  const granted = await ensureNotificationPermission();
  if (!granted) {
    console.warn('[sx pushRegistration] quyền thông báo chưa được cấp — tray hệ thống sẽ không hiện');
  }
  // FCM là kênh chính cho tray hệ thống (không cần EAS projectId).
  await registerFcmTokenOnly();
  if (!granted) return;
  const projectId = getProjectId();
  if (!projectId) {
    // app.json còn placeholder REPLACE_WITH_EAS_PROJECT_ID → bỏ Expo push (tránh spam lỗi 400).
    return;
  }
  try {
    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenRes?.data;
    if (!expoToken) return;
    const prev = await AsyncStorage.getItem(EXPO_TOKEN_KEY);
    if (prev !== expoToken) await AsyncStorage.setItem(EXPO_TOKEN_KEY, expoToken);
    await postDeviceToken(expoToken, 'expo');
    console.log('[sx pushRegistration] Expo token registered');
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
