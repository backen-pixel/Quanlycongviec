/**
 * Quy tắc kéo giai đoạn deal trên CRM.
 * Deal chưa có project_id không được nhảy sang cột sau Thắng (phải chọn SX ở Thắng).
 * Các ràng buộc theo liên kết Sản xuất / tiến độ xưởng-VC xem `CRM_PRODUCTION_LINK_STAGE_GATE`.
 */

const { isLostOrCancelledPipelineStage } = require('./crmLostPipelineStage');

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
 * Bật lại phải đổi ở CẢ hai file: file này và frontend/src/lib/crmDealStageGate.js.
 */
const CRM_PRODUCTION_LINK_STAGE_GATE = false;

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

/** @returns {'sx_production'|'vc_delivery'|'vc_installation'|'vc_customer_care'|null} */
function classifyCrmPostWonManagedKind(stage) {
  if (!stage || stage.is_won || stage.is_lost) return null;
  const role = String(stage.sync_role || '').trim();
  if (role && POST_WON_SYNC_ROLES.has(role)) return role;
  const n = normalizeStageNameFold(stage.name);
  if (n.includes('da san xuat') || n.includes('san xuat xong') || n.includes('da dong goi')) return 'sx_completed';
  if (isSanXuatProductionColumnName(n)) return 'sx_production';
  if (n.includes('van chuyen') && n.includes('lap dat')) return 'vc_delivery';
  if (n.includes('lap dat')) return 'vc_installation';
  if (n.includes('van chuyen')) return 'vc_delivery';
  if (n.includes('cham soc') && n.includes('khach')) return 'vc_customer_care';
  if (n.includes('bao hanh') || n.includes('hoa don')) return 'vc_customer_care';
  return null;
}

/** Cột CRM sau Thắng (Sản xuất, VC…) do module xưởng/VC quản. */
function isCrmPostWonManagedStage(stage) {
  return !!classifyCrmPostWonManagedKind(stage);
}

function badgeNameFold(badge) {
  const b = Array.isArray(badge) ? badge[0] : badge;
  return normalizeStageNameFold(b?.name);
}

function badgeSyncType(badge) {
  const b = Array.isArray(badge) ? badge[0] : badge;
  return String(b?.crm_sync_type || '').trim().toLowerCase();
}

function badgeIsPackagingDone(badge) {
  const b = Array.isArray(badge) ? badge[0] : badge;
  return !!b?.is_packaging_done;
}

function currentStageSyncRole(lead) {
  const st = lead?.stage;
  return String(st?.sync_role || '').trim();
}

function workshopReadyForCrmPostWonStage(lead, targetStage) {
  const kind = classifyCrmPostWonManagedKind(targetStage);
  if (!kind) return true;
  const sx = lead?.sx_pipeline_stage;
  const vc = lead?.vc_pipeline_stage;
  const sxN = badgeNameFold(sx);
  const vcN = badgeNameFold(vc);
  const sxType = badgeSyncType(sx);
  const vcType = badgeSyncType(vc);
  const sxId = (Array.isArray(sx) ? sx[0] : sx)?.id;
  const vcId = (Array.isArray(vc) ? vc[0] : vc)?.id;

  if (kind === 'sx_production') {
    if (sxType === 'production') return true;
    if (sxId && isSanXuatProductionColumnName(sxN)) return true;
    return false;
  }
  if (kind === 'sx_completed') {
    if (badgeIsPackagingDone(sx)) return true;
    if (sxId && (sxN.includes('dong goi') || sxN.includes('hoan thien dong goi'))) return true;
    return false;
  }
  if (kind === 'vc_installation') {
    if (vcType === 'installation') return true;
    if (vcId && vcN.includes('lap dat')) return true;
    return false;
  }
  if (kind === 'vc_delivery') {
    if (vcType === 'delivery' || vcType === 'installation') return true;
    if (vcId && (vcN.includes('van chuyen') || vcN.includes('lap dat') || vcN.includes('giao hang'))) return true;
    // Cho phép sale kéo tay từ «Đã sản xuất» sang «Vận chuyển» để mở modal đặt VC.
    if (currentStageSyncRole(lead) === 'sx_completed') return true;
    if (badgeIsPackagingDone(sx)) return true;
    return false;
  }
  if (kind === 'vc_customer_care') {
    if (vcType === 'customer_care') return true;
    if (vcId && (vcN.includes('cham soc') || vcN.includes('bao hanh') || vcN.includes('cskh'))) return true;
    return false;
  }
  return true;
}

function postWonManualBlockMessage(kind) {
  if (kind === 'vc_installation') {
    return 'Cột Lắp đặt chỉ kéo được sau khi bên Vận chuyển/xưởng đã chuyển dự án sang «Đang lắp đặt». Hiện VC chưa ở giai đoạn lắp đặt — hãy kéo trên module VC trước.';
  }
  if (kind === 'vc_delivery') {
    return 'Cột Vận chuyển chỉ kéo được sau khi bên VC đã chuyển dự án sang «Đang vận chuyển» (hoặc lắp đặt). Hiện VC chưa sẵn sàng — hãy kéo trên module VC trước.';
  }
  if (kind === 'sx_production') {
    return 'Cột Sản xuất chỉ kéo được sau khi xưởng đã đưa dự án vào cột Sản xuất (đồng bộ CRM). Hiện xưởng chưa ở giai đoạn đó — hãy kéo trên module SX trước.';
  }
  if (kind === 'sx_completed') {
    return 'Cột «Đã sản xuất» chỉ kéo được sau khi xưởng đã đưa dự án vào cột đóng gói (is_packaging_done). Hãy đợi xưởng đóng gói xong.';
  }
  if (kind === 'vc_customer_care') {
    return 'Cột Chăm sóc KH chỉ kéo được sau khi bên VC đã chuyển sang Bảo hành / CSKH. Hiện VC chưa sẵn sàng — hãy kéo trên module VC trước.';
  }
  return 'Không thể chuyển tay sang giai đoạn này trên CRM — tiến độ do xưởng/VC đồng bộ.';
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

/**
 * Cột sau Thắng cần đã chọn công ty SX (có project_id).
 * - SX/VC sync_role + Hoàn thành DT
 * - Cột có order_index > neo Thắng (max is_won) — NextGo: Thiết kế chi tiết, Giao hàng…
 * KHÔNG dùng heuristic tên «thiết kế»/«giao hàng»: cột bán hàng như «Đã cọc thiết kế» (Phúc Đạt)
 * sẽ bị chặn nhầm dù còn trước neo Thắng.
 *
 * @param {object} stage
 * @param {number|null|undefined} wonAnchorOrder order_index cột Thắng (max is_won) cùng pipeline
 */
function isCrmPostWonRequiresSxProject(stage, wonAnchorOrder = null) {
  if (!stage || stage.is_won || stage.is_lost) return false;
  if (isLostOrCancelledPipelineStage(stage)) return false;
  if (isCrmCompletedRevenueStage(stage)) return true;
  if (isCrmPostWonManagedStage(stage)) return true;
  if (wonAnchorOrder != null && wonAnchorOrder !== '') {
    const order = Number(stage.order_index);
    const anchor = Number(wonAnchorOrder);
    if (Number.isFinite(order) && Number.isFinite(anchor) && order > anchor) return true;
  }
  return false;
}

function isDealOnCrmPostWonColumn(stage, wonAnchorOrder = null) {
  if (!stage) return false;
  if (stage.is_won) return true;
  return isCrmPostWonRequiresSxProject(stage, wonAnchorOrder);
}

function isCrmPreWonSalesStage(stage, wonAnchorOrder = null) {
  if (!stage) return false;
  if (stage.is_lost || stage.is_won || isLostOrCancelledPipelineStage(stage)) return false;
  if (isCrmPostWonRequiresSxProject(stage, wonAnchorOrder)) return false;
  return true;
}

/**
 * @param {object} lead
 * @param {object} targetStage
 * @param {object|null} prevStage
 * @param {{ wonAnchorOrder?: number|null }} [opts]
 * @returns {{ ok: true } | { ok: false, error: string, code: string, requires_production_company?: boolean }}
 */
function assertDealCrmManualStageChange(lead, targetStage, prevStage, opts = {}) {
  if (!lead || lead.type !== 'deal' || !targetStage) {
    return { ok: true };
  }
  if (prevStage && String(prevStage.id) === String(targetStage.id)) return { ok: true };
  if (targetStage.is_lost || isLostOrCancelledPipelineStage(targetStage)) return { ok: true };

  const wonAnchorOrder = opts.wonAnchorOrder != null ? opts.wonAnchorOrder : null;

  // Chưa có dự án SX → bắt buộc qua cột Thắng (chọn công ty SX) trước khi sang cột sau neo Thắng.
  if (!lead.project_id && !targetStage.is_won && isCrmPostWonRequiresSxProject(targetStage, wonAnchorOrder)) {
    return {
      ok: false,
      error: 'Cần chuyển deal sang cột Thắng và chọn công ty sản xuất trước khi sang giai đoạn sau Thắng.',
      code: 'CRM_DEAL_REQUIRES_SX_PICK',
      requires_production_company: true,
    };
  }

  // Luôn cho kéo về cột Thắng hoặc cột «doanh thu đã hoàn thành» (khi đã có project).
  if (targetStage.is_won || isCrmCompletedRevenueStage(targetStage)) return { ok: true };

  if (!prevStage) return { ok: true };

  if (!CRM_PRODUCTION_LINK_STAGE_GATE) return { ok: true };

  if (lead.project_id) {
    const leavingPostWon = isDealOnCrmPostWonColumn(prevStage, wonAnchorOrder);
    const enteringPreWon = isCrmPreWonSalesStage(targetStage, wonAnchorOrder);
    if (leavingPostWon && enteringPreWon) {
      return {
        ok: false,
        error: 'Deal đã tạo dự án Sản xuất — không thể kéo ngược về giai đoạn bán hàng. Vẫn có thể kéo thẳng về cột Thắng.',
        code: 'CRM_DEAL_SX_PROJECT_EXISTS',
      };
    }
  }

  const kind = classifyCrmPostWonManagedKind(targetStage);
  if (kind && !workshopReadyForCrmPostWonStage(lead, targetStage)) {
    return {
      ok: false,
      error: postWonManualBlockMessage(kind),
      code: 'CRM_DEAL_WORKSHOP_STAGE_REQUIRED',
    };
  }
  return { ok: true };
}

/**
 * order_index neo Thắng (max is_won) cùng pipeline — khớp FE resolveDealWonAnchorStage.
 * @param {string|null|undefined} pipelineId
 * @returns {Promise<number|null>}
 */
async function loadWonAnchorOrderForPipeline(pipelineId) {
  if (!pipelineId) return null;
  try {
    const { supabase } = require('../config/supabase');
    const { data } = await supabase
      .from('crm_pipeline_stages')
      .select('order_index')
      .eq('pipeline_id', pipelineId)
      .eq('is_won', true)
      .eq('is_active', true)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    const n = Number(data?.order_index);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    console.warn('[crmDealStageGate] loadWonAnchorOrder:', e.message);
    return null;
  }
}

module.exports = {
  CRM_PRODUCTION_LINK_STAGE_GATE,
  POST_WON_SYNC_ROLES,
  normalizeStageNameFold,
  isSanXuatProductionColumnName,
  classifyCrmPostWonManagedKind,
  isCrmPostWonManagedStage,
  isCrmPostWonRequiresSxProject,
  isCrmCompletedRevenueStage,
  isDealOnCrmPostWonColumn,
  isDealCrmStageLocked,
  workshopReadyForCrmPostWonStage,
  assertDealCrmManualStageChange,
  loadWonAnchorOrderForPipeline,
};
