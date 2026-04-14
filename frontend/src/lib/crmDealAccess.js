/**
 * CRM Deal: admin / lãnh đạo xem mọi deal; nhân viên (staff, sale, …) chỉ deal mình phụ trách.
 * Phải khớp logic backend `userSeesAllCrmDeals` (crm.js).
 */
const CRM_DEAL_VIEW_ALL_ROLES = new Set([
  'admin',
  'manager',
  'director',
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
