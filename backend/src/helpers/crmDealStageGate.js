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

/** Cột CRM sau Thắng (Sản xuất, VC…) — không cho kéo thủ công trên Kanban CRM. */
function isCrmPostWonManagedStage(stage) {
  if (!stage) return false;
  if (stage.is_won || stage.is_lost) return false;
  const role = String(stage.sync_role || '').trim();
  if (role && POST_WON_SYNC_ROLES.has(role)) return true;
  const n = normalizeStageNameFold(stage.name);
  if (n.includes('san xuat')) return true;
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

/**
 * @returns {{ ok: true } | { ok: false, error: string, code: string }}
 */
function assertDealCrmManualStageChange(_lead, _targetStage) {
  // Đã mở khóa: không chặn chuyển cột thủ công trên CRM nữa.
  return { ok: true };
}

module.exports = {
  POST_WON_SYNC_ROLES,
  normalizeStageNameFold,
  isCrmPostWonManagedStage,
  isDealCrmStageLocked,
  assertDealCrmManualStageChange,
};
