const { isAdminLike, isSystemAdmin } = require('./adminRole');
const { userHasEcosystemModuleAccess } = require('./ecosystemModuleScope');

const BUILTIN_EVENT_MODULES = new Set(['crm', 'production', 'logistics', 'general']);
const EVENT_MODULE_SLUG_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/** @deprecated dùng BUILTIN_EVENT_MODULES + slug custom */
const EVENT_MODULES = BUILTIN_EVENT_MODULES;

function normalizeEventModule(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (BUILTIN_EVENT_MODULES.has(s)) return s;
  if (EVENT_MODULE_SLUG_RE.test(s)) return s;
  return null;
}

function isCustomEventModule(v) {
  const s = normalizeEventModule(v);
  return !!s && !BUILTIN_EVENT_MODULES.has(s);
}

/**
 * null = được mọi module (admin hệ thống / admin-like).
 * string[] = chỉ các module được phép (luôn gồm 'general' nếu có ít nhất 1 module).
 */
async function getAllowedEventModules(user) {
  if (!user) return [];
  if (isSystemAdmin(user) || isAdminLike(user)) return null;

  const r = String(user.role || '').trim().toLowerCase();
  const allowed = new Set(['general']);

  if (r === 'crm_production_admin' || r === 'crm_production_staff') {
    allowed.add('crm');
    allowed.add('production');
  } else if (r === 'production_admin' || r === 'production_staff') {
    allowed.add('production');
  } else if (r === 'logistics_admin') {
    allowed.add('logistics');
  } else {
    if (await userHasEcosystemModuleAccess(user, 'crm')) allowed.add('crm');
    if (await userHasEcosystemModuleAccess(user, 'production')) allowed.add('production');
    if (await userHasEcosystemModuleAccess(user, 'logistics')) allowed.add('logistics');
  }

  // Module tùy chỉnh user được phép
  try {
    const { getCustomModuleKeys } = require('./appModuleRegistry');
    const customKeys = typeof getCustomModuleKeys === 'function'
      ? await getCustomModuleKeys()
      : [];
    for (const key of customKeys || []) {
      const k = String(key || '').trim().toLowerCase();
      if (!k || BUILTIN_EVENT_MODULES.has(k)) continue;
      if (await userHasEcosystemModuleAccess(user, k)) allowed.add(k);
    }
  } catch {
    /* registry optional */
  }

  return [...allowed];
}

/**
 * Kiểm user được ghi/đổi sự kiện thuộc module này.
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
async function assertEventModuleWrite(user, moduleKey) {
  const mod = normalizeEventModule(moduleKey) || 'crm';
  const allowed = await getAllowedEventModules(user);

  if (allowed === null) {
    if (mod === 'general' && !isAdminLike(user)) {
      return {
        ok: false,
        code: 'general_forbidden',
        message: 'Chỉ admin được tạo sự kiện chung toàn công ty',
      };
    }
    return { ok: true };
  }

  // Custom module: kiểm trực tiếp quyền ecosystem nếu chưa nằm trong danh sách cached
  if (!allowed.includes(mod) && isCustomEventModule(mod)) {
    if (await userHasEcosystemModuleAccess(user, mod)) {
      return { ok: true };
    }
  }

  if (!allowed.includes(mod)) {
    return {
      ok: false,
      code: 'module_forbidden',
      message: `Không có quyền thao tác sự kiện khối "${mod}"`,
    };
  }

  if (mod === 'general' && !isAdminLike(user)) {
    return {
      ok: false,
      code: 'general_forbidden',
      message: 'Chỉ admin được tạo sự kiện chung toàn công ty',
    };
  }

  return { ok: true };
}

/** Áp filter module mặc định khi client không gửi ?module / ?modules */
async function resolveEventModulesQueryFilter(user, moduleFilter, modulesFilter) {
  if (moduleFilter) {
    const check = await assertEventModuleWrite(user, moduleFilter);
    if (!check.ok) return { error: check };
    return { moduleFilter, modulesFilter: null };
  }
  if (modulesFilter && modulesFilter.length) return { moduleFilter: null, modulesFilter };

  const allowed = await getAllowedEventModules(user);
  if (allowed === null) return { moduleFilter: null, modulesFilter: null };
  if (!allowed.length) {
    return { error: { ok: false, code: 'no_module', message: 'Không có quyền xem sự kiện' } };
  }
  return { moduleFilter: null, modulesFilter: allowed };
}

module.exports = {
  EVENT_MODULES,
  BUILTIN_EVENT_MODULES,
  normalizeEventModule,
  isCustomEventModule,
  getAllowedEventModules,
  assertEventModuleWrite,
  resolveEventModulesQueryFilter,
};
