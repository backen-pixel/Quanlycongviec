/** Khớp backend/src/helpers/assignmentManageAccess.js */

function hasCompanyId(value) {
  return value != null && String(value).trim() !== '';
}

export function isSystemAdminUser(user) {
  return String(user?.role || '').toLowerCase() === 'admin' && !hasCompanyId(user?.company_id);
}

function isAdminLikeUser(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'sales_admin' || role === 'platform_admin';
}

function sameCompany(userCompanyId, rowCompanyId) {
  if (!hasCompanyId(userCompanyId) || !hasCompanyId(rowCompanyId)) return false;
  return String(userCompanyId) === String(rowCompanyId);
}

export function isAssignmentCreator(task, userId) {
  return String(task?.created_by_id || '') === String(userId || '');
}

export function canManageAssignment(task, user) {
  const uid = String(user?.id || user?.userId || '');
  if (isAssignmentCreator(task, uid)) return true;
  if (isSystemAdminUser(user)) return true;
  if (!isAdminLikeUser(user) || !hasCompanyId(user?.company_id) || !task) return false;
  return sameCompany(user.company_id, task.company_id)
    || sameCompany(user.company_id, task.executor_company_id);
}

export function isAssignmentAssignee(task, userId) {
  if (!userId) return false;
  const list = (task?.assignees?.length) ? task.assignees : (task?.assignee ? [task.assignee] : []);
  if (list.some((a) => String(a.id) === String(userId))) return true;
  if (task?.assignee_id && String(task.assignee_id) === String(userId)) return true;
  return false;
}
