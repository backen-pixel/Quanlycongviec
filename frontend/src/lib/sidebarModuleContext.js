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
  '/crm/activity',
  '/crm/messenger',
];

export function isCrmSharedPath(pathname) {
  return CRM_SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isCrmCrossModulePath(pathname) {
  return CRM_CROSS_MODULE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isDrivePath(pathname) {
  return pathname === '/drive' || pathname.startsWith('/drive/');
}

/** ?module=crm|sx|vc → khóa sidebar đúng module khi mở Drive */
export function resolveModuleFromDriveQuery(moduleParam) {
  const m = String(moduleParam || '').toLowerCase();
  if (m === 'crm') return 'crm';
  if (m === 'sx') return 'sx';
  if (m === 'vc') return 'vc';
  return null;
}

export function appendDriveModuleQuery(path, moduleKey) {
  if (!moduleKey) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}module=${encodeURIComponent(moduleKey)}`;
}

/** Module Công việc — tổng hợp NV từ các module. */
export function isCongViecPrimaryPath(pathname) {
  return (
    pathname.startsWith('/work') ||
    pathname.startsWith('/personal-tasks')
  );
}

export function isWorkPrimaryPath(pathname) {
  if (pathname.startsWith('/crm') || pathname.startsWith('/sx') || pathname.startsWith('/vc') || pathname.startsWith('/ketoan')) return false;
  if (isCongViecPrimaryPath(pathname)) return false;
  return (
    pathname === '/' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/management') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/projects') ||
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
  if (pathname.startsWith('/calc')) return 'calc';
  if (pathname.startsWith('/knowledge')) return 'knowledge';
  if (isCongViecPrimaryPath(pathname)) return 'congviec';
  if (isWorkPrimaryPath(pathname)) return 'work';
  return null;
}

export function readStoredModule() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === 'crm' || v === 'work' || v === 'congviec' || v === 'sx' || v === 'vc' || v === 'calc' || v === 'knowledge' || v === 'ketoan') return v;
  } catch { /* ignore */ }
  return null;
}

export function storeModule(module) {
  try {
    if (module) sessionStorage.setItem(STORAGE_KEY, module);
  } catch { /* ignore */ }
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
