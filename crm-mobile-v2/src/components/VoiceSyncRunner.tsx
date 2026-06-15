import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  runVoiceBackgroundSyncOnce,
  startVoiceBackgroundSyncLoop,
  stopVoiceBackgroundSyncLoop,
} from '../lib/voiceBackgroundSync';
import {
  registerVoiceBackgroundTask,
  unregisterVoiceBackgroundTask,
} from '../lib/voiceBackgroundTask';
import { loadCrmMobilePrefs } from '../lib/crmMobilePrefs';

/** Khởi chạy quét ghi âm nền sau đăng nhập (Android). */
export default function VoiceSyncRunner() {
  const { token, loading } = useAuth();

  useEffect(() => {
    if (loading || !token || Platform.OS !== 'android') {
      stopVoiceBackgroundSyncLoop();
      void unregisterVoiceBackgroundTask();
      return;
    }

    void (async () => {
      const prefs = await loadCrmMobilePrefs();
      if (!prefs.voiceBackgroundSyncEnabled || !prefs.voiceCaptureEnabled) {
        stopVoiceBackgroundSyncLoop();
        await unregisterVoiceBackgroundTask();
        return;
      }
      startVoiceBackgroundSyncLoop();
      // Quét nền định kỳ cả khi app không mở (WorkManager trên Android).
      await registerVoiceBackgroundTask();
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runVoiceBackgroundSyncOnce();
    });

    return () => {
      sub.remove();
      stopVoiceBackgroundSyncLoop();
    };
  }, [loading, token]);

  return null;
}
