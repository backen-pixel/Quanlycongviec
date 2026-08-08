/** Dự án đã bàn giao / đang trong module Lắp đặt — Lắp đặt.
 * Chỉ dựa liên kết VC thật (cột Kanban VC hoặc công ty VC) —
 * không dùng projects.status vì cột SX slug delivery/customer-care cũng set shipping/warranty.
 */
export const LOGISTICS_PROJECT_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];

export function isProjectAlreadyInLogistics(project) {
  if (!project) return false;
  if (project.vc_kanban_column_id) return true;
  if (project.logistics_company_id) return true;
  return false;
}
