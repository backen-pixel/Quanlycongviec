/**
 * Quản lý giao diện Sáng/Tối toàn app. Lưu lựa chọn vào AsyncStorage,
 * mặc định Tối. Dùng `useColors()` để lấy bảng màu hiện tại trong component.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Palettes, type ThemeColors, type ThemeMode } from './index';

const STORAGE_KEY = 'crm.theme.mode';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  ready: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: Palettes.dark,
  ready: false,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!active) return;
        if (v === 'light' || v === 'dark') setModeState(v);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((m: ThemeMode) => {
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      persist(m);
    },
    [persist],
  );

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, [persist]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: Palettes[mode], ready, setMode, toggle }),
    [mode, ready, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
