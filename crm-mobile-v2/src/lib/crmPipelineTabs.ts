import type { CrmPipelineStage } from '../types';

function stageOrderIndex(stage: CrmPipelineStage): number {
  const ord = Number(stage.orderIndex);
  return Number.isFinite(ord) ? ord : 999;
}

/** Cột thua / hủy — khớp web CRM (is_lost, slug, tên cột). */
const LOST_PIPELINE_STAGE_NAME_RE =
  /(hủy\s*deal|^\s*thua\s*\.?\s*$|chê\s*gi[aá]|khách\s*hủy|từ\s*chối|rớt|\blost\b|mất\s*deal)/i;

export function isLostOrCancelledPipelineStage(stage: CrmPipelineStage | null | undefined): boolean {
  if (!stage) return false;
  if (stage.isLost) return true;
  if (stage.canonicalSlug === 'lost') return true;
  if (stage.dealReportBucket === 'lost') return true;
  const name = String(stage.name || '').trim();
  return LOST_PIPELINE_STAGE_NAME_RE.test(name);
}

/** Cột đã chốt / hoàn thành — không thuộc pipeline mở. */
export function isWonOrClosedPipelineStage(stage: CrmPipelineStage | null | undefined): boolean {
  if (!stage) return false;
  if (stage.isWon) return true;
  if (stage.countsAsCompletedRevenue) return true;
  const slug = stage.canonicalSlug || '';
  if (slug === 'won' || slug === 'completed') return true;
  if (stage.dealReportBucket === 'completed') return true;
  return false;
}

/** Cột được cộng vào GT pipeline mở (không Thua, Hủy, Thắng, sau Thắng). */
export function isOpenPipelineValueStage(stage: CrmPipelineStage | null | undefined): boolean {
  if (!stage?.id) return false;
  if (isLostOrCancelledPipelineStage(stage)) return false;
  if (isWonOrClosedPipelineStage(stage)) return false;
  return true;
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
  return (stages || []).some((s) => !!s.countsAsExpectedRevenue && isOpenPipelineValueStage(s));
}

/**
 * Cột tính GT pipeline mở — chỉ deal đang mở; loại Thua, Hủy, Chê giá, Khách hủy, Thắng.
 */
export function expectedRevenueStagesForPipelineValue(
  dealStages: CrmPipelineStage[],
): CrmPipelineStage[] {
  const all = dealStages || [];
  if (hasExplicitExpectedRevenueStage(all)) {
    return all.filter((s) => !!s.countsAsExpectedRevenue && isOpenPipelineValueStage(s));
  }
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(all);
  return preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder)
    .filter(isOpenPipelineValueStage);
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

/** GT pipeline mở — Σ estimated_value deal ở cột đang mở (khớp CRM Hub). */
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
