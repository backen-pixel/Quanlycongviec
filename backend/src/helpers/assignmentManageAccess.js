/**
 * Ai được sửa cấu trúc / xóa phân công (Không gian chung + bảng Giao việc).
 * Người tạo luôn được. Admin hệ thống (vd. Trương Trọng Thành) được thao tác
 * cả việc người khác tạo. Admin/sales_admin gắn công ty chỉ trong phạm vi công ty.
 */
const { isSystemAdmin, isAdminLike } = require('./adminRole');

function hasCompanyId(value) {
  return value != null && String(value).trim() !== '';
}

function sameCompany(userCompanyId, rowCompanyId) {
  if (!hasCompanyId(userCompanyId) || !hasCompanyId(rowCompanyId)) return false;
  return String(userCompanyId) === String(rowCompanyId);
}

function canOverrideAssignmentManage(user, row) {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  if (!isAdminLike(user) || !hasCompanyId(user.company_id) || !row) return false;
  return sameCompany(user.company_id, row.company_id)
    || sameCompany(user.company_id, row.executor_company_id);
}

function isAssignmentCreatorUser(user, row) {
  const uid = user?.userId || user?.id;
  return !!(row && uid && String(row.created_by_id || '') === String(uid));
}

function canManageAssignmentStructure(user, row) {
  return isAssignmentCreatorUser(user, row) || canOverrideAssignmentManage(user, row);
}

module.exports = {
  canOverrideAssignmentManage,
  canManageAssignmentStructure,
  isAssignmentCreatorUser,
};
