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

export function isCrmSharedPath(pathname) {
  return CRM_SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isWorkPrimaryPath(pathname) {
  if (pathname.startsWith('/crm') || pathname.startsWith('/sx') || pathname.startsWith('/vc')) return false;
  return (
    pathname === '/' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/my-tasks') ||
    pathname.startsWith('/personal-tasks') ||
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
    pathname.startsWith('/stage/') ||
    pathname.startsWith('/project-workflow')
  );
}

export function resolveModuleFromPathname(pathname) {
  if (pathname.startsWith('/crm') || pathname.startsWith('/tools/voice-recordings')) return 'crm';
  if (pathname.startsWith('/sx')) return 'sx';
  if (pathname.startsWith('/vc')) return 'vc';
  if (isWorkPrimaryPath(pathname)) return 'work';
  return null;
}

export function readStoredModule() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === 'crm' || v === 'work' || v === 'sx' || v === 'vc') return v;
  } catch { /* ignore */ }
  return null;
}

export function storeModule(module) {
  try {
    if (module) sessionStorage.setItem(STORAGE_KEY, module);
  } catch { /* ignore */ }
}

export function resolveActiveModule(pathname, navStateModuleContext) {
  const fromPath = resolveModuleFromPathname(pathname);
  if (fromPath) return fromPath;
  if (navStateModuleContext) return navStateModuleContext;
  if (isCrmSharedPath(pathname)) return readStoredModule() || 'crm';
  return readStoredModule() || 'work';
}

export function isCrmSidebarActive(pathname, activeModule, crmOnly) {
  if (crmOnly) return true;
  if (pathname.startsWith('/crm') || pathname.startsWith('/tools/voice-recordings')) return true;
  return activeModule === 'crm' && isCrmSharedPath(pathname);
}
