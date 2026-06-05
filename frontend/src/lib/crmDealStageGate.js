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
