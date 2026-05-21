/**
 * Đăng ký push device token với backend.
 *
 * Hai kênh song song:
 *  1) Expo Push token  → POST /push/device-token platform=expo
 *     - Tray notification, đa nền tảng (Android + iOS), latency thấp.
 *  2) FCM token (Android) → POST /push/device-token platform=fcm
 *     - Data-only payload, để CrmFirebaseMessagingService tự tạo bong bóng
 *       overlay + tray notification kể cả khi app đã bị tắt hoàn toàn.
 *
 * Backend sẽ gửi qua CẢ hai kênh trong pushSender.sendMobilePush.
 */

import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

type FloatingModule = {
  getFcmToken?: () => Promise<string | null>;
};

const Overlay: FloatingModule | undefined = NativeModules.FloatingBubbleOverlay;

let expoRegistered = false;
let fcmRegistered = false;

export async function registerPushToken(): Promise<void> {
  // 1) Expo push token (cần permission + projectId từ app.json)
  if (!expoRegistered) {
    try {
      const perm = await Notifications.getPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted') {
        const r = await Notifications.requestPermissionsAsync();
        status = r.status;
      }
      if (status === 'granted') {
        const tok = await Notifications.getExpoPushTokenAsync().catch(() => null);
        const token = tok?.data || '';
        if (token) {
          await api.post('/push/device-token', {
            token,
            platform: 'expo',
            device_id: Platform.OS,
          });
          expoRegistered = true;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2) FCM token (Android only) — chỉ chạy khi native bridge có sẵn
  if (Platform.OS === 'android' && !fcmRegistered && Overlay?.getFcmToken) {
    try {
      const fcmToken = await Overlay.getFcmToken();
      if (fcmToken) {
        await api.post('/push/device-token', {
          token: fcmToken,
          platform: 'fcm',
          device_id: 'android',
        });
        fcmRegistered = true;
      }
    } catch {
      /* google-services.json chưa add → bỏ qua */
    }
  }
}

export type PushSetupStatus = {
  notificationPermission: 'granted' | 'denied' | 'undetermined';
  hasExpoToken: boolean;
  hasFcmToken: boolean;
  hasPushToken: boolean;
  hasProjectId: boolean;
  hint?: string;
};

export async function getPushSetupStatus(): Promise<PushSetupStatus> {
  let perm: 'granted' | 'denied' | 'undetermined' = 'undetermined';
  try {
    const p = await Notifications.getPermissionsAsync();
    perm = (p.status as 'granted' | 'denied' | 'undetermined') ?? 'undetermined';
  } catch {
    /* */
  }
  let hasFcm = false;
  if (Platform.OS === 'android' && Overlay?.getFcmToken) {
    try {
      const t = await Overlay.getFcmToken();
      hasFcm = !!t;
    } catch {
      /* */
    }
  }
  return {
    notificationPermission: perm,
    hasExpoToken: expoRegistered,
    hasFcmToken: hasFcm,
    hasPushToken: expoRegistered || hasFcm,
    hasProjectId: true,
    hint:
      perm !== 'granted'
        ? 'Hãy cấp quyền Thông báo để nhận tin khi app tắt.'
        : undefined,
  };
}

export async function unregisterPushToken(): Promise<void> {
  try {
    await api.delete('/push/device-token').catch(() => {});
  } catch {
    /* */
  }
  expoRegistered = false;
  fcmRegistered = false;
}
