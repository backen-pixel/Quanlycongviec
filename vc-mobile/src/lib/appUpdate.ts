/**
 * Tự cập nhật full APK (sideload) cho app nội bộ SX.
 * Hỏi server /api/app-updates/check, tải APK và mở trình cài đặt Android.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from '../config';
import {
  canInstallApkFromApp,
  INSTALL_PERMISSION_ERROR,
  launchApkInstall,
  openApkInstallSettings,
} from './apkInstallNative';

export const APP_KEY = 'vc-mobile';

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

const UPDATE_PENDING_CODE_KEY = '@vc_update_pending_code';
const UPDATE_PENDING_VERSION_KEY = '@vc_update_pending_version';
const UPDATE_DISMISSED_CODE_KEY = '@vc_update_dismissed_code';
const UPDATE_DISMISSED_VERSION_KEY = '@vc_update_dismissed_version';

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
  return (
    Application.nativeApplicationVersion
    || Constants.nativeAppVersion
    || Constants.expoConfig?.version
    || ''
  ).trim();
}

export function isUpToDate(res: UpdateCheckResult): boolean {
  const localCode = currentVersionCode();
  const localVer = currentVersionName();
  const latestCode = res.latestVersionCode ?? null;
  const latestVer = res.latestVersion ?? null;

  if (res.needsUpdate === false) return true;
  if (!res.updateAvailable && res.needsUpdate !== true) return true;

  if (localVer && latestVer && compareVersionNames(localVer, latestVer) >= 0) return true;
  if (localCode != null && latestCode != null && localCode >= latestCode) return true;

  return false;
}

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

async function assertDownloadedApk(uri: string, expectedSize?: number | null): Promise<void> {
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
          'APK chưa có trên server hoặc tải bị gián đoạn — báo admin deploy APK rồi thử lại.',
        );
      }
      throw new Error(
        `File tải về không khớp dung lượng (${info.size} / ${expectedSize} bytes) — vui lòng thử lại.`,
      );
    }
  }
}

export async function downloadAndInstall(
  url: string,
  version: string,
  opts: { expectedSize?: number | null; onProgress?: (ratio: number) => void } = {},
): Promise<boolean> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');
  const apk = await downloadApkToCache(url, version, opts);
  await openDownloadedApk(apk.uri, { version, versionCode: null });
  return true;
}

export async function downloadApkToCache(
  url: string,
  version: string,
  opts: { expectedSize?: number | null; onProgress?: (ratio: number) => void } = {},
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

  const resumable = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (opts.onProgress && p.totalBytesExpectedToWrite > 0) {
      opts.onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });

  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error('Tải APK thất bại');
  await assertDownloadedApk(result.uri, opts.expectedSize);
  return { uri: result.uri };
}

export async function openDownloadedApk(
  apkUri: string,
  opts: { version?: string | null; versionCode?: number | null } = {},
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');

  const canInstall = await canInstallApkFromApp();
  if (!canInstall) {
    const err = new Error(
      'Cần bật "Cho phép cài đặt ứng dụng không rõ nguồn" cho Lắp đặt.',
    ) as Error & { code?: string };
    err.code = INSTALL_PERMISSION_ERROR;
    throw err;
  }

  const contentUri = apkUri.startsWith('content://')
    ? apkUri
    : await FileSystem.getContentUriAsync(apkUri);

  await markPendingUpdateInstall(opts);
  await dismissUpdateForRelease({
    updateAvailable: true,
    latestVersion: opts.version,
    latestVersionCode: opts.versionCode,
  });

  try {
    await launchApkInstall(contentUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('NO_INSTALL_PERMISSION') || msg.toLowerCase().includes('không rõ nguồn')) {
      const err = new Error(
        'Cần bật "Cho phép cài đặt ứng dụng không rõ nguồn" cho Lắp đặt.',
      ) as Error & { code?: string };
      err.code = INSTALL_PERMISSION_ERROR;
      throw err;
    }
    throw e;
  }
}

export { openApkInstallSettings };

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
