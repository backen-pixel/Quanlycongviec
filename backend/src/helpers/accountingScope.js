const { supabase } = require('../config/supabase');
const { normalizeRole } = require('./adminRole');
const { fetchAllPages, fetchAllByIdsParallel } = require('./supabaseFetchAll');

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

/**
 * Tên công ty để đối chiếu deal chỉ có `external_company_name` (chưa có id).
 *
 * Trước đây chỗ này so khớp bằng chuỗi CỨNG 'vạn phú'/'van phu'/'vpt' và trả true
 * bất kể công ty kế toán đang hỏi là ai — tức deal của VPT lọt sang mọi công ty khác.
 * Thêm nữa, dùng `includes` khiến «VẠN PHÚC DESIGN» khớp nhầm «Vạn Phú» (đo ngày
 * 09/10/2026: 17/99 deal khớp chuỗi cứng KHÔNG thuộc VPT). Nay đối chiếu với tên
 * thật của ĐÚNG công ty kế toán đang hỏi, và so khớp BẰNG NHAU chứ không chứa nhau.
 */
const COMPANY_NAME_TTL_MS = 5 * 60 * 1000;
let _companyNameCache = { at: 0, byId: new Map() };

function chuanHoaTenCongTy(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nạp sẵn tên công ty. Gọi trước khi lọc hàng loạt để khỏi rơi vào cache nguội. */
async function warmAccountingCompanyNames(force = false) {
  const now = Date.now();
  if (!force && _companyNameCache.byId.size && now - _companyNameCache.at < COMPANY_NAME_TTL_MS) {
    return _companyNameCache.byId;
  }
  const { data, error } = await supabase.from('companies').select('id, name, short_name');
  if (error) {
    console.warn('[accountingScope] nạp tên công ty:', error.message);
    return _companyNameCache.byId;
  }
  const byId = new Map();
  for (const c of data || []) {
    const ten = [chuanHoaTenCongTy(c.name), chuanHoaTenCongTy(c.short_name)].filter(Boolean);
    byId.set(String(c.id), ten);
  }
  _companyNameCache = { at: now, byId };
  return byId;
}

function crmDealBelongsToAccountingCompanyLegacyName(dealRow, accountingCompanyId) {
  if (!dealRow?.external_company_name || !accountingCompanyId) return false;
  const ten = _companyNameCache.byId.get(String(accountingCompanyId));
  if (!ten || !ten.length) {
    // Cache nguội: nạp nền cho lượt sau, lượt này trả false. Thà bỏ sót một deal
    // trong tích tắc còn hơn cho công ty khác nhìn thấy nhầm.
    void warmAccountingCompanyNames().catch(() => {});
    return false;
  }
  const ext = chuanHoaTenCongTy(dealRow.external_company_name);
  if (!ext) return false;
  return ten.some((t) => t === ext);
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

  let projects;
  try {
    projects = await fetchAllPages(() => supabase
      .from('projects')
      .select('id')
      .eq('company_id', workshopCompanyId)
      .order('id'));
  } catch (pErr) {
    console.warn('[accountingScope] projects at workshop:', pErr.message);
    return [];
  }
  const projectIds = (projects || []).map((p) => p.id).filter(Boolean);
  if (!projectIds.length) return [];

  const selectCols = 'project_id, company_id, external_company_id, external_company_name, type';
  let deals;
  try {
    deals = await fetchAllByIdsParallel({
      table: 'crm_leads',
      columns: selectCols,
      key: 'project_id',
      ids: projectIds,
      tune: (q) => q.eq('type', 'deal').order('id'),
    });
  } catch (dErr) {
    console.warn('[accountingScope] crm_leads at workshop:', dErr.message);
    return [];
  }

  await warmAccountingCompanyNames();
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
  await warmAccountingCompanyNames();
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
  warmAccountingCompanyNames,
  applyAccountingCrmCompanyFilter,
  getAccountingClientProjectIdsAtWorkshop,
  getAccountingScopedProjectIds,
};
