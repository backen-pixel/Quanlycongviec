import { isCrmModuleAdmin } from './adminRole';

/**
 * Admin CRM (admin / sales_admin / crm_production_admin) luôn được xóa.
 * Nhân viên: theo cấu hình pipeline (mặc định cho phép nếu chưa có cột / null).
 */
export function canUserDeleteCrmLeadDeal({ pipeline, type, user }) {
  if (isCrmModuleAdmin(user)) return true;
  const isDeal = String(type || '').toLowerCase() === 'deal';
  const field = isDeal ? 'allow_employee_delete_deal' : 'allow_employee_delete_lead';
  if (!pipeline) return true;
  return pipeline[field] !== false;
}

export function findCrmPipelineById(pipelines, pipelineId) {
  if (!pipelineId) return null;
  const pid = String(pipelineId);
  return (pipelines || []).find((p) => String(p.id) === pid) || null;
}
