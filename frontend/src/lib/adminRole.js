/**
 * Helper phân loại quyền admin (frontend) — mirror backend/src/helpers/adminRole.js.
 *
 * Hai role admin-like:
 *  - `admin`            — quản trị viên (hệ thống hoặc công ty, tuỳ company_id).
 *  - `sales_admin`      — quản trị viên Kinh doanh, luôn gắn company_id (scope theo công ty).
 *
 * Quy tắc:
 *  - isAdminLike          : gating UI/route admin (mở trang cài đặt, hành động admin).
 *  - isSystemAdmin        : "thấy mọi công ty" — chỉ `admin` không có company_id.
 *  - isCompanyScopedAdmin : admin-like + có company_id (admin công ty hoặc sales_admin).
 */

export function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

export function hasCompanyId(user) {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

export function isAdminLike(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'sales_admin';
}

export function isSystemAdmin(user) {
  return normalizeRole(user?.role) === 'admin' && !hasCompanyId(user);
}

export function isCompanyScopedAdmin(user) {
  return isAdminLike(user) && hasCompanyId(user);
}

export function isProductionAdmin(user) {
  return normalizeRole(user?.role) === 'production_admin';
}

export function isLogisticsAdmin(user) {
  return normalizeRole(user?.role) === 'logistics_admin';
}

export function isModuleAdmin(user, moduleKey) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  const k = String(moduleKey || '').trim().toLowerCase();
  if (k === 'production' || k === 'sx') return isProductionAdmin(user);
  if (k === 'logistics' || k === 'vc') return isLogisticsAdmin(user);
  return false;
}

/** Tab thùng rác: crm | sx | vc */
export function canViewTrashTab(user, tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  if (t === 'crm' || !t) return isAdminLike(user);
  if (t === 'sx') return isAdminLike(user) || isProductionAdmin(user);
  if (t === 'vc') return isAdminLike(user) || isLogisticsAdmin(user);
  return false;
}

export function canAccessTrash(user) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  return isProductionAdmin(user) || isLogisticsAdmin(user);
}
