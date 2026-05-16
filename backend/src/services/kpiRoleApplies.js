/**
 * Ánh xạ users.role → tập applies_to trên kpi_definitions được tính điểm.
 * (Không import Supabase — dùng được trong unit test.)
 *
 * Trước đây gần như chỉ coi `sales` / `sales_admin`; các role khác làm CRM
 * (CSKH, thiết kế, NV được giao lead/deal, SX/VC khi có assigned_to…) dùng
 * cùng bộ «trường» với sales để điểm khớp dữ liệu crm_leads.
 */

const KPI_FULL_DEFINITION_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin',
  'administrator',
  /** Admin khu vực: cần bảng đủ KPI khi đối chiếu / chấm giống quản lý */
  'region_admin',
]);

/**
 * NV có thể được gán lead/deal trên CRM — cùng tập KPI «pipeline» với sales
 * (applies_to: sales, sales_all, deal, all).
 */
const KPI_CRM_FIELD_ROLES = new Set([
  'sales',
  'customer_care',
  'staff',
  'designer',
  'production',
  'driver',
  'installer',
]);

/**
 * Danh sách role mặc định khi gọi GET /kpi/users (scorecard) và cron recompute.
 * Giữ manager vì một số tổ chức vẫn gắn role manager cho NV kinh doanh.
 */
const KPI_RECOMPUTE_USER_ROLES_DEFAULT = [
  'sales',
  'sales_admin',
  'manager',
  'customer_care',
  'staff',
  'designer',
  'production',
  'driver',
  'installer',
  'region_admin',
];

/**
 * @param {string} userRole
 * @returns {Set<string>|null} null = không lọc (đủ KPI active)
 */
function allowedAppliesTagsForUserRole(userRole) {
  const r = String(userRole || 'sales').trim().toLowerCase();
  if (KPI_FULL_DEFINITION_ROLES.has(r)) return null;
  if (r === 'sales_admin') return new Set(['sales_admin', 'sales_all', 'all']);
  if (KPI_CRM_FIELD_ROLES.has(r)) return new Set(['sales', 'sales_all', 'deal', 'all']);
  return new Set(['all']);
}

function filterDefinitionsForUserRole(definitions, userRole) {
  const tags = allowedAppliesTagsForUserRole(userRole);
  if (!tags) return definitions || [];
  return (definitions || []).filter((d) => tags.has(String(d.applies_to || '').trim()));
}

module.exports = {
  KPI_FULL_DEFINITION_ROLES,
  KPI_CRM_FIELD_ROLES,
  KPI_RECOMPUTE_USER_ROLES_DEFAULT,
  allowedAppliesTagsForUserRole,
  filterDefinitionsForUserRole,
};
