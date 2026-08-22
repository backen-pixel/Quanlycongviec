/** Giữ sidebar đúng module khi route dùng chung (vd. /social, /updates). */
const STORAGE_KEY = 'active_sidebar_module';

export const CRM_SHARED_PATHS = [
  '/social',
  '/updates',
  '/guide',
  '/settings/password',
  '/settings/location',
  '/settings/devices',
  '/settings/misa',
  '/settings/api-keys',
  '/admin/trash',
];

/**
 * Các trang CRM nhưng được nhiều module dùng chung (Sự kiện, Đang hoạt động,
 * Nhóm chat). Khi điều hướng đến đây từ sidebar SX/VC thì sidebar phải GIỮ
 * NGUYÊN module gốc, không nhảy sang CRM.
 */
export const CRM_CROSS_MODULE_PATHS = [
  '/crm/events',
  '/crm/leaves',
  '/crm/activity',
  '/crm/messenger',
];

const BUILTIN_MODULE_SCOPES = new Set([
  'crm', 'work', 'congviec', 'sx', 'vc', 'calc', 'knowledge', 'ketoan', 'muahang',
]);

export function isCustomModuleScope(scope) {
  return typeof scope === 'string' && scope.startsWith('custom:');
}

export function customModuleScopeId(moduleKey) {
  const key = String(moduleKey || '').trim();
  return key ? `custom:${key}` : null;
}

export function moduleKeyFromCustomScope(scope) {
  if (!isCustomModuleScope(scope)) return null;
  return String(scope).slice('custom:'.length) || null;
}

/** `/m/:key` hoặc `/ecosystem/app-modules/:key` → module_key tùy chỉnh. */
export function parseAppModuleKeyFromPath(pathname) {
  const p = String(pathname || '');
  let m = p.match(/^\/m\/([^/]+)/);
  if (m?.[1]) return decodeURIComponent(m[1]);
  m = p.match(/^\/ecosystem\/app-modules\/([^/]+)/);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return null;
}

export function isCrmSharedPath(pathname) {
  return CRM_SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isCrmCrossModulePath(pathname) {
  return CRM_CROSS_MODULE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isDrivePath(pathname) {
  return pathname === '/drive' || pathname.startsWith('/drive/');
}

/** ?module=crm|sx|vc|custom:key → khóa sidebar đúng module khi mở Drive */
export function resolveModuleFromDriveQuery(moduleParam) {
  const raw = String(moduleParam || '').trim();
  if (!raw) return null;
  if (isCustomModuleScope(raw)) return raw;
  const m = raw.toLowerCase();
  if (m === 'crm') return 'crm';
  if (m === 'sx') return 'sx';
  if (m === 'vc') return 'vc';
  if (m.startsWith('custom:')) return raw;
  return null;
}

export function appendDriveModuleQuery(path, moduleKey) {
  if (!moduleKey) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}module=${encodeURIComponent(moduleKey)}`;
}

/** Module Dự án và công việc — tổng hợp NV + setup luồng. */
export function isCongViecPrimaryPath(pathname) {
  return (
    pathname.startsWith('/work') ||
    pathname.startsWith('/personal-tasks')
  );
}

/** /projects dùng chung giữa Quản lý và Dự án và công việc — giữ sidebar theo module đang mở. */
export function isProjectsSharedPath(pathname) {
  return pathname === '/projects' || pathname.startsWith('/projects/');
}

export function isWorkPrimaryPath(pathname) {
  if (pathname.startsWith('/crm') || pathname.startsWith('/sx') || pathname.startsWith('/vc') || pathname.startsWith('/ketoan') || pathname.startsWith('/mua-hang')) return false;
  if (pathname.startsWith('/m/')) return false;
  if (/^\/ecosystem\/app-modules\/[^/]+/.test(pathname)) return false;
  if (isCongViecPrimaryPath(pathname)) return false;
  if (isProjectsSharedPath(pathname)) return false;
  return (
    pathname === '/' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/management') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/workspace') ||
    pathname.startsWith('/ecosystem') ||
    pathname.startsWith('/companies') ||
    pathname.startsWith('/departments') ||
    pathname.startsWith('/teams') ||
    pathname.startsWith('/users') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/products') ||
    pathname.startsWith('/workflow') ||
    pathname.startsWith('/permissions') ||
    pathname.startsWith('/settings/app-updates') ||
    pathname.startsWith('/stage/')
  );
}

export function resolveModuleFromPathname(pathname) {
  const customKey = parseAppModuleKeyFromPath(pathname);
  if (customKey) return customModuleScopeId(customKey);
  if (pathname.startsWith('/tools/voice-recordings')) return 'crm';
  if (pathname.startsWith('/crm')) {
    // /crm/events, /crm/activity, /crm/messenger được dùng chung — nhường
    // module context cho navStateModuleContext / sessionStorage quyết định.
    if (isCrmCrossModulePath(pathname)) return null;
    return 'crm';
  }
  if (pathname.startsWith('/sx')) return 'sx';
  if (pathname.startsWith('/vc')) return 'vc';
  if (pathname.startsWith('/ketoan')) return 'ketoan';
  if (pathname.startsWith('/mua-hang')) return 'muahang';
  if (pathname.startsWith('/calc')) return 'calc';
  if (pathname.startsWith('/knowledge')) return 'knowledge';
  if (isCongViecPrimaryPath(pathname)) return 'congviec';
  if (isWorkPrimaryPath(pathname)) return 'work';
  return null;
}

export function readStoredModule() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    if (BUILTIN_MODULE_SCOPES.has(v)) return v;
    if (isCustomModuleScope(v)) return v;
  } catch { /* ignore */ }
  return null;
}

export function storeModule(module) {
  try {
    if (module) sessionStorage.setItem(STORAGE_KEY, module);
  } catch { /* ignore */ }
}

/**
 * Sidebar module (crm|sx|vc|congviec|work|…) → khóa lọc NotificationCenter / API.
 * null = không khóa module (ketoan, knowledge, custom…).
 */
export function sidebarModuleToNotificationFilter(sidebarModule) {
  const m = String(sidebarModule || '').trim().toLowerCase();
  if (m === 'crm') return 'crm';
  if (m === 'sx') return 'production';
  if (m === 'vc') return 'logistics';
  if (m === 'congviec' || m === 'work') return 'project';
  return null;
}

export function resolveActiveModule(pathname, navStateModuleContext, searchParams) {
  // Drive dùng chung route — giữ sidebar module theo ?module= hoặc context đã lưu
  if (isDrivePath(pathname)) {
    const moduleParam = searchParams?.get?.('module') ?? (typeof searchParams === 'string'
      ? new URLSearchParams(searchParams).get('module')
      : null);
    const fromQuery = resolveModuleFromDriveQuery(moduleParam);
    if (fromQuery) return fromQuery;
    if (navStateModuleContext) return navStateModuleContext;
    return readStoredModule() || 'work';
  }
  // Trang CRM dùng chung (events/activity/messenger): ưu tiên context từ state
  // hoặc sessionStorage — chỉ rơi về 'crm' khi không có gì.
  if (isCrmCrossModulePath(pathname)) {
    return navStateModuleContext || readStoredModule() || 'crm';
  }
  // /projects dùng chung Quản lý ↔ Dự án và công việc
  if (isProjectsSharedPath(pathname)) {
    const stored = navStateModuleContext || readStoredModule();
    if (stored === 'congviec' || stored === 'work') return stored;
    return 'work';
  }
  const fromPath = resolveModuleFromPathname(pathname);
  if (fromPath) return fromPath;
  if (navStateModuleContext) return navStateModuleContext;
  if (isCrmSharedPath(pathname)) return readStoredModule() || 'crm';
  return readStoredModule() || 'work';
}

export function isCrmSidebarActive(pathname, activeModule, crmOnly) {
  if (crmOnly) return true;
  if (pathname.startsWith('/tools/voice-recordings')) return true;
  if (pathname.startsWith('/crm') && !isCrmCrossModulePath(pathname)) return true;
  if (isDrivePath(pathname) && activeModule === 'crm') return true;
  return activeModule === 'crm' && (isCrmSharedPath(pathname) || isCrmCrossModulePath(pathname));
}
