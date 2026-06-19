/** Deal: admin hệ thống / superadmin xem toàn (theo phạm vi API); NV chỉ deal assigned_to.
 *  Không gồm manager/director — KPI pipeline chỉ theo deal được giao, tránh nhầm với tổng công ty. */
const CRM_DEAL_VIEW_ALL_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'administrator',
]);

/** Lead: chỉ admin hệ thống xem hết; NV chỉ lead assigned_to / lead_owner_id. */
const CRM_LEAD_VIEW_ALL_ROLES = new Set(['admin', 'superadmin', 'super_admin', 'administrator']);

function normalizeCrmUserRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

/**
 * Admin hệ thống (tổng): role `admin` và không gắn `company_id` — xem/lọc mọi công ty khi gọi API.
 * @param {{ role?: string, company_id?: string | null }} user — JWT / req.user
 */
function isCrmSystemAdminUser(user) {
  return normalizeCrmUserRole(user?.role) === 'admin' && !(user?.company_id != null && String(user.company_id).trim() !== '');
}

/**
 * Admin theo công ty: role `admin` và có `company_id` — phạm vi dữ liệu chỉ công ty đó (backend ép filter).
 * @param {{ role?: string, company_id?: string | null }} user
 */
function isCrmCompanyAdminUser(user) {
  return normalizeCrmUserRole(user?.role) === 'admin' && user?.company_id != null && String(user.company_id).trim() !== '';
}

/** Admin khu vực: xem/gán lead-deal trong các khu vực được gán (JWT crm_region_ids), không toàn công ty. */
function isCrmRegionAdminUser(user) {
  return normalizeCrmUserRole(user?.role) === 'region_admin' && user?.company_id != null && String(user.company_id).trim() !== '';
}

/** Sales Admin / Admin CRM+SX: xem mọi lead/deal trong phạm vi công ty. */
function isCrmSalesAdminUser(user) {
  const r = normalizeCrmUserRole(user?.role);
  const hasCompany = user?.company_id != null && String(user.company_id).trim() !== '';
  return (r === 'sales_admin' || r === 'crm_production_admin') && hasCompany;
}

/** Kế toán công ty — xem mọi deal/lead thuộc công ty (company_id hoặc external_company_id). */
function isCrmAccountingUser(user) {
  return normalizeCrmUserRole(user?.role) === 'accounting'
    && user?.company_id != null
    && String(user.company_id).trim() !== '';
}

/** Giống userSeesAllCrmLeads(role) nhưng gồm admin khu vực + sales_admin (phạm vi công ty). */
function userSeesAllCrmLeadsForScope(user) {
  if (userSeesAllCrmLeads(user?.role)) return true;
  if (isCrmRegionAdminUser(user)) return true;
  if (isCrmSalesAdminUser(user)) return true;
  if (isCrmAccountingUser(user)) return true;
  return false;
}

/** Giống userSeesAllCrmDeals(role) nhưng gồm admin khu vực + sales_admin. */
function userSeesAllCrmDealsForScope(user) {
  if (userSeesAllCrmDeals(user?.role)) return true;
  if (isCrmRegionAdminUser(user)) return true;
  if (isCrmSalesAdminUser(user)) return true;
  if (isCrmAccountingUser(user)) return true;
  return false;
}

function userSeesAllCrmDeals(role) {
  return CRM_DEAL_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

function userSeesAllCrmLeads(role) {
  return CRM_LEAD_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

const CRM_LEAD_OPTION_SELECT = 'id, code, title, type, updated_at';

/**
 * Lead/deal của một khách — admin xem hết; lead NV chỉ bản mình phụ trách; deal NV chỉ assigned_to.
 */
async function fetchCrmLeadsForCustomerScoped(supabase, customerId, userId, role, limit = 40) {
  if (!customerId) return [];
  if (userSeesAllCrmLeads(role) && userSeesAllCrmDeals(role)) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
  const parts = [];
  if (userSeesAllCrmLeads(role)) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'lead')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  } else if (userId) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'lead')
      .or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  }
  if (userSeesAllCrmDeals(role)) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'deal')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  } else if (userId) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'deal')
      .eq('assigned_to', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  }
  return [...parts]
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, limit);
}

const { isAdminLike, isSystemAdmin, isCompanyScopedAdmin } = require('./adminRole');

module.exports = {
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
  normalizeCrmUserRole,
  fetchCrmLeadsForCustomerScoped,
  isCrmSystemAdminUser,
  isCrmCompanyAdminUser,
  isCrmRegionAdminUser,
  isCrmSalesAdminUser,
  isCrmAccountingUser,
  userSeesAllCrmLeadsForScope,
  userSeesAllCrmDealsForScope,
  isAdminLike,
  isSystemAdmin,
  isCompanyScopedAdmin,
};
