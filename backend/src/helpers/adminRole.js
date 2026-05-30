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

/** Chỉ true với role `admin` (hệ thống hoặc admin công ty). */
function isStrictAdmin(user) {
  return normalizeRole(user?.role) === 'admin';
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
 * Tab thùng rác gộp (crm | sx | vc) — chỉ role `admin` (hệ thống / admin công ty)
 * được vào trang Thùng rác và xem mọi tab module.
 * Sales_admin, production_admin, logistics_admin, manager đều bị chặn.
 */
function canViewTrashTab(user /* , _tab */) {
  return isStrictAdmin(user);
}

function canAccessTrash(user) {
  return isStrictAdmin(user);
}

module.exports = {
  normalizeRole,
  hasCompanyId,
  isAdminLike,
  isStrictAdmin,
  isSystemAdmin,
  isCompanyScopedAdmin,
  isProductionAdmin,
  isLogisticsAdmin,
  isModuleAdmin,
  canViewTrashTab,
  canAccessTrash,
};
