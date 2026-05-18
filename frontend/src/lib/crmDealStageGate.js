/** @typedef {{ id?: string, name?: string, is_won?: boolean, is_lost?: boolean, sync_role?: string|null }} CrmStageLike */
/** @typedef {{ type?: string, project_id?: string|null, sx_handover_at?: string|null, stage_id?: string|null }} CrmLeadLike */

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

/** @param {CrmLeadLike|null|undefined} item */
export function isDealCrmStageLocked(item) {
  if (!item || item.type !== 'deal') return false;
  return !!(item.project_id || item.sx_handover_at);
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
  if (isDealCrmStageLocked(item)) return false;
  if (isCrmPostWonManagedStage(targetStage)) return false;
  if (targetStage?.is_won) return true;
  return true;
}

/**
 * @returns {string|null} Thông báo nếu không được thả / đổi cột
 */
export function crmDealStageMoveBlockedMessage(item, targetStage, pipelineType) {
  if (pipelineType !== 'deal') return null;
  if (isDealCrmStageLocked(item)) {
    return 'Deal đã có dự án — giai đoạn CRM cố định ở Thắng; badge SX/VC cập nhật từ module Sản xuất / Vận chuyển.';
  }
  if (isCrmPostWonManagedStage(targetStage)) {
    return 'Không kéo deal sang cột này trên CRM. Chỉ kéo tới cột Thắng; phần sau do module xưởng/VC quản lý.';
  }
  return null;
}
