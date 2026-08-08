const { supabase } = require('../config/supabase');
const { getRestrictedDivisionIdsForModule, KNOWN_MODULE_KEYS } = require('./ecosystemModuleScope');

/** Cache theo module_key → { ids, at } */
const cacheByModule = new Map();
const TTL_MS = 60_000;

/**
 * ID công ty thuộc khối module (khớp GET /companies?for_module=…).
 * @param {string} moduleKey
 * @returns {Promise<string[]>}
 */
async function listModuleCompanyIds(moduleKey) {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (!key || !KNOWN_MODULE_KEYS.includes(key)) return [];

  const now = Date.now();
  const hit = cacheByModule.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.ids;

  const restricted = await getRestrictedDivisionIdsForModule(key);
  let q = supabase
    .from('companies')
    .select('id')
    .or('is_active.eq.true,is_active.is.null');
  if (restricted && restricted.size > 0) {
    const ids = [...restricted];
    const { data: linkRows, error: linkErr } = await supabase
      .from('company_division_units')
      .select('company_id')
      .in('division_unit_id', ids);
    const fromLinks = !linkErr && linkRows?.length
      ? [...new Set(linkRows.map((r) => r.company_id).filter(Boolean))]
      : [];
    const orParts = [`division_unit_id.in.(${ids.join(',')})`];
    if (fromLinks.length) orParts.push(`id.in.(${fromLinks.join(',')})`);
    q = q.or(orParts.join(','));
  }
  const { data, error } = await q;
  if (error) throw error;
  const ids = (data || []).map((c) => c.id).filter(Boolean);
  cacheByModule.set(key, { ids, at: now });
  return ids;
}

/** ID công ty thuộc khối CRM (khớp GET /companies?for_module=crm). */
async function listCrmModuleCompanyIds() {
  return listModuleCompanyIds('crm');
}

/**
 * ID dự án đã vào module xưởng — dùng picker deal Giao việc SX / Lắp đặt.
 * logistics: đã bàn giao VC (logistics_company_id hoặc vc_kanban_column_id).
 * production: đã có cột Kanban SX.
 */
async function listWorkshopPickerProjectIds(moduleKey, { companyId = null } = {}) {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (key !== 'logistics' && key !== 'production') return null;

  const cid = companyId ? String(companyId).trim() : '';
  const run = async (withVcDeleted) => {
    let q = supabase.from('projects').select('id').order('updated_at', { ascending: false }).limit(2000);
    if (key === 'logistics') {
      q = q.or('logistics_company_id.not.is.null,vc_kanban_column_id.not.is.null');
      if (withVcDeleted) q = q.is('vc_deleted_at', null);
      if (cid) q = q.or(`company_id.eq.${cid},logistics_company_id.eq.${cid}`);
    } else {
      q = q.not('sx_kanban_column_id', 'is', null);
      if (cid) q = q.eq('company_id', cid);
    }
    return q;
  };

  let { data, error } = await run(true);
  if (error && /vc_deleted_at/i.test(String(error.message || ''))) {
    ({ data, error } = await run(false));
  }
  if (error) throw error;
  return (data || []).map((r) => r.id).filter(Boolean);
}

module.exports = { listCrmModuleCompanyIds, listModuleCompanyIds, listWorkshopPickerProjectIds };
