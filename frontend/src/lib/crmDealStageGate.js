import { isLostOrCancelledPipelineStage } from './crmLostPipelineStage';

/** @typedef {{ id?: string, name?: string, order_index?: number, is_won?: boolean, is_lost?: boolean, sync_role?: string|null, counts_as_completed_revenue?: boolean }} CrmStageLike */
/** @typedef {{ type?: string, project_id?: string|null, sx_handover_at?: string|null, stage_id?: string|null, stage?: CrmStageLike|null }} CrmLeadLike */

const POST_WON_SYNC_ROLES = new Set([
  'sx_production',
  'sx_completed',
  'vc_delivery',
  'vc_installation',
  'vc_customer_care',
]);

/**
 * Chặn kéo thẻ CRM theo liên kết dự án Sản xuất / tiến độ xưởng-VC.
 *
 * Đang TẮT theo yêu cầu nghiệp vụ: sale được kéo deal tự do giữa các cột CRM, kể cả khi deal
 * đã có dự án Sản xuất và kể cả khi xưởng/VC chưa tới giai đoạn tương ứng.
 * Bật lại phải đổi ở CẢ hai file: file này và backend/src/helpers/crmDealStageGate.js.
 *
 * Vẫn giữ chặn khi deal CHƯA có dự án SX mà nhảy sang cột sau Thắng — cột đó cần project_id,
 * thiếu thì board Sản xuất không nhận được thẻ.
 */
export const CRM_PRODUCTION_LINK_STAGE_GATE = false;

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
  if (isLostOrCancelledPipelineStage(stage)) return false;
  const role = String(stage.sync_role || '').trim();
  if (role && POST_WON_SYNC_ROLES.has(role)) return true;
  const n = normalizeStageNameFold(stage.name);
  if (n.includes('da san xuat') || n.includes('san xuat xong') || n.includes('da dong goi')) return true;
  if (isSanXuatProductionColumnName(n)) return true;
  if (n.includes('van chuyen')) return true;
  if (n.includes('lap dat')) return true;
  if (n.includes('cham soc') && n.includes('khach')) return true;
  // NextGo / bao bì: cột sau Thắng (Thiết kế chi tiết, Giao hàng…)
  if (n.includes('thiet ke')) return true;
  if (n.includes('giao hang')) return true;
  return false;
}

/** Cột sau neo Thắng theo order_index (không gồm chính cột Thắng / Thua-Hủy). */
export function isStageAfterWonAnchor(stage, wonAnchorOrder) {
  if (!stage || wonAnchorOrder == null || wonAnchorOrder === '') return false;
  if (stage.is_won || stage.is_lost || isLostOrCancelledPipelineStage(stage)) return false;
  const order = Number(stage.order_index);
  const anchor = Number(wonAnchorOrder);
  if (!Number.isFinite(order) || !Number.isFinite(anchor)) return false;
  return order > anchor;
}

/**
 * Trước đây chặn kéo sang cột sau Thắng khi chưa có project_id.
 * Đã tắt theo yêu cầu nghiệp vụ — luôn cho kéo; chọn SX chỉ khi vào cột Thắng (popup).
 * @returns {null}
 */
export function crmDealMustPickSxBeforePostWonMessage(_item, _targetStage, _opts = {}) {
  return null;
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
  if (!CRM_PRODUCTION_LINK_STAGE_GATE) return null;
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
 * Phân loại cột CRM do xưởng/VC quản (sau Thắng).
 * @returns {'sx_production'|'vc_delivery'|'vc_installation'|'vc_customer_care'|null}
 */
export function classifyCrmPostWonManagedKind(stage) {
  if (!stage || stage.is_won || stage.is_lost) return null;
  const role = String(stage.sync_role || '').trim();
  if (role && POST_WON_SYNC_ROLES.has(role)) return role;
  const n = normalizeStageNameFold(stage.name);
  if (n.includes('da san xuat') || n.includes('san xuat xong') || n.includes('da dong goi')) return 'sx_completed';
  if (isSanXuatProductionColumnName(n)) return 'sx_production';
  // «Vận chuyển/lắp đặt» (Phúc Đạt) → delivery trước khi tách lắp đặt
  if (n.includes('van chuyen') && n.includes('lap dat')) return 'vc_delivery';
  if (n.includes('lap dat')) return 'vc_installation';
  if (n.includes('van chuyen')) return 'vc_delivery';
  if (n.includes('cham soc') && n.includes('khach')) return 'vc_customer_care';
  if (n.includes('bao hanh') || n.includes('hoa don')) return 'vc_customer_care';
  return null;
}

function badgeNameFold(badge) {
  return normalizeStageNameFold(badge?.name);
}

function badgeSyncType(badge) {
  return String(badge?.crm_sync_type || '').trim().toLowerCase();
}

function badgeIsPackagingDone(badge) {
  return !!badge?.is_packaging_done;
}

/** Xưởng/VC đã ở giai đoạn tương ứng cột CRM đích chưa? */
export function workshopReadyForCrmPostWonStage(item, targetStage) {
  const kind = classifyCrmPostWonManagedKind(targetStage);
  if (!kind) return true;
  const sx = item?.sx_pipeline_stage;
  const vc = item?.vc_pipeline_stage;
  const sxN = badgeNameFold(sx);
  const vcN = badgeNameFold(vc);
  const sxType = badgeSyncType(sx);
  const vcType = badgeSyncType(vc);
  const currentRole = String(item?.stage?.sync_role || '').trim();

  if (kind === 'sx_production') {
    if (sxType === 'production') return true;
    if (sx?.id && isSanXuatProductionColumnName(sxN)) return true;
    return false;
  }
  if (kind === 'sx_completed') {
    if (badgeIsPackagingDone(sx)) return true;
    if (sx?.id && (sxN.includes('dong goi') || sxN.includes('hoan thien dong goi'))) return true;
    return false;
  }
  if (kind === 'vc_installation') {
    if (vcType === 'installation') return true;
    if (vc?.id && vcN.includes('lap dat')) return true;
    return false;
  }
  if (kind === 'vc_delivery') {
    if (vcType === 'delivery' || vcType === 'installation') return true;
    if (vc?.id && (vcN.includes('van chuyen') || vcN.includes('lap dat') || vcN.includes('giao hang'))) return true;
    // Cho phép sale kéo tay từ «Đã sản xuất» → «Vận chuyển» để mở modal booking.
    if (currentRole === 'sx_completed') return true;
    if (badgeIsPackagingDone(sx)) return true;
    return false;
  }
  if (kind === 'vc_customer_care') {
    if (vcType === 'customer_care') return true;
    if (vc?.id && (vcN.includes('cham soc') || vcN.includes('bao hanh') || vcN.includes('cskh'))) return true;
    return false;
  }
  return true;
}

function postWonManualBlockMessage(kind, item) {
  const code = item?.code || item?.title || 'Deal';
  if (kind === 'vc_installation') {
    return `Deal ${code}: cột Lắp đặt chỉ kéo được sau khi bên Vận chuyển/xưởng đã chuyển dự án sang «Đang lắp đặt». Hiện VC chưa ở giai đoạn lắp đặt — hãy kéo trên module VC trước.`;
  }
  if (kind === 'vc_delivery') {
    return `Deal ${code}: cột Vận chuyển chỉ kéo được sau khi bên VC đã chuyển dự án sang «Đang vận chuyển» (hoặc lắp đặt). Hiện VC chưa sẵn sàng — hãy kéo trên module VC trước.`;
  }
  if (kind === 'sx_production') {
    return `Deal ${code}: cột Sản xuất chỉ kéo được sau khi xưởng đã đưa dự án vào cột Sản xuất (đồng bộ CRM). Hiện xưởng chưa ở giai đoạn đó — hãy kéo trên module SX trước.`;
  }
  if (kind === 'sx_completed') {
    return `Deal ${code}: cột «Đã sản xuất» sẽ tự bật khi xưởng đưa dự án vào cột đóng gói. Vui lòng đợi xưởng hoàn tất đóng gói.`;
  }
  if (kind === 'vc_customer_care') {
    return `Deal ${code}: cột Chăm sóc KH chỉ kéo được sau khi bên VC đã chuyển sang Bảo hành / CSKH. Hiện VC chưa sẵn sàng — hãy kéo trên module VC trước.`;
  }
  return `Deal ${code}: không thể chuyển tay sang giai đoạn này trên CRM — tiến độ do xưởng/VC đồng bộ.`;
}

/**
 * @param {CrmLeadLike} item
 * @param {CrmStageLike} targetStage
 * @param {'lead'|'deal'} pipelineType
 */
export function canDropDealOnCrmKanbanStage(item, targetStage, pipelineType, opts = {}) {
  if (pipelineType !== 'deal' && pipelineType !== 'customer') return true;
  return !crmDealStageMoveBlockedMessage(item, targetStage, pipelineType, opts);
}

/**
 * Chặn kéo tay trên CRM theo tiến độ xưởng/VC khi `CRM_PRODUCTION_LINK_STAGE_GATE` bật.
 * Không còn chặn «phải qua Thắng chọn SX» trước cột sau Thắng.
 * @returns {string|null}
 */
export function crmDealStageMoveBlockedMessage(item, targetStage, pipelineType, opts = {}) {
  if (pipelineType !== 'deal' && pipelineType !== 'customer') return null;
  if (!item || item.type === 'lead') return null;
  if (!targetStage) return null;
  if (String(item.stage_id || '') === String(targetStage.id || '')) return null;
  // Không chặn Thắng / Thua / cột doanh thu hoàn thành (đã có project).
  if (targetStage.is_won || targetStage.is_lost || isCrmCompletedRevenueStage(targetStage)) return null;
  if (isLostOrCancelledPipelineStage(targetStage)) return null;
  if (!CRM_PRODUCTION_LINK_STAGE_GATE) return null;
  const kind = classifyCrmPostWonManagedKind(targetStage);
  if (!kind) return null;
  if (workshopReadyForCrmPostWonStage(item, targetStage)) return null;
  return postWonManualBlockMessage(kind, item);
}
