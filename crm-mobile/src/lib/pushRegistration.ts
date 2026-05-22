/**
 * Đăng ký push token mobile.
 *
 * Hỗ trợ song song 2 nhánh:
 *  - **Expo Push** (`platform: 'expo'`) — hiển thị notification status-bar
 *    cho cả app trạng thái killed (Expo dùng FCM bên dưới trên Android).
 *  - **FCM token native** (`platform: 'fcm'`) — dùng cho data-only push
 *    wake `OverlayBubbleService` (xem `BubbleFcmService.kt`). Token được
 *    `FloatingBubbleModule.consumeFcmToken()` đẩy lên khi service nhận.
 *
 * Token được upsert vào backend `POST /api/push/device-token`.
 */
import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import Constants from 'expo-constants';

const EXPO_TOKEN_KEY = 'crm_expo_push_token_v1';
const FCM_TOKEN_KEY = 'crm_fcm_push_token_v1';

type FloatingBubbleOverlayModule = {
  consumeFcmToken?: () => Promise<string | null>;
};

const Overlay = NativeModules.FloatingBubbleOverlay as FloatingBubbleOverlayModule | undefined;

function getProjectId(): string | null {
  const fromExpo = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  if (fromExpo && fromExpo !== 'REPLACE_WITH_EAS_PROJECT_ID') return fromExpo;
  const fromManifest = (Constants?.easConfig as { projectId?: string } | undefined)?.projectId;
  return fromManifest || null;
}

async function ensurePermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

async function postDeviceToken(token: string, platform: 'expo' | 'fcm'): Promise<void> {
  try {
    await api.post('/push/device-token', { token, platform });
  } catch {
    /* offline / 401 → sẽ thử lại lần sau */
  }
}

/**
 * Gọi sau login + bootstrap. Idempotent — token cũ không gửi lại.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) return;

  // 1) Expo push token (notification hiển thị)
  try {
    const granted = await ensurePermission();
    if (granted) {
      const projectId = getProjectId();
      const tokenRes = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoToken = tokenRes?.data;
      if (expoToken) {
        const prev = await AsyncStorage.getItem(EXPO_TOKEN_KEY);
        if (prev !== expoToken) {
          await AsyncStorage.setItem(EXPO_TOKEN_KEY, expoToken);
          await postDeviceToken(expoToken, 'expo');
        } else {
          // Vẫn ping nhẹ để backend cập nhật last_seen_at (mỗi 24h là đủ)
          await postDeviceToken(expoToken, 'expo');
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 2) FCM native token (cho BubbleFcmService wake overlay)
  try {
    const fcmToken = await Overlay?.consumeFcmToken?.();
    if (fcmToken) {
      const prev = await AsyncStorage.getItem(FCM_TOKEN_KEY);
      if (prev !== fcmToken) {
        await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
        await postDeviceToken(fcmToken, 'fcm');
      } else {
        await postDeviceToken(fcmToken, 'fcm');
      }
    }
  } catch {
    /* ignore */
  }
}

export type PushSetupStatus = {
  notificationPermission: 'granted' | 'denied' | 'undetermined';
  hasProjectId: boolean;
  hasPushToken: boolean;
  hasFcmToken: boolean;
  hint?: string;
};

export async function getPushSetupStatus(): Promise<PushSetupStatus> {
  let perm: 'granted' | 'denied' | 'undetermined' = 'undetermined';
  try {
    const r = await Notifications.getPermissionsAsync();
    if (r.status === 'granted') perm = 'granted';
    else if (r.status === 'denied') perm = 'denied';
  } catch {
    /* */
  }
  const expoToken = await AsyncStorage.getItem(EXPO_TOKEN_KEY);
  const fcmToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
  const hasProject = !!getProjectId();
  let hint: string | undefined;
  if (perm !== 'granted') hint = 'Chưa cấp quyền thông báo';
  else if (!hasProject) hint = 'Thiếu EAS projectId trong app.json';
  else if (!expoToken && !fcmToken) hint = 'Chưa đăng ký token';
  return {
    notificationPermission: perm,
    hasProjectId: hasProject,
    hasPushToken: !!expoToken,
    hasFcmToken: !!fcmToken,
    hint,
  };
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const expoToken = await AsyncStorage.getItem(EXPO_TOKEN_KEY);
    if (expoToken) await api.delete('/push/device-token', { data: { token: expoToken } });
    await AsyncStorage.removeItem(EXPO_TOKEN_KEY);
  } catch {
    /* */
  }
  try {
    const fcmToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (fcmToken) await api.delete('/push/device-token', { data: { token: fcmToken } });
    await AsyncStorage.removeItem(FCM_TOKEN_KEY);
  } catch {
    /* */
  }
}
