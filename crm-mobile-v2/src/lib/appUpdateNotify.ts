/**
 * Thông báo tray hệ thống khi có bản cập nhật APK mới.
 * Chỉ hiện **một lần / versionCode** (trong phiên + throttle 12h) — tránh nhảy liên tục.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  checkForUpdate,
  isUpToDate,
  type UpdateCheckResult,
} from './appUpdate';

export const CHANNEL_APP_UPDATE = 'crm_app_update_v1';

const NOTIF_ID = 'crmv2-app-update-available';
const LAST_NOTIFIED_CODE_KEY = 'crmv2_app_update_notif_code_v3';
const LAST_NOTIFIED_AT_KEY = 'crmv2_app_update_notif_at_v3';

/** Không spam cùng một bản trong 12 giờ (kể cả mở app lại). */
const THROTTLE_MS = 12 * 60 * 60 * 1000;

type OpenListener = () => void;
const openListeners = new Set<OpenListener>();
let pendingOpenUpdateGate = false;
let channelReady = false;
let probing = false;

/** Đã schedule tray cho versionCode này trong tiến trình hiện tại. */
const sessionNotifiedKeys = new Set<string>();

export function requestOpenUpdateGate(): void {
  pendingOpenUpdateGate = true;
  openListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* bỏ qua */
    }
  });
}

export function consumeOpenUpdateGateRequest(): boolean {
  const v = pendingOpenUpdateGate;
  pendingOpenUpdateGate = false;
  return v;
}

export function onOpenUpdateGateRequest(cb: OpenListener): () => void {
  openListeners.add(cb);
  return () => {
    openListeners.delete(cb);
  };
}

export async function ensureAppUpdateChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_APP_UPDATE, {
      name: 'Cập nhật ứng dụng',
      description: 'Thông báo khi có bản CRM Mobile mới',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F97316',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
    channelReady = true;
  } catch {
    /* bỏ qua */
  }
}

async function ensurePostNotificationsPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (apiLevel < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    /* bỏ qua */
  }
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    /* bỏ qua */
  }
}

function notifyKey(code: number | null, version: string): string {
  if (code != null) return `c:${code}`;
  return `v:${version}`;
}

async function getLastNotified(): Promise<{ code: number | null; at: number }> {
  try {
    const [codeRaw, atRaw] = await Promise.all([
      AsyncStorage.getItem(LAST_NOTIFIED_CODE_KEY),
      AsyncStorage.getItem(LAST_NOTIFIED_AT_KEY),
    ]);
    const code = codeRaw != null && Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : null;
    const at = atRaw != null && Number.isFinite(Number(atRaw)) ? Number(atRaw) : 0;
    return { code, at };
  } catch {
    return { code: null, at: 0 };
  }
}

async function setLastNotified(code: number | null): Promise<void> {
  try {
    if (code != null) await AsyncStorage.setItem(LAST_NOTIFIED_CODE_KEY, String(code));
    await AsyncStorage.setItem(LAST_NOTIFIED_AT_KEY, String(Date.now()));
  } catch {
    /* bỏ qua */
  }
}

export async function cancelAppUpdateNotification(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID);
  } catch {
    /* bỏ qua */
  }
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch {
    /* bỏ qua */
  }
}

export async function clearAppUpdateNotifyState(): Promise<void> {
  await cancelAppUpdateNotification();
  sessionNotifiedKeys.clear();
  try {
    await AsyncStorage.multiRemove([LAST_NOTIFIED_CODE_KEY, LAST_NOTIFIED_AT_KEY]);
  } catch {
    /* bỏ qua */
  }
}

/**
 * Hiện tray một lần cho mỗi versionCode (phiên hiện tại + throttle 12h).
 * Không có force re-post — tránh nhảy liên tục khi mở app / về foreground.
 */
export async function maybeNotifyAppUpdate(res: UpdateCheckResult): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!res?.updateAvailable || !res.downloadUrl) return false;

  const code = res.latestVersionCode != null && Number.isFinite(Number(res.latestVersionCode))
    ? Number(res.latestVersionCode)
    : null;
  const version = String(res.latestVersion || '').trim();
  if (code == null && !version) return false;

  const key = notifyKey(code, version);
  if (sessionNotifiedKeys.has(key)) return false;

  const last = await getLastNotified();
  if (
    code != null
    && last.code === code
    && last.at > 0
    && Date.now() - last.at < THROTTLE_MS
  ) {
    sessionNotifiedKeys.add(key);
    return false;
  }

  await ensureAppUpdateChannel();
  await ensurePostNotificationsPermission();

  const title = 'Có bản cập nhật mới';
  const body = version
    ? `Phiên bản ${version} đã sẵn sàng. Nhấn để cập nhật.`
    : 'Bản cập nhật CRM đã sẵn sàng. Nhấn để cập nhật.';

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'app_update',
          entity_type: 'app_update',
          latest_version: version || null,
          latest_version_code: code,
          mandatory: !!res.mandatory,
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_APP_UPDATE } : {}),
      },
      trigger: null,
    });
    sessionNotifiedKeys.add(key);
    await setLastNotified(code);
    return true;
  } catch {
    return false;
  }
}

/** Check server + tray (không re-post nếu đã báo cùng bản). */
export async function probeAndNotifyAppUpdateTray(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (probing) return false;
  probing = true;
  try {
    await ensureAppUpdateChannel();
    const res = await checkForUpdate();
    if (isUpToDate(res) || !res.updateAvailable || !res.downloadUrl) {
      await clearAppUpdateNotifyState();
      return false;
    }
    return await maybeNotifyAppUpdate(res);
  } catch {
    return false;
  } finally {
    probing = false;
  }
}
