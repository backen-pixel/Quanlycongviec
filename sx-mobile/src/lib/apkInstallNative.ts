import { NativeModules, Platform } from 'react-native';

type ApkInstallNative = {
  canRequestPackageInstalls(): Promise<boolean>;
  openUnknownAppSourcesSettings(): Promise<boolean>;
  installApk(contentUri: string): Promise<boolean>;
};

const Native: ApkInstallNative | undefined = NativeModules.ApkInstall;

export const INSTALL_PERMISSION_ERROR = 'NO_INSTALL_PERMISSION';

export async function canInstallApkFromApp(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!Native?.canRequestPackageInstalls) return true;
  try {
    return await Native.canRequestPackageInstalls();
  } catch {
    return true;
  }
}

export async function openApkInstallSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (Native?.openUnknownAppSourcesSettings) {
    await Native.openUnknownAppSourcesSettings();
    return;
  }
  const { default: IntentLauncher } = await import('expo-intent-launcher');
  const Application = await import('expo-application');
  const pkg = Application.applicationId;
  try {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: pkg ? `package:${pkg}` : undefined,
    });
  } catch {
    if (pkg) {
      await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', {
        data: `package:${pkg}`,
      });
    }
  }
}

export async function launchApkInstall(contentUri: string): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Chỉ hỗ trợ Android');

  if (Native?.installApk) {
    await Native.installApk(contentUri);
    return;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const IntentLauncher = await import('expo-intent-launcher');
  const uri = contentUri.startsWith('content://')
    ? contentUri
    : await FileSystem.getContentUriAsync(contentUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    flags: 1 | 268435456,
    type: 'application/vnd.android.package-archive',
  });
}

export function isInstallPermissionError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const ex = e as { code?: string; message?: string };
  if (ex.code === INSTALL_PERMISSION_ERROR) return true;
  const msg = String(ex.message || '').toLowerCase();
  return msg.includes('no_install_permission') || msg.includes('không rõ nguồn');
}
