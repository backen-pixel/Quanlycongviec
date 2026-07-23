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

/**
 * Gom stage theo pipeline — khớp web `groupStagesByPipeline`.
 * KPI «Tất cả công ty» phải tính riêng từng pipeline (mỗi công ty có order_index/cột Thắng độc lập).
 */
export function groupStagesByPipeline(stages: CrmPipelineStage[]): Map<string, CrmPipelineStage[]> {
  const map = new Map<string, CrmPipelineStage[]>();
  for (const s of stages || []) {
    const pid = String(s?.pipelineId || '__none__');
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(s);
  }
  return map;
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
    return {
      dealTabStages: sorted,
      customerTabStages: [] as CrmPipelineStage[],
      postWonStages: [] as CrmPipelineStage[],
      wonStage,
      wonAnchorOrder,
    };
  }

  const dealTabStages: CrmPipelineStage[] = [];
  const customerTabStages: CrmPipelineStage[] = [];
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
      customerTabStages.push(s);
      continue;
    }
    if (order < wonAnchorOrder) {
      dealTabStages.push(s);
    } else {
      postWonStages.push(s);
      customerTabStages.push(s);
    }
  }

  return { dealTabStages, customerTabStages, postWonStages, wonStage, wonAnchorOrder };
}

/**
 * Cột dùng KPI tab Deal trên CRM Hub — trước Thắng; không gồm Thua / Hủy / Thắng / sau Thắng.
 */
export function preWonStagesForDealStats(
  dealTabStages: CrmPipelineStage[],
  wonStage: CrmPipelineStage | null,
  wonAnchorOrder: number | null,
): CrmPipelineStage[] {
  const wonId = wonStage?.id ? String(wonStage.id) : null;
  return (dealTabStages || []).filter((s) => {
    if (isLostOrCancelledPipelineStage(s)) return false;
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

/** Tổng Deal KPI — cột pre-won + chưa có GD (không gồm Thua / Hủy). */
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

/**
 * Tổng Deal KPI tab Deal trên CRM Hub.
 * Gồm deal pre-Thắng + stage lạ (stage_id không thuộc pipeline công ty, vd. import FB).
 * Không gồm cột Thua / Hủy / Thắng / sau Thắng — tính riêng theo TỪNG pipeline (khi "Tất cả công ty"
 * gộp nhiều công ty, mỗi pipeline có order_index/cột Thắng độc lập).
 */
export function sumCrmDealHubKpiCount(
  dealStages: CrmPipelineStage[],
  dealCounts: Record<string, number>,
): number {
  const stages = dealStages || [];
  const counts = dealCounts || {};
  const stageById = new Map(stages.map((s) => [String(s.id), s]));
  const anchorOrderByPipeline = new Map<string, number | null>();
  for (const [pid, pipeStages] of groupStagesByPipeline(stages)) {
    const anchor = resolveDealWonAnchorStage(pipeStages);
    anchorOrderByPipeline.set(pid, anchor ? stageOrderIndex(anchor) : null);
  }

  let total = Number(counts[ORPHAN_STAGE_KEY] ?? 0) || 0;
  for (const [sid, raw] of Object.entries(counts)) {
    if (sid === ORPHAN_STAGE_KEY) continue;
    const cnt = Number(raw) || 0;
    if (cnt <= 0) continue;
    const stage = stageById.get(sid);
    if (!stage) {
      // Stage lạ — không thuộc pipeline đang xem (vd. import FB) — luôn tính vào tab Deal.
      total += cnt;
      continue;
    }
    // Tab Deal không tính cột Thua / Hủy.
    if (isLostOrCancelledPipelineStage(stage)) continue;
    const pid = String(stage.pipelineId || '__none__');
    const anchorOrder = anchorOrderByPipeline.get(pid) ?? null;
    if (anchorOrder == null) {
      if (!stage.isWon) total += cnt;
      continue;
    }
    if (stageOrderIndex(stage) < anchorOrder) total += cnt;
  }
  return total;
}

/** Tổng tab KH — deal ở cột Thắng + sau Thắng (khớp CRM Hub tab Khách hàng / Đơn hàng). */
export function sumCrmCustomerTabDealCount(
  dealStages: CrmPipelineStage[],
  dealCounts: Record<string, number>,
): number {
  const { customerTabStages } = splitDealStagesForCrmTabs(dealStages);
  let total = 0;
  for (const stage of customerTabStages) {
    total += Number(dealCounts[stage.id] ?? 0) || 0;
  }
  return total;
}

/**
 * Tổng Deal khi Gộp — mọi cột trừ Thua/Hủy (khớp web `sumCrmDealTabCountsFromStageCounts.merged`).
 */
export function sumCrmDealMergedHubCount(
  dealStages: CrmPipelineStage[],
  dealCounts: Record<string, number>,
): number {
  const stages = dealStages || [];
  const counts = dealCounts || {};
  let total = Number(counts[ORPHAN_STAGE_KEY] ?? 0) || 0;
  for (const s of stages) {
    if (!s?.id) continue;
    if (isLostOrCancelledPipelineStage(s)) continue;
    total += Number(counts[s.id] ?? 0) || 0;
  }
  return total;
}

/** Có cột sau Thắng → đủ điều kiện hiện tab Đơn hàng khi Tách. */
export function hasCrmCustomerOrderTab(dealStages: CrmPipelineStage[]): boolean {
  return splitDealStagesForCrmTabs(dealStages).postWonStages.length > 0;
}

/**
 * Cột Kanban theo tab Hub — khớp web `resolveCrmPipelineStagesForTab`.
 * leads | deals (gộp/tách) | orders (ĐH = Thắng + sau Thắng).
 */
export function resolveCrmHubDisplayStages(
  tab: 'leads' | 'deals' | 'orders',
  stagesLead: CrmPipelineStage[],
  stagesDeal: CrmPipelineStage[],
  dealKhSplitEnabled: boolean,
): CrmPipelineStage[] {
  if (tab === 'leads') return stagesLead || [];
  const { dealTabStages, customerTabStages } = splitDealStagesForCrmTabs(stagesDeal || []);
  if (tab === 'orders') return customerTabStages;
  if (!dealKhSplitEnabled) return stagesDeal || [];
  return dealTabStages;
}

/** Tỷ lệ chốt — chốt tab KH / tổng deal kỳ (%, làm tròn nguyên như BC web). */
export function crmCustomerTabConversionRate(closedCount: number, dealCount: number): number {
  if (!dealCount) return 0;
  return Math.round((closedCount / dealCount) * 100);
}

/** Funnel Deal — chỉ cột thống kê tab Deal (không gồm Thắng / sau Thắng). */
export function dealStatsStagesForFunnel(dealStages: CrmPipelineStage[]): CrmPipelineStage[] {
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(dealStages);
  return preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder);
}
