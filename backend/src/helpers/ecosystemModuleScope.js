const { supabase } = require('../config/supabase');
const { createTTLCache } = require('./ttlCache');
const {
  isAdminLike,
  isSystemAdmin,
  isProductionStaff,
  isCrmProductionStaff,
  isCrmProductionAdmin,
} = require('./adminRole');
const { isAccountingUser } = require('./accountingScope');
const { isWorkshopRoleProductionParticipant } = require('./dealParticipantProduction');
const { isPlatformAdmin, tenantFeatureEnabled } = require('./tenantScope');

const PRODUCTION_STAFF_MODULES = new Set(['tasks', 'production', 'projects']);
const CRM_PRODUCTION_DUAL_MODULES = new Set(['crm', 'production', 'tasks', 'projects', 'customers']);
/** Kế toán công ty — xem CRM + SX + VC + module Kế toán (phạm vi deal thuộc công ty). */
const ACCOUNTING_VIEW_MODULES = new Set(['crm', 'production', 'logistics', 'projects', 'accounting']);
/** NV lắp đặt / vận chuyển — vào module SX/VC, chỉ thấy deal được thêm thành viên. */
const WORKSHOP_PARTICIPANT_VIEW_MODULES = new Set(['production', 'logistics', 'projects']);

/** Khớp module_key built-in dùng trong ecosystem_module_scopes và Sidebar.
 *  Module tùy chỉnh (app_modules) được merge động qua getAllKnownModuleKeys / isKnownModuleKeyAsync. */
const KNOWN_MODULE_KEYS = ['crm', 'production', 'logistics', 'projects', 'tasks', 'customers', 'tinhtoan', 'accounting', 'purchasing'];

async function resolveKnownModuleKeys() {
  try {
    const { getAllKnownModuleKeys } = require('./appModuleRegistry');
    return await getAllKnownModuleKeys();
  } catch {
    return KNOWN_MODULE_KEYS.slice();
  }
}

async function isKnownModuleKeyAsync(moduleKey) {
  try {
    const { isKnownModuleKey } = require('./appModuleRegistry');
    return await isKnownModuleKey(moduleKey);
  } catch {
    return KNOWN_MODULE_KEYS.includes(String(moduleKey || ''));
  }
}

/** Module hiện trên form NV (chip). CRM/SX/VC theo khối; kế toán luôn có. */
const STAFF_FORM_MODULE_KEYS = ['crm', 'production', 'logistics', 'accounting'];

/** Module mọi công ty đều có — không cần gắn khối trong ecosystem_module_scopes. */
const STAFF_FORM_ALWAYS_MODULE_KEYS = new Set(['accounting']);

const STAFF_FORM_MODULE_LABELS = {
  crm: 'CRM',
  production: 'Sản xuất',
  logistics: 'VC/LD',
  accounting: 'Kế toán',
};

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
  if (isPlatformAdmin(user)) return true;
  if (user?.tenant_id) {
    const ok = await tenantFeatureEnabled(user.tenant_id, moduleKey);
    if (!ok) return false;
  }
  if (isAdminLike(user)) return true;
  if (isAccountingUser(user) && ACCOUNTING_VIEW_MODULES.has(String(moduleKey))) return true;
  if (isWorkshopRoleProductionParticipant(user) && WORKSHOP_PARTICIPANT_VIEW_MODULES.has(String(moduleKey))) return true;
  if (isCrmProductionAdmin(user) && CRM_PRODUCTION_DUAL_MODULES.has(String(moduleKey))) return true;
  if (isCrmProductionStaff(user) && CRM_PRODUCTION_DUAL_MODULES.has(String(moduleKey))) return true;
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
  if (isPlatformAdmin(user) || isSystemAdmin(user)) {
    return { allowAll: true, modules: null };
  }
  const modules = {};
  const keys = await resolveKnownModuleKeys();
  for (const k of keys) {
    modules[k] = await userHasEcosystemModuleAccess(user, k);
  }
  return { allowAll: false, modules };
}

/**
 * Division IDs gắn với công ty (primary + company_division_units).
 * @returns {Promise<string[]>}
 */
async function getCompanyDivisionIds(companyId) {
  if (!companyId) return [];
  const divisionIds = [];
  const { data: co } = await supabase
    .from('companies')
    .select('division_unit_id, tenant_id')
    .eq('id', companyId)
    .maybeSingle();
  if (co?.division_unit_id) divisionIds.push(String(co.division_unit_id));
  const { data: links } = await supabase
    .from('company_division_units')
    .select('division_unit_id')
    .eq('company_id', companyId);
  (links || []).forEach((r) => {
    const id = r?.division_unit_id && String(r.division_unit_id);
    if (id && !divisionIds.includes(id)) divisionIds.push(id);
  });
  return { divisionIds, tenantId: co?.tenant_id || null };
}

/**
 * Module công ty được phép trên form NV:
 * - CRM / SX / VC: chỉ khi công ty thuộc khối gắn module (ecosystem_module_scopes)
 * - Kế toán: mọi công ty đều có
 * @returns {Promise<{ key: string, label: string }[]>}
 */
async function getModulesForCompany(companyId, { chipOnly = true } = {}) {
  if (!companyId) return [];
  const { divisionIds, tenantId } = await getCompanyDivisionIds(companyId);
  const keys = chipOnly ? STAFF_FORM_MODULE_KEYS : KNOWN_MODULE_KEYS;
  const out = [];

  for (const key of keys) {
    if (tenantId) {
      const ok = await tenantFeatureEnabled(tenantId, key);
      if (!ok) continue;
    }

    // Kế toán: mọi công ty đều có — không cần khớp khối
    if (STAFF_FORM_ALWAYS_MODULE_KEYS.has(key)) {
      out.push({ key, label: STAFF_FORM_MODULE_LABELS[key] || key });
      continue;
    }

    // CRM/SX/VC: bắt buộc thuộc khối đã gắn module
    if (!divisionIds.length) continue;
    const restricted = await getRestrictedDivisionIdsForModule(key);
    if (restricted == null) continue;
    if (!divisionIds.some((id) => restricted.has(id))) continue;
    out.push({
      key,
      label: STAFF_FORM_MODULE_LABELS[key] || key,
    });
  }
  return out;
}

module.exports = {
  KNOWN_MODULE_KEYS,
  STAFF_FORM_MODULE_KEYS,
  STAFF_FORM_MODULE_LABELS,
  STAFF_FORM_ALWAYS_MODULE_KEYS,
  getRestrictedDivisionIdsForModule,
  invalidateEcosystemModuleScopeCache,
  userHasEcosystemModuleAccess,
  buildMyModuleAccessMap,
  getCompanyDivisionIds,
  getModulesForCompany,
  resolveKnownModuleKeys,
  isKnownModuleKeyAsync,
};
