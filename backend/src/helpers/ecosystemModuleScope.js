const { supabase } = require('../config/supabase');

/** Khớp module_key dùng trong ecosystem_module_scopes và Sidebar */
const KNOWN_MODULE_KEYS = ['crm', 'production', 'logistics', 'projects', 'tasks', 'customers'];

/**
 * @param {string} moduleKey
 * @returns {Promise<Set<string>|null>} null = không giới hạn khối; Set = chỉ các division_unit_id được phép
 */
async function getRestrictedDivisionIdsForModule(moduleKey) {
  try {
    const { data, error } = await supabase
      .from('ecosystem_module_scopes')
      .select('division_unit_id')
      .eq('module_key', moduleKey);
    if (error) return null;
    if (!data?.length) return null;
    return new Set(data.map((r) => String(r.division_unit_id)));
  } catch {
    return null;
  }
}

/**
 * @param {{ role?: string, company_id?: string }} user — JWT / req.user
 */
async function userHasEcosystemModuleAccess(user, moduleKey) {
  if (!moduleKey || moduleKey === 'core') return true;
  if (user?.role === 'admin') return true;

  let divisionId = null;
  if (user?.company_id) {
    const { data: co } = await supabase
      .from('companies')
      .select('division_unit_id')
      .eq('id', user.company_id)
      .maybeSingle();
    divisionId = co?.division_unit_id || null;
  }
  if (!divisionId) return true;

  const restricted = await getRestrictedDivisionIdsForModule(moduleKey);
  if (restricted == null) return true;
  return restricted.has(String(divisionId));
}

async function buildMyModuleAccessMap(user) {
  if (user?.role === 'admin') {
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
  userHasEcosystemModuleAccess,
  buildMyModuleAccessMap,
};
