/**
 * Heartbeat: gửi ping định kỳ tới /devices/ping để server biết thiết bị nào đang online.
 * Bật khi đã có token, tắt khi logout.
 */
import { AppState, type AppStateStatus, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { api } from '../api/client';

const DEVICE_ID_KEY = 'crm_device_id_v1';
const PING_INTERVAL_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let started = false;
let cachedDeviceId: string | null = null;

function randomId(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.length >= 6) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {
    /* ignore */
  }
  const fresh = randomId();
  cachedDeviceId = fresh;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

function getDeviceName(): string | undefined {
  const expoConfig = (Constants.expoConfig ?? null) as { name?: string } | null;
  const manifestName = expoConfig?.name;
  const platformLabel =
    Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : Platform.OS;
  const constantsAny = Constants as unknown as { deviceName?: string };
  return constantsAny.deviceName || `${manifestName || 'CRM Mobile'} (${platformLabel})`;
}

function getAppVersion(): string | undefined {
  const expoConfig = (Constants.expoConfig ?? null) as { version?: string } | null;
  return expoConfig?.version || (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion || undefined;
}

async function getPushToken(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem('crm_expo_push_token_v1');
    return t || null;
  } catch {
    return null;
  }
}

async function ping(isLogin = false): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    const pushToken = await getPushToken();
    await api.post('/devices/ping', {
      device_id: deviceId,
      platform: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web',
      device_name: getDeviceName(),
      os_name: Platform.OS,
      os_version: String((Platform as { Version?: string | number }).Version ?? ''),
      app_version: getAppVersion(),
      push_token: pushToken || undefined,
      is_login: isLogin,
    });
  } catch {
    /* mạng yếu / 401 — bỏ qua */
  }
}

export function startDeviceHeartbeat(): void {
  if (started) return;
  started = true;

  void ping(true);

  timer = setInterval(() => {
    if (AppState.currentState === 'active') void ping(false);
  }, PING_INTERVAL_MS);

  appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') void ping(false);
  });

  if (Platform.OS === 'android') {
    const overlay = (NativeModules as { FloatingBubbleOverlay?: { setHeartbeatActive?: (b: boolean) => void } })
      .FloatingBubbleOverlay;
    overlay?.setHeartbeatActive?.(true);
  }
}

/** Buộc ping ngay (cho MyDevicesScreen — đảm bảo thiết bị hiện tại có trong danh sách). */
export async function forcePingNow(): Promise<void> {
  await ping(false);
}

export function stopDeviceHeartbeat(): void {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

export async function getDeviceId(): Promise<string> {
  return getOrCreateDeviceId();
}
