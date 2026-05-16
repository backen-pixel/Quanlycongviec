/**
 * Lọc KPI theo users.role — giữ khớp backend/src/services/kpiRoleApplies.js (đổi song song).
 */

const KPI_FULL_DEFINITION_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin',
  'administrator',
  'region_admin',
]);

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
 * @param {string} [userRole] — rỗng = không lọc (xem đủ)
 * @returns {Set<string>|null} null = mọi applies_to đều hiển thị
 */
export function allowedAppliesTagsForUserRole(userRole) {
  const r = String(userRole ?? '').trim().toLowerCase();
  if (!r) return null;
  if (KPI_FULL_DEFINITION_ROLES.has(r)) return null;
  if (r === 'sales_admin') return new Set(['sales_admin', 'sales_all', 'all']);
  if (KPI_CRM_FIELD_ROLES.has(r)) return new Set(['sales', 'sales_all', 'deal', 'all']);
  return new Set(['all']);
}

/** KPI definition applies_to có được tính cho vai trò đang lọc không */
export function definitionMatchesRoleFilter(appliesTo, roleFilter) {
  const tags = allowedAppliesTagsForUserRole(roleFilter);
  if (tags == null) return true;
  return tags.has(String(appliesTo || '').trim());
}

/** Tab CRM KD: có hiển thị nhóm mẫu Deal không */
export function crmSettingsShowsDealTemplates(roleFilter) {
  const tags = allowedAppliesTagsForUserRole(roleFilter);
  if (tags == null) return true;
  return tags.has('deal');
}

/** Giá trị select + nhãn tiếng Việt */
export const KPI_SETTINGS_ROLE_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả vai trò' },
  { value: 'sales_admin', label: 'Sales Admin / telesales' },
  { value: 'sales', label: 'Kinh doanh (SAE)' },
  { value: 'customer_care', label: 'Chăm sóc khách hàng' },
  { value: 'staff', label: 'Nhân viên (staff)' },
  { value: 'designer', label: 'Thiết kế' },
  { value: 'production', label: 'Sản xuất' },
  { value: 'driver', label: 'Vận chuyển' },
  { value: 'installer', label: 'Lắp đặt' },
  { value: 'manager', label: 'Quản lý (xem đủ KPI)' },
  { value: 'director', label: 'Giám đốc (xem đủ KPI)' },
  { value: 'supervisor', label: 'Giám sát (xem đủ KPI)' },
  { value: 'region_admin', label: 'Admin khu vực (xem đủ KPI)' },
];
