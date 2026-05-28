/**
 * Bộ 20 preset hình nền cho toàn ứng dụng.
 *
 * Mỗi preset có các trường:
 * - id              unique key (lưu xuống theme.bgPreset)
 * - name            tên hiển thị (có thể chứa emoji)
 * - category        'aurora' | 'minimal' | 'pastel' | 'landscape' | 'animated'
 * - type            'gradient' | 'image' | 'animated'
 * - gradient        CSS background (gradient) — khi type='gradient'
 * - image           URL ảnh 4K hot-link (Unsplash) — khi type='image'
 * - scene           tên scene canvas (rain | stars | snow | raindrops | sparks | meteors)
 * - sceneOpts       props tuỳ scene (vd. intensity, color, speed)
 * - baseGradient    gradient nền tĩnh phía sau canvas (animated) — đảm bảo nhìn đẹp trước khi canvas ready
 * - textTheme       'light' | 'dark' — bộ màu chữ tự áp dụng
 * - accent          màu chính (#hex) — dùng cho button/highlight
 * - sidebar         màu sidebar phù hợp (#hex)
 * - thumb           CSS gradient/colour cho ô preview nhỏ
 */

/** Bộ màu chữ tương ứng textTheme — đảm bảo dễ đọc trên nền. */
export const TEXT_PALETTES = {
  light: {
    textHeading: '#ffffff',
    textBody: '#e2ecff',
    textMuted: '#a8b8d8',
    textCard: '#ffffff',
  },
  dark: {
    textHeading: '#0f172a',
    textBody: '#1e3a5f',
    textMuted: '#475569',
    textCard: '#0f172a',
  },
};

/**
 * URL ảnh Unsplash 4K (hot-link). Format ổn định, hỗ trợ resize qua query param.
 * Nếu mạng chậm/chặn, user có thể upload ảnh riêng (fallback).
 */
function unsplash(id, w = 3840) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

export const BACKGROUND_PRESETS = [
  // ─────────── AURORA — gradient động bằng CSS ───────────
  {
    id: 'aurora-night',
    name: '🌌 Cực quang đêm',
    category: 'aurora',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    textTheme: 'light',
    accent: '#06b6d4',
    sidebar: '#0c1b29',
    thumb: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  },
  {
    id: 'aurora-violet',
    name: '🌠 Cực quang tím',
    category: 'aurora',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #1a0b3d 0%, #4a148c 40%, #00b8d4 100%)',
    textTheme: 'light',
    accent: '#a855f7',
    sidebar: '#150834',
    thumb: 'linear-gradient(135deg, #1a0b3d, #4a148c, #00b8d4)',
  },
  {
    id: 'aurora-emerald',
    name: '✨ Cực quang xanh ngọc',
    category: 'aurora',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #003d2b 0%, #00695c 45%, #00bcd4 100%)',
    textTheme: 'light',
    accent: '#10b981',
    sidebar: '#002f22',
    thumb: 'linear-gradient(135deg, #003d2b, #00695c, #00bcd4)',
  },
  {
    id: 'aurora-rose',
    name: '🌸 Cực quang hồng',
    category: 'aurora',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #2c0a3a 0%, #6b1f7a 40%, #ec4899 100%)',
    textTheme: 'light',
    accent: '#f472b6',
    sidebar: '#220730',
    thumb: 'linear-gradient(135deg, #2c0a3a, #6b1f7a, #ec4899)',
  },

  // ─────────── MINIMAL — gradient sạch, tối giản ───────────
  {
    id: 'min-ocean',
    name: '🌊 Đại dương',
    category: 'minimal',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #001e3c 0%, #003366 100%)',
    textTheme: 'light',
    accent: '#3b82f6',
    sidebar: '#001528',
    thumb: 'linear-gradient(135deg, #001e3c, #003366)',
  },
  {
    id: 'min-midnight',
    name: '🌃 Nửa đêm',
    category: 'minimal',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    textTheme: 'light',
    accent: '#60a5fa',
    sidebar: '#0a0f1c',
    thumb: 'linear-gradient(135deg, #0f172a, #1e293b)',
  },
  {
    id: 'min-graphite',
    name: '⬛ Than chì',
    category: 'minimal',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)',
    textTheme: 'light',
    accent: '#a78bfa',
    sidebar: '#141416',
    thumb: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)',
  },
  {
    id: 'min-slate',
    name: '🪨 Đá phiến',
    category: 'minimal',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #1f2937 0%, #374151 50%, #4b5563 100%)',
    textTheme: 'light',
    accent: '#22d3ee',
    sidebar: '#161e2b',
    thumb: 'linear-gradient(135deg, #1f2937, #374151, #4b5563)',
  },

  // ─────────── PASTEL — nhẹ nhàng, ban ngày ───────────
  {
    id: 'pastel-peach',
    name: '🍑 Pastel đào',
    category: 'pastel',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    textTheme: 'dark',
    accent: '#f97316',
    sidebar: '#7c2d12',
    thumb: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
  },
  {
    id: 'pastel-mint',
    name: '🌿 Pastel bạc hà',
    category: 'pastel',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
    textTheme: 'dark',
    accent: '#16a34a',
    sidebar: '#14532d',
    thumb: 'linear-gradient(135deg, #d4fc79, #96e6a1)',
  },
  {
    id: 'pastel-sky',
    name: '☁️ Pastel trời',
    category: 'pastel',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    textTheme: 'dark',
    accent: '#2563eb',
    sidebar: '#1e3a8a',
    thumb: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)',
  },
  {
    id: 'pastel-lavender',
    name: '💜 Pastel oải hương',
    category: 'pastel',
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    textTheme: 'dark',
    accent: '#7c3aed',
    sidebar: '#4c1d95',
    thumb: 'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
  },

  // ─────────── LANDSCAPE — ảnh 4K Unsplash ───────────
  {
    id: 'land-mountain-lake',
    name: '🏔️ Núi & hồ',
    category: 'landscape',
    type: 'image',
    image: unsplash('photo-1464822759023-fed622ff2c3b'),
    thumb: unsplash('photo-1464822759023-fed622ff2c3b', 320),
    textTheme: 'light',
    accent: '#06b6d4',
    sidebar: '#0c1b29',
  },
  {
    id: 'land-forest-light',
    name: '🌲 Rừng tia nắng',
    category: 'landscape',
    type: 'image',
    image: unsplash('photo-1448375240586-882707db888b'),
    thumb: unsplash('photo-1448375240586-882707db888b', 320),
    textTheme: 'light',
    accent: '#10b981',
    sidebar: '#102218',
  },
  {
    id: 'land-mountain-sunset',
    name: '🌄 Hoàng hôn núi',
    category: 'landscape',
    type: 'image',
    image: unsplash('photo-1506905925346-21bda4d32df4'),
    thumb: unsplash('photo-1506905925346-21bda4d32df4', 320),
    textTheme: 'light',
    accent: '#f59e0b',
    sidebar: '#2a1606',
  },
  {
    id: 'land-milky-way',
    name: '🌌 Dải ngân hà',
    category: 'landscape',
    type: 'image',
    image: unsplash('photo-1419242902214-272b3f66ee7a'),
    thumb: unsplash('photo-1419242902214-272b3f66ee7a', 320),
    textTheme: 'light',
    accent: '#a855f7',
    sidebar: '#0a0518',
  },

  // ─────────── ANIMATED — canvas scene động ───────────
  {
    id: 'anim-rain-heavy',
    name: '🌧️ Mưa to 3D',
    category: 'animated',
    type: 'animated',
    scene: 'rain',
    sceneOpts: { intensity: 'heavy' },
    baseGradient: 'linear-gradient(180deg, #0c1426 0%, #1a2540 100%)',
    textTheme: 'light',
    accent: '#60a5fa',
    sidebar: '#080f1c',
    thumb: 'linear-gradient(180deg, #0c1426, #1a2540)',
  },
  {
    id: 'anim-starry-night',
    name: '⭐ Bầu trời đầy sao',
    category: 'animated',
    type: 'animated',
    scene: 'stars',
    sceneOpts: { meteors: true, density: 'high' },
    baseGradient: 'radial-gradient(ellipse at top, #1b2a4a 0%, #06091a 70%)',
    textTheme: 'light',
    accent: '#a855f7',
    sidebar: '#06091a',
    thumb: 'radial-gradient(ellipse at top, #1b2a4a, #06091a)',
  },
  {
    id: 'anim-snowfall',
    name: '❄️ Tuyết rơi 3D',
    category: 'animated',
    type: 'animated',
    scene: 'snow',
    sceneOpts: { intensity: 'medium' },
    baseGradient: 'linear-gradient(180deg, #1e293b 0%, #334155 100%)',
    textTheme: 'light',
    accent: '#22d3ee',
    sidebar: '#0f1a2c',
    thumb: 'linear-gradient(180deg, #1e293b, #334155)',
  },
  {
    id: 'anim-raindrops',
    name: '💧 Giọt nước rơi chậm',
    category: 'animated',
    type: 'animated',
    scene: 'raindrops',
    sceneOpts: { density: 'medium' },
    baseGradient: 'linear-gradient(135deg, #052e3a 0%, #094354 60%, #0d5469 100%)',
    textTheme: 'light',
    accent: '#06b6d4',
    sidebar: '#02212a',
    thumb: 'linear-gradient(135deg, #052e3a, #094354, #0d5469)',
  },
];

/** Resolve preset theo id, trả về null nếu không có. */
export function findPreset(id) {
  if (!id) return null;
  return BACKGROUND_PRESETS.find((p) => p.id === id) || null;
}

/** Nhãn category để hiển thị. */
export const CATEGORY_LABELS = {
  aurora: '🌌 Cực quang',
  minimal: '🪟 Tối giản',
  pastel: '🎨 Pastel nhẹ',
  landscape: '🏞️ Phong cảnh 4K',
  animated: '✨ Nền động',
};
