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
export const APP_KEY = 'sx-mobile';

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

  // Kiểm tra toàn vẹn cơ bản theo dung lượng (sha256 do server cung cấp).
  if (opts.expectedSize) {
    const info = await FileSystem.getInfoAsync(result.uri);
    if (info.exists && info.size && Math.abs(info.size - opts.expectedSize) > 1024) {
      throw new Error('File tải về không khớp dung lượng — vui lòng thử lại');
    }
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
  return true;
}
