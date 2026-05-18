/**
 * Quy tắc kéo giai đoạn deal trên CRM: chỉ tới cột Thắng (is_won).
 * Sau khi có dự án / bàn giao SX — giai đoạn & badge SX/VC do module xưởng/VC đồng bộ.
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

/** Deal đã có dự án / đã bàn giao — khóa đổi stage trên CRM (trừ Thua + endpoint reopen). */
function isDealCrmStageLocked(lead) {
  if (!lead || lead.type !== 'deal') return false;
  return !!(lead.project_id || lead.sx_handover_at);
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, code: string }}
 */
function assertDealCrmManualStageChange(lead, targetStage) {
  if (!lead || lead.type !== 'deal') return { ok: true };

  if (targetStage?.is_lost) return { ok: true };

  if (isCrmPostWonManagedStage(targetStage)) {
    return {
      ok: false,
      code: 'crm_stage_locked_post_won',
      error:
        'Giai đoạn sau Thắng (Sản xuất, Vận chuyển…) do module xưởng/VC quản lý. Trên CRM chỉ kéo deal tới cột Thắng.',
    };
  }

  if (isDealCrmStageLocked(lead)) {
    if (targetStage?.is_won && String(lead.stage_id || '') === String(targetStage.id || '')) {
      return { ok: true };
    }
    return {
      ok: false,
      code: 'crm_stage_locked_has_project',
      error:
        'Deal đã có dự án — không đổi giai đoạn trên CRM. Cập nhật tiến độ qua Kanban Sản xuất / Vận chuyển.',
    };
  }

  if (!targetStage?.is_won && !targetStage?.is_lost) {
    return { ok: true };
  }

  if (targetStage?.is_won) return { ok: true };

  return { ok: true };
}

module.exports = {
  POST_WON_SYNC_ROLES,
  normalizeStageNameFold,
  isCrmPostWonManagedStage,
  isDealCrmStageLocked,
  assertDealCrmManualStageChange,
};
