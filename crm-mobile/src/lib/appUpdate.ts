/**
 * Tự cập nhật full APK (sideload) cho app nội bộ.
 *  - Hỏi server /api/app-updates/check (so sánh versionCode).
 *  - Nếu có bản mới: tải APK về cache rồi mở trình cài đặt Android.
 *
 * Cập nhật JS nhanh (không cài lại) do expo-updates lo (xem src/lib/otaUpdate).
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import { API_ORIGIN } from '../config';

/** Định danh app trong registry server (bảng mobile_apps.app_key). */
export const APP_KEY = 'crm-mobile';

export type UpdateCheckResult = {
  updateAvailable: boolean;
  mandatory?: boolean;
  latestVersion?: string | null;
  latestVersionCode?: number | null;
  downloadUrl?: string | null;
  size?: number | null;
  sha256?: string | null;
  releaseNotes?: string | null;
};

/** versionCode native hiện tại (Android). Trên iOS trả null. */
export function currentVersionCode(): number | null {
  if (Platform.OS !== 'android') return null;
  const raw = Application.nativeBuildVersion; // Android: chuỗi versionCode
  const n = raw != null ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function currentVersionName(): string {
  return Application.nativeApplicationVersion || '';
}

/** Gọi server kiểm tra cập nhật. Không ném lỗi — lỗi mạng trả updateAvailable=false. */
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
    return (await res.json()) as UpdateCheckResult;
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
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(await readDownloadErrorMessage(url, res.status));
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    throw new Error(
      'APK chưa sẵn sàng trên server — liên hệ quản trị viên upload lại bản phát hành.',
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

  if (expectedSize && expectedSize > 0) {
    const diff = Math.abs(info.size - expectedSize);
    const tolerance = Math.max(512 * 1024, expectedSize * 0.03);
    if (diff > tolerance) {
      throw new Error(
        `File tải về không khớp dung lượng (${info.size} / ${expectedSize} bytes) — vui lòng thử lại hoặc báo admin upload lại APK.`,
      );
    }
  }
}

/**
 * Tải APK về cache và mở trình cài đặt.
 * @returns true nếu đã mở được trình cài đặt.
 */
export async function downloadAndInstall(
  url: string,
  version: string,
  opts: { expectedSize?: number | null; onProgress?: (ratio: number) => void } = {},
): Promise<boolean> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');

  await assertDownloadReady(url);

  const safeVersion = String(version || 'latest').replace(/[^0-9A-Za-z._-]/g, '_');
  const target = `${FileSystem.cacheDirectory}update-${safeVersion}.apk`;

  // Xóa file cũ cùng tên (tránh nửa file tải dở).
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

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
  return true;
}
