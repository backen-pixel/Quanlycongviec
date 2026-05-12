import {
  createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef,
} from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

const ThemeContext = createContext();

const PRESET_THEMES = [
  {
    id: 'default', name: 'Mặc định',
    sidebar: '#1b2a4a', sidebarHover: '#243556', sidebarActive: '#2d4a7a', sidebarText: '#94a3c6',
    pageBg: '#f0f2f5', accent: '#2563eb',
    textHeading: '#111827', textBody: '#374151', textMuted: '#6b7280', textCard: '#1f2937',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'ocean', name: '🌊 Đại dương',
    sidebar: '#0c2d48', sidebarHover: '#14394f', sidebarActive: '#1a4a6e', sidebarText: '#7eb8d8',
    pageBg: '#e8f4f8', accent: '#0ea5e9',
    textHeading: '#0c2d48', textBody: '#1e4b6e', textMuted: '#5a8faa', textCard: '#0f3652',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'forest', name: '🌲 Rừng xanh',
    sidebar: '#1a2e1a', sidebarHover: '#243824', sidebarActive: '#2d4a2d', sidebarText: '#8fb88f',
    pageBg: '#f0f5f0', accent: '#16a34a',
    textHeading: '#1a2e1a', textBody: '#2d4a2d', textMuted: '#5a7a5a', textCard: '#1f3a1f',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'sunset', name: '🌅 Hoàng hôn',
    sidebar: '#3d1f1f', sidebarHover: '#4a2929', sidebarActive: '#5c3333', sidebarText: '#d4a0a0',
    pageBg: '#fef5f0', accent: '#ea580c',
    textHeading: '#3d1f1f', textBody: '#5c3333', textMuted: '#9a6b6b', textCard: '#4a2525',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'purple', name: '💜 Tím',
    sidebar: '#2d1b4e', sidebarHover: '#3a2560', sidebarActive: '#4a3075', sidebarText: '#b8a0d8',
    pageBg: '#f5f0ff', accent: '#7c3aed',
    textHeading: '#2d1b4e', textBody: '#4a3075', textMuted: '#8b6fb8', textCard: '#3a2560',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'dark', name: '🌙 Tối',
    sidebar: '#111111', sidebarHover: '#1a1a1a', sidebarActive: '#2a2a2a', sidebarText: '#888888',
    pageBg: '#1e1e1e', accent: '#60a5fa',
    textHeading: '#f0f0f0', textBody: '#d0d0d0', textMuted: '#888888', textCard: '#e0e0e0',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
];

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--color-sidebar', theme.sidebar);
  root.style.setProperty('--color-sidebar-hover', theme.sidebarHover);
  root.style.setProperty('--color-sidebar-active', theme.sidebarActive);
  root.style.setProperty('--color-sidebar-text', theme.sidebarText);
  root.style.setProperty('--color-sidebar-text-active', '#ffffff');
  root.style.setProperty('--color-page-bg', theme.pageBg);
  root.style.setProperty('--color-primary-600', theme.accent);

  // Text colors
  root.style.setProperty('--color-text-heading', theme.textHeading || '#111827');
  root.style.setProperty('--color-text-body', theme.textBody || '#374151');
  root.style.setProperty('--color-text-muted', theme.textMuted || '#6b7280');
  root.style.setProperty('--color-text-card', theme.textCard || '#1f2937');

  // Background image
  if (theme.bgImage) {
    root.style.setProperty('--bg-image', `url(${theme.bgImage})`);
    root.style.setProperty('--bg-overlay', theme.bgOverlay || 'rgba(0,0,0,0.03)');
  } else {
    root.style.setProperty('--bg-image', 'none');
    root.style.setProperty('--bg-overlay', 'rgba(0,0,0,0)');
  }

  // Scrollbar
  root.style.setProperty('--scrollbar-thumb', theme.id === 'dark' ? '#444' : '#c1c9d6');
  root.style.setProperty('--scrollbar-hover', theme.id === 'dark' ? '#666' : '#a0aec0');
}

const STORAGE_KEY = 'tubep_theme';

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  /** Bỏ qua 1 lần ghi localStorage sau khi vừa nạp theme theo user (tránh ghi theme user trước vào key user mới). */
  const skipNextThemePersist = useRef(false);
  const [theme, setTheme] = useState(() => {
    try {
      // Load from localStorage first (fast)
      const userKey = `${STORAGE_KEY}_${user?.userId || 'guest'}`;
      const saved = localStorage.getItem(userKey) || localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return PRESET_THEMES[0];
  });

  /** Khi đăng nhập / đổi tài khoản: áp dụng theme cục bộ của user đó (layout — trước khi persist theme cũ nhầm key). */
  useLayoutEffect(() => {
    const uid = user?.userId || 'guest';
    const userKey = `${STORAGE_KEY}_${uid}`;
    try {
      const saved = localStorage.getItem(userKey) || localStorage.getItem(STORAGE_KEY);
      skipNextThemePersist.current = true;
      if (saved) setTheme(JSON.parse(saved));
      else setTheme(PRESET_THEMES[0]);
    } catch {
      skipNextThemePersist.current = true;
      setTheme(PRESET_THEMES[0]);
    }
  }, [user?.userId]);

  useEffect(() => {
    applyTheme(theme);
    if (skipNextThemePersist.current) {
      skipNextThemePersist.current = false;
      return;
    }
    try {
      const userKey = `${STORAGE_KEY}_${user?.userId || 'guest'}`;
      localStorage.setItem(userKey, JSON.stringify(theme));
    } catch { /* ignore */ }
  }, [theme]);

  const changeTheme = (themeOrId) => {
    let newTheme;
    if (typeof themeOrId === 'string') {
      newTheme = PRESET_THEMES.find(t => t.id === themeOrId);
    } else {
      newTheme = themeOrId;
    }
    if (newTheme) {
      setTheme(newTheme);
    }
  };

  const setBackgroundImage = (imageUrl) => {
    const newTheme = { ...theme, id: 'custom', bgImage: imageUrl, bgOverlay: 'rgba(0,0,0,0.03)' };
    setTheme(newTheme);
  };

  const setOverlayOpacity = (opacity) => {
    const newTheme = { ...theme, bgOverlay: `rgba(0,0,0,${opacity})` };
    setTheme(newTheme);
  };

  const setTextColors = (colors) => {
    const newTheme = { ...theme, ...colors, id: theme.id === 'custom' ? 'custom' : theme.id };
    setTheme(newTheme);
  };

  /** Đẩy theme hiện tại (đang lưu cục bộ) lên máy chủ cho tài khoản đăng nhập. */
  const pushThemeToServer = useCallback(async () => {
    if (!user?.userId) {
      const err = new Error('Cần đăng nhập để đồng bộ giao diện lên máy chủ.');
      throw err;
    }
    await api.put('/settings/theme', { theme });
  }, [theme, user?.userId]);

  /** Tải theme đã lưu trên máy chủ và áp dụng trên máy này (ghi đè local). */
  const pullThemeFromServer = useCallback(async () => {
    if (!user?.userId) {
      const err = new Error('Cần đăng nhập để tải giao diện từ máy chủ.');
      throw err;
    }
    const { data } = await api.get('/settings/theme');
    if (data?.theme) {
      setTheme(data.theme);
      return;
    }
    throw new Error('Chưa có giao diện nào được lưu trên máy chủ cho tài khoản này.');
  }, [user?.userId]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        changeTheme,
        setBackgroundImage,
        setOverlayOpacity,
        setTextColors,
        presets: PRESET_THEMES,
        pushThemeToServer,
        pullThemeFromServer,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { PRESET_THEMES };
