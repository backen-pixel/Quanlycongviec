/** @typedef {{ id?: string, name?: string, is_won?: boolean, is_lost?: boolean, sync_role?: string|null }} CrmStageLike */
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

/** @param {CrmStageLike|null|undefined} stage */
export function isCrmPostWonManagedStage(stage) {
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

/** Khóa kéo khi thẻ đang ở cột SX/VC trên CRM (không khóa chỉ vì có dự án). */
export function isDealCrmStageLocked(item) {
  if (!item || item.type !== 'deal') return false;
  const st = item.stage;
  if (st && isCrmPostWonManagedStage(st)) return true;
  return false;
}

/** Không cho kéo thẻ deal trên Kanban CRM. */
export function isDealCrmKanbanDragLocked(item, pipelineType) {
  return pipelineType === 'deal' && isDealCrmStageLocked(item);
}

/**
 * @param {CrmLeadLike} item
 * @param {CrmStageLike} targetStage
 * @param {'lead'|'deal'} pipelineType
 */
export function canDropDealOnCrmKanbanStage(item, targetStage, pipelineType) {
  if (pipelineType !== 'deal') return true;
  if (targetStage?.is_lost) return true;
  if (isCrmPostWonManagedStage(targetStage)) return false;
  if (isDealCrmStageLocked(item) && isCrmPostWonManagedStage(targetStage)) return false;
  return true;
}

/**
 * @returns {string|null} Thông báo nếu không được thả / đổi cột
 */
export function crmDealStageMoveBlockedMessage(item, targetStage, pipelineType) {
  if (pipelineType !== 'deal') return null;
  if (isCrmPostWonManagedStage(targetStage)) {
    return 'Không kéo deal sang cột Sản xuất / Vận chuyển trên CRM. Cập nhật tiến độ ở module xưởng/VC; trên CRM chỉ đổi giai đoạn trước Thắng hoặc Thắng / Thua.';
  }
  if (isDealCrmStageLocked(item)) {
    return 'Deal đang ở cột do module Sản xuất/Vận chuyển quản lý — kéo về Thắng hoặc giai đoạn trước đó, hoặc đổi ở chi tiết deal.';
  }
  return null;
}
