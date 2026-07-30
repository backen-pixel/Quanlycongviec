const { supabase } = require('../config/supabase');
const { createTTLCache } = require('./ttlCache');

const BUILTIN_MODULE_KEYS = [
  'crm', 'production', 'logistics', 'projects', 'tasks', 'customers',
  'tinhtoan', 'accounting', 'purchasing',
];

const MODULE_KEY_RE = /^[a-z][a-z0-9_]{1,62}$/;

const registryCache = createTTLCache({
  ttlMs: 60_000,
  maxEntries: 20,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'appmod:',
});

async function _loadActiveModules() {
  const { data, error } = await supabase
    .from('app_modules')
    .select('id, module_key, name, icon, icon_image, category, color, company_id, is_active, description, companies:app_module_companies(company_id)')
    .eq('is_active', true)
    .order('name');
  if (error) {
    console.warn('[appModuleRegistry] load failed:', error.message);
    return [];
  }
  return (data || []).map(normalizeModuleRow);
}

function normalizeModuleRow(row) {
  if (!row) return row;
  const fromJoin = (row.companies || []).map((c) => String(c.company_id)).filter(Boolean);
  const ids = [...new Set(fromJoin)];
  if (row.company_id && !ids.includes(String(row.company_id))) {
    ids.push(String(row.company_id));
  }
  return {
    ...row,
    company_ids: ids,
    shared_all: ids.length === 0,
    companies: undefined,
  };
}

async function listActiveAppModules() {
  return registryCache.getOrFetch('active', () => _loadActiveModules());
}

/**
 * Company IDs gắn module (junction + legacy company_id).
 * [] = dùng chung mọi công ty.
 */
async function getModuleCompanyIds(moduleId) {
  if (!moduleId) return [];
  const { data, error } = await supabase
    .from('app_module_companies')
    .select('company_id')
    .eq('module_id', moduleId);
  if (error) throw error;
  return (data || []).map((r) => String(r.company_id)).filter(Boolean);
}

async function setModuleCompanies(moduleId, companyIds) {
  const ids = [...new Set((companyIds || []).map((x) => String(x).trim()).filter(Boolean))];
  const { error: delErr } = await supabase
    .from('app_module_companies')
    .delete()
    .eq('module_id', moduleId);
  if (delErr) throw delErr;
  if (ids.length) {
    const { error: insErr } = await supabase
      .from('app_module_companies')
      .insert(ids.map((company_id) => ({ module_id: moduleId, company_id })));
    if (insErr) throw insErr;
  }
  // Sync legacy single company_id: 1 công ty → set; 0 hoặc nhiều → null
  const legacy = ids.length === 1 ? ids[0] : null;
  await supabase
    .from('app_modules')
    .update({ company_id: legacy, updated_at: new Date().toISOString() })
    .eq('id', moduleId);
  invalidateAppModuleRegistry();
  return ids;
}

/**
 * User có được thấy module theo phạm vi công ty không.
 * shared_all (không gắn công ty) → true; ngược lại khớp company_id user.
 */
function userMatchesModuleCompanies(user, moduleRow) {
  if (!moduleRow) return false;
  const ids = Array.isArray(moduleRow.company_ids)
    ? moduleRow.company_ids.map(String)
    : [];
  if (!ids.length) return true; // dùng chung
  const uidCo = user?.company_id ? String(user.company_id) : '';
  if (!uidCo) return false;
  return ids.includes(uidCo);
}

async function enrichModuleWithCompanies(mod) {
  if (!mod) return null;
  const company_ids = await getModuleCompanyIds(mod.id);
  if (mod.company_id && !company_ids.includes(String(mod.company_id))) {
    company_ids.push(String(mod.company_id));
  }
  return {
    ...mod,
    company_ids,
    shared_all: company_ids.length === 0,
  };
}

async function getCustomModuleKeys() {
  const rows = await listActiveAppModules();
  return rows.map((r) => String(r.module_key)).filter(Boolean);
}

async function getAllKnownModuleKeys() {
  const custom = await getCustomModuleKeys();
  const set = new Set(BUILTIN_MODULE_KEYS);
  custom.forEach((k) => set.add(k));
  return [...set];
}

async function isKnownModuleKey(moduleKey) {
  const key = String(moduleKey || '').trim();
  if (!key) return false;
  if (BUILTIN_MODULE_KEYS.includes(key)) return true;
  const custom = await getCustomModuleKeys();
  return custom.includes(key);
}

async function getModuleByKey(moduleKey) {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (!key) return null;
  const { data, error } = await supabase
    .from('app_modules')
    .select('*, companies:app_module_companies(company_id)')
    .eq('module_key', key)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeModuleRow(data) : null;
}

async function getModuleById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('app_modules')
    .select('*, companies:app_module_companies(company_id)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeModuleRow(data) : null;
}

function invalidateAppModuleRegistry() {
  registryCache.invalidateRemote('active').catch(() => {});
}

function slugifyModuleKey(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 63);
}

function isValidModuleKey(key) {
  return MODULE_KEY_RE.test(String(key || ''));
}

module.exports = {
  BUILTIN_MODULE_KEYS,
  MODULE_KEY_RE,
  listActiveAppModules,
  getCustomModuleKeys,
  getAllKnownModuleKeys,
  isKnownModuleKey,
  getModuleByKey,
  getModuleById,
  invalidateAppModuleRegistry,
  slugifyModuleKey,
  isValidModuleKey,
  getModuleCompanyIds,
  setModuleCompanies,
  userMatchesModuleCompanies,
  enrichModuleWithCompanies,
  normalizeModuleRow,
};
