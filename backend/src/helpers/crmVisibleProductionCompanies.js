const { supabase } = require('../config/supabase');
const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');
const { validateProductionCompanyId } = require('./productionCompanyGate');

/**
 * Danh sách id công ty SX được phép hiện cho 1 công ty CRM.
 * @returns {Promise<string[]>} rỗng = chưa cấu hình (hiện tất cả)
 */
async function getVisibleProductionCompanyIds(crmCompanyId) {
  const cid = String(crmCompanyId || '').trim();
  if (!cid) return [];
  const { data, error } = await supabase
    .from('crm_company_visible_production_companies')
    .select('production_company_id')
    .eq('crm_company_id', cid);
  if (error) throw error;
  return (data || [])
    .map((r) => (r?.production_company_id ? String(r.production_company_id) : ''))
    .filter(Boolean);
}

/**
 * Thay thế toàn bộ allowlist. Mảng rỗng = xóa hết (lại hiện tất cả).
 */
async function setVisibleProductionCompanyIds(crmCompanyId, productionCompanyIds) {
  const cid = String(crmCompanyId || '').trim();
  if (!cid) throw new Error('Thiếu crm_company_id');

  const rawIds = Array.isArray(productionCompanyIds) ? productionCompanyIds : [];
  const unique = [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))];

  for (const pid of unique) {
    const pv = await validateProductionCompanyId(pid);
    if (!pv.ok) throw new Error(pv.error || `Công ty SX không hợp lệ: ${pid}`);
  }

  const { error: delErr } = await supabase
    .from('crm_company_visible_production_companies')
    .delete()
    .eq('crm_company_id', cid);
  if (delErr) throw delErr;

  if (!unique.length) return [];

  const rows = unique.map((production_company_id) => ({
    crm_company_id: cid,
    production_company_id,
  }));
  const { error: insErr } = await supabase
    .from('crm_company_visible_production_companies')
    .insert(rows);
  if (insErr) throw insErr;
  return unique;
}

/** Lọc list công ty theo allowlist (rỗng allowlist = giữ nguyên). */
function filterCompaniesByVisibleIds(companies, visibleIds) {
  const list = Array.isArray(companies) ? companies : [];
  if (!visibleIds || !visibleIds.length) return list;
  const set = new Set(visibleIds.map(String));
  return list.filter((c) => c && set.has(String(c.id)));
}

/**
 * Danh sách công ty thuộc module Sản xuất (cùng logic GET /companies?for_module=production).
 */
async function listAllProductionCompanies() {
  let q = supabase
    .from('companies')
    .select('id, name, short_name, division_unit_id, is_active')
    .or('is_active.eq.true,is_active.is.null')
    .order('name');

  const restricted = await getRestrictedDivisionIdsForModule('production');
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
  return data || [];
}

/**
 * Công ty SX cho deal của CRM company — đã lọc allowlist nếu có cấu hình.
 */
async function listProductionCompaniesForCrmCompany(crmCompanyId) {
  const all = await listAllProductionCompanies();
  const visibleIds = await getVisibleProductionCompanyIds(crmCompanyId);
  return {
    companies: filterCompaniesByVisibleIds(all, visibleIds),
    production_company_ids: visibleIds,
    filtered: visibleIds.length > 0,
  };
}

/**
 * Validate workshop type thuộc công ty SX (module production).
 */
async function validateWorkshopTypeForProductionCompany(workshopTypeId, productionCompanyId) {
  const tid = String(workshopTypeId || '').trim();
  const pid = String(productionCompanyId || '').trim();
  if (!tid) return { ok: true, workshopType: null };
  if (!pid) {
    return { ok: false, error: 'Cần chọn công ty SX mặc định trước khi gắn phân loại SX.' };
  }
  const { data: wt, error } = await supabase
    .from('workshop_project_types')
    .select('id, name, company_id, applies_to, is_active')
    .eq('id', tid)
    .maybeSingle();
  if (error || !wt) {
    return { ok: false, error: 'Phân loại SX không tồn tại.' };
  }
  if (wt.is_active === false) {
    return { ok: false, error: 'Phân loại SX đã ngưng.' };
  }
  if (String(wt.company_id || '') !== pid) {
    return { ok: false, error: 'Phân loại SX không thuộc công ty SX mặc định đã chọn.' };
  }
  const applies = String(wt.applies_to || 'both').toLowerCase();
  if (applies !== 'production' && applies !== 'both') {
    return { ok: false, error: 'Phân loại không thuộc module Sản xuất.' };
  }
  return { ok: true, workshopType: wt };
}

module.exports = {
  getVisibleProductionCompanyIds,
  setVisibleProductionCompanyIds,
  filterCompaniesByVisibleIds,
  listAllProductionCompanies,
  listProductionCompaniesForCrmCompany,
  validateWorkshopTypeForProductionCompany,
};
