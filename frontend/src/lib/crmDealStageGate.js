/** @typedef {{ id?: string, name?: string, is_won?: boolean, is_lost?: boolean, sync_role?: string|null, counts_as_completed_revenue?: boolean }} CrmStageLike */
/** @typedef {{ type?: string, project_id?: string|null, sx_handover_at?: string|null, stage_id?: string|null, stage?: CrmStageLike|null }} CrmLeadLike */

const POST_WON_SYNC_ROLES = new Set([
  'sx_production',
  'vc_delivery',
  'vc_installation',
  'vc_customer_care',
]);

export function normalizeStageNameFold(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Tên cột CRM «Sản xuất» — không nhầm cột xưởng kiểu «Vẽ lên kế hoạch sản xuất». */
export function isSanXuatProductionColumnName(foldedName) {
  const n = String(foldedName || '').trim();
  if (!n) return false;
  if (/\b(ke hoach|lap ke hoach|ve len ke hoach|thiet ke)\b/.test(n) && /\bsan xuat\b/.test(n)) {
    return false;
  }
  return /\bsan xuat\b/.test(n);
}

/** @param {CrmStageLike|null|undefined} stage */
export function isCrmPostWonManagedStage(stage) {
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

/** Deal CRM đã có dự án xưởng (đã tạo / đang ở Sản xuất). */
export function dealHasSxProject(item) {
  return !!(item?.project_id);
}

/** Cột «doanh thu đã hoàn thành» — tiến về phía sau Thắng, không coi là giai đoạn bán hàng. */
export function isCrmCompletedRevenueStage(stage) {
  return !!stage?.counts_as_completed_revenue;
}

/** Cột đang ở giai đoạn sau Thắng (Thắng, Hoàn thành DT, Sản xuất / VC…). */
export function isDealOnCrmPostWonColumn(stage) {
  if (!stage) return false;
  if (stage.is_won) return true;
  if (isCrmCompletedRevenueStage(stage)) return true;
  return isCrmPostWonManagedStage(stage);
}

/** Cột giai đoạn bán hàng (trước Thắng) — kéo ngược từ post-won về đây bị chặn. */
function isCrmPreWonSalesStage(stage) {
  if (!stage) return false;
  if (stage.is_lost || stage.is_won) return false;
  if (isCrmCompletedRevenueStage(stage)) return false;
  if (isCrmPostWonManagedStage(stage)) return false;
  return true;
}

/**
 * Kéo ngược deal đã có dự án SX về cột bán hàng (trước Thắng) — không cho phép.
 * @returns {string|null}
 */
export function crmDealRevertFromPostWonBlockedMessage(item, currentStage, targetStage) {
  if (!item || item.type !== 'deal' || !dealHasSxProject(item)) return null;
  if (!currentStage || !targetStage) return null;
  if (String(currentStage.id) === String(targetStage.id)) return null;
  // Luôn cho kéo về cột Thắng hoặc cột «doanh thu đã hoàn thành».
  if (targetStage.is_won || isCrmCompletedRevenueStage(targetStage)) return null;
  const leavingPostWon = isDealOnCrmPostWonColumn(currentStage);
  const enteringPreWon = isCrmPreWonSalesStage(targetStage);
  if (!leavingPostWon || !enteringPreWon) return null;
  const code = item.code || item.title || 'Deal';
  return `Deal ${code} đã tạo dự án Sản xuất — không thể kéo ngược về giai đoạn bán hàng. Vẫn có thể kéo thẳng về cột Thắng.`;
}

/**
 * Kéo lại sang Thắng khi đã có dự án SX — không mở hộp chuyển, chỉ thông báo.
 * @returns {string|null}
 */
export function crmDealMoveToWonSxAlreadyCreatedMessage(item) {
  if (!item || item.type !== 'deal' || !dealHasSxProject(item)) return null;
  const code = item.code || item.title || 'Deal';
  const proj = item.linked_project?.code || item.project_code || '';
  const projHint = proj ? ` (${proj})` : '';
  return `Deal ${code} đã có dự án Sản xuất${projHint}. Không tạo lại — chỉ cập nhật cột Thắng trên CRM nếu cần.`;
}

/** Khóa kéo khi thẻ đang ở cột SX/VC trên CRM (không khóa chỉ vì có dự án). */
export function isDealCrmStageLocked(item) {
  if (!item || item.type !== 'deal') return false;
  const st = item.stage;
  if (st && isCrmPostWonManagedStage(st)) return true;
  return false;
}

/** CRM Kanban: cho phép kéo deal ở mọi cột (kể cả Sản xuất / Vận chuyển). */
export function isDealCrmKanbanDragLocked(_item, _pipelineType) {
  return false;
}

/**
 * @param {CrmLeadLike} item
 * @param {CrmStageLike} targetStage
 * @param {'lead'|'deal'} pipelineType
 */
export function canDropDealOnCrmKanbanStage(_item, _targetStage, pipelineType) {
  if (pipelineType !== 'deal') return true;
  // Mở khóa toàn bộ: CRM Kanban có thể thả deal vào bất kỳ cột nào (kể cả Sản xuất / Vận chuyển).
  return true;
}

/**
 * @returns {string|null} Thông báo nếu không được thả / đổi cột
 *   Hiện tại: không chặn bất kỳ chiều di chuyển nào trên CRM Kanban.
 *   Đồng bộ tiến độ SX/VC vẫn do module xưởng/VC quản — chuyển tay từ CRM chỉ đổi `stage_id` và badge.
 */
export function crmDealStageMoveBlockedMessage(_item, _targetStage, pipelineType) {
  if (pipelineType !== 'deal') return null;
  return null;
}
