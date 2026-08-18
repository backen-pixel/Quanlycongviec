/** Dự án đã bàn giao / đang trong module Lắp đặt — Lắp đặt.
 * Chỉ dựa liên kết VC thật (cột Kanban VC hoặc công ty VC) —
 * không dùng projects.status vì cột SX slug delivery/customer-care cũng set shipping/warranty.
 */
export const LOGISTICS_PROJECT_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];

/** Thẻ ở cột lắp đặt tạm bị khoá chuyển cột tới khi xưởng bàn giao + Sale CRM xác nhận. */
export const VC_TEMP_LOCK_MSG = 'Dự án đang ở cột lắp đặt tạm (badge TẠM) — chờ xưởng SX bàn giao và Sale CRM xác nhận lại thông tin VC/LĐ thì mới chuyển cột được.';

export function isProjectAlreadyInLogistics(project) {
  if (!project) return false;
  // Đang ở cột «lắp đặt tạm» (setup kế hoạch SX/VC) → chưa bàn giao thật từ xưởng.
  if (project.vc_temp_staged) return false;
  if (project.vc_kanban_column_id) return true;
  if (project.logistics_company_id) return true;
  return false;
}
