/**
 * Gắn meta phân loại cho lead_documents khi đồng bộ từ crm_tasks (ghi chú / đính kèm).
 * - crm_stage_slug / crm_stage_group_label: "nhiệm vụ lớn" = giai đoạn pipeline (KD / Deal / SX).
 * - SX (slug bắt đầu sx_): bật chia sẻ xưởng + giới hạn module production/workshop.
 * - Mặc định không chia sẻ xưởng — user bật «Hiện ở SX/VC» trên tab Tài liệu CRM.
 */

const SX_PREFIX = 'sx_';

/** Đồng bộ với frontend CRMTasksTab (LEAD_STAGES / DEAL_STAGES / SX_ORDER_STAGES). */
const SLUG_LABELS = {
  consulting: 'Tư vấn',
  design: 'Thiết kế',
  quotation: 'Báo giá',
  contract: 'Hợp đồng',
  deal_new: 'Nhiệm vụ Deal mới',
  deal_quote_contract: 'Báo giá & Hợp đồng',
  deal_ordering: 'Tiến hành đặt hàng',
  deal_schedule: 'Hẹn ngày lắp đặt',
  deal_shipping: 'Đặt Vận chuyển',
  deal_notes: 'Ghi chú khác',
  sx_tiep_nhan: 'Tiếp nhận',
  sx_thiet_ke_ke_hoach: 'Thiết kế và lên kế hoạch',
  sx_kiem_tra_cheo: 'Kiểm tra chéo',
  sx_vat_tu: 'Vật tư',
  sx_san_xuat_thung: 'Sản xuất thùng',
  sx_san_xuat_alu: 'Sản xuất alu',
  sx_hoan_thien: 'Hoàn thiện',
  sx_dong_goi: 'Đóng gói',
  sx_giao_hang: 'Giao hàng',
};

function getCrmStageGroupLabel(stageSlug) {
  if (!stageSlug) return null;
  const s = String(stageSlug);
  if (SLUG_LABELS[s]) return SLUG_LABELS[s];
  if (s.startsWith(SX_PREFIX)) return `SX · ${SLUG_LABELS[s] || s.replace(/^sx_/, '')}`;
  return s;
}

/**
 * @param {{ id?: string, stage_slug?: string|null, title?: string }|null|undefined} taskRow — một dòng crm_tasks (đủ id + stage_slug)
 * @param {{ linkToProject?: boolean }} opts — crm_leads đã có project_id (deal đã vào xưởng / có dự án)
 * @returns {object} các cột gộp vào insert/update lead_documents
 */
function getLeadDocumentFieldsFromCrmTask(taskRow, opts = {}) {
  if (!taskRow || !taskRow.id) {
    return {
      source_crm_task_id: null,
      crm_stage_slug: null,
      crm_stage_group_label: null,
      allowed_share_modules: null,
      shared_to_workshop: false,
    };
  }
  const slug = taskRow.stage_slug || null;
  const sx = slug && String(slug).startsWith(SX_PREFIX);
  return {
    source_crm_task_id: taskRow.id,
    crm_stage_slug: slug,
    crm_stage_group_label: getCrmStageGroupLabel(slug),
    allowed_share_modules: sx ? ['production', 'workshop'] : null,
    shared_to_workshop: false,
  };
}

module.exports = {
  getCrmStageGroupLabel,
  getLeadDocumentFieldsFromCrmTask,
};
