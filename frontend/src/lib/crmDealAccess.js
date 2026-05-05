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
