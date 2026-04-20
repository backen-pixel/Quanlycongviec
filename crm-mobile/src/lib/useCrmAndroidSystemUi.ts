import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { CrmColors } from '../theme/crmTheme';

/**
 * Đồng bộ thanh điều hướng Android với nền app (#EEF2F8) — tránh đường đen dưới cùng,
 * phù hợp edgeToEdgeEnabled: false trong app.json + expo-navigation-bar.
 */
export function useCrmAndroidSystemUi(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const apply = () => {
      void (async () => {
        try {
          await NavigationBar.setBackgroundColorAsync(CrmColors.pageBg);
          await NavigationBar.setBorderColorAsync(CrmColors.gray200);
          await NavigationBar.setButtonStyleAsync('dark');
        } catch {
          /* emulator / unsupported */
        }
      })();
    };

    apply();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') apply();
    });
    return () => sub.remove();
  }, []);
}
