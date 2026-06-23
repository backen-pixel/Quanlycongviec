import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import { AppState, Platform } from 'react-native';
import { api, getStoredToken } from '../api/client';
import { uploadRecording } from '../api/recordings';
import { guessAudioMimeFromFileName } from './guessAudioMime';
import { normalizeVoiceRecordingFileName } from './voiceRecordingName';
import { loadCrmMobilePrefs } from './crmMobilePrefs';

const LAST_SYNC_MS_KEY = '@crmv2_voice_last_sync_ms';
const UPLOADED_NAMES_KEY = '@crmv2_voice_uploaded_names_v1';
const SYNC_INTERVAL_MS = 3 * 60 * 1000;

export type LocalCallRecording = {
  id: string;
  name: string;
  size: number;
  dateAddedMs: number;
  mime: string | null;
  localUri: string;
  phoneHint: string | null;
};

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

function extractPhoneFromName(name: string): string | null {
  const m = name.replace(/\s+/g, '').match(/(?:\+84|84|0)([3-9]\d{8,9})/);
  if (!m) return null;
  const digits = (m[0].startsWith('+') ? m[0].slice(1) : m[0]).replace(/\D/g, '');
  return digits.slice(0, 32) || null;
}

/** Chỉ lấy file có dấu hiệu ghi âm cuộc gọi (Dialer/OEM) hoặc SĐT trong tên. */
export function looksLikeCallRecording(name: string, uri?: string | null): boolean {
  const blob = `${name} ${uri || ''}`.toLowerCase();
  if (extractPhoneFromName(name)) return true;
  return /call|recording|phone|cuoc.?goi|ghi.?am|dialer|miui|samsung|oppo|vivo|recordings|soundrecorder|callrecord/i.test(
    blob,
  );
}

async function getUploadedNames(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(UPLOADED_NAMES_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

async function markUploaded(name: string): Promise<void> {
  const set = await getUploadedNames();
  set.add(name);
  const arr = [...set].slice(-800);
  await AsyncStorage.setItem(UPLOADED_NAMES_KEY, JSON.stringify(arr));
}

export async function skipLocalUpload(name: string): Promise<void> {
  await markUploaded(name);
}

export async function unmarkLocalUpload(name: string): Promise<void> {
  const set = await getUploadedNames();
  set.delete(name);
  await AsyncStorage.setItem(UPLOADED_NAMES_KEY, JSON.stringify([...set].slice(-800)));
}

export async function isLocallyMarkedUploaded(name: string): Promise<boolean> {
  const set = await getUploadedNames();
  return set.has(name);
}

async function getLastSyncMs(): Promise<number> {
  const raw = await AsyncStorage.getItem(LAST_SYNC_MS_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function setLastSyncMs(ms: number): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_MS_KEY, String(ms));
}

export async function ensureVoiceBackgroundSyncPermissions(): Promise<{ mediaGranted: boolean }> {
  if (Platform.OS !== 'android') return { mediaGranted: false };
  const cur = await MediaLibrary.getPermissionsAsync();
  if (cur.granted) return { mediaGranted: true };
  const next = await MediaLibrary.requestPermissionsAsync();
  return { mediaGranted: !!next.granted };
}

export async function listLocalCallRecordings(opts: {
  sinceMs?: number;
  limit?: number;
  includeAll?: boolean;
} = {}): Promise<LocalCallRecording[]> {
  if (Platform.OS !== 'android') return [];
  const perm = await MediaLibrary.getPermissionsAsync();
  if (!perm.granted) return [];

  const sinceMs = Math.max(0, opts.sinceMs ?? 0);
  const limit = Math.max(1, Math.min(300, opts.limit ?? 120));
  const includeAll = !!opts.includeAll;

  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.audio,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    first: Math.min(limit * 3, 300),
    ...(sinceMs > 0 ? { createdAfter: sinceMs } : {}),
  });

  const out: LocalCallRecording[] = [];
  for (const asset of page.assets) {
    if (out.length >= limit) break;
    const name = asset.filename || `audio_${asset.id}`;
    const decodedName = normalizeVoiceRecordingFileName(name) || name;
    if (!includeAll && !looksLikeCallRecording(name, asset.uri)) continue;
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    const localUri = info.localUri || asset.uri;
    if (!localUri) continue;
    out.push({
      id: asset.id,
      name: decodedName,
      size: 0,
      dateAddedMs: (asset.creationTime || 0) * 1000,
      mime: guessAudioMimeFromFileName(name),
      localUri,
      phoneHint: extractPhoneFromName(name),
    });
  }
  return out;
}

async function bulkExistsOnServer(
  items: {
    file_name: string;
    file_size?: number;
    phone_number?: string | null;
    call_started_at?: string | null;
    duration_sec?: number | null;
  }[],
) {
  if (!items.length) return { existing: new Set<string>(), tombstoned: new Set<string>() };
  try {
    const { data } = await api.post<{
      existing?: {
        file_name: string;
        file_size?: number | null;
        phone_number?: string | null;
        duration_sec?: number | null;
        call_started_at?: string | null;
      }[];
      tombstoned?: { file_name: string; file_size?: number | null }[];
    }>('/voice-recordings/bulk-check', { items });
    const existing = new Set<string>();
    const tombstoned = new Set<string>();
    const rowKey = (r: {
      file_name: string;
      file_size?: number | null;
      phone_number?: string | null;
      duration_sec?: number | null;
      call_started_at?: string | null;
    }) => {
      const ph = (r.phone_number || '').replace(/\D/g, '').slice(-9);
      const t = r.call_started_at ? String(Math.floor(new Date(r.call_started_at).getTime() / 60_000)) : '';
      const d = r.duration_sec != null && r.duration_sec > 0 ? String(Math.round(r.duration_sec)) : '';
      return `${r.file_name}|${r.file_size ?? 0}|${ph}|${t}|${d}`;
    };
    for (const r of data?.existing || []) {
      existing.add(rowKey(r));
      existing.add(`${r.file_name}|${r.file_size ?? 0}`);
      existing.add(r.file_name);
    }
    for (const t of data?.tombstoned || []) {
      tombstoned.add(`${t.file_name}|${t.file_size ?? 0}`);
      tombstoned.add(t.file_name);
    }
    return { existing, tombstoned, rowKey };
  } catch {
    return { existing: new Set<string>(), tombstoned: new Set<string>(), rowKey: null as null };
  }
}

export async function runVoiceBackgroundSyncOnce(): Promise<{ uploaded: number; scanned: number }> {
  if (Platform.OS !== 'android' || syncing) return { uploaded: 0, scanned: 0 };
  const token = await getStoredToken();
  if (!token) return { uploaded: 0, scanned: 0 };

  const prefs = await loadCrmMobilePrefs();
  if (!prefs.voiceCaptureEnabled || !prefs.voiceBackgroundSyncEnabled) {
    return { uploaded: 0, scanned: 0 };
  }

  const perm = await ensureVoiceBackgroundSyncPermissions();
  if (!perm.mediaGranted) return { uploaded: 0, scanned: 0 };

  syncing = true;
  let uploaded = 0;
  try {
    const lastSync = await getLastSyncMs();
    const sinceMs = lastSync > 0 ? lastSync - 60_000 : Date.now() - 7 * 24 * 60 * 60 * 1000;
    const local = await listLocalCallRecordings({ sinceMs, limit: 40, includeAll: false });
    const uploadedNames = await getUploadedNames();
    const pending = local.filter((it) => !uploadedNames.has(it.name)).slice(0, 20);
    const { existing, tombstoned, rowKey } = await bulkExistsOnServer(
      pending.map((p) => ({
        file_name: p.name,
        file_size: p.size || undefined,
        phone_number: p.phoneHint || undefined,
        call_started_at: p.dateAddedMs > 0 ? new Date(p.dateAddedMs).toISOString() : undefined,
      })),
    );

    for (const item of pending) {
      const basicKey = `${item.name}|${item.size ?? 0}`;
      const richKey = rowKey
        ? rowKey({
            file_name: item.name,
            file_size: item.size ?? 0,
            phone_number: item.phoneHint || null,
            call_started_at: item.dateAddedMs > 0 ? new Date(item.dateAddedMs).toISOString() : null,
          })
        : basicKey;
      if (
        existing.has(richKey)
        || existing.has(basicKey)
        || existing.has(item.name)
        || tombstoned.has(basicKey)
        || tombstoned.has(item.name)
      ) {
        await markUploaded(item.name);
        continue;
      }
      try {
        await uploadRecording({
          localUri: item.localUri,
          fileName: item.name,
          mime: item.mime || guessAudioMimeFromFileName(item.name),
          phoneNumber: item.phoneHint,
        });
        await markUploaded(item.name);
        uploaded += 1;
      } catch {
        /* thử file kế tiếp */
      }
    }

    if (uploaded > 0 && prefs.autoLinkVoiceByPhone) {
      void api.post('/voice-recordings/relink-unassigned').catch(() => {});
    }
    await setLastSyncMs(Date.now());
    return { uploaded, scanned: local.length };
  } finally {
    syncing = false;
  }
}

export async function syncVoiceBackgroundTaskWithPrefs(): Promise<void> {
  await runVoiceBackgroundSyncOnce();
}

export function startVoiceBackgroundSyncLoop(): void {
  if (Platform.OS !== 'android') return;
  stopVoiceBackgroundSyncLoop();
  void runVoiceBackgroundSyncOnce();
  syncTimer = setInterval(() => {
    if (AppState.currentState === 'active') void runVoiceBackgroundSyncOnce();
  }, SYNC_INTERVAL_MS);
}

export function stopVoiceBackgroundSyncLoop(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export async function reuploadLocalByName(rec: LocalCallRecording): Promise<void> {
  await uploadRecording({
    localUri: rec.localUri,
    fileName: rec.name,
    mime: rec.mime || guessAudioMimeFromFileName(rec.name),
    phoneNumber: rec.phoneHint,
  });
  await markUploaded(rec.name);
  const prefs = await loadCrmMobilePrefs();
  if (prefs.autoLinkVoiceByPhone) {
    void api.post('/voice-recordings/relink-unassigned').catch(() => {});
  }
}
