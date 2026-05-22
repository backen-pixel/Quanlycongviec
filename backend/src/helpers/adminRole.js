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

module.exports = {
  normalizeRole,
  hasCompanyId,
  isAdminLike,
  isSystemAdmin,
  isCompanyScopedAdmin,
};
