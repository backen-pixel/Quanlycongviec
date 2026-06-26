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
import { reportClosedWonCount } from './reportMetrics';
import {
  crmCustomerTabConversionRate,
  dealStatsStagesForFunnel,
  sumCrmCustomerTabDealCount,
  sumCrmDealStatsCount,
  sumCrmOpenPipelineValue,
  sumCrmOpenWeightedPipelineValue,
} from './crmPipelineTabs';

export type CrmReportHubSnapshot = {
  /** Tab Deal — pre-won + thua (không dùng làm mẫu số tỷ lệ chốt). */
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

/** Bộ lọc deal theo kỳ — khớp CRM Hub (RPC stage-counts + ngày tạo). */
export function buildReportStageFetchOpts(query: EmployeeReportQuery): CrmStageFetchOpts {
  return {
    companyId: query.company_id || undefined,
    regionId: query.region_id || undefined,
    dateFrom: query.date_from || undefined,
    dateTo: query.date_to || undefined,
    phoneFilter: 'has_phone',
    lite: true,
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
 * Lead: giữ org-overview (khớp web BC theo ngày tạo).
 * Funnel Deal: CRM Dashboard tab Deal.
 * Tỷ lệ chốt: tab KH (Thắng + sau Thắng) / tổng deal kỳ org-overview — khớp BC web.
 * Pipeline KPI: giá trị kỳ vọng weighted theo kỳ (khớp CRM Hub), GT thô giữ ở open_pipeline_raw_value.
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
  const orgDealCount = Number(report.summary.deal_count) || 0;
  const closedCount = reportClosedWonCount(report.summary);
  /** «Tất cả công ty»: DEAL khớp CRM Hub tab Deal (có SĐT, trước Thắng + thua). */
  const allCompaniesScope = !report.company_id;
  const hubDealCount = snap.dealTotal > 0 ? snap.dealTotal : 0;
  const dealCount = allCompaniesScope && hubDealCount > 0
    ? hubDealCount
    : orgDealCount;
  const summary = {
    ...report.summary,
    cohort_pipeline_value: cohortPipeline,
    open_pipeline_value: openWeighted,
    open_pipeline_raw_value: openRaw,
    open_weighted_pipeline_value: openWeighted,
    pipeline_value: hubKvActive ? openWeighted : (report.summary.pipeline_value ?? 0),
    // Ghi đè org-overview weighted (~3,5 tỷ) bằng KV Hub theo cột CRM (~2,26 tỷ).
    weighted_value: hubKvActive ? openWeighted : (report.summary.weighted_value ?? 0),
    expected_value: hubKvActive ? openRaw : (report.summary.expected_value ?? 0),
    deal_count: dealCount,
    // Tỷ lệ chốt: tab KH / tổng deal kỳ — mẫu số khớp cột DEAL hiển thị.
    conversion_rate: allCompaniesScope && hubDealCount > 0
      ? crmCustomerTabConversionRate(closedCount, dealCount)
      : (report.summary.conversion_rate ?? crmCustomerTabConversionRate(closedCount, orgDealCount)),
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
      dealTotal: sumCrmDealStatsCount(dealStages, dealBatch.counts),
      customerTabDealCount: sumCrmCustomerTabDealCount(dealStages, dealBatch.counts),
      dealPeriodTotal: Number(dealBatch.total) || 0,
    };
  }

  const companies = await fetchCrmCompanies(signal);
  const mergedCounts: Record<string, number> = {};
  const mergedValues: Record<string, number> = {};
  const mergedWeighted: Record<string, number> = {};
  const dealStages: CrmPipelineStage[] = [];
  let dealTotal = 0;
  let customerTabDealCount = 0;
  let dealPeriodTotal = 0;

  for (const company of companies) {
    const opts = { ...periodOpts, companyId: company.id };
    const [dealBatch, stages] = await Promise.all([
      fetchCrmStageCountsBatch('deal', opts),
      fetchPipelineStages('deal', opts),
    ]);
    dealTotal += sumCrmDealStatsCount(stages, dealBatch.counts);
    customerTabDealCount += sumCrmCustomerTabDealCount(stages, dealBatch.counts);
    dealPeriodTotal += Number(dealBatch.total) || 0;
    mergeStageCountMaps(mergedCounts, dealBatch.counts);
    mergeStageCountMaps(mergedValues, dealBatch.values);
    mergeStageCountMaps(mergedWeighted, dealBatch.weightedValues);
    dealStages.push(...stages);
  }

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

/** Snapshot Deal: counts theo kỳ + GT pipeline mở (không lọc ngày tạo). */
export async function fetchCrmReportHubSnapshot(
  query: EmployeeReportQuery,
  signal?: AbortSignal,
): Promise<CrmReportHubSnapshot> {
  const [periodSnap, openSnap] = await Promise.all([
    fetchDealPeriodSnapshot(query, signal),
    fetchOpenPipelineSnapshot(query, signal),
  ]);

  return {
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
