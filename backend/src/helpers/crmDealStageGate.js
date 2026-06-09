/**
 * Quy tắc kéo giai đoạn deal trên CRM.
 * Mở khóa toàn bộ: CRM Kanban có thể kéo deal sang bất kỳ cột nào (kể cả Sản xuất / Vận chuyển).
 * Module xưởng/VC vẫn tự sync tiến độ về `sx_pipeline_stage_id` / `vc_pipeline_stage_id` (badge),
 * còn `stage_id` chính do user CRM tự quyết khi kéo tay.
 */

const POST_WON_SYNC_ROLES = new Set([
  'sx_production',
  'vc_delivery',
  'vc_installation',
  'vc_customer_care',
]);

function normalizeStageNameFold(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Tên cột CRM «Sản xuất» — không nhầm cột xưởng kiểu «Vẽ lên kế hoạch sản xuất». */
function isSanXuatProductionColumnName(foldedName) {
  const n = String(foldedName || '').trim();
  if (!n) return false;
  if (/\b(ke hoach|lap ke hoach|ve len ke hoach|thiet ke)\b/.test(n) && /\bsan xuat\b/.test(n)) {
    return false;
  }
  return /\bsan xuat\b/.test(n);
}

/** Cột CRM sau Thắng (Sản xuất, VC…) — không cho kéo thủ công trên Kanban CRM. */
function isCrmPostWonManagedStage(stage) {
  if (!stage) return false;
  if (stage.is_won || stage.is_lost) return false;
  const role = String(stage.sync_role || '').trim();
  if (role && POST_WON_SYNC_ROLES.has(role)) return true;
  const n = normalizeStageNameFold(stage.name);
  if (isSanXuatProductionColumnName(n)) return true;
  if (n.includes('van chuyen')) return true;
  if (n.includes('lap dat')) return true;
  if (n.includes('cham soc') && n.includes('khach')) return true;
  return false;
}

/** Chỉ khóa kéo thẻ khi đang ở cột do SX/VC quản lý (không khóa vì có project_id). */
function isDealCrmStageLocked(lead) {
  if (!lead || lead.type !== 'deal') return false;
  const st = lead.stage;
  if (st && isCrmPostWonManagedStage(st)) return true;
  return false;
}

function isCrmCompletedRevenueStage(stage) {
  return !!stage?.counts_as_completed_revenue;
}

function isDealOnCrmPostWonColumn(stage) {
  if (!stage) return false;
  if (stage.is_won) return true;
  if (isCrmCompletedRevenueStage(stage)) return true;
  return isCrmPostWonManagedStage(stage);
}

function isCrmPreWonSalesStage(stage) {
  if (!stage) return false;
  if (stage.is_lost || stage.is_won) return false;
  if (isCrmCompletedRevenueStage(stage)) return false;
  if (isCrmPostWonManagedStage(stage)) return false;
  return true;
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, code: string }}
 */
function assertDealCrmManualStageChange(lead, targetStage, prevStage) {
  if (!lead || lead.type !== 'deal' || !lead.project_id || !prevStage || !targetStage) {
    return { ok: true };
  }
  if (String(prevStage.id) === String(targetStage.id)) return { ok: true };
  // Luôn cho kéo về cột Thắng hoặc cột «doanh thu đã hoàn thành».
  if (targetStage.is_won || isCrmCompletedRevenueStage(targetStage)) return { ok: true };
  const leavingPostWon = isDealOnCrmPostWonColumn(prevStage);
  const enteringPreWon = isCrmPreWonSalesStage(targetStage);
  if (leavingPostWon && enteringPreWon) {
    return {
      ok: false,
      error: 'Deal đã tạo dự án Sản xuất — không thể kéo ngược về giai đoạn bán hàng. Vẫn có thể kéo thẳng về cột Thắng.',
      code: 'CRM_DEAL_SX_PROJECT_EXISTS',
    };
  }
  return { ok: true };
}

module.exports = {
  POST_WON_SYNC_ROLES,
  normalizeStageNameFold,
  isSanXuatProductionColumnName,
  isCrmPostWonManagedStage,
  isCrmCompletedRevenueStage,
  isDealOnCrmPostWonColumn,
  isDealCrmStageLocked,
  assertDealCrmManualStageChange,
};
