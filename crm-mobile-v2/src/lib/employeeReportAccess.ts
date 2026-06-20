/** Khớp backend STAFF_LEAD_DEAL_REPORT_ROLES */
const REPORT_ROLES = new Set([
  'admin',
  'manager',
  'director',
  'supervisor',
  'superadmin',
  'super_admin',
  'region_admin',
]);

export function canViewEmployeeReport(role?: string | null): boolean {
  return REPORT_ROLES.has(String(role || '').trim().toLowerCase());
}
