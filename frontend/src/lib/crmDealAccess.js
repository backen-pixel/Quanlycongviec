/**
 * CRM Deal: admin / superadmin xem mọi deal (theo phạm vi API); nhân viên & quản lý (manager/director) chỉ deal được giao.
 * Phải khớp logic backend `userSeesAllCrmDeals` (crmAccessRoles.js).
 */
const CRM_DEAL_VIEW_ALL_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'administrator',
]);

export function normalizeCrmUserRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

export function userSeesAllCrmDeals(role) {
  return CRM_DEAL_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

/** Khớp backend `userSeesAllCrmDealsForScope`: admin khu vực + sales_admin xem deal trong phạm vi (region/công ty). */
export function userSeesAllCrmDealsScoped(user) {
  if (userSeesAllCrmDeals(user?.role)) return true;
  const r = normalizeCrmUserRole(user?.role);
  const hasCompany = !!(user?.company_id != null && String(user.company_id).trim());
  if (r === 'region_admin' && hasCompany) return true;
  return (r === 'sales_admin' || r === 'crm_production_admin') && hasCompany;
}
