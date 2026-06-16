/**
 * Push notification (FCM native) cho CRM Mobile v2.
 *
 * Luồng:
 *  - `configurePushNotifications()` (gọi sớm ở index): cài handler hiển thị khi app
 *    đang mở + tạo các kênh Android khớp `channelId` mà backend gửi.
 *  - `registerPushTokenV2()` (sau login): xin quyền, lấy FCM device token và đăng ký
 *    lên `POST /push/device-token` với platform 'fcm' + device_id tiền tố "crmv2"
 *    (để backend biết đây là app v2 và gửi notification hiển thị trên thanh hệ thống).
 *  - `unregisterPushTokenV2()` (logout): gỡ token khỏi server.
 *
 * Yêu cầu: google-services.json (Firebase project tubep-crm, package
 * vn.tubeppro.crmobilev2) đặt tại crm-mobile-v2/android/app/. Thiếu file thì
 * lấy token sẽ thất bại và hàm im lặng bỏ qua (không làm app crash).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { navigate } from '../navigation/navigationRef';

const FCM_TOKEN_KEY = 'crmv2_fcm_push_token_v1';

/** Phải khớp hằng số channelId trong backend/src/services/pushSender.js */
const CHANNEL_SYSTEM = 'crm_system_tray_v3';
const CHANNEL_CHAT = 'crm_chat';
const CHANNEL_CALL = 'crm_call';

let configured = false;

/** Hiển thị banner + âm thanh ngay cả khi app đang mở (foreground). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_SYSTEM, {
      name: 'Thông báo CRM',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2F6BFF',
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_CHAT, {
      name: 'Tin nhắn',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2F6BFF',
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_CALL, {
      name: 'Cuộc gọi',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 500, 500],
      lightColor: '#22C55E',
      sound: 'default',
    });
  } catch {
    /* bỏ qua */
  }
}

/** Điều hướng theo loại thông báo khi người dùng bấm vào. */
function handleNotificationData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  const entity = String(data.entity_type || '').toLowerCase();
  const type = String(data.type || '').toLowerCase();
  if (entity === 'crm_deal' || type.includes('deal')) {
    navigate('CrmHub', { initialMode: 'deals' });
    return;
  }
  if (entity === 'crm_lead' || entity === 'lead' || entity === 'crm_task' || type.includes('lead')) {
    navigate('CrmHub', { initialMode: 'leads' });
    return;
  }
  if (entity === 'event' || type.includes('event')) {
    navigate('Events');
    return;
  }
  navigate('Notifications');
}

/** Gọi 1 lần lúc khởi động app — cài channels + lắng nghe người dùng bấm thông báo. */
export function configurePushNotifications(): void {
  if (configured) return;
  configured = true;
  void ensureAndroidChannels();
  Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response?.notification?.request?.content?.data as
        | Record<string, unknown>
        | undefined;
      handleNotificationData(data);
    } catch {
      /* bỏ qua */
    }
  });
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

function buildDeviceId(): string {
  const part = Device.osBuildId || Device.modelName || 'android';
  const safe = String(part).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return `crmv2-${safe || 'android'}`;
}

/**
 * Đăng ký FCM token lên server. Idempotent — luôn ping để cập nhật last_seen_at.
 * Trả về true nếu đăng ký thành công.
 */
export async function registerPushTokenV2(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  try {
    await ensureAndroidChannels();
    const granted = await ensurePermission();
    if (!granted) return false;

    let fcmToken: string | null = null;
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      fcmToken = typeof device?.data === 'string' ? device.data : null;
    } catch {
      // Thường do thiếu google-services.json / Firebase chưa init.
      return false;
    }
    if (!fcmToken) return false;

    await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
    try {
      await api.post('/push/device-token', {
        token: fcmToken,
        platform: 'fcm',
        device_id: buildDeviceId(),
      });
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/** Gỡ token khi logout. */
export async function unregisterPushTokenV2(): Promise<void> {
  try {
    const fcmToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (fcmToken) {
      await api.delete('/push/device-token', { data: { token: fcmToken } });
    }
    await AsyncStorage.removeItem(FCM_TOKEN_KEY);
  } catch {
    /* bỏ qua */
  }
}
