import { Platform, NativeModules } from 'react-native';
import { API_ORIGIN } from '../config';

const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      saveAuthToken?: (token: string) => void;
      saveApiOrigin?: (origin: string) => void;
      saveUserId?: (userId: string) => void;
      saveUiTheme?: (mode: string) => void;
    }
  | undefined;

/** Đồng bộ token/API sang SharedPreferences native (cuộc gọi khi app tắt, FCM token). */
export function syncNativeAuthPrefs(opts: {
  token?: string | null;
  userId?: string | null;
  themeMode?: 'light' | 'dark' | null;
}): void {
  if (Platform.OS !== 'android' || !Overlay) return;
  const token = (opts.token || '').trim();
  if (token) Overlay.saveAuthToken?.(token);
  if (API_ORIGIN) Overlay.saveApiOrigin?.(API_ORIGIN);
  const uid = (opts.userId || '').trim();
  if (uid) Overlay.saveUserId?.(uid);
  const mode = opts.themeMode === 'light' ? 'light' : opts.themeMode === 'dark' ? 'dark' : null;
  if (mode) Overlay.saveUiTheme?.(mode);
}
