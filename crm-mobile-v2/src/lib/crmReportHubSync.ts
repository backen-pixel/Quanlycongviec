import {
  fetchCrmCompanies,
  fetchCrmStageCountsBatch,
  fetchPipelineStages,
  type CrmStageFetchOpts,
} from '../api/crm';
import type { CrmPipelineStage } from '../types';
import type {
  EmployeeReportQuery,
  OrgOverviewReport,
  ReportPipelineFunnelRow,
} from '../api/employeeReport';
import {
  dealStatsStagesForFunnel,
  sumCrmCustomerTabDealCount,
  sumCrmDealHubKpiCount,
  sumCrmOpenPipelineValue,
  sumCrmOpenWeightedPipelineValue,
} from './crmPipelineTabs';

export type CrmReportHubSnapshot = {
  /** Lead tạo trong kỳ — mọi lead (không lọc SĐT), khớp CRM Hub «Tổng Lead». */
  leadTotal: number;
  /** Tab Deal — pre-won + thua + stage lạ (có SĐT), khớp CRM Hub «Tổng deal». */
  dealTotal: number;
  /** Tab KH — Thắng + sau Thắng. */
  customerTabDealCount: number;
  /** Tổng deal kỳ (stage-counts total, có SĐT + ngày tạo). */
  dealPeriodTotal: number;
  dealCounts: Record<string, number>;
  dealValues: Record<string, number>;
  dealWeightedValues: Record<string, number>;
  openPipelineValue: number;
  openWeightedPipelineValue: number;
  dealStages: CrmPipelineStage[];
};

/** Lead KPI Hub — tạo trong kỳ, không lọc SĐT (khớp pipelinePhoneTotals.lead.all). */
export function buildReportLeadFetchOpts(query: EmployeeReportQuery): CrmStageFetchOpts {
  return {
    companyId: query.company_id || undefined,
    regionId: query.region_id || undefined,
    dateFrom: query.date_from || undefined,
    dateTo: query.date_to || undefined,
    lite: true,
  };
}

/** Deal KPI Hub — có SĐT + ngày tạo (khớp dealStatsDeals trên web). */
export function buildReportStageFetchOpts(query: EmployeeReportQuery): CrmStageFetchOpts {
  return {
    ...buildReportLeadFetchOpts(query),
    phoneFilter: 'has_phone',
  };
}

/** Pipeline mở theo kỳ báo cáo — khớp CRM Hub (có SĐT + ngày tạo deal). */
export function buildReportOpenPipelineFetchOpts(query: EmployeeReportQuery): CrmStageFetchOpts {
  return {
    companyId: query.company_id || undefined,
    regionId: query.region_id || undefined,
    dateFrom: query.date_from || undefined,
    dateTo: query.date_to || undefined,
    phoneFilter: 'has_phone',
    lite: true,
  };
}

function buildDealFunnelFromSnapshot(snap: CrmReportHubSnapshot): ReportPipelineFunnelRow[] {
  const rows: ReportPipelineFunnelRow[] = [];
  for (const stage of dealStatsStagesForFunnel(snap.dealStages)) {
    const count = snap.dealCounts[stage.id] ?? 0;
    const value = snap.dealValues[stage.id] ?? 0;
    if (count <= 0 && value <= 0) continue;
    rows.push({
      stage_id: stage.id,
      name: stage.name,
      color: stage.color,
      icon: stage.icon,
      count,
      lead_count: 0,
      deal_count: count,
      value,
    });
  }
  const orphan = snap.dealCounts.__none__ ?? 0;
  const orphanVal = snap.dealValues.__none__ ?? 0;
  if (orphan > 0 || orphanVal > 0) {
    rows.push({
      stage_id: '__orphan_no_stage__',
      name: 'Chưa có giai đoạn',
      color: '#94a3b8',
      icon: '🗂️',
      count: orphan,
      lead_count: 0,
      deal_count: orphan,
      value: orphanVal,
    });
  }
  return rows;
}

/** Giữ funnel Lead từ BC web; thay funnel Deal bằng snapshot CRM. */
function mergeFunnelForAllView(
  orgFunnel: ReportPipelineFunnelRow[],
  snap: CrmReportHubSnapshot,
): ReportPipelineFunnelRow[] {
  const leadRows = (orgFunnel || []).filter((r) => (r.lead_count ?? 0) > 0);
  return [...leadRows, ...buildDealFunnelFromSnapshot(snap)];
}

function hasStageValueData(values: Record<string, number>): boolean {
  return Object.values(values || {}).some((v) => (Number(v) || 0) > 0);
}

/** Giá trị kỳ vọng pipeline — weighted × xác suất, khớp CRM Hub «Giá trị kỳ vọng». */
function resolveOpenPipelineValue(snap: CrmReportHubSnapshot): number {
  if (snap.openWeightedPipelineValue > 0 || hasStageValueData(snap.dealWeightedValues)) {
    return snap.openWeightedPipelineValue;
  }
  return snap.openPipelineValue;
}

function resolveOpenWeightedValue(
  snap: CrmReportHubSnapshot,
  openPipeline: number,
): number {
  return openPipeline;
}

/**
 * Lead + Deal KPI: snapshot CRM Hub (stage-counts).
 * Funnel Deal: cột thống kê tab Deal.
 * Tỷ lệ chốt: giữ org-overview (Chốt SL / tổng deal kỳ — cùng cohort).
 * hub_deal_kpi: tab Deal Hub (có SĐT) — tham chiếu Kanban, không thay mẫu số chốt.
 * Pipeline KPI: giá trị kỳ vọng weighted theo kỳ (khớp CRM Hub).
 */
export function applyCrmHubSnapshotToReport(
  report: OrgOverviewReport,
  snap: CrmReportHubSnapshot,
  typeView: 'all' | 'lead' | 'deal' = 'all',
): OrgOverviewReport {
  if (typeView === 'lead') return report;

  const cohortPipeline = report.summary.pipeline_value ?? 0;
  const openWeighted = resolveOpenPipelineValue(snap);
  const openRaw = snap.openPipelineValue;
  const hubKvActive = openWeighted > 0 || hasStageValueData(snap.dealWeightedValues);
  const orgLeadCount = Number(report.summary.lead_count) || 0;
  const leadCount = snap.leadTotal > 0 ? snap.leadTotal : orgLeadCount;
  const summary = {
    ...report.summary,
    lead_count: leadCount,
    hub_deal_kpi: snap.dealTotal,
    /** Deal có SĐT gộp tất cả công ty — khớp stage-counts global (296). */
    deal_has_phone_total: snap.dealPeriodTotal,
    cohort_pipeline_value: cohortPipeline,
    open_pipeline_value: openWeighted,
    open_pipeline_raw_value: openRaw,
    open_weighted_pipeline_value: openWeighted,
    pipeline_value: hubKvActive ? openWeighted : (report.summary.pipeline_value ?? 0),
    weighted_value: hubKvActive ? openWeighted : (report.summary.weighted_value ?? 0),
    expected_value: hubKvActive ? openRaw : (report.summary.expected_value ?? 0),
    // deal_count + conversion_rate: giữ nguyên từ org-overview (cohort chuẩn BC web).
  };

  const pipeline_funnel = typeView === 'deal'
    ? buildDealFunnelFromSnapshot(snap)
    : mergeFunnelForAllView(report.pipeline_funnel || [], snap);

  return {
    ...report,
    summary,
    pipeline_funnel,
  };
}

function mergeStageCountMaps(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, raw] of Object.entries(source || {})) {
    target[key] = (Number(target[key]) || 0) + (Number(raw) || 0);
  }
}

/**
 * Tổng Deal KPI tab Deal — dùng stage-counts (O(1) server), không tải từng deal.
 * stage-counts vẫn gồm stage_id lạ / cross-pipeline nên khớp sumCrmDealHubKpiCount.
 */
function dealHubKpiFromStageCounts(
  stages: CrmPipelineStage[],
  counts: Record<string, number>,
): number {
  return sumCrmDealHubKpiCount(stages, counts);
}

async function fetchLeadPeriodTotal(
  query: EmployeeReportQuery,
  signal?: AbortSignal,
): Promise<number> {
  const leadOpts = { ...buildReportLeadFetchOpts(query), signal };
  if (query.company_id) {
    const batch = await fetchCrmStageCountsBatch('lead', leadOpts);
    return Number(batch.total) || 0;
  }
  /**
   * «Tất cả công ty» — khớp CRM Hub `pipelinePhoneTotals.lead.all`:
   * GET /crm/leads không truyền company_id → gồm lead chưa gán công ty (company_id null).
   * Không cộng riêng từng công ty CRM (thiếu ~16 lead orphan).
   */
  const batch = await fetchCrmStageCountsBatch('lead', leadOpts);
  return Number(batch.total) || 0;
}

async function fetchDealPeriodSnapshot(
  query: EmployeeReportQuery,
  signal?: AbortSignal,
): Promise<{
  dealBatch: Awaited<ReturnType<typeof fetchCrmStageCountsBatch>>;
  dealStages: CrmPipelineStage[];
  dealTotal: number;
  customerTabDealCount: number;
  dealPeriodTotal: number;
}> {
  const periodOpts = { ...buildReportStageFetchOpts(query), signal };

  if (query.company_id) {
    const [dealBatch, dealStages] = await Promise.all([
      fetchCrmStageCountsBatch('deal', periodOpts),
      fetchPipelineStages('deal', periodOpts),
    ]);
    return {
      dealBatch,
      dealStages,
      dealTotal: dealHubKpiFromStageCounts(dealStages, dealBatch.counts),
      customerTabDealCount: sumCrmCustomerTabDealCount(dealStages, dealBatch.counts),
      dealPeriodTotal: Number(dealBatch.total) || 0,
    };
  }

  const companies = await fetchCrmCompanies(signal);
  const mergedCounts: Record<string, number> = {};
  const mergedValues: Record<string, number> = {};
  const mergedWeighted: Record<string, number> = {};
  const dealStages: CrmPipelineStage[] = [];
  let customerTabDealCount = 0;
  let dealTotal = 0;
  /** Global stage-counts — khớp CRM Hub `pipelinePhoneTotals.deal.hasPhone`. */
  const globalBatchPromise = fetchCrmStageCountsBatch('deal', periodOpts);

  for (const company of companies) {
    const opts = { ...periodOpts, companyId: company.id };
    const [dealBatch, stages] = await Promise.all([
      fetchCrmStageCountsBatch('deal', opts),
      fetchPipelineStages('deal', opts),
    ]);
    dealTotal += dealHubKpiFromStageCounts(stages, dealBatch.counts);
    customerTabDealCount += sumCrmCustomerTabDealCount(stages, dealBatch.counts);
    mergeStageCountMaps(mergedCounts, dealBatch.counts);
    mergeStageCountMaps(mergedValues, dealBatch.values);
    mergeStageCountMaps(mergedWeighted, dealBatch.weightedValues);
    dealStages.push(...stages);
  }

  const globalBatch = await globalBatchPromise;
  const dealPeriodTotal = Number(globalBatch.total) || 0;

  return {
    dealBatch: {
      counts: mergedCounts,
      values: mergedValues,
      weightedValues: mergedWeighted,
      total: dealPeriodTotal,
    },
    dealStages,
    dealTotal,
    customerTabDealCount,
    dealPeriodTotal,
  };
}

async function fetchOpenPipelineSnapshot(
  query: EmployeeReportQuery,
  signal?: AbortSignal,
): Promise<{ openPipelineValue: number; openWeightedPipelineValue: number; openBatch: Awaited<ReturnType<typeof fetchCrmStageCountsBatch>> }> {
  const openOpts = { ...buildReportOpenPipelineFetchOpts(query), signal };
  if (query.company_id) {
    const [openBatch, dealStages] = await Promise.all([
      fetchCrmStageCountsBatch('deal', openOpts),
      fetchPipelineStages('deal', openOpts),
    ]);
    return {
      openPipelineValue: sumCrmOpenPipelineValue(dealStages, openBatch.values),
      openWeightedPipelineValue: sumCrmOpenWeightedPipelineValue(dealStages, openBatch.weightedValues),
      openBatch,
    };
  }

  const companies = await fetchCrmCompanies(signal);
  let openPipelineValue = 0;
  let openWeightedPipelineValue = 0;
  const mergedValues: Record<string, number> = {};
  const mergedWeighted: Record<string, number> = {};
  let total = 0;

  for (const company of companies) {
    const opts = { ...openOpts, companyId: company.id };
    const [openBatch, dealStages] = await Promise.all([
      fetchCrmStageCountsBatch('deal', opts),
      fetchPipelineStages('deal', opts),
    ]);
    openPipelineValue += sumCrmOpenPipelineValue(dealStages, openBatch.values);
    openWeightedPipelineValue += sumCrmOpenWeightedPipelineValue(dealStages, openBatch.weightedValues);
    total += Number(openBatch.total) || 0;
    mergeStageCountMaps(mergedValues, openBatch.values);
    mergeStageCountMaps(mergedWeighted, openBatch.weightedValues);
  }

  return {
    openPipelineValue,
    openWeightedPipelineValue,
    openBatch: {
      counts: {},
      values: mergedValues,
      weightedValues: mergedWeighted,
      total,
    },
  };
}

/** Snapshot CRM Hub: Lead + Deal theo kỳ, GT pipeline mở. */
export async function fetchCrmReportHubSnapshot(
  query: EmployeeReportQuery,
  signal?: AbortSignal,
): Promise<CrmReportHubSnapshot> {
  const [leadTotal, periodSnap, openSnap] = await Promise.all([
    fetchLeadPeriodTotal(query, signal),
    fetchDealPeriodSnapshot(query, signal),
    fetchOpenPipelineSnapshot(query, signal),
  ]);

  return {
    leadTotal,
    dealTotal: periodSnap.dealTotal,
    customerTabDealCount: periodSnap.customerTabDealCount,
    dealPeriodTotal: periodSnap.dealPeriodTotal,
    dealCounts: periodSnap.dealBatch.counts,
    dealValues: periodSnap.dealBatch.values,
    dealWeightedValues: periodSnap.dealBatch.weightedValues,
    openPipelineValue: openSnap.openPipelineValue,
    openWeightedPipelineValue: openSnap.openWeightedPipelineValue,
    dealStages: periodSnap.dealStages,
  };
}
