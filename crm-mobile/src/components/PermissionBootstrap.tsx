import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import {
  CRM_PERMISSION_ONBOARDING_DONE_KEY,
  grantAllPermissionsQuick,
  getAppPermissionGaps,
  promptAppPermissionsIfNeeded,
} from '../lib/appPermissions';
import { syncVoiceBackgroundTaskWithPrefs } from '../lib/voiceBackgroundSync';

/**
 * Yêu cầu tất cả permission ngay sau đăng nhập (lần đầu),
 * không hiện modal bước trung gian — hệ thống tự bắn hộp thoại từng quyền.
 * Với overlay Android (chỉ mở được qua Settings): hỏi 1 lần rõ ràng.
 */
export default function PermissionBootstrap() {
  const { token, loading } = useAuth();
  const lastPromptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (loading || !token) return;
      const done = await AsyncStorage.getItem(CRM_PERMISSION_ONBOARDING_DONE_KEY);
      if (cancelled) return;

      if (!done) {
        // Lần đầu: cấp tất cả quyền trực tiếp (không qua modal)
        await grantAllPermissionsQuick();
        await AsyncStorage.setItem(CRM_PERMISSION_ONBOARDING_DONE_KEY, '1');
        void syncVoiceBackgroundTaskWithPrefs();

        // Kiểm tra còn thiếu gì không (chủ yếu overlay Android)
        if (!cancelled) {
          const still = await getAppPermissionGaps();
          if (still.includes('overlay_android')) {
            Alert.alert(
              'Cho phép hiển thị trên app khác',
              'Để bong bóng Messenger hoạt động khi dùng app khác, hãy bật "Hiển thị trên app khác" trong cài đặt.',
              [
                { text: 'Để sau', style: 'cancel' },
                { text: 'Mở cài đặt', onPress: () => void Linking.openSettings() },
              ],
            );
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, token]);

  // Nhắc lại khi app trở lại foreground nếu vẫn còn thiếu quyền
  useEffect(() => {
    if (loading || !token) return;

    const maybePrompt = () => {
      const now = Date.now();
      if (now - lastPromptRef.current < 3000) return;
      lastPromptRef.current = now;
      promptAppPermissionsIfNeeded();
      void syncVoiceBackgroundTaskWithPrefs();
    };

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') maybePrompt();
    });
    return () => sub.remove();
  }, [loading, token]);

  return null;
}
