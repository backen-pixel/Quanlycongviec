const { supabase } = require('../config/supabase');
const { normalizeRole } = require('./adminRole');

function isAccountingUser(user) {
  return normalizeRole(user?.role) === 'accounting'
    && user?.company_id != null
    && String(user.company_id).trim() !== '';
}

function getAccountingCompanyId(user) {
  if (!isAccountingUser(user)) return null;
  return String(user.company_id).trim();
}

/** Deal thuộc phạm vi kế toán: company_id hoặc external_company_id = công ty kế toán. */
function crmDealBelongsToAccountingCompany(dealRow, accountingCompanyId) {
  if (!dealRow || !accountingCompanyId) return false;
  const ac = String(accountingCompanyId);
  if (String(dealRow.company_id || '') === ac) return true;
  if (dealRow.external_company_id && String(dealRow.external_company_id) === ac) return true;
  return crmDealBelongsToAccountingCompanyLegacyName(dealRow, accountingCompanyId);
}

/** Fallback khi DB chưa có cột external_company_id — dùng tên text. */
function crmDealBelongsToAccountingCompanyLegacyName(dealRow, accountingCompanyId) {
  if (!dealRow?.external_company_name) return false;
  const ext = String(dealRow.external_company_name).toLowerCase();
  if (accountingCompanyId && dealRow._accounting_company_short) {
    const sn = String(dealRow._accounting_company_short).toLowerCase();
    if (sn && ext.includes(sn)) return true;
  }
  return ext.includes('vạn phú') || ext.includes('van phu') || ext.includes('vpt');
}

/**
 * Lọc Supabase query crm_leads theo phạm vi công ty kế toán.
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 */
function applyAccountingCrmCompanyFilter(query, accountingCompanyId) {
  if (!accountingCompanyId) return query;
  const ac = String(accountingCompanyId);
  return query.or(`company_id.eq.${ac},external_company_id.eq.${ac}`);
}

/**
 * Dự án tại xưởng partner có deal thuộc công ty kế toán.
 */
async function getAccountingClientProjectIdsAtWorkshop(workshopCompanyId, clientCompanyId) {
  if (!workshopCompanyId || !clientCompanyId) return [];

  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', workshopCompanyId);
  if (pErr) {
    console.warn('[accountingScope] projects at workshop:', pErr.message);
    return [];
  }
  const projectIds = (projects || []).map((p) => p.id).filter(Boolean);
  if (!projectIds.length) return [];

  const selectCols = 'project_id, company_id, external_company_id, external_company_name, type';
  const { data: deals, error: dErr } = await supabase
    .from('crm_leads')
    .select(selectCols)
    .eq('type', 'deal')
    .in('project_id', projectIds);
  if (dErr) {
    console.warn('[accountingScope] crm_leads at workshop:', dErr.message);
    return [];
  }

  const matched = new Set();
  for (const d of deals || []) {
    if (!d.project_id) continue;
    if (crmDealBelongsToAccountingCompany(d, clientCompanyId)) {
      matched.add(String(d.project_id));
    }
  }
  return [...matched];
}

/**
 * Mọi project_id gắn deal thuộc phạm vi kế toán (mọi xưởng).
 */
async function getAccountingScopedProjectIds(clientCompanyId) {
  if (!clientCompanyId) return [];
  const ac = String(clientCompanyId);
  const { data: deals, error } = await supabase
    .from('crm_leads')
    .select('project_id, company_id, external_company_id, external_company_name')
    .eq('type', 'deal')
    .not('project_id', 'is', null)
    .or(`company_id.eq.${ac},external_company_id.eq.${ac}`);
  if (error) {
    console.warn('[accountingScope] getAccountingScopedProjectIds:', error.message);
    return [];
  }
  const ids = new Set();
  for (const d of deals || []) {
    if (d.project_id && crmDealBelongsToAccountingCompany(d, clientCompanyId)) {
      ids.add(String(d.project_id));
    }
  }
  return [...ids];
}

module.exports = {
  isAccountingUser,
  getAccountingCompanyId,
  crmDealBelongsToAccountingCompany,
  crmDealBelongsToAccountingCompanyLegacyName,
  applyAccountingCrmCompanyFilter,
  getAccountingClientProjectIdsAtWorkshop,
  getAccountingScopedProjectIds,
};
