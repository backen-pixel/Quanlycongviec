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

module.exports = {
  normalizeRole,
  hasCompanyId,
  isAdminLike,
  isStrictAdmin,
  isSystemAdmin,
  isCompanyScopedAdmin,
  isCrmProductionStaff,
  isCrmProductionAdmin,
  isCrmModuleAdmin,
  isProductionAdmin,
  isProductionStaff,
  isLogisticsAdmin,
  isWorkProductionModuleAdmin,
  isModuleAdmin,
  canViewTrashTab,
  canAccessTrash,
};
