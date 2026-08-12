import type { CrmPipelineStage } from '../types';
import type { CrmSxProductionTarget } from '../api/crm';

export type StageMovePlan =
  | { action: 'convert_deal'; stage: CrmPipelineStage }
  | { action: 'need_deadline'; stage: CrmPipelineStage }
  | { action: 'need_sx_pick'; stage: CrmPipelineStage }
  | { action: 'block_need_won_sx'; stage: CrmPipelineStage; message: string }
  | {
      action: 'proceed';
      stage: CrmPipelineStage;
      kanbanDeadlineAt?: string;
      sxTargets?: CrmSxProductionTarget[];
    };

/** Neo cột thắng (is_won) — order_index lớn nhất. */
export function resolveWonAnchorOrder(stages?: CrmPipelineStage[] | null): number | null {
  if (!stages?.length) return null;
  let max: number | null = null;
  for (const s of stages) {
    if (!s.isWon) continue;
    const n = Number(s.orderIndex);
    if (!Number.isFinite(n)) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

/** Cột sau neo thắng cần đã có dự án SX (khớp web CRM_DEAL_REQUIRES_SX_PICK). */
export function isPostWonRequiresSxProject(
  stage: CrmPipelineStage,
  wonAnchorOrder: number | null,
): boolean {
  if (!stage || stage.isWon || stage.isLost) return false;
  if (stage.countsAsCompletedRevenue) return true;
  if (wonAnchorOrder == null) return false;
  const order = Number(stage.orderIndex);
  return Number.isFinite(order) && order > wonAnchorOrder;
}

/** Lập kế hoạch chuyển cột — khớp gate web/backend (requires_deadline, is_won, SX pick). */
export function planCrmStageMove(opts: {
  kind: 'lead' | 'deal';
  target: CrmPipelineStage;
  existingDeadlineIso?: string | null;
  projectId?: string | null;
  stages?: CrmPipelineStage[] | null;
  itemCode?: string | null;
}): StageMovePlan {
  const { kind, target, existingDeadlineIso, projectId, stages, itemCode } = opts;

  // Lead → cột thắng («Chuyển Deal»): không PATCH stage, phải convert-to-deal.
  if (kind === 'lead' && target.isWon) {
    return { action: 'convert_deal', stage: target };
  }

  // Deal → cột sau thắng khi chưa có project SX.
  if (kind === 'deal' && !projectId) {
    const wonOrder = resolveWonAnchorOrder(stages);
    if (isPostWonRequiresSxProject(target, wonOrder)) {
      const code = itemCode || 'Deal';
      return {
        action: 'block_need_won_sx',
        stage: target,
        message:
          `Deal ${code} chưa tạo dự án Sản xuất. Vui lòng chuyển sang cột «Đã ký hợp đồng» trước để chọn công ty / phân loại SX, rồi mới chuyển tiếp.`,
      };
    }
  }

  // Deal → cột thắng (đã ký HĐ): bắt buộc chọn công ty + phân loại SX nếu chưa có project.
  if (kind === 'deal' && target.isWon && !projectId) {
    return { action: 'need_sx_pick', stage: target };
  }

  const needsDeadline =
    !!target.requiresDeadline
    && !target.isWon
    && !target.isLost
    && !target.countsAsCompletedRevenue;

  if (needsDeadline) {
    const existing = (existingDeadlineIso || '').trim();
    if (existing) {
      return { action: 'proceed', stage: target, kanbanDeadlineAt: existing };
    }
    return { action: 'need_deadline', stage: target };
  }

  return { action: 'proceed', stage: target };
}

/** yyyy-mm-dd từ ISO hoặc giữ nguyên nếu đã là ngày. */
export function deadlineIsoToYmd(iso?: string | null): string | null {
  if (!iso) return null;
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
