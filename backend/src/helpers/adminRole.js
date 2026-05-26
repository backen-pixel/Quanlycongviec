/**
 * Helper phân loại quyền admin.
 *
 * Hai role được coi là "admin-like":
 *  - `admin`            — quản trị viên hệ thống / công ty (tuỳ có company_id).
 *  - `sales_admin`      — quản trị viên Kinh doanh, LUÔN có company_id và bị khoá phạm vi.
 *
 * Quy tắc dùng:
 *  - isAdminLike          : gating "có quyền thao tác admin" (mở UI/route admin, tạo/sửa/xoá).
 *                           Phạm vi dữ liệu vẫn được khoá ở tầng route khi user có company_id.
 *  - isSystemAdmin        : nhánh "thấy mọi công ty" (admin tổng, không gắn company_id).
 *                           `sales_admin` không bao giờ qualify.
 *  - isCompanyScopedAdmin : admin-like + có company_id (admin công ty hoặc sales_admin).
 */

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function hasCompanyId(user) {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

function isAdminLike(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'sales_admin';
}

function isSystemAdmin(user) {
  return normalizeRole(user?.role) === 'admin' && !hasCompanyId(user);
}

function isCompanyScopedAdmin(user) {
  return isAdminLike(user) && hasCompanyId(user);
}

function isProductionAdmin(user) {
  return normalizeRole(user?.role) === 'production_admin';
}

function isLogisticsAdmin(user) {
  return normalizeRole(user?.role) === 'logistics_admin';
}

/** Admin module SX hoặc VC (hoặc admin hệ thống/công ty). */
function isModuleAdmin(user, moduleKey) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  const k = String(moduleKey || '').trim().toLowerCase();
  if (k === 'production' || k === 'sx') return isProductionAdmin(user);
  if (k === 'logistics' || k === 'vc') return isLogisticsAdmin(user);
  return false;
}

/**
 * Tab thùng rác gộp: crm | sx | vc
 * - crm: admin-like
 * - sx: admin-like hoặc production_admin
 * - vc: admin-like hoặc logistics_admin
 */
function canViewTrashTab(user, tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  if (t === 'crm' || t === '') return false;
  if (t === 'sx') return isProductionAdmin(user);
  if (t === 'vc') return isLogisticsAdmin(user);
  return false;
}

function canAccessTrash(user) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  return isProductionAdmin(user) || isLogisticsAdmin(user);
}

module.exports = {
  normalizeRole,
  hasCompanyId,
  isAdminLike,
  isSystemAdmin,
  isCompanyScopedAdmin,
  isProductionAdmin,
  isLogisticsAdmin,
  isModuleAdmin,
  canViewTrashTab,
  canAccessTrash,
};
