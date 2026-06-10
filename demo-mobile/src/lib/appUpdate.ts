import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import { API_ORIGIN } from '../config';

export const APP_KEY = 'tubep-demo';

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

export function currentVersionCode(): number | null {
  if (Platform.OS !== 'android') return null;
  const n = parseInt(String(Application.nativeBuildVersion ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function currentVersionName(): string {
  return Application.nativeApplicationVersion || '';
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
    const res = await fetch(`${API_ORIGIN}/api/app-updates/check?${params.toString()}`);
    if (!res.ok) return { updateAvailable: false };
    return (await res.json()) as UpdateCheckResult;
  } catch {
    return { updateAvailable: false };
  }
}

export async function downloadAndInstall(
  url: string,
  version: string,
  opts: { expectedSize?: number | null; onProgress?: (ratio: number) => void } = {},
): Promise<boolean> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');
  const safeVersion = String(version || 'latest').replace(/[^0-9A-Za-z._-]/g, '_');
  const target = `${FileSystem.cacheDirectory}update-${safeVersion}.apk`;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch { /* ignore */ }

  const resumable = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (opts.onProgress && p.totalBytesExpectedToWrite > 0) {
      opts.onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error('Tải APK thất bại');

  if (opts.expectedSize) {
    const info = await FileSystem.getInfoAsync(result.uri);
    if (info.exists && info.size && Math.abs(info.size - opts.expectedSize) > 1024) {
      throw new Error('File tải về không khớp dung lượng');
    }
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
  return true;
}
