import {
  groupStagesByPipeline,
  preWonStagesForDealStats,
  resolveDealWonAnchorStage,
  splitDealStagesForCrmTabs,
} from './crmPipelineTabs';
import { sortAndDedupePipelineStages } from './crmPipelineStages';

const ORPHAN_STAGE_KEY = '__none__';

const LOST_PIPELINE_STAGE_NAME_RE =
  /(hủy\s*deal|^\s*thua\s*\.?\s*$|chê\s*gi[aá]|khách\s*hủy|từ\s*chối|rớt|\blost\b|mất\s*deal)/i;

function stageOrderIndex(stage) {
  const ord = Number(stage?.order_index);
  return Number.isFinite(ord) ? ord : 999;
}

export function isLostOrCancelledPipelineStage(stage) {
  if (!stage) return false;
  if (stage.is_lost || stage.canonical_slug === 'lost' || stage.deal_report_bucket === 'lost') return true;
  const name = String(stage.name || '').trim();
  return LOST_PIPELINE_STAGE_NAME_RE.test(name);
}

function isWonOrClosedPipelineStage(stage) {
  if (!stage) return false;
  if (stage.is_won) return true;
  if (stage.counts_as_completed_revenue) return true;
  const slug = stage.canonical_slug || '';
  if (slug === 'won' || slug === 'completed') return true;
  if (stage.deal_report_bucket === 'completed') return true;
  return false;
}

function isOpenPipelineValueStage(stage) {
  if (!stage?.id) return false;
  if (isLostOrCancelledPipelineStage(stage)) return false;
  if (isWonOrClosedPipelineStage(stage)) return false;
  return true;
}

function hasExplicitExpectedRevenueStage(stages) {
  return (stages || []).some((s) => !!s?.counts_as_expected_revenue && isOpenPipelineValueStage(s));
}

/** Cột tính GT dự kiến / kỳ vọng — theo từng pipeline (một công ty). */
export function expectedRevenueStagesForPipelineValue(dealStages) {
  const openStages = (dealStages || []).filter(isOpenPipelineValueStage);
  if (hasExplicitExpectedRevenueStage(dealStages)) {
    return openStages.filter((s) => !!s.counts_as_expected_revenue);
  }
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(openStages);
  return preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder).filter(isOpenPipelineValueStage);
}

function sumStageMapForStages(stages, stageMap, includeOrphan) {
  let total = 0;
  for (const stage of stages) {
    total += Number(stageMap?.[stage.id] ?? 0) || 0;
  }
  if (includeOrphan) {
    total += Number(stageMap?.[ORPHAN_STAGE_KEY] ?? 0) || 0;
  }
  return Math.round(total);
}

export function sumCrmOpenPipelineValue(dealStages, stageValues) {
  const stages = expectedRevenueStagesForPipelineValue(dealStages);
  const includeOrphan = !hasExplicitExpectedRevenueStage(dealStages);
  return sumStageMapForStages(stages, stageValues, includeOrphan);
}

export function sumCrmOpenWeightedPipelineValue(dealStages, stageWeightedValues) {
  const stages = expectedRevenueStagesForPipelineValue(dealStages);
  const includeOrphan = !hasExplicitExpectedRevenueStage(dealStages);
  return sumStageMapForStages(stages, stageWeightedValues, includeOrphan);
}

function buildStageCountsQuery(type, opts = {}) {
  const params = { type };
  if (opts.companyId) params.company_id = opts.companyId;
  if (opts.regionId) params.region_id = opts.regionId;
  if (opts.dateFrom) params.date_from = opts.dateFrom;
  if (opts.dateTo) params.date_to = opts.dateTo;
  if (opts.phoneFilter) params.phone_filter = opts.phoneFilter;
  if (opts.assignedTo) params.assigned_to = opts.assignedTo;
  return params;
}

async function fetchCompanyDealPipelineKpi(api, companyId, opts = {}) {
  const stageParams = { type: 'deal', company_id: companyId };
  if (opts.regionId) stageParams.region_id = opts.regionId;

  const [stagesRes, countsRes] = await Promise.all([
    api.get('/crm/pipeline-stages', { params: stageParams }).catch(() => ({ data: [] })),
    api.get('/crm/stage-counts', { params: buildStageCountsQuery('deal', { ...opts, companyId }) }).catch(() => ({ data: {} })),
  ]);

  const dealStages = sortAndDedupePipelineStages(stagesRes.data || []);
  const values = countsRes.data?.values && typeof countsRes.data.values === 'object' ? countsRes.data.values : {};
  const weightedValues = countsRes.data?.weighted_values && typeof countsRes.data.weighted_values === 'object'
    ? countsRes.data.weighted_values
    : {};

  return {
    raw: sumCrmOpenPipelineValue(dealStages, values),
    weighted: sumCrmOpenWeightedPipelineValue(dealStages, weightedValues),
  };
}

/**
 * «Tất cả công ty»: cộng KPI từng công ty (khớp CRM Hub + app mobile).
 * Tránh gộp stage nhiều pipeline / chỉ lấy nhầm một công ty (vd. Phúc Đạt).
 */
export async function fetchAggregatedOpenPipelineKpi(api, {
  companies = [],
  dateFrom,
  dateTo,
  phoneFilter,
  assignedTo,
  regionId,
} = {}) {
  const list = (companies || []).filter((c) => c?.id);
  if (!list.length) {
    return { raw: 0, weighted: 0 };
  }

  let raw = 0;
  let weighted = 0;
  const opts = {
    dateFrom,
    dateTo,
    phoneFilter,
    assignedTo,
    regionId,
  };

  for (const company of list) {
    const part = await fetchCompanyDealPipelineKpi(api, String(company.id), opts);
    raw += part.raw;
    weighted += part.weighted;
  }

  return { raw, weighted };
}

/** Gom stage nhiều pipeline — dùng khi kiểm tra client-side. */
export { groupStagesByPipeline };
