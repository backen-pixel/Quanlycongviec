import type { CrmPipelineStage } from '../types';

export type StageMovePlan =
  | { action: 'convert_deal'; stage: CrmPipelineStage }
  | { action: 'need_deadline'; stage: CrmPipelineStage }
  | { action: 'proceed'; stage: CrmPipelineStage; kanbanDeadlineAt?: string };

/** Lập kế hoạch chuyển cột — khớp gate web/backend (requires_deadline, is_won). */
export function planCrmStageMove(opts: {
  kind: 'lead' | 'deal';
  target: CrmPipelineStage;
  existingDeadlineIso?: string | null;
}): StageMovePlan {
  const { kind, target, existingDeadlineIso } = opts;

  // Lead → cột thắng («Chuyển Deal»): không PATCH stage, phải convert-to-deal.
  if (kind === 'lead' && target.isWon) {
    return { action: 'convert_deal', stage: target };
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
