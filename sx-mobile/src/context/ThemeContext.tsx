import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type AppColors, type ThemeMode, themes } from '../theme';

const STORAGE_KEY = 'sx_theme_mode';

type ThemeCtx = {
  mode: ThemeMode;
  colors: AppColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  loading: boolean;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') setModeState(saved);
      } catch {
        /* giữ light mặc định */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      // Clone shallow để mọi màn phụ thuộc `colors` luôn nhận reference mới khi đổi theme
      // (tránh StyleSheet/Pressable giữ màu cũ trên Android).
      colors: { ...themes[mode] },
      isDark: mode === 'dark',
      setMode,
      loading,
    }),
    [mode, setMode, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme phải nằm trong ThemeProvider');
  return v;
}
