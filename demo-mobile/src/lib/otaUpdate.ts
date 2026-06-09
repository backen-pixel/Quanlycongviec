import * as FileSystem from 'expo-file-system/legacy';
import * as Updates from 'expo-updates';
import { API_ORIGIN } from '../config';
import { APP_KEY } from './appUpdate';

export type OtaReleaseInfo = {
  available: boolean;
  version: string | null;
  runtimeVersion?: string | null;
  releaseNotes?: string | null;
  mandatory?: boolean;
  updateId?: string | null;
  publishedAt?: string | null;
  source?: string;
};

export type OtaLocalInfo = {
  enabled: boolean;
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
};

type OtaOpts = {
  onFetching?: () => void;
};

function noticeFlagPath(updateId: string) {
  return `${FileSystem.documentDirectory}ota-notice-${updateId}.flag`;
}

/** Phiên bản OTA (jsbundle) đang active trên server. */
export async function fetchOtaReleaseFromServer(runtimeVersion?: string | null): Promise<OtaReleaseInfo> {
  try {
    const params = new URLSearchParams({ app: APP_KEY });
    if (runtimeVersion) params.set('runtime', runtimeVersion);
    const res = await fetch(`${API_ORIGIN}/api/app-updates/ota-current?${params.toString()}`);
    if (!res.ok) return { available: false, version: null };
    return (await res.json()) as OtaReleaseInfo;
  } catch {
    return { available: false, version: null };
  }
}

/** Thông tin bundle OTA đang chạy trên thiết bị. */
export function getLocalOtaInfo(): OtaLocalInfo {
  return {
    enabled: Updates.isEnabled,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    updateId: Updates.updateId ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    channel: Updates.channel ?? null,
  };
}

export async function shouldShowOtaSuccessNotice(updateId: string | null): Promise<boolean> {
  if (!updateId || Updates.isEmbeddedLaunch) return false;
  try {
    const info = await FileSystem.getInfoAsync(noticeFlagPath(updateId));
    return !info.exists;
  } catch {
    return true;
  }
}

export async function markOtaSuccessNoticeShown(updateId: string): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(noticeFlagPath(updateId), '1');
  } catch {
    /* ignore */
  }
}

/** Kiểm tra & áp dụng OTA — tự reload nếu có bản mới. */
export async function checkAndApplyOtaUpdate(opts: OtaOpts = {}): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (!res.isAvailable) return false;
    opts.onFetching?.();
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}
