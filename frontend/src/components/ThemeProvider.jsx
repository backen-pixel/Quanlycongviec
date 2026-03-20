import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const PRESET_THEMES = [
  {
    id: 'default',
    name: 'Mặc định',
    sidebar: '#1b2a4a',
    sidebarHover: '#243556',
    sidebarActive: '#2d4a7a',
    sidebarText: '#94a3c6',
    pageBg: '#f0f2f5',
    accent: '#2563eb',
    bgImage: null,
    bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'ocean',
    name: '🌊 Đại dương',
    sidebar: '#0c2d48',
    sidebarHover: '#14394f',
    sidebarActive: '#1a4a6e',
    sidebarText: '#7eb8d8',
    pageBg: '#e8f4f8',
    accent: '#0ea5e9',
    bgImage: null,
    bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'forest',
    name: '🌲 Rừng xanh',
    sidebar: '#1a2e1a',
    sidebarHover: '#243824',
    sidebarActive: '#2d4a2d',
    sidebarText: '#8fb88f',
    pageBg: '#f0f5f0',
    accent: '#16a34a',
    bgImage: null,
    bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'sunset',
    name: '🌅 Hoàng hôn',
    sidebar: '#3d1f1f',
    sidebarHover: '#4a2929',
    sidebarActive: '#5c3333',
    sidebarText: '#d4a0a0',
    pageBg: '#fef5f0',
    accent: '#ea580c',
    bgImage: null,
    bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'purple',
    name: '💜 Tím',
    sidebar: '#2d1b4e',
    sidebarHover: '#3a2560',
    sidebarActive: '#4a3075',
    sidebarText: '#b8a0d8',
    pageBg: '#f5f0ff',
    accent: '#7c3aed',
    bgImage: null,
    bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'dark',
    name: '🌙 Tối',
    sidebar: '#111111',
    sidebarHover: '#1a1a1a',
    sidebarActive: '#2a2a2a',
    sidebarText: '#888888',
    pageBg: '#1e1e1e',
    accent: '#60a5fa',
    bgImage: null,
    bgOverlay: 'rgba(0,0,0,0)',
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

  // Background image
  if (theme.bgImage) {
    root.style.setProperty('--bg-image', `url(${theme.bgImage})`);
    root.style.setProperty('--bg-overlay', theme.bgOverlay || 'rgba(0,0,0,0.03)');
  } else {
    root.style.setProperty('--bg-image', 'none');
    root.style.setProperty('--bg-overlay', 'rgba(0,0,0,0)');
  }

  // Scrollbar color based on theme
  root.style.setProperty('--scrollbar-thumb', theme.id === 'dark' ? '#444' : '#c1c9d6');
  root.style.setProperty('--scrollbar-hover', theme.id === 'dark' ? '#666' : '#a0aec0');
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('tubep_theme');
      if (saved) return JSON.parse(saved);
    } catch {}
    return PRESET_THEMES[0];
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('tubep_theme', JSON.stringify(theme));
  }, [theme]);

  const changeTheme = (themeOrId) => {
    if (typeof themeOrId === 'string') {
      const preset = PRESET_THEMES.find(t => t.id === themeOrId);
      if (preset) setTheme(preset);
    } else {
      setTheme(themeOrId);
    }
  };

  const setBackgroundImage = (imageUrl) => {
    setTheme(prev => ({
      ...prev,
      id: 'custom',
      bgImage: imageUrl,
      bgOverlay: 'rgba(0,0,0,0.03)',
    }));
  };

  const setOverlayOpacity = (opacity) => {
    setTheme(prev => ({
      ...prev,
      bgOverlay: `rgba(0,0,0,${opacity})`,
    }));
  };

  return (
    <ThemeContext.Provider value={{ theme, changeTheme, setBackgroundImage, setOverlayOpacity, presets: PRESET_THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { PRESET_THEMES };
