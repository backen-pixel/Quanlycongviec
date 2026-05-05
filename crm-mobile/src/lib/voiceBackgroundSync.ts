import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { getStoredToken } from '../api/client';
import { API_ORIGIN } from '../config';
import { ensureAndroidPostNotificationsPermission } from './appPermissions';
import {
  isVoiceDataSyncAvailable,
  voiceDataSyncGetDebugState,
  voiceDataSyncStart,
  voiceDataSyncStop,
  voiceDataSyncStopLogout,
} from '../native/voiceDataSyncAndroid';
import { loadCrmMobilePrefs } from './crmMobilePrefs';

const KEY_LAST_SYNC_MS = 'crm_voice_bg_last_sync_ms_v1';

async function getLastSyncMs(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY_LAST_SYNC_MS);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function ensureVoiceBackgroundSyncPermissions(): Promise<{ mediaGranted: boolean }> {
  if (Platform.OS !== 'android') return { mediaGranted: false };
  const cur = await MediaLibrary.getPermissionsAsync();
  if (cur.granted) return { mediaGranted: true };
  const next = await MediaLibrary.requestPermissionsAsync();
  return { mediaGranted: !!next.granted };
}

export async function getVoiceBackgroundSyncDebugInfo(): Promise<{
  foregroundSyncEnabled: boolean;
  mediaGranted: boolean;
  lastRunMs: number;
  lastUploaded: number;
  lastResult: string;
  lastSyncMs: number;
}> {
  const perm = await MediaLibrary.getPermissionsAsync();
  if (!isVoiceDataSyncAvailable()) {
    return {
      foregroundSyncEnabled: false,
      mediaGranted: !!perm.granted,
      lastRunMs: 0,
      lastUploaded: 0,
      lastResult: '',
      lastSyncMs: await getLastSyncMs(),
    };
  }
  const native = await voiceDataSyncGetDebugState();
  return {
    foregroundSyncEnabled: !!native?.syncEnabled,
    mediaGranted: !!perm.granted,
    lastRunMs: native?.lastRunMs ?? 0,
    lastUploaded: native?.lastUploaded ?? 0,
    lastResult: native?.lastResult ?? '',
    lastSyncMs: native?.lastSyncMs ?? (await getLastSyncMs()),
  };
}

/** Đăng xuất: dừng foreground sync và xóa token native. */
export async function stopVoiceForegroundSyncLogout(): Promise<void> {
  if (!isVoiceDataSyncAvailable()) return;
  await voiceDataSyncStopLogout();
}

/** Dừng foreground sync khi tắt toggle (giữ token để bật lại). */
export async function stopVoiceForegroundSyncToggle(): Promise<void> {
  if (!isVoiceDataSyncAvailable()) return;
  await voiceDataSyncStop();
}

export async function syncVoiceBackgroundTaskWithPrefs(): Promise<void> {
  if (!isVoiceDataSyncAvailable()) return;

  const prefs = await loadCrmMobilePrefs();
  const token = await getStoredToken();
  const shouldRun = !!(prefs.voiceCaptureEnabled && prefs.voiceBackgroundSyncEnabled && token);

  if (!shouldRun) {
    await voiceDataSyncStop();
    return;
  }

  await ensureAndroidPostNotificationsPermission();
  const lastSync = await getLastSyncMs();
  await voiceDataSyncStart(`${API_ORIGIN}/api`, token, lastSync);
}
