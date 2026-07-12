const LOGISTICS_PROJECT_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];

/** Dự án đã bàn giao sang VC/LĐ — không hỏi lại modal bàn giao. */
function isProjectAlreadyInLogistics(project) {
  if (!project) return false;
  if (project.vc_kanban_column_id) return true;
  if (project.logistics_company_id) return true;
  if (LOGISTICS_PROJECT_STATUSES.includes(String(project.status || ''))) return true;
  return false;
}

module.exports = {
  LOGISTICS_PROJECT_STATUSES,
  isProjectAlreadyInLogistics,
};
