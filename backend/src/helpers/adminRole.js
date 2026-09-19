/**
 * Helper phân loại quyền admin.
 *
 * Role admin-like:
 *  - `ecosystem_admin`  — quản trị toàn hệ sinh thái (mọi công ty trong tenant). Không vượt tenant.
 *  - `admin`            — quản trị viên hệ thống / công ty (tuỳ có company_id).
 *  - `sales_admin`      — quản trị viên Kinh doanh, LUÔN có company_id và bị khoá phạm vi.
 *  - `platform_admin`   — SaaS toàn nền tảng (bỏ tenant). Không dùng cho admin HST.
 *
 * Quy tắc dùng:
 *  - isAdminLike          : gating "có quyền thao tác admin" (mở UI/route admin, tạo/sửa/xoá).
 *                           Phạm vi dữ liệu vẫn được khoá ở tầng route khi user có company_id.
 *  - isEcosystemAdmin     : role `ecosystem_admin` — cao nhất trong HST, vẫn bị tenantGate.
 *  - isSystemAdmin        : ecosystem_admin, hoặc `admin` không gắn company_id (legacy).
 *                           Khác `platform_admin` (toàn nền tảng SaaS).
 *  - isLegacySystemAdmin  : admin hệ thống legacy (không tenant_id) — chỉ dùng khi cần phạm vi toàn server cũ.
 *  - isCompanyScopedAdmin : admin-like + có company_id (admin công ty hoặc sales_admin).
 *                           ecosystem_admin không bao giờ bị khoá 1 công ty.
 */

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function hasCompanyId(user) {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

function hasTenantId(user) {
  return user?.tenant_id != null && String(user.tenant_id).trim() !== '';
}

function isPlatformAdmin(user) {
  return normalizeRole(user?.role) === 'platform_admin';
}

/** Quản trị toàn hệ sinh thái — cao hơn admin công ty, thấp hơn platform_admin. */
function isEcosystemAdmin(user) {
  return normalizeRole(user?.role) === 'ecosystem_admin';
}

function isAdminLike(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'sales_admin' || r === 'platform_admin' || r === 'ecosystem_admin';
}

/** Role `admin` hoặc `ecosystem_admin` (thùng rác, xóa cứng). Không gồm sales_admin. */
function isStrictAdmin(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'ecosystem_admin';
}

/** Admin cao nhất trong HST (ecosystem_admin, hoặc admin không khoá công ty). */
function isTenantAdmin(user) {
  if (isEcosystemAdmin(user) && hasTenantId(user)) return true;
  return normalizeRole(user?.role) === 'admin' && hasTenantId(user) && !hasCompanyId(user);
}

/** Admin hệ thống legacy — không thuộc tenant SaaS (phạm vi toàn server cũ). */
function isLegacySystemAdmin(user) {
  return normalizeRole(user?.role) === 'admin' && !hasCompanyId(user) && !hasTenantId(user);
}

function isSystemAdmin(user) {
  if (isEcosystemAdmin(user)) return true;
  return normalizeRole(user?.role) === 'admin' && !hasCompanyId(user);
}

function isCompanyScopedAdmin(user) {
  if (isEcosystemAdmin(user)) return false;
  return isAdminLike(user) && hasCompanyId(user);
}

/** NV Kinh doanh (SAE) hoặc Sales Admin. */
function isSalesRole(user) {
  const r = normalizeRole(user?.role);
  return r === 'sales' || r === 'sales_admin';
}

/**
 * Sale gắn công ty — được xem module SX + VC/LĐ trong phạm vi công ty (deal/dự án của công ty mình).
 * Khác admin hệ thống: không xem công ty khác.
 */
function isSalesCompanyWorkshopViewer(user) {
  return isSalesRole(user) && hasCompanyId(user);
}

function isCrmProductionStaff(user) {
  return normalizeRole(user?.role) === 'crm_production_staff';
}

/** Admin CRM + Sản xuất (phạm vi công ty — cần company_id). */
function isCrmProductionAdmin(user) {
  return normalizeRole(user?.role) === 'crm_production_admin';
}

/** Quản trị menu/route CRM (admin hệ thống, sales_admin, admin CRM+SX). */
function isCrmModuleAdmin(user) {
  return isAdminLike(user) || isCrmProductionAdmin(user);
}

/** Email được xem trang Facebook / Zalo OA (không cần full admin CRM). */
const CRM_SOCIAL_INBOX_EMAILS = new Set([
  'luonggiayen@gmail.com',
]);

const CRM_SOCIAL_INBOX_COMPANY_KEYS = {
  'luonggiayen@gmail.com': 'nextgo',
};

function getCrmSocialInboxCompanyKey(user) {
  if (!isCrmSocialInboxUser(user)) return null;
  return CRM_SOCIAL_INBOX_COMPANY_KEYS[normalizeEmail(user?.email)] || null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isCrmSocialInboxUser(user) {
  return CRM_SOCIAL_INBOX_EMAILS.has(normalizeEmail(user?.email));
}

/** Trang hộp thư Facebook + Zalo OA (admin CRM hoặc user được cấp riêng). */
function canAccessCrmSocialInbox(user) {
  return isCrmModuleAdmin(user) || isCrmSocialInboxUser(user);
}

/** Admin module Sản xuất (crm_production_staff = NV CRM nhưng admin SX trong phạm vi công ty). */
function isProductionAdmin(user) {
  const r = normalizeRole(user?.role);
  return r === 'production_admin' || r === 'crm_production_admin' || r === 'crm_production_staff';
}

/** Nhân viên sản xuất — admin module Công việc + Sản xuất (phạm vi công ty). */
function isProductionStaff(user) {
  const r = normalizeRole(user?.role);
  return r === 'production_staff' || r === 'crm_production_staff';
}

function isLogisticsAdmin(user) {
  return normalizeRole(user?.role) === 'logistics_admin';
}

/** Quản trị menu/API module Công việc + Sản xuất (không gồm CRM / hệ thống). */
function isWorkProductionModuleAdmin(user) {
  const r = normalizeRole(user?.role);
  return isAdminLike(user) || r === 'manager' || isProductionStaff(user) || isProductionAdmin(user);
}

/** Admin module SX hoặc VC (hoặc admin hệ thống/công ty). */
function isModuleAdmin(user, moduleKey) {
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  const k = String(moduleKey || '').trim().toLowerCase();
  if (k === 'crm' || k === 'customers') return isCrmProductionAdmin(user);
  if (k === 'production' || k === 'sx') return isProductionAdmin(user) || isProductionStaff(user);
  if (k === 'tasks' || k === 'projects') return isProductionStaff(user) || isCrmProductionAdmin(user);
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

/** CRUD phòng ban — admin công ty, manager, admin module Công việc/SX. */
function canManageDepartments(user) {
  const r = normalizeRole(user?.role);
  return isWorkProductionModuleAdmin(user) || r === 'superadmin' || r === 'super_admin';
}

/**
 * Tạo / sửa / vô hiệu hóa nhân viên.
 * Gồm admin/manager/sales_admin và admin module Công việc+SX (production_staff, production_admin, …).
 */
function canCreateStaff(user) {
  return canManageDepartments(user);
}

/** Role không được tự tạo admin hệ thống / HST / nền tảng khi không phải admin hệ thống. */
function isElevatedStaffRole(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'platform_admin' || r === 'ecosystem_admin';
}

module.exports = {
  normalizeRole,
  hasCompanyId,
  hasTenantId,
  isPlatformAdmin,
  isEcosystemAdmin,
  isAdminLike,
  isStrictAdmin,
  isTenantAdmin,
  isLegacySystemAdmin,
  isSystemAdmin,
  isCompanyScopedAdmin,
  isSalesRole,
  isSalesCompanyWorkshopViewer,
  isCrmProductionStaff,
  isCrmProductionAdmin,
  isCrmModuleAdmin,
  isCrmSocialInboxUser,
  getCrmSocialInboxCompanyKey,
  canAccessCrmSocialInbox,
  normalizeEmail,
  isProductionAdmin,
  isProductionStaff,
  isLogisticsAdmin,
  isWorkProductionModuleAdmin,
  isModuleAdmin,
  canManageDepartments,
  canCreateStaff,
  isElevatedStaffRole,
  canViewTrashTab,
  canAccessTrash,
};
