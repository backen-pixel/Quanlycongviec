/**
 * Quy tắc kéo giai đoạn deal trên CRM.
 * Cột sau Thắng (Sản xuất / VC / Lắp đặt / CSKH) chỉ kéo tay khi badge xưởng/VC
 * đã ở giai đoạn tương ứng — còn lại do module SX/VC đồng bộ.
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

/** @returns {'sx_production'|'vc_delivery'|'vc_installation'|'vc_customer_care'|null} */
function classifyCrmPostWonManagedKind(stage) {
  if (!stage || stage.is_won || stage.is_lost) return null;
  const role = String(stage.sync_role || '').trim();
  if (role && POST_WON_SYNC_ROLES.has(role)) return role;
  const n = normalizeStageNameFold(stage.name);
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
  if (kind === 'vc_installation') {
    if (vcType === 'installation') return true;
    if (vcId && vcN.includes('lap dat')) return true;
    return false;
  }
  if (kind === 'vc_delivery') {
    if (vcType === 'delivery' || vcType === 'installation') return true;
    if (vcId && (vcN.includes('van chuyen') || vcN.includes('lap dat') || vcN.includes('giao hang'))) return true;
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
  if (!lead || lead.type !== 'deal' || !prevStage || !targetStage) {
    return { ok: true };
  }
  if (String(prevStage.id) === String(targetStage.id)) return { ok: true };
  // Luôn cho kéo về cột Thắng hoặc cột «doanh thu đã hoàn thành».
  if (targetStage.is_won || isCrmCompletedRevenueStage(targetStage)) return { ok: true };
  if (targetStage.is_lost) return { ok: true };

  if (lead.project_id) {
    const leavingPostWon = isDealOnCrmPostWonColumn(prevStage);
    const enteringPreWon = isCrmPreWonSalesStage(targetStage);
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

module.exports = {
  POST_WON_SYNC_ROLES,
  normalizeStageNameFold,
  isSanXuatProductionColumnName,
  classifyCrmPostWonManagedKind,
  isCrmPostWonManagedStage,
  isCrmCompletedRevenueStage,
  isDealOnCrmPostWonColumn,
  isDealCrmStageLocked,
  workshopReadyForCrmPostWonStage,
  assertDealCrmManualStageChange,
};
