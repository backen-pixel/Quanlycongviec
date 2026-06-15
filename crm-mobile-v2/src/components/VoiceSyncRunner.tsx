import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  runVoiceBackgroundSyncOnce,
  startVoiceBackgroundSyncLoop,
  stopVoiceBackgroundSyncLoop,
} from '../lib/voiceBackgroundSync';
import { loadCrmMobilePrefs } from '../lib/crmMobilePrefs';

/** Khởi chạy quét ghi âm nền sau đăng nhập (Android). */
export default function VoiceSyncRunner() {
  const { token, loading } = useAuth();

  useEffect(() => {
    if (loading || !token || Platform.OS !== 'android') {
      stopVoiceBackgroundSyncLoop();
      return;
    }

    void (async () => {
      const prefs = await loadCrmMobilePrefs();
      if (!prefs.voiceBackgroundSyncEnabled || !prefs.voiceCaptureEnabled) {
        stopVoiceBackgroundSyncLoop();
        return;
      }
      startVoiceBackgroundSyncLoop();
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
