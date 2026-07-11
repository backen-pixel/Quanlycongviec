/** Dự án đã bàn giao / đang trong module Vận chuyển — Lắp đặt. */
export const LOGISTICS_PROJECT_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];

export function isProjectAlreadyInLogistics(project) {
  if (!project) return false;
  if (project.vc_kanban_column_id) return true;
  if (project.logistics_company_id) return true;
  const st = String(project.status || '');
  if (LOGISTICS_PROJECT_STATUSES.includes(st)) return true;
  return false;
}
