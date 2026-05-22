/**
 * Heartbeat: gửi ping định kỳ tới /devices/ping để server biết thiết bị nào đang online.
 * Bật khi đã có token, tắt khi logout.
 */
import { AppState, type AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../api/client';

const DEVICE_ID_KEY = 'crm_device_id_v1';
const PING_INTERVAL_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let started = false;
let cachedDeviceId: string | null = null;
let cachedGeo: { lat: number; lng: number; at: number; address?: string } | null = null;

NetInfo.configure({ shouldFetchWiFiSSID: true });

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

async function getNetworkMeta(): Promise<{
  network_type?: string;
  network_name?: string;
}> {
  try {
    const state = await NetInfo.fetch();
    const details = (state as { details?: Record<string, unknown> }).details || {};
    const type = state.type && state.type !== 'unknown' ? String(state.type) : undefined;
    const ssid = typeof details.ssid === 'string' ? details.ssid.trim() : '';
    return {
      network_type: type,
      network_name: ssid || undefined,
    };
  } catch {
    return {};
  }
}

function isValidCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

async function getGeoMeta(isLogin: boolean): Promise<{
  geo_lat?: number;
  geo_lng?: number;
  geo_address?: string;
}> {
  try {
    if (!isLogin && cachedGeo && Date.now() - cachedGeo.at < 10 * 60 * 1000) {
      if (isValidCoord(cachedGeo.lat, cachedGeo.lng)) {
        return { geo_lat: cachedGeo.lat, geo_lng: cachedGeo.lng, geo_address: cachedGeo.address };
      }
      cachedGeo = null;
    }
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted' && isLogin && perm.canAskAgain) {
      perm = await Location.requestForegroundPermissionsAsync();
    }
    if (perm.status !== 'granted') return {};
    const last = await Location.getLastKnownPositionAsync();
    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const chosen = fresh || last;
    const lat = chosen?.coords?.latitude;
    const lng = chosen?.coords?.longitude;
    if (!isValidCoord(lat as number, lng as number)) return {};
    let address: string | undefined;
    try {
      const geos = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const g = geos?.[0];
      const parts = [g?.name, g?.street, g?.district, g?.city, g?.region]
        .map((x) => String(x || '').trim())
        .filter(Boolean);
      if (parts.length) address = parts.join(', ');
    } catch {
      // ignore reverse geocode failures
    }
    cachedGeo = { lat, lng, at: Date.now(), address };
    return { geo_lat: lat, geo_lng: lng, geo_address: address };
  } catch {
    return {};
  }
}

async function ping(isLogin = false): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    const pushToken = await getPushToken();
    const [networkMeta, geoMeta] = await Promise.all([
      getNetworkMeta(),
      getGeoMeta(isLogin),
    ]);
    await api.post('/devices/ping', {
      device_id: deviceId,
      platform: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web',
      device_name: getDeviceName(),
      os_name: Platform.OS,
      os_version: String((Platform as { Version?: string | number }).Version ?? ''),
      app_version: getAppVersion(),
      push_token: pushToken || undefined,
      network_type: networkMeta.network_type,
      network_name: networkMeta.network_name,
      geo_lat: geoMeta.geo_lat,
      geo_lng: geoMeta.geo_lng,
      geo_address: geoMeta.geo_address,
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
