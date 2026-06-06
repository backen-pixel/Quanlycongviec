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

/** Chỉ true với role `admin` (hệ thống hoặc admin công ty). Không bao gồm sales_admin, manager, module-admin. */
export function isStrictAdmin(user) {
  return normalizeRole(user?.role) === 'admin';
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

/** Nhân viên sản xuất — admin module Công việc + Sản xuất (phạm vi công ty). */
export function isProductionStaff(user) {
  return normalizeRole(user?.role) === 'production_staff';
}

export function isLogisticsAdmin(user) {
  return normalizeRole(user?.role) === 'logistics_admin';
}

/** Quản trị menu module Công việc + Sản xuất (không gồm CRM / hệ thống). */
export function isWorkProductionModuleAdmin(user) {
  const r = normalizeRole(user?.role);
  return isAdminLike(user) || r === 'manager' || isProductionStaff(user) || isProductionAdmin(user);
}

export function isModuleAdmin(user, moduleKey) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  const k = String(moduleKey || '').trim().toLowerCase();
  if (k === 'production' || k === 'sx') return isProductionAdmin(user) || isProductionStaff(user);
  if (k === 'tasks' || k === 'projects') return isProductionStaff(user);
  if (k === 'logistics' || k === 'vc') return isLogisticsAdmin(user);
  return false;
}

/** Tab thùng rác: crm | sx | vc — chỉ role `admin` (system admin / admin công ty) được phép. */
export function canViewTrashTab(user /* , _tab */) {
  return isStrictAdmin(user);
}

export function canAccessTrash(user) {
  return isStrictAdmin(user);
}
