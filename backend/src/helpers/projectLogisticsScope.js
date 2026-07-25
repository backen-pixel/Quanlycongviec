/** Status lịch sử — giữ export cho chỗ còn tham chiếu; không dùng để suy «đã bàn giao». */
const LOGISTICS_PROJECT_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];

/**
 * Dự án đã bàn giao sang VC/LĐ — không hỏi lại modal bàn giao.
 * Chỉ dựa liên kết VC thật (không dùng status — cột SX có thể tự set shipping/warranty).
 */
function isProjectAlreadyInLogistics(project) {
  if (!project) return false;
  if (project.vc_kanban_column_id) return true;
  if (project.logistics_company_id) return true;
  return false;
}

module.exports = {
  LOGISTICS_PROJECT_STATUSES,
  isProjectAlreadyInLogistics,
};
