/**
 * Push notification (FCM native) cho CRM Mobile v2.
 *
 * Luồng:
 *  - `configurePushNotifications()` (gọi sớm ở index): handler + kênh Android
 *    khớp `channelId` backend (`pushSender.js`).
 *  - `registerPushTokenV2()` (sau login): xin quyền, lấy FCM token, POST `/push/device-token`
 *    với platform `fcm` + `device_id` tiền tố `crmv2`.
 *
 * Yêu cầu build:
 *  - `google-services.json` cho package `vn.tubeppro.crmobilev2` (Firebase project tubep-crm)
 *    đặt tại `crm-mobile-v2/google-services.json` rồi prebuild/build.
 *  - Thiếu file → `getDevicePushTokenAsync` thất bại; tin nhắn local (app còn sống) vẫn hiện.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';
import { api } from '../api/client';
import { invalidateCrmHubCache, invalidatePlannerCache } from '../api/crm';
import { navigate } from '../navigation/navigationRef';
import { APP_KEY } from './appUpdate';
import { requestOpenUpdateGate } from './appUpdateNotify';
import { emitCrmRealtime } from './crmRealtimeBus';
import { getOrCreateDeviceId } from './deviceHeartbeat';

const FCM_TOKEN_KEY = 'crmv2_fcm_push_token_v1';
const LOG = '[crmv2 push]';

/** Phải khớp hằng số channelId trong backend/src/services/pushSender.js */
const CHANNEL_SYSTEM = 'crm_system_tray_v3';
const CHANNEL_CHAT = 'crm_chat';
const CHANNEL_CALL = 'crm_call';
const CHANNEL_SX_COMMENTS = 'sx_comments';

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

/**
 * Emulator iOS không có push; Android emulator/LDPlayer thường có GMS
 * và vẫn đăng ký FCM được — không chặn bằng Device.isDevice trên Android.
 */
function canRegisterPush(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') return true;
  return Device.isDevice;
}

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
    await Notifications.setNotificationChannelAsync(CHANNEL_SX_COMMENTS, {
      name: 'Bình luận sản xuất',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2F6BFF',
      sound: 'default',
    });
  } catch (e) {
    console.warn(LOG, 'ensureAndroidChannels', e);
  }
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

/** Điều hướng theo loại thông báo khi người dùng bấm vào. */
function handleNotificationData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  const entity = String(data.entity_type || '').toLowerCase();
  const type = String(data.type || '').toLowerCase();
  if (type === 'app_update' || entity === 'app_update') {
    requestOpenUpdateGate();
    return;
  }
  if (
    type === 'deadline_overdue_local'
    || entity === 'deadline_tab'
    || type === 'crm_deadline_overdue'
    || type === 'crm_kanban_deadline_overdue'
  ) {
    navigate('Tabs', { screen: 'Deadline' });
    return;
  }
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
  if (
    type === 'messenger_chat'
    || entity === 'messenger_group'
    || data.group_id
    || data.entity_id
  ) {
    const groupId = String(data.group_id || data.entity_id || '');
    const title = String(data.group_name || data.title || 'Tin nhắn');
    if (groupId) {
      navigate('ChatDetail', { threadId: groupId, title });
      return;
    }
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
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    try {
      const data = response?.notification?.request?.content?.data as
        | Record<string, unknown>
        | undefined;
      if (!data) return;
      const type = String(data.type || '').toLowerCase();
      const entity = String(data.entity_type || '').toLowerCase();
      if (type === 'app_update' || entity === 'app_update') {
        handleNotificationData(data);
      }
    } catch {
      /* bỏ qua */
    }
  });
  Notifications.addNotificationReceivedListener((notification) => {
    try {
      const data = notification?.request?.content?.data as Record<string, unknown> | undefined;
      const type = String(data?.type || '').toLowerCase();
      if (type === 'incoming_call' || type === 'messenger_chat' || type === 'app_update') return;
      invalidateCrmHubCache();
      invalidatePlannerCache();
      emitCrmRealtime({ reason: 'notification', detail: data });
    } catch {
      /* bỏ qua */
    }
  });
}

async function ensurePermission(): Promise<boolean> {
  try {
    await requestAndroidPostNotifications();
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch (e) {
    console.warn(LOG, 'ensurePermission', e);
    return false;
  }
}

/**
 * Đăng ký FCM token lên server. Idempotent — luôn ping để cập nhật last_seen_at.
 * Trả về true nếu đăng ký thành công.
 */
export async function registerPushTokenV2(): Promise<boolean> {
  if (!canRegisterPush()) {
    console.log(LOG, 'skip: thiết bị không hỗ trợ push');
    return false;
  }
  try {
    await ensureAndroidChannels();
    const granted = await ensurePermission();
    if (!granted) {
      console.warn(LOG, 'quyền thông báo chưa cấp — tray hệ thống có thể không hiện (Android 13+)');
    }

    let fcmToken: string | null = null;
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      fcmToken = typeof device?.data === 'string' ? device.data : null;
    } catch (e) {
      console.warn(
        LOG,
        'getDevicePushTokenAsync thất bại — thiếu google-services.json cho package vn.tubeppro.crmobilev2?',
        e,
      );
      return false;
    }
    if (!fcmToken) {
      console.warn(LOG, 'không có FCM token (thiếu GMS / google-services?)');
      return false;
    }

    await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
    try {
      await api.post('/push/device-token', {
        token: fcmToken,
        platform: 'fcm',
        device_id: await getOrCreateDeviceId(),
        app_key: APP_KEY,
      });
      console.log(LOG, 'FCM registered', fcmToken.slice(0, 12) + '…');
      return true;
    } catch (e) {
      console.warn(LOG, 'POST /push/device-token', e);
      return false;
    }
  } catch (e) {
    console.warn(LOG, 'registerPushTokenV2', e);
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

/** Trạng thái nhanh để debug / màn Tài khoản. */
export async function getPushDebugStatus(): Promise<{
  canRegister: boolean;
  permission: string;
  hasStoredToken: boolean;
}> {
  const permission = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined' as const }));
  const hasStoredToken = !!(await AsyncStorage.getItem(FCM_TOKEN_KEY).catch(() => null));
  return {
    canRegister: canRegisterPush(),
    permission: permission.status,
    hasStoredToken,
  };
}
