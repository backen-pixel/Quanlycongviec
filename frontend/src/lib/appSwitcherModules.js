import {
  CheckSquare,
  UserCircle,
  Factory,
  Truck,
  Receipt,
  ShoppingBag,
  Sigma,
  GraduationCap,
  Layers,
  Puzzle,
} from 'lucide-react';
import {
  categoryAccentFor,
  categoryClassFor,
  CUSTOM_APP_MODULE_SWITCHER_CATEGORY,
} from './appModulePresets';

export const WORK_MODULE_LABEL = 'Quản lý';
export const CONGVIEC_MODULE_LABEL = 'Công việc';
export const LOGISTICS_MODULE_LABEL = 'Lắp đặt';
export const CRM_MODULE_ICON = '/icons/crm-module.png?v=4';
export const WORK_MODULE_ICON = '/icons/work-module.png?v=3';
export const CONGVIEC_MODULE_ICON = '/icons/work-module.png?v=4';
export const SX_MODULE_ICON = '/icons/sx-module.png?v=3';
export const VC_MODULE_ICON = '/icons/vc-module.png?v=3';
export const KETOAN_MODULE_ICON = '/icons/ketoan-module.png?v=3';
export const MUAHANG_MODULE_ICON = '/icons/muahang-module.png?v=1';
export const CALC_MODULE_ICON = '/icons/calc-module.png?v=3';
export const KNOWLEDGE_MODULE_ICON = '/icons/knowledge-module.png?v=3';

export const APP_SWITCHER_FAVORITES_KEY = 'app_switcher_favorites';

/** @typedef {{ ring: string; card: string; iconWrap: string; dot: string }} SidebarAccent */

/** @typedef {{ id: string; path: string; name: string; desc: string; Icon: import('lucide-react').LucideIcon; imageUrl?: string; iconClass: string; category: string; categoryClass: string; sidebarAccent: SidebarAccent; mod: string | null; hideCrmOnly?: boolean; always?: boolean; accentColor?: string; isCustom?: boolean; emoji?: string }} AppModuleDef */

function normalizeHexColor(raw, fallback = '#4f46e5') {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return fallback;
}

/** Accent sidebar từ màu brand module tùy chỉnh (hex). */
export function sidebarAccentFromColor(hex) {
  const c = normalizeHexColor(hex);
  return {
    ring: 'ring-white/30 hover:ring-white/45',
    card: '',
    iconWrap: '',
    dot: '',
    color: c,
  };
}

/** Đã là AppModuleDef custom (từ mapCustomAppModuleToDef) hay raw API row? */
function coerceCustomAppModuleDef(row) {
  if (!row) return null;
  if (row.isCustom && String(row.id || '').startsWith('custom:')) return row;
  return mapCustomAppModuleToDef(row);
}

/** Map bản ghi app_modules API → AppModuleDef cho App Switcher. */
export function mapCustomAppModuleToDef(row) {
  if (!row?.module_key) return null;
  const color = normalizeHexColor(row.color || categoryAccentFor(row.category) || '#4f46e5');
  // Switcher luôn gom module tùy chỉnh vào mục riêng — không trộn badge với CRM/SX/…
  const category = CUSTOM_APP_MODULE_SWITCHER_CATEGORY;
  const imageUrl = row.icon_image || null;
  const accent = sidebarAccentFromColor(color);
  return {
    id: `custom:${row.module_key}`,
    path: `/m/${row.module_key}`,
    name: row.name || row.module_key,
    desc: row.description || 'Module tùy chỉnh',
    Icon: Puzzle,
    imageUrl: imageUrl || undefined,
    emoji: imageUrl ? undefined : (row.icon || '📦'),
    iconClass: 'bg-transparent shadow-none',
    category,
    categoryClass: categoryClassFor(category),
    sidebarAccent: accent,
    mod: row.module_key,
    accentColor: color,
    isCustom: true,
    adminCategory: row.category || 'Tùy chỉnh',
  };
}

/** Module hiển thị trên sidebar (lọc theo quyền). */
export function getAccessibleAppModules({ canAccessModule, crmOnly, extraModules = [] }) {
  const base = APP_MODULE_DEFINITIONS.filter((mod) => canUseAppModule(mod, { canAccessModule, crmOnly }));
  const extras = (extraModules || [])
    .map(coerceCustomAppModuleDef)
    .filter(Boolean)
    .filter((mod) => canUseAppModule(mod, { canAccessModule, crmOnly }));
  return [...base, ...extras];
}

/** @type {AppModuleDef[]} */
export const APP_MODULE_DEFINITIONS = [
  {
    id: 'work',
    path: '/dashboard',
    name: WORK_MODULE_LABEL,
    desc: 'Tổng hợp dự án, nhiệm vụ & vận hành',
    Icon: CheckSquare,
    imageUrl: WORK_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Tổng hợp',
    categoryClass: 'bg-blue-50 text-blue-700 border-blue-100',
    sidebarAccent: {
      ring: 'ring-blue-400/35 hover:ring-blue-300/55',
      card: 'bg-gradient-to-br from-blue-500/22 via-blue-500/8 to-transparent hover:from-blue-500/30',
      iconWrap: 'bg-blue-500/18 ring-1 ring-blue-300/30 shadow-inner shadow-blue-900/20',
      dot: 'bg-blue-400',
    },
    mod: null,
    hideCrmOnly: true,
  },
  {
    id: 'congviec',
    path: '/work/unified',
    name: CONGVIEC_MODULE_LABEL,
    desc: 'Tổng hợp nhiệm vụ từ CRM, SX, VC & giao việc',
    Icon: Layers,
    imageUrl: CONGVIEC_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Làm việc',
    categoryClass: 'bg-cyan-50 text-cyan-800 border-cyan-100',
    sidebarAccent: {
      ring: 'ring-cyan-400/35 hover:ring-cyan-300/55',
      card: 'bg-gradient-to-br from-cyan-500/22 via-cyan-500/8 to-transparent hover:from-cyan-500/30',
      iconWrap: 'bg-cyan-500/18 ring-1 ring-cyan-300/30 shadow-inner shadow-cyan-900/20',
      dot: 'bg-cyan-400',
    },
    mod: null,
    always: true,
  },
  {
    id: 'crm',
    path: '/crm',
    name: 'CRM',
    desc: 'Quản lý khách hàng & bán hàng',
    Icon: UserCircle,
    imageUrl: CRM_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Kinh doanh',
    categoryClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sidebarAccent: {
      ring: 'ring-emerald-400/35 hover:ring-emerald-300/55',
      card: 'bg-gradient-to-br from-emerald-500/22 via-emerald-500/8 to-transparent hover:from-emerald-500/30',
      iconWrap: 'bg-emerald-500/18 ring-1 ring-emerald-300/30 shadow-inner shadow-emerald-900/20',
      dot: 'bg-emerald-400',
    },
    mod: 'crm',
  },
  {
    id: 'sx',
    path: '/sx',
    name: 'Xưởng SX',
    desc: 'Quản lý deal, pipeline và duyệt sản xuất',
    Icon: Factory,
    imageUrl: SX_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Sản xuất',
    categoryClass: 'bg-orange-50 text-orange-700 border-orange-100',
    sidebarAccent: {
      ring: 'ring-orange-400/35 hover:ring-orange-300/55',
      card: 'bg-gradient-to-br from-orange-500/22 via-orange-500/8 to-transparent hover:from-orange-500/30',
      iconWrap: 'bg-orange-500/18 ring-1 ring-orange-300/30 shadow-inner shadow-orange-900/20',
      dot: 'bg-orange-400',
    },
    mod: 'production',
  },
  {
    id: 'vc',
    path: '/vc',
    name: LOGISTICS_MODULE_LABEL,
    desc: 'Quản lý giao hàng, lắp đặt & bảo hành',
    Icon: Truck,
    imageUrl: VC_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Vận hành',
    categoryClass: 'bg-amber-50 text-amber-800 border-amber-100',
    sidebarAccent: {
      ring: 'ring-amber-400/35 hover:ring-amber-300/55',
      card: 'bg-gradient-to-br from-amber-500/22 via-amber-500/8 to-transparent hover:from-amber-500/30',
      iconWrap: 'bg-amber-500/18 ring-1 ring-amber-300/30 shadow-inner shadow-amber-900/20',
      dot: 'bg-amber-400',
    },
    mod: 'logistics',
  },
  {
    id: 'ketoan',
    path: '/ketoan',
    name: 'Kế toán',
    desc: 'Tổng hợp deal SX theo xưởng xử lý',
    Icon: Receipt,
    imageUrl: KETOAN_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Tài chính',
    categoryClass: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    sidebarAccent: {
      ring: 'ring-indigo-400/35 hover:ring-indigo-300/55',
      card: 'bg-gradient-to-br from-indigo-500/22 via-indigo-500/8 to-transparent hover:from-indigo-500/30',
      iconWrap: 'bg-indigo-500/18 ring-1 ring-indigo-300/30 shadow-inner shadow-indigo-900/20',
      dot: 'bg-indigo-400',
    },
    mod: 'accounting',
  },
  {
    id: 'muahang',
    path: '/mua-hang',
    name: 'Mua hàng',
    desc: 'Lệnh đặt hàng, thương hiệu & catalog SP',
    Icon: ShoppingBag,
    imageUrl: MUAHANG_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Vận hành',
    categoryClass: 'bg-orange-50 text-orange-800 border-orange-100',
    sidebarAccent: {
      ring: 'ring-orange-400/35 hover:ring-orange-300/55',
      card: 'bg-gradient-to-br from-orange-500/22 via-orange-500/8 to-transparent hover:from-orange-500/30',
      iconWrap: 'bg-orange-500/18 ring-1 ring-orange-300/30 shadow-inner shadow-orange-900/20',
      dot: 'bg-orange-400',
    },
    mod: 'purchasing',
  },
  {
    id: 'calc',
    path: '/calc',
    name: 'Tính toán',
    desc: 'Công thức, rule, tính từ kích thước & file 3D',
    Icon: Sigma,
    imageUrl: CALC_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Công cụ',
    categoryClass: 'bg-violet-50 text-violet-700 border-violet-100',
    sidebarAccent: {
      ring: 'ring-violet-400/35 hover:ring-violet-300/55',
      card: 'bg-gradient-to-br from-violet-500/22 via-violet-500/8 to-transparent hover:from-violet-500/30',
      iconWrap: 'bg-violet-500/18 ring-1 ring-violet-300/30 shadow-inner shadow-violet-900/20',
      dot: 'bg-violet-400',
    },
    mod: 'tinhtoan',
  },
  {
    id: 'knowledge',
    path: '/knowledge',
    name: 'Kiến thức',
    desc: 'Bài học, video và bài tập theo chủ đề',
    Icon: GraduationCap,
    imageUrl: KNOWLEDGE_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Đào tạo',
    categoryClass: 'bg-teal-50 text-teal-700 border-teal-100',
    sidebarAccent: {
      ring: 'ring-teal-400/35 hover:ring-teal-300/55',
      card: 'bg-gradient-to-br from-teal-500/22 via-teal-500/8 to-transparent hover:from-teal-500/30',
      iconWrap: 'bg-teal-500/18 ring-1 ring-teal-300/30 shadow-inner shadow-teal-900/20',
      dot: 'bg-teal-400',
    },
    mod: null,
    always: true,
  },
];

export function readAppSwitcherFavorites() {
  try {
    const raw = localStorage.getItem(APP_SWITCHER_FAVORITES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : null;
  } catch {
    return null;
  }
}

export function writeAppSwitcherFavorites(paths) {
  try {
    localStorage.setItem(APP_SWITCHER_FAVORITES_KEY, JSON.stringify(paths));
  } catch {
    /* ignore */
  }
}

export function defaultAppSwitcherFavorites(allPaths) {
  const preferred = ['/crm', '/sx', '/mua-hang', '/work/unified', '/dashboard', '/knowledge', '/vc'];
  const picked = preferred.filter((p) => allPaths.includes(p));
  if (picked.length >= 2) return picked.slice(0, 5);
  return allPaths.slice(0, 5);
}

/** @param {AppModuleDef} mod */
export function canUseAppModule(mod, { canAccessModule, crmOnly }) {
  if (!mod) return false;
  if (mod.always) return true;
  if (!mod.mod) return !crmOnly;
  return canAccessModule(mod.mod);
}

export function resolveActiveAppModuleId({
  isKnowledge,
  isCalc,
  isKetoan,
  isMuahang,
  isVC,
  isSX,
  isCRM,
  isCongViec,
  customModuleId = null,
}) {
  if (customModuleId) return customModuleId;
  if (isKnowledge) return 'knowledge';
  if (isCalc) return 'calc';
  if (isKetoan) return 'ketoan';
  if (isMuahang) return 'muahang';
  if (isVC) return 'vc';
  if (isSX) return 'sx';
  if (isCRM) return 'crm';
  if (isCongViec) return 'congviec';
  return 'work';
}
