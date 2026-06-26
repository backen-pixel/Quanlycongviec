import type { CrmPipelineStage } from '../types';

function stageOrderIndex(stage: CrmPipelineStage): number {
  const ord = Number(stage.orderIndex);
  return Number.isFinite(ord) ? ord : 999;
}

/** Cột Thắng duy nhất — khớp web `resolveDealWonAnchorStage`. */
export function resolveDealWonAnchorStage(stagesDeal: CrmPipelineStage[]): CrmPipelineStage | null {
  const won = [...stagesDeal]
    .sort((a, b) => stageOrderIndex(a) - stageOrderIndex(b))
    .filter((s) => !!s.isWon && !s.isLost);
  if (!won.length) return null;
  if (won.length === 1) return won[0];
  return won.reduce((best, s) => (stageOrderIndex(s) > stageOrderIndex(best) ? s : best));
}

/** Tách cột tab Deal / tab KH — khớp web `splitDealStagesForCrmTabs`. */
export function splitDealStagesForCrmTabs(stagesDeal: CrmPipelineStage[]) {
  const sorted = [...stagesDeal].sort((a, b) => stageOrderIndex(a) - stageOrderIndex(b));
  const wonStage = resolveDealWonAnchorStage(sorted);
  const wonAnchorOrder = wonStage ? stageOrderIndex(wonStage) : null;
  const wonStageId = wonStage ? String(wonStage.id) : null;

  if (wonAnchorOrder == null) {
    return { dealTabStages: sorted, postWonStages: [] as CrmPipelineStage[], wonStage, wonAnchorOrder };
  }

  const dealTabStages: CrmPipelineStage[] = [];
  const postWonStages: CrmPipelineStage[] = [];

  for (const s of sorted) {
    const sid = String(s.id);
    const order = stageOrderIndex(s);
    if (s.isLost) {
      dealTabStages.push(s);
      continue;
    }
    if (sid === wonStageId || order === wonAnchorOrder) {
      dealTabStages.push(s);
      continue;
    }
    if (order < wonAnchorOrder) {
      dealTabStages.push(s);
    } else {
      postWonStages.push(s);
    }
  }

  return { dealTabStages, postWonStages, wonStage, wonAnchorOrder };
}

/**
 * Cột dùng KPI tab Deal trên CRM web — trước Thắng + Thua; không gồm cột Thắng / sau Thắng.
 */
export function preWonStagesForDealStats(
  dealTabStages: CrmPipelineStage[],
  wonStage: CrmPipelineStage | null,
  wonAnchorOrder: number | null,
): CrmPipelineStage[] {
  const wonId = wonStage?.id ? String(wonStage.id) : null;
  return (dealTabStages || []).filter((s) => {
    if (s.isLost) return true;
    if (wonAnchorOrder == null) return !s.isWon;
    if (wonId && String(s.id) === wonId) return false;
    return stageOrderIndex(s) < wonAnchorOrder;
  });
}

const ORPHAN_STAGE_KEY = '__none__';

function hasExplicitExpectedRevenueStage(stages: CrmPipelineStage[]): boolean {
  return (stages || []).some((s) => !!s.countsAsExpectedRevenue);
}

/**
 * Cột tính GT pipeline mở — khớp web `dealCountsTowardExpectedValue`.
 * Có tick counts_as_expected_revenue → chỉ các cột đó; ngược lại → pre-won mở (không thua).
 */
export function expectedRevenueStagesForPipelineValue(
  dealStages: CrmPipelineStage[],
): CrmPipelineStage[] {
  if (hasExplicitExpectedRevenueStage(dealStages)) {
    return (dealStages || []).filter((s) => !!s.countsAsExpectedRevenue && !s.isLost);
  }
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(dealStages);
  return preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder).filter((s) => !s.isLost);
}

function sumStageMapForStages(
  stages: CrmPipelineStage[],
  stageMap: Record<string, number>,
  includeOrphan: boolean,
): number {
  let total = 0;
  for (const stage of stages) {
    total += Number(stageMap[stage.id] ?? 0) || 0;
  }
  if (includeOrphan) {
    total += Number(stageMap[ORPHAN_STAGE_KEY] ?? 0) || 0;
  }
  return Math.round(total);
}

/** GT pipeline mở — Σ estimated_value deal ở cột dự kiến (khớp CRM Hub). */
export function sumCrmOpenPipelineValue(
  dealStages: CrmPipelineStage[],
  stageValues: Record<string, number>,
): number {
  const stages = expectedRevenueStagesForPipelineValue(dealStages);
  const includeOrphan = !hasExplicitExpectedRevenueStage(dealStages);
  return sumStageMapForStages(stages, stageValues, includeOrphan);
}

/** GT kỳ vọng có trọng số — pipeline mở × xác suất deal. */
export function sumCrmOpenWeightedPipelineValue(
  dealStages: CrmPipelineStage[],
  stageWeightedValues: Record<string, number>,
): number {
  const stages = expectedRevenueStagesForPipelineValue(dealStages);
  const includeOrphan = !hasExplicitExpectedRevenueStage(dealStages);
  return sumStageMapForStages(stages, stageWeightedValues, includeOrphan);
}

/** Tổng Deal KPI — khớp CRM Dashboard tab Deal (pre-won + thua + chưa có GD). */
export function sumCrmDealStatsCount(
  dealStages: CrmPipelineStage[],
  dealCounts: Record<string, number>,
): number {
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(dealStages);
  const statsStages = preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder);
  let total = Number(dealCounts[ORPHAN_STAGE_KEY] ?? 0) || 0;
  for (const stage of statsStages) {
    total += Number(dealCounts[stage.id] ?? 0) || 0;
  }
  return total;
}

/** Funnel Deal — chỉ cột thống kê tab Deal (không gồm Thắng / sau Thắng). */
export function dealStatsStagesForFunnel(dealStages: CrmPipelineStage[]): CrmPipelineStage[] {
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(dealStages);
  return preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder);
}
