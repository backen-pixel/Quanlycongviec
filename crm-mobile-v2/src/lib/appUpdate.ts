/**
 * Tự cập nhật full APK (sideload) — giống TuBep Demo / crm-mobile.
 * Hỏi server /api/app-updates/check, tải APK và mở trình cài đặt Android.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from '../config';
import { base64ToBytes, createSha256, normalizeSha256Hex } from './sha256';

/** Định danh app trong registry server (bảng mobile_apps.app_key). */
export const APP_KEY = 'crm-mobile-v2';

export type UpdateCheckResult = {
  updateAvailable: boolean;
  mandatory?: boolean;
  latestVersion?: string | null;
  latestVersionCode?: number | null;
  downloadUrl?: string | null;
  size?: number | null;
  sha256?: string | null;
  releaseNotes?: string | null;
  apkReady?: boolean;
  needsUpdate?: boolean;
};

const UPDATE_PENDING_CODE_KEY = '@crmv2_update_pending_code';
const UPDATE_PENDING_VERSION_KEY = '@crmv2_update_pending_version';
const UPDATE_DISMISSED_CODE_KEY = '@crmv2_update_dismissed_code';
const UPDATE_DISMISSED_VERSION_KEY = '@crmv2_update_dismissed_version';

/** So sánh semver đơn giản — khớp backend appUpdates.js */
export function compareVersionNames(a: string, b: string): number {
  const pa = String(a || '').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function currentVersionCode(): number | null {
  if (Platform.OS !== 'android') return null;

  const candidates = [
    Application.nativeBuildVersion,
    Constants.nativeBuildVersion,
    Constants.expoConfig?.android?.versionCode,
  ];

  for (const c of candidates) {
    const raw = String(c ?? '').trim();
    if (!/^\d+$/.test(raw)) continue;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

export function currentVersionName(): string {
  const v = (
    Application.nativeApplicationVersion
    || Constants.nativeAppVersion
    || Constants.expoConfig?.version
    || ''
  ).trim();
  return v;
}

export function isUpToDate(res: UpdateCheckResult): boolean {
  const localCode = currentVersionCode();
  const localVer = currentVersionName();
  const latestCode = res.latestVersionCode ?? null;
  const latestVer = res.latestVersion ?? null;

  if (res.needsUpdate === false) return true;
  if (!res.updateAvailable && res.needsUpdate !== true) return true;

  // Ưu tiên đọc phiên bản trên máy — không tin server nếu local đã >= latest.
  if (localVer && latestVer && compareVersionNames(localVer, latestVer) >= 0) return true;
  if (localCode != null && latestCode != null && localCode >= latestCode) return true;

  return false;
}

/** Xóa flag pending/dismissed khi máy đã cài >= bản đang chờ. */
export async function reconcileUpdateStorage(): Promise<boolean> {
  try {
    const localCode = currentVersionCode();
    const localVer = currentVersionName();
    const [pendingCodeRaw, pendingVer] = await Promise.all([
      AsyncStorage.getItem(UPDATE_PENDING_CODE_KEY),
      AsyncStorage.getItem(UPDATE_PENDING_VERSION_KEY),
    ]);
    if (!pendingCodeRaw && !pendingVer) return false;

    const pendingCode = pendingCodeRaw ? Number(pendingCodeRaw) : null;
    const okByCode =
      pendingCode != null &&
      Number.isFinite(pendingCode) &&
      localCode != null &&
      Number.isFinite(localCode) &&
      localCode >= pendingCode;
    const okByVersion =
      !!pendingVer &&
      !!localVer &&
      (pendingVer === localVer || compareVersionNames(localVer, pendingVer) >= 0);

    if (okByCode || okByVersion) {
      await clearDismissedUpdate();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function dismissUpdateForRelease(res: UpdateCheckResult): Promise<void> {
  try {
    const code = res.latestVersionCode;
    const ver = (res.latestVersion || '').trim();
    const ops: Promise<void>[] = [];
    if (code != null && Number.isFinite(code)) {
      ops.push(AsyncStorage.setItem(UPDATE_DISMISSED_CODE_KEY, String(code)));
    }
    if (ver) ops.push(AsyncStorage.setItem(UPDATE_DISMISSED_VERSION_KEY, ver));
    await Promise.all(ops);
  } catch {
    /* ignore */
  }
}

export async function clearDismissedUpdate(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(UPDATE_DISMISSED_CODE_KEY),
      AsyncStorage.removeItem(UPDATE_DISMISSED_VERSION_KEY),
      AsyncStorage.removeItem(UPDATE_PENDING_CODE_KEY),
      AsyncStorage.removeItem(UPDATE_PENDING_VERSION_KEY),
    ]);
  } catch {
    /* ignore */
  }
}

export async function shouldSuppressUpdateModal(res: UpdateCheckResult): Promise<boolean> {
  try {
    const [dismissedCodeRaw, dismissedVer, pendingCodeRaw, pendingVer] = await Promise.all([
      AsyncStorage.getItem(UPDATE_DISMISSED_CODE_KEY),
      AsyncStorage.getItem(UPDATE_DISMISSED_VERSION_KEY),
      AsyncStorage.getItem(UPDATE_PENDING_CODE_KEY),
      AsyncStorage.getItem(UPDATE_PENDING_VERSION_KEY),
    ]);

    const latestCode = res.latestVersionCode != null ? String(res.latestVersionCode) : '';
    const latestVer = (res.latestVersion || '').trim();

    if (dismissedCodeRaw && latestCode && dismissedCodeRaw === latestCode) return true;
    if (dismissedVer && latestVer && dismissedVer === latestVer) return true;

    // Đã mở màn cài — không chặn modal lại cho tới khi app khởi động lại với bản mới
    if (pendingCodeRaw && latestCode && pendingCodeRaw === latestCode) return true;
    if (pendingVer && latestVer && pendingVer === latestVer) return true;

    return false;
  } catch {
    return false;
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (Platform.OS !== 'android') return { updateAvailable: false };
  try {
    const params = new URLSearchParams({
      app: APP_KEY,
      platform: 'android',
      version: currentVersionName(),
    });
    const code = currentVersionCode();
    if (code != null) params.set('versionCode', String(code));
    const deviceId = Application.getAndroidId?.();
    if (deviceId) params.set('deviceId', deviceId);

    const res = await fetch(`${API_ORIGIN}/api/app-updates/check?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { updateAvailable: false };
    const data = (await res.json()) as UpdateCheckResult;

    const localVer = currentVersionName();
    const localCode = currentVersionCode();
    const latestVer = (data.latestVersion || '').trim();
    const latestCode = data.latestVersionCode ?? null;

    // Máy đã >= bản server → không bắt cập nhật (theo tên hoặc versionCode).
    const upToDateByName = !!(localVer && latestVer && compareVersionNames(localVer, latestVer) >= 0);
    const upToDateByCode =
      localCode != null && latestCode != null && Number.isFinite(latestCode) && localCode >= latestCode;

    if (upToDateByName || upToDateByCode) {
      void clearDismissedUpdate();
      return {
        ...data,
        updateAvailable: false,
        mandatory: false,
        needsUpdate: false,
        downloadUrl: null,
      };
    }

    return data;
  } catch {
    return { updateAvailable: false };
  }
}

async function readDownloadErrorMessage(url: string, status: number): Promise<string> {
  let msg = `Không tải được APK (HTTP ${status})`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
  } catch {
    /* ignore */
  }
  return msg;
}

async function assertDownloadReady(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch {
    res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-3' } });
  }
  if (!res.ok) {
    throw new Error(await readDownloadErrorMessage(url, res.status));
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('text/html')) {
    throw new Error(
      'APK chưa sẵn sàng trên server — admin cần deploy file APK lên server rồi thử lại.',
    );
  }
}

async function hashFileSha256(uri: string, size: number): Promise<string> {
  const hasher = createSha256();
  const chunkBytes = 512 * 1024;
  let pos = 0;
  while (pos < size) {
    const length = Math.min(chunkBytes, size - pos);
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length,
      position: pos,
    });
    hasher.update(base64ToBytes(b64));
    pos += length;
  }
  return hasher.digestHex();
}

async function assertDownloadedApk(
  uri: string,
  expectedSize?: number | null,
  expectedSha256?: string | null,
): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) {
    throw new Error('Tải APK thất bại — không lấy được file.');
  }

  if (info.size < 512 * 1024) {
    try {
      const text = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const trimmed = text.trim();
      if (trimmed.startsWith('{')) {
        const body = JSON.parse(trimmed) as { error?: string; message?: string };
        if (body?.error) throw new Error(String(body.error));
        if (body?.message) throw new Error(String(body.message));
      }
    } catch (e) {
      if (e instanceof Error && !e.message.includes('JSON')) throw e;
    }
    throw new Error(
      'File tải về không phải APK hợp lệ — có thể bản phát hành chưa được upload lên server.',
    );
  }

  try {
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 4,
      position: 0,
    });
    const bin = atob(head);
    if (!bin.startsWith('PK')) {
      throw new Error('File tải về không phải APK hợp lệ.');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('APK')) throw e;
  }

  if (expectedSize && expectedSize > 0) {
    const diff = Math.abs(info.size - expectedSize);
    const tolerance = Math.max(512 * 1024, expectedSize * 0.03);
    if (diff > tolerance) {
      if (info.size < expectedSize * 0.5) {
        throw new Error(
          'APK chưa có trên server hoặc tải bị gián đoạn — báo admin deploy bản 2.0.21 rồi thử lại.',
        );
      }
      throw new Error(
        `File tải về không khớp dung lượng (${info.size} / ${expectedSize} bytes) — vui lòng thử lại hoặc báo admin upload lại APK.`,
      );
    }
  }

  const wantSha = normalizeSha256Hex(expectedSha256);
  if (wantSha && /^[0-9a-f]{64}$/.test(wantSha)) {
    const gotSha = await hashFileSha256(uri, info.size);
    if (gotSha !== wantSha) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        /* ignore */
      }
      throw new Error(
        'APK tải về không khớp checksum (sha256) — file có thể bị hỏng hoặc giả mạo. Vui lòng tải lại.',
      );
    }
  }
}

export async function downloadAndInstall(
  url: string,
  version: string,
  opts: {
    expectedSize?: number | null;
    expectedSha256?: string | null;
    onProgress?: (ratio: number) => void;
  } = {},
): Promise<boolean> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');

  const apk = await downloadApkToCache(url, version, opts);
  await openDownloadedApk(apk.uri, {
    version,
    versionCode: null,
  });
  return true;
}

export async function downloadApkToCache(
  url: string,
  version: string,
  opts: {
    expectedSize?: number | null;
    expectedSha256?: string | null;
    onProgress?: (ratio: number) => void;
  } = {},
): Promise<{ uri: string }> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');

  await assertDownloadReady(url);

  const safeVersion = String(version || 'latest').replace(/[^0-9A-Za-z._-]/g, '_');
  const target = `${FileSystem.cacheDirectory}update-${safeVersion}.apk`;

  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    /* ignore */
  }

  let resultUri = target;
  try {
    const resumable = FileSystem.createDownloadResumable(url, target, {}, (p) => {
      if (opts.onProgress && p.totalBytesExpectedToWrite > 0) {
        opts.onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });
    const result = await resumable.downloadAsync();
    if (result?.uri) resultUri = result.uri;
  } catch (e) {
    // Fallback khi resumable lỗi / mất file trên một số máy Android.
    const result = await FileSystem.downloadAsync(url, target);
    if (!result?.uri) {
      throw new Error(
        e instanceof Error && e.message
          ? `Tải APK thất bại: ${e.message}`
          : 'Tải APK thất bại',
      );
    }
    resultUri = result.uri;
  }

  const info = await FileSystem.getInfoAsync(resultUri);
  if (!info.exists || !info.size) {
    throw new Error(
      'Tải APK thất bại — file không lưu được vào máy. Thử lại hoặc tải APK từ trang Cập nhật trên web.',
    );
  }

  try {
    await assertDownloadedApk(resultUri, opts.expectedSize, opts.expectedSha256);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || '');
    if (/ENOENT|FileNotFound|readAsStringAsync/i.test(msg)) {
      throw new Error(
        'Tải APK chưa xong hoặc file bị mất trong cache. Bấm tải lại; nếu vẫn lỗi hãy tải APK từ web.',
      );
    }
    throw e;
  }
  return { uri: resultUri };
}

export async function openDownloadedApk(
  apkUri: string,
  opts: { version?: string | null; versionCode?: number | null } = {},
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');
  const contentUri = await FileSystem.getContentUriAsync(apkUri);
  await markPendingUpdateInstall(opts);
  await dismissUpdateForRelease({
    updateAvailable: true,
    latestVersion: opts.version,
    latestVersionCode: opts.versionCode,
  });
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}

async function markPendingUpdateInstall(opts: {
  version?: string | null;
  versionCode?: number | null;
}): Promise<void> {
  try {
    const code = opts.versionCode;
    if (code != null && Number.isFinite(code)) {
      await AsyncStorage.setItem(UPDATE_PENDING_CODE_KEY, String(code));
    }
    const ver = (opts.version || '').trim();
    if (ver) await AsyncStorage.setItem(UPDATE_PENDING_VERSION_KEY, ver);
  } catch {
    /* ignore */
  }
}

export async function consumeUpdateSuccessMessage(): Promise<string | null> {
  try {
    const [pendingCodeRaw, pendingVer] = await Promise.all([
      AsyncStorage.getItem(UPDATE_PENDING_CODE_KEY),
      AsyncStorage.getItem(UPDATE_PENDING_VERSION_KEY),
    ]);
    if (!pendingCodeRaw && !pendingVer) return null;

    const currentCode = currentVersionCode();
    const pendingCode = pendingCodeRaw ? Number(pendingCodeRaw) : null;
    const currentVer = currentVersionName();

    const okByCode =
      pendingCode != null &&
      Number.isFinite(pendingCode) &&
      currentCode != null &&
      Number.isFinite(currentCode) &&
      currentCode >= pendingCode;
    const okByVersion =
      !!pendingVer &&
      !!currentVer &&
      (pendingVer === currentVer || compareVersionNames(currentVer, pendingVer) >= 0);

    if (!okByCode && !okByVersion) return null;

    await Promise.all([
      AsyncStorage.removeItem(UPDATE_PENDING_CODE_KEY),
      AsyncStorage.removeItem(UPDATE_PENDING_VERSION_KEY),
      AsyncStorage.removeItem(UPDATE_DISMISSED_CODE_KEY),
      AsyncStorage.removeItem(UPDATE_DISMISSED_VERSION_KEY),
    ]);
    return `Đã cập nhật thành công lên phiên bản ${currentVer || pendingVer || ''}`.trim();
  } catch {
    return null;
  }
}
