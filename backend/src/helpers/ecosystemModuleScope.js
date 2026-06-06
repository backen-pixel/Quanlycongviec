const { supabase } = require('../config/supabase');
const { createTTLCache } = require('./ttlCache');
const { isAdminLike, isSystemAdmin, isProductionStaff } = require('./adminRole');

const PRODUCTION_STAFF_MODULES = new Set(['tasks', 'production', 'projects']);

/** Khớp module_key dùng trong ecosystem_module_scopes và Sidebar */
const KNOWN_MODULE_KEYS = ['crm', 'production', 'logistics', 'projects', 'tasks', 'customers'];

// Set<string> không JSON-serializable → cache `string[] | null`, convert sang Set khi trả về.
const scopeCache = createTTLCache({
  ttlMs: 60_000,
  maxEntries: 50,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'ecoscope:',
});

async function _loadRestrictedArrayForModule(moduleKey) {
  const { data, error } = await supabase
    .from('ecosystem_module_scopes')
    .select('division_unit_id')
    .eq('module_key', moduleKey);
  if (error) return null;
  if (!data?.length) return null;
  return data.map((r) => String(r.division_unit_id));
}

/**
 * @param {string} moduleKey
 * @returns {Promise<Set<string>|null>} null = không giới hạn khối; Set = chỉ các division_unit_id được phép
 */
async function getRestrictedDivisionIdsForModule(moduleKey) {
  try {
    const arr = await scopeCache.getOrFetch(
      `module:${moduleKey}`,
      () => _loadRestrictedArrayForModule(moduleKey),
    );
    if (arr == null) return null;
    return new Set(arr);
  } catch {
    return null;
  }
}

/** Gọi khi ecosystem_module_scopes thay đổi (admin sửa). */
function invalidateEcosystemModuleScopeCache(moduleKey) {
  if (moduleKey) {
    scopeCache.invalidateRemote(`module:${moduleKey}`).catch(() => {});
  } else {
    scopeCache.invalidateRemote(null).catch(() => {});
  }
  try {
    const { invalidateTags } = require('../middleware/responseCache');
    void invalidateTags(['ecosystem']);
  } catch { /* ignore */ }
}

/**
 * @param {{ role?: string, company_id?: string }} user — JWT / req.user
 */
async function userHasEcosystemModuleAccess(user, moduleKey) {
  if (!moduleKey || moduleKey === 'core') return true;
  if (isAdminLike(user)) return true;
  if (isProductionStaff(user) && PRODUCTION_STAFF_MODULES.has(String(moduleKey))) return true;

  let divisionIds = [];
  if (user?.company_id) {
    const { data: co } = await supabase
      .from('companies')
      .select('division_unit_id')
      .eq('id', user.company_id)
      .maybeSingle();
    if (co?.division_unit_id) divisionIds.push(String(co.division_unit_id));
    const { data: links } = await supabase
      .from('company_division_units')
      .select('division_unit_id')
      .eq('company_id', user.company_id);
    (links || []).forEach((r) => {
      const id = r?.division_unit_id && String(r.division_unit_id);
      if (id && !divisionIds.includes(id)) divisionIds.push(id);
    });
  }
  if (!divisionIds.length) return true;

  const restricted = await getRestrictedDivisionIdsForModule(moduleKey);
  if (restricted == null) return true;
  return divisionIds.some((id) => restricted.has(id));
}

async function buildMyModuleAccessMap(user) {
  if (isSystemAdmin(user)) {
    return { allowAll: true, modules: null };
  }
  const modules = {};
  for (const k of KNOWN_MODULE_KEYS) {
    modules[k] = await userHasEcosystemModuleAccess(user, k);
  }
  return { allowAll: false, modules };
}

module.exports = {
  KNOWN_MODULE_KEYS,
  getRestrictedDivisionIdsForModule,
  invalidateEcosystemModuleScopeCache,
  userHasEcosystemModuleAccess,
  buildMyModuleAccessMap,
};
