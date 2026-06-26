import {
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
  dealStatsStagesForFunnel,
  sumCrmDealStatsCount,
  sumCrmOpenPipelineValue,
  sumCrmOpenWeightedPipelineValue,
} from './crmPipelineTabs';

export type CrmReportHubSnapshot = {
  dealTotal: number;
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

/** Pipeline mở snapshot — không lọc ngày tạo (GT đang chạy trên CRM). */
export function buildReportOpenPipelineFetchOpts(query: EmployeeReportQuery): CrmStageFetchOpts {
  return {
    companyId: query.company_id || undefined,
    regionId: query.region_id || undefined,
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

function reportConversionRate(closedCount: number, dealCount: number): number {
  if (!dealCount) return 0;
  return Math.round((closedCount / dealCount) * 1000) / 10;
}

function patchCompareCount(
  report: OrgOverviewReport,
  key: 'deal_count',
  current: number,
  previous: number,
): OrgOverviewReport {
  const delta = current - previous;
  const pct = previous !== 0
    ? Math.round((delta / previous) * 1000) / 10
    : (current > 0 ? 100 : null);
  const compare = {
    ...(report.compare || {}),
    [key]: { previous, delta, pct },
  };
  return { ...report, compare };
}

function hasStageValueData(values: Record<string, number>): boolean {
  return Object.values(values || {}).some((v) => (Number(v) || 0) > 0);
}

function resolveOpenPipelineValue(
  snap: CrmReportHubSnapshot,
  orgSummary: OrgOverviewReport['summary'],
): number {
  if (snap.openPipelineValue > 0 || hasStageValueData(snap.dealValues)) {
    return snap.openPipelineValue;
  }
  return orgSummary.expected_value ?? orgSummary.pipeline_value ?? 0;
}

function resolveOpenWeightedValue(
  snap: CrmReportHubSnapshot,
  orgSummary: OrgOverviewReport['summary'],
  openPipeline: number,
): number {
  if (snap.openWeightedPipelineValue > 0 || hasStageValueData(snap.dealWeightedValues)) {
    return snap.openWeightedPipelineValue;
  }
  return orgSummary.weighted_value ?? openPipeline;
}

function buildHubSnapshot(
  dealBatch: Awaited<ReturnType<typeof fetchCrmStageCountsBatch>>,
  openBatch: Awaited<ReturnType<typeof fetchCrmStageCountsBatch>>,
  dealStages: CrmPipelineStage[],
): CrmReportHubSnapshot {
  const openPipelineValue = sumCrmOpenPipelineValue(dealStages, openBatch.values);
  const openWeightedPipelineValue = sumCrmOpenWeightedPipelineValue(
    dealStages,
    openBatch.weightedValues,
  );
  return {
    dealTotal: sumCrmDealStatsCount(dealStages, dealBatch.counts),
    dealCounts: dealBatch.counts,
    dealValues: dealBatch.values,
    dealWeightedValues: dealBatch.weightedValues,
    openPipelineValue,
    openWeightedPipelineValue,
    dealStages,
  };
}

/**
 * Lead: giữ org-overview (khớp web BC theo ngày tạo).
 * Deal count/funnel: CRM Dashboard tab Deal.
 * Pipeline KPI: GT mở snapshot (khớp Hub), cohort GT giữ ở cohort_pipeline_value.
 */
export function applyCrmHubSnapshotToReport(
  report: OrgOverviewReport,
  snap: CrmReportHubSnapshot,
  typeView: 'all' | 'lead' | 'deal' = 'all',
  prevSnap?: CrmReportHubSnapshot | null,
): OrgOverviewReport {
  if (typeView === 'lead') return report;

  const cohortPipeline = report.summary.pipeline_value ?? 0;
  const openPipeline = resolveOpenPipelineValue(snap, report.summary);
  const openWeighted = resolveOpenWeightedValue(snap, report.summary, openPipeline);
  const summary = {
    ...report.summary,
    cohort_pipeline_value: cohortPipeline,
    open_pipeline_value: openPipeline,
    open_weighted_pipeline_value: openWeighted,
    pipeline_value: openPipeline,
    deal_count: snap.dealTotal,
    conversion_rate: reportConversionRate(
      reportClosedWonCount(report.summary),
      snap.dealTotal,
    ),
  };

  const pipeline_funnel = typeView === 'deal'
    ? buildDealFunnelFromSnapshot(snap)
    : mergeFunnelForAllView(report.pipeline_funnel || [], snap);

  let next: OrgOverviewReport = {
    ...report,
    summary,
    pipeline_funnel,
  };

  if (prevSnap) {
    next = patchCompareCount(next, 'deal_count', snap.dealTotal, prevSnap.dealTotal);
  }

  return next;
}

/** Snapshot Deal: counts theo kỳ + GT pipeline mở (không lọc ngày tạo). */
export async function fetchCrmReportHubSnapshot(
  query: EmployeeReportQuery,
  signal?: AbortSignal,
): Promise<CrmReportHubSnapshot> {
  const periodOpts = { ...buildReportStageFetchOpts(query), signal };
  const openOpts = { ...buildReportOpenPipelineFetchOpts(query), signal };
  const [dealBatch, openBatch, dealStages] = await Promise.all([
    fetchCrmStageCountsBatch('deal', periodOpts),
    fetchCrmStageCountsBatch('deal', openOpts),
    fetchPipelineStages('deal', periodOpts),
  ]);

  return buildHubSnapshot(dealBatch, openBatch, dealStages);
}
