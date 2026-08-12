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

function getCrmStageGroupLabel(stageSlug, pipelineStageName = null) {
  if (pipelineStageName) return pipelineStageName;
  if (!stageSlug) return null;
  const s = String(stageSlug);
  if (SLUG_LABELS[s]) return SLUG_LABELS[s];
  if (s.startsWith(SX_PREFIX)) return `SX · ${SLUG_LABELS[s] || s.replace(/^sx_/, '').replace(/_/g, ' ')}`;
  const plMatch = s.match(/^pl_(.+)_([a-f0-9]{8})$/i);
  if (plMatch) return plMatch[1].replace(/_/g, ' ');
  return s;
}

const { cleanShareModulesInput, parseJsonArray } = require('./documentShareScope');
const { shouldBlockAutoShareQuoteContract } = require('./hideQuoteContractFromProduction');

/**
 * Map cờ chia sẻ CRM (shared_to_project trên task/attachment) → lead_documents (shared_to_workshop).
 * @param {{ shared_to_project?: boolean, allowed_share_modules?: unknown }|null|undefined} artifactRow — attachment hoặc task
 */
function getLeadDocumentShareFromCrm(artifactRow) {
  if (!artifactRow || artifactRow.shared_to_project !== true) {
    return { shared_to_workshop: false, allowed_share_modules: null };
  }
  const raw = parseJsonArray(artifactRow.allowed_share_modules);
  const cleaned = raw?.length ? cleanShareModulesInput(raw) : null;
  return {
    shared_to_workshop: true,
    allowed_share_modules: cleaned,
  };
}

/** Nhiệm vụ SX trên deal đã có project_id → tự chia sẻ sang tab Tài liệu module Sản xuất. */
function shouldAutoShareSxToWorkshop(taskRow, opts = {}) {
  if (!opts.linkToProject) return false;
  const slug = taskRow?.stage_slug;
  return !!(slug && String(slug).startsWith(SX_PREFIX));
}

function shareFromChecklistItem(checklistItem) {
  if (!checklistItem || checklistItem.shared_to_project !== true) return null;
  const raw = parseJsonArray(checklistItem.allowed_share_modules);
  const cleaned = raw?.length ? cleanShareModulesInput(raw) : null;
  return {
    shared_to_project: true,
    allowed_share_modules: cleaned?.length ? cleaned : ['production'],
  };
}

/** Cờ mặc định trên crm_task_attachments — deal đã có dự án SX thì tự chia sẻ sang xưởng. */
function getDefaultCrmAttachmentShare(taskRow, opts = {}, checklistItem = null) {
  // VPT / Phúc Đạt: không auto-chia sẻ file/ghi chú nhiệm vụ Báo giá & Hợp đồng sang SX
  if (shouldBlockAutoShareQuoteContract({ companyId: opts.leadCompanyId, task: taskRow })) {
    return { shared_to_project: false, allowed_share_modules: null };
  }
  const fromCk = shareFromChecklistItem(checklistItem);
  if (fromCk) return fromCk;
  if (taskRow?.shared_to_project === true) {
    const raw = parseJsonArray(taskRow.allowed_share_modules);
    const cleaned = raw?.length ? cleanShareModulesInput(raw) : null;
    return { shared_to_project: true, allowed_share_modules: cleaned };
  }
  // Slot tư liệu đơn hàng (sketchup / mô tả / render / …): luôn đồng bộ file → xưởng khi có dự án
  try {
    const { isOrderDocsTaskTitle } = require('./orderDocsWorkshopTasks');
    if (opts.linkToProject && isOrderDocsTaskTitle(taskRow?.title)) {
      return { shared_to_project: true, allowed_share_modules: ['production'] };
    }
  } catch (_) { /* ignore */ }
  if (opts.linkToProject || shouldAutoShareSxToWorkshop(taskRow, opts)) {
    return { shared_to_project: true, allowed_share_modules: ['production'] };
  }
  return { shared_to_project: false, allowed_share_modules: null };
}

/**
 * @param {{ id?: string, stage_slug?: string|null, title?: string, shared_to_project?: boolean, allowed_share_modules?: unknown }|null|undefined} taskRow
 * @param {{ linkToProject?: boolean }} opts — crm_leads đã có project_id (deal đã vào xưởng / có dự án)
 * @param {{ shared_to_project?: boolean, allowed_share_modules?: unknown }|null|undefined} [attachmentRow] — ưu tiên cờ trên attachment
 * @returns {object} các cột gộp vào insert/update lead_documents
 */
function getLeadDocumentFieldsFromCrmTask(taskRow, opts = {}, attachmentRow = null) {
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
  const pipelineStageName = taskRow.pipeline_stage?.name || taskRow.pipeline_stage_name || null;
  const shareSrc = attachmentRow?.shared_to_project != null ? attachmentRow : taskRow;
  let share = getLeadDocumentShareFromCrm(shareSrc);
  if (!share.shared_to_workshop && shouldAutoShareSxToWorkshop(taskRow, opts)) {
    share = { shared_to_workshop: true, allowed_share_modules: ['production'] };
  }
  return {
    source_crm_task_id: taskRow.id,
    crm_stage_slug: slug,
    crm_stage_group_label: getCrmStageGroupLabel(slug, pipelineStageName),
    ...share,
  };
}

module.exports = {
  getCrmStageGroupLabel,
  getLeadDocumentShareFromCrm,
  shouldAutoShareSxToWorkshop,
  getDefaultCrmAttachmentShare,
  getLeadDocumentFieldsFromCrmTask,
};
