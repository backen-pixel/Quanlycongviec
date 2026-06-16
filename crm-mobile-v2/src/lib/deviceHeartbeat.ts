import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { api } from '../api/client';
import { currentVersionName } from './appUpdate';

const DEVICE_ID_KEY = 'crmv2_device_id_v1';
const PING_INTERVAL_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let started = false;
let cachedDeviceId: string | null = null;

function randomId(): string {
  return `crmv2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
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

async function ping(isLogin = false): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    const version = currentVersionName() || Constants.expoConfig?.version || '2.0.0';
    const model = Device.modelName || Device.deviceName || Platform.OS;
    await api.post('/devices/ping', {
      device_id: deviceId,
      platform: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web',
      device_name: `CRM Mobile (${model})`,
      os_name: Platform.OS,
      os_version: String(Platform.Version ?? ''),
      app_version: version,
      is_login: isLogin,
    });
  } catch {
    /* ignore */
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
}

export function stopDeviceHeartbeat(): void {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  appStateSub?.remove();
  appStateSub = null;
}
