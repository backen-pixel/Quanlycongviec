/**
 * Thông báo tray hệ thống khi có bản cập nhật APK mới (ngoài modal trong app).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { UpdateCheckResult } from './appUpdate';

const CHANNEL_SYSTEM = 'crm_system_tray_v3';
const NOTIF_ID = 'crmv2-app-update-available';
const LAST_NOTIFIED_CODE_KEY = 'crmv2_app_update_notif_code_v1';

type OpenListener = () => void;
const openListeners = new Set<OpenListener>();
let pendingOpenUpdateGate = false;

/** Yêu cầu mở màn cập nhật (từ tap thông báo). */
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

async function getLastNotifiedCode(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_NOTIFIED_CODE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function setLastNotifiedCode(code: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_NOTIFIED_CODE_KEY, String(code));
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
  try {
    await AsyncStorage.removeItem(LAST_NOTIFIED_CODE_KEY);
  } catch {
    /* bỏ qua */
  }
}

/**
 * Hiện tray hệ thống một lần cho mỗi versionCode mới.
 * Trả về true nếu đã schedule thông báo.
 */
export async function maybeNotifyAppUpdate(res: UpdateCheckResult): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!res?.updateAvailable || !res.downloadUrl) return false;

  const code = res.latestVersionCode != null && Number.isFinite(Number(res.latestVersionCode))
    ? Number(res.latestVersionCode)
    : null;
  const version = String(res.latestVersion || '').trim();
  if (code == null && !version) return false;

  if (code != null) {
    const last = await getLastNotifiedCode();
    if (last != null && last === code) return false;
  }

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
        data: {
          type: 'app_update',
          entity_type: 'app_update',
          latest_version: version || null,
          latest_version_code: code,
          mandatory: !!res.mandatory,
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_SYSTEM } : {}),
      },
      trigger: null,
    });
    if (code != null) await setLastNotifiedCode(code);
    return true;
  } catch {
    return false;
  }
}
