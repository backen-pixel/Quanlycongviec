/**
 * CRM phạm vi xem lead/deal/khu vực — khớp backend crmAccessRoles.js + crmRegionScope.js.
 */
const CRM_DEAL_VIEW_ALL_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'administrator',
]);

const CRM_LEAD_VIEW_ALL_ROLES = new Set(['admin', 'superadmin', 'super_admin', 'administrator']);

export function normalizeCrmUserRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

export function userSeesAllCrmDeals(role) {
  return CRM_DEAL_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

export function userSeesAllCrmLeads(role) {
  return CRM_LEAD_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

/** Khớp backend `userSeesAllCrmLeadsForScope`. */
export function userSeesAllCrmLeadsScoped(user) {
  if (userSeesAllCrmLeads(user?.role)) return true;
  const r = normalizeCrmUserRole(user?.role);
  const hasCompany = !!(user?.company_id != null && String(user.company_id).trim());
  if (r === 'region_admin' && hasCompany) return true;
  return (r === 'sales_admin' || r === 'crm_production_admin' || r === 'accounting') && hasCompany;
}

/** Khớp backend `userSeesAllCrmDealsForScope`: admin khu vực + sales_admin xem deal trong phạm vi (region/công ty). */
export function userSeesAllCrmDealsScoped(user) {
  if (userSeesAllCrmDeals(user?.role)) return true;
  const r = normalizeCrmUserRole(user?.role);
  const hasCompany = !!(user?.company_id != null && String(user.company_id).trim());
  if (r === 'region_admin' && hasCompany) return true;
  return (r === 'sales_admin' || r === 'crm_production_admin') && hasCompany;
}

/** Admin hệ thống / admin công ty / sales_admin — chọn mọi khu vực trong công ty ở bộ lọc. */
export function userCanPickAnyCrmRegionInCompany(user) {
  if (userSeesAllCrmLeads(user?.role)) {
    const hasCompany = !!(user?.company_id != null && String(user.company_id).trim());
    if (!hasCompany) return true;
    return normalizeCrmUserRole(user?.role) === 'admin';
  }
  const r = normalizeCrmUserRole(user?.role);
  return r === 'sales_admin' || r === 'crm_production_admin';
}

/** Danh sách khu vực hiển thị trong bộ lọc CRM theo phân quyền user. */
export function filterCrmRegionsForUser(regions, user) {
  if (!Array.isArray(regions) || !regions.length) return [];
  if (userCanPickAnyCrmRegionInCompany(user)) return regions;
  const ids = (user?.crm_region_ids || []).map(String).filter(Boolean);
  if (!ids.length) return regions;
  const allowed = new Set(ids);
  return regions.filter((r) => allowed.has(String(r.id)));
}

/** region_id gửi API khi áp dụng bộ lọc khu vực (`__none__` chỉ lọc client-side). */
export function resolveCrmRegionApiParam(filterRegion) {
  const v = String(filterRegion || '').trim();
  if (!v || v === '__none__') return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return v;
  }
  return undefined;
}
