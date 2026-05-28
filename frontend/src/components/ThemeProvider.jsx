import {
  createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef,
} from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { findPreset, TEXT_PALETTES } from '../lib/backgroundPresets';

const ThemeContext = createContext();

const PRESET_THEMES = [
  {
    id: 'default', name: 'Mặc định',
    sidebar: '#1b2a4a', sidebarHover: '#243556', sidebarActive: '#2d4a7a', sidebarText: '#ffffff',
    pageBg: '#f0f2f5', accent: '#2563eb',
    textHeading: '#111827', textBody: '#374151', textMuted: '#6b7280', textCard: '#1f2937',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'ocean', name: '🌊 Đại dương',
    sidebar: '#0c2d48', sidebarHover: '#14394f', sidebarActive: '#1a4a6e', sidebarText: '#ffffff',
    pageBg: '#e8f4f8', accent: '#0ea5e9',
    textHeading: '#0c2d48', textBody: '#1e4b6e', textMuted: '#5a8faa', textCard: '#0f3652',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'forest', name: '🌲 Rừng xanh',
    sidebar: '#1a2e1a', sidebarHover: '#243824', sidebarActive: '#2d4a2d', sidebarText: '#ffffff',
    pageBg: '#f0f5f0', accent: '#16a34a',
    textHeading: '#1a2e1a', textBody: '#2d4a2d', textMuted: '#5a7a5a', textCard: '#1f3a1f',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'sunset', name: '🌅 Hoàng hôn',
    sidebar: '#3d1f1f', sidebarHover: '#4a2929', sidebarActive: '#5c3333', sidebarText: '#ffffff',
    pageBg: '#fef5f0', accent: '#ea580c',
    textHeading: '#3d1f1f', textBody: '#5c3333', textMuted: '#9a6b6b', textCard: '#4a2525',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'purple', name: '💜 Tím',
    sidebar: '#2d1b4e', sidebarHover: '#3a2560', sidebarActive: '#4a3075', sidebarText: '#ffffff',
    pageBg: '#f5f0ff', accent: '#7c3aed',
    textHeading: '#2d1b4e', textBody: '#4a3075', textMuted: '#8b6fb8', textCard: '#3a2560',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
  {
    id: 'dark', name: '🌙 Tối',
    sidebar: '#111111', sidebarHover: '#1a1a1a', sidebarActive: '#2a2a2a', sidebarText: '#ffffff',
    pageBg: '#1e1e1e', accent: '#60a5fa',
    textHeading: '#f0f0f0', textBody: '#d0d0d0', textMuted: '#888888', textCard: '#e0e0e0',
    bgImage: null, bgOverlay: 'rgba(0,0,0,0)',
  },
];

/** hex (#rrggbb hoặc #rgb) → { r, g, b }; trả null nếu sai định dạng */
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/**
 * Resolve preset từ theme.bgPreset (nếu có).
 * Trả về null nếu không phải preset hợp lệ.
 */
function resolveBgPreset(theme) {
  return findPreset(theme?.bgPreset);
}

function applyTheme(theme) {
  const root = document.documentElement;
  const preset = resolveBgPreset(theme);

  // ── Hiệu ứng sidebar: 'solid' (đặc) | 'transparent' (đổ bóng trong suốt) | 'frosted' (bóng mờ kính) ──
  const sidebarStyle = theme.sidebarStyle || 'solid';
  const sidebarBase = preset?.sidebar || theme.sidebar;
  let sidebarBg = sidebarBase;
  let sidebarHover = theme.sidebarHover;
  let sidebarActive = theme.sidebarActive;
  let backdropFilter = 'none';
  if (sidebarStyle === 'frosted') {
    sidebarBg = rgba(sidebarBase, 0.55);
    sidebarHover = rgba(sidebarBase, 0.75);
    sidebarActive = rgba(theme.sidebarActive, 0.85);
    backdropFilter = 'blur(22px) saturate(180%)';
  } else if (sidebarStyle === 'transparent') {
    sidebarBg = rgba(sidebarBase, 0.28);
    sidebarHover = rgba(sidebarBase, 0.5);
    sidebarActive = rgba(theme.sidebarActive, 0.7);
    backdropFilter = 'blur(8px) saturate(130%)';
  }

  root.style.setProperty('--color-sidebar', sidebarBg);
  root.style.setProperty('--color-sidebar-hover', sidebarHover);
  root.style.setProperty('--color-sidebar-active', sidebarActive);
  root.style.setProperty('--sidebar-backdrop', backdropFilter);
  root.style.setProperty('--color-sidebar-text', '#ffffff');
  root.style.setProperty('--color-sidebar-text-active', '#ffffff');
  root.style.setProperty('--color-page-bg', theme.pageBg);
  root.style.setProperty('--color-primary-600', preset?.accent || theme.accent);

  // ── Text colors ──
  // Auto palette từ preset.textTheme (light/dark). Override thủ công (theme.text*) đè lên auto.
  const palette = preset ? TEXT_PALETTES[preset.textTheme] || TEXT_PALETTES.dark : null;
  root.style.setProperty('--color-text-heading', theme.textHeading || palette?.textHeading || '#111827');
  root.style.setProperty('--color-text-body', theme.textBody || palette?.textBody || '#374151');
  root.style.setProperty('--color-text-muted', theme.textMuted || palette?.textMuted || '#6b7280');
  root.style.setProperty('--color-text-card', theme.textCard || palette?.textCard || '#1f2937');

  // ── Background layer (gradient/image), animated scene xử lý ngoài ──
  if (preset?.type === 'gradient' && preset.gradient) {
    root.style.setProperty('--bg-image', preset.gradient);
    root.style.setProperty('--bg-image-mode', 'gradient');
    root.style.setProperty('--bg-overlay', 'rgba(0,0,0,0)');
  } else if (preset?.type === 'image' && preset.image) {
    root.style.setProperty('--bg-image', `url(${preset.image})`);
    root.style.setProperty('--bg-image-mode', 'image');
    root.style.setProperty('--bg-overlay', preset.overlay || 'rgba(0,0,0,0.15)');
  } else if (preset?.type === 'animated') {
    // Animated → render canvas riêng. Nền tĩnh lấy từ baseGradient (đẹp trước khi canvas paint).
    root.style.setProperty('--bg-image', preset.baseGradient || 'none');
    root.style.setProperty('--bg-image-mode', preset.baseGradient ? 'gradient' : 'none');
    root.style.setProperty('--bg-overlay', 'rgba(0,0,0,0)');
  } else if (theme.bgImage) {
    root.style.setProperty('--bg-image', `url(${theme.bgImage})`);
    root.style.setProperty('--bg-image-mode', 'image');
    root.style.setProperty('--bg-overlay', theme.bgOverlay || 'rgba(0,0,0,0.03)');
  } else {
    root.style.setProperty('--bg-image', 'none');
    root.style.setProperty('--bg-image-mode', 'none');
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

  /**
   * Cập nhật màu chữ tuỳ chỉnh. Truyền value=null cho field nào để xoá override
   * (quay về palette auto từ preset).
   */
  const setTextColors = (colors) => {
    setTheme((prev) => {
      const next = { ...prev };
      Object.keys(colors || {}).forEach((k) => {
        if (colors[k] === null || colors[k] === undefined) {
          delete next[k];
        } else {
          next[k] = colors[k];
        }
      });
      return next;
    });
  };

  /** Đổi hiệu ứng sidebar: 'solid' | 'transparent' | 'frosted'. */
  const setSidebarStyle = (style) => {
    if (!['solid', 'transparent', 'frosted'].includes(style)) return;
    setTheme({ ...theme, sidebarStyle: style });
  };

  /**
   * Chọn preset hình nền theo id (gradient/image/animated).
   * Đồng thời xoá bgImage cũ (upload) để không xung đột.
   */
  const setBgPreset = (presetId) => {
    setTheme((prev) => ({ ...prev, bgPreset: presetId, bgImage: null }));
  };

  /** Xoá hết preset/upload → quay về theme.pageBg đơn sắc. */
  const clearBackground = () => {
    setTheme((prev) => ({ ...prev, bgPreset: null, bgImage: null, bgOverlay: 'rgba(0,0,0,0)' }));
  };

  /** Scene động đang chọn (rain/stars/snow/raindrops) — App.jsx render canvas. */
  const activeAnimatedScene = (() => {
    const p = findPreset(theme?.bgPreset);
    if (p?.type === 'animated') return { scene: p.scene, opts: p.sceneOpts || {}, id: p.id };
    return null;
  })();

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
        setSidebarStyle,
        setBgPreset,
        clearBackground,
        activeAnimatedScene,
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
