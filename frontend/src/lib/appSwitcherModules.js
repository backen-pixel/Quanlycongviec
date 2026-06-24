import {
  CheckSquare,
  UserCircle,
  Factory,
  Truck,
  Receipt,
  Sigma,
  GraduationCap,
} from 'lucide-react';

export const CRM_MODULE_ICON = '/icons/crm-module.png?v=4';
export const WORK_MODULE_ICON = '/icons/work-module.png?v=3';
export const SX_MODULE_ICON = '/icons/sx-module.png?v=3';
export const VC_MODULE_ICON = '/icons/vc-module.png?v=3';
export const KETOAN_MODULE_ICON = '/icons/ketoan-module.png?v=3';
export const CALC_MODULE_ICON = '/icons/calc-module.png?v=3';
export const KNOWLEDGE_MODULE_ICON = '/icons/knowledge-module.png?v=3';

export const APP_SWITCHER_FAVORITES_KEY = 'app_switcher_favorites';

/** @typedef {{ id: string; path: string; name: string; desc: string; Icon: import('lucide-react').LucideIcon; imageUrl?: string; iconClass: string; category: string; categoryClass: string; mod: string | null; hideCrmOnly?: boolean; always?: boolean }} AppModuleDef */

/** @type {AppModuleDef[]} */
export const APP_MODULE_DEFINITIONS = [
  {
    id: 'work',
    path: '/dashboard',
    name: 'Công việc',
    desc: 'Quản lý dự án & nhiệm vụ cá nhân',
    Icon: CheckSquare,
    imageUrl: WORK_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Quản lý',
    categoryClass: 'bg-blue-50 text-blue-700 border-blue-100',
    mod: null,
    hideCrmOnly: true,
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
    mod: 'production',
  },
  {
    id: 'vc',
    path: '/vc',
    name: 'Vận chuyển & Lắp đặt',
    desc: 'Quản lý giao hàng, lắp đặt, bảo hành',
    Icon: Truck,
    imageUrl: VC_MODULE_ICON,
    iconClass: 'bg-transparent shadow-none',
    category: 'Vận hành',
    categoryClass: 'bg-amber-50 text-amber-800 border-amber-100',
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
    mod: 'accounting',
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
  const preferred = ['/crm', '/sx', '/dashboard', '/knowledge', '/vc'];
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
  isVC,
  isSX,
  isCRM,
}) {
  if (isKnowledge) return 'knowledge';
  if (isCalc) return 'calc';
  if (isKetoan) return 'ketoan';
  if (isVC) return 'vc';
  if (isSX) return 'sx';
  if (isCRM) return 'crm';
  return 'work';
}
