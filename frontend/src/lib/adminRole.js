/**
 * Helper phân loại quyền admin (frontend) — mirror backend/src/helpers/adminRole.js.
 *
 * Hai role admin-like:
 *  - `admin`            — quản trị viên (hệ thống hoặc công ty, tuỳ company_id).
 *  - `sales_admin`      — quản trị viên Kinh doanh, luôn gắn company_id (scope theo công ty).
 *
 * Quy tắc:
 *  - isAdminLike          : gating UI/route admin (mở trang cài đặt, hành động admin).
 *  - isSystemAdmin        : admin hệ thống — `admin` không có company_id (legacy hoặc admin cao nhất HST).
 *                           Khác `platform_admin`. Phạm vi dữ liệu do tenant context trên API.
 *  - isLegacySystemAdmin  : admin legacy không tenant_id (toàn server cũ).
 *  - isCompanyScopedAdmin : admin-like + có company_id (admin công ty hoặc sales_admin).
 */

export function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

export function hasCompanyId(user) {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

export function hasTenantId(user) {
  return user?.tenant_id != null && String(user.tenant_id).trim() !== '';
}

export function isPlatformAdmin(user) {
  return normalizeRole(user?.role) === 'platform_admin';
}

export function isAdminLike(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'sales_admin' || r === 'platform_admin';
}

/** Chỉ true với role `admin` (hệ thống hoặc admin công ty). Không bao gồm sales_admin, manager, module-admin. */
export function isStrictAdmin(user) {
  return normalizeRole(user?.role) === 'admin';
}

/** Admin cao nhất trong HST (có tenant_id, không company_id). */
export function isTenantAdmin(user) {
  return normalizeRole(user?.role) === 'admin' && hasTenantId(user) && !hasCompanyId(user);
}

/** Admin hệ thống legacy — không thuộc tenant SaaS. */
export function isLegacySystemAdmin(user) {
  return normalizeRole(user?.role) === 'admin' && !hasCompanyId(user) && !hasTenantId(user);
}

export function isSystemAdmin(user) {
  return normalizeRole(user?.role) === 'admin' && !hasCompanyId(user);
}

export function isCompanyScopedAdmin(user) {
  return isAdminLike(user) && hasCompanyId(user);
}

/** NV Kinh doanh (SAE) hoặc Sales Admin. */
export function isSalesRole(user) {
  const r = normalizeRole(user?.role);
  return r === 'sales' || r === 'sales_admin';
}

/**
 * Sale gắn công ty — được xem module SX + VC/LĐ trong phạm vi công ty (deal/dự án của công ty mình).
 */
export function isSalesCompanyWorkshopViewer(user) {
  return isSalesRole(user) && hasCompanyId(user);
}

export function isCrmProductionStaff(user) {
  return normalizeRole(user?.role) === 'crm_production_staff';
}

/** Admin CRM + Sản xuất (phạm vi công ty). */
export function isCrmProductionAdmin(user) {
  return normalizeRole(user?.role) === 'crm_production_admin';
}

/** Quản trị menu/route CRM (admin hệ thống, sales_admin, admin CRM+SX). */
export function isCrmModuleAdmin(user) {
  return isAdminLike(user) || isCrmProductionAdmin(user);
}

/** Email được xem trang Facebook / Zalo OA (không cần full admin CRM). */
const CRM_SOCIAL_INBOX_EMAILS = new Set([
  'luonggiayen@gmail.com',
]);

/** Phạm vi công ty cho từng email hộp thư riêng. */
const CRM_SOCIAL_INBOX_COMPANY_KEYS = {
  'luonggiayen@gmail.com': 'nextgo',
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isCrmSocialInboxUser(user) {
  return CRM_SOCIAL_INBOX_EMAILS.has(normalizeEmail(user?.email));
}

export function getCrmSocialInboxCompanyKey(user) {
  if (!isCrmSocialInboxUser(user)) return null;
  return CRM_SOCIAL_INBOX_COMPANY_KEYS[normalizeEmail(user?.email)] || null;
}

/** User hộp thư riêng — luôn khóa theo công ty (NextGo), không đổi filter. */
export function isCrmSocialInboxCompanyLocked(user) {
  return !!getCrmSocialInboxCompanyKey(user);
}

/** Trang hộp thư Facebook + Zalo OA (admin CRM hoặc user được cấp riêng). */
export function canAccessCrmSocialInbox(user) {
  return isCrmModuleAdmin(user) || isCrmSocialInboxUser(user);
}

/** Admin module Sản xuất (crm_production_staff = NV CRM nhưng admin SX trong phạm vi công ty). */
export function isProductionAdmin(user) {
  const r = normalizeRole(user?.role);
  return r === 'production_admin' || r === 'crm_production_admin' || r === 'crm_production_staff';
}

/** Nhân viên sản xuất — admin module Công việc + Sản xuất (phạm vi công ty). */
export function isProductionStaff(user) {
  const r = normalizeRole(user?.role);
  return r === 'production_staff' || r === 'crm_production_staff';
}

export function isLogisticsAdmin(user) {
  return normalizeRole(user?.role) === 'logistics_admin';
}

/** Quản trị menu module Công việc + Sản xuất (không gồm CRM / hệ thống). */
export function isWorkProductionModuleAdmin(user) {
  const r = normalizeRole(user?.role);
  return isAdminLike(user) || r === 'manager' || isProductionStaff(user) || isProductionAdmin(user);
}

/** CRUD phòng ban — khớp backend adminRole.canManageDepartments. */
export function canManageDepartments(user) {
  const r = normalizeRole(user?.role);
  return isWorkProductionModuleAdmin(user) || r === 'superadmin' || r === 'super_admin';
}

/** Tạo / sửa nhân viên — khớp backend adminRole.canCreateStaff. */
export function canCreateStaff(user) {
  return canManageDepartments(user);
}

export function isModuleAdmin(user, moduleKey) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  const k = String(moduleKey || '').trim().toLowerCase();
  if (k === 'crm' || k === 'customers') return isCrmProductionAdmin(user);
  if (k === 'production' || k === 'sx') return isProductionAdmin(user) || isProductionStaff(user);
  if (k === 'tasks' || k === 'projects') return isProductionStaff(user) || isCrmProductionAdmin(user);
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
