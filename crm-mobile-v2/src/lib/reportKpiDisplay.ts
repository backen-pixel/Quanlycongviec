import type { OrgReportRow } from '../api/employeeReport';
import { formatVndShort } from './reportFormat';

/** GT pipeline cohort — khớp BC web «Pipeline» (summary.pipeline_value). */
export function reportPipelineKpiValue(summary: OrgReportRow): number {
  return Number(summary.pipeline_value ?? 0) || 0;
}

/** Tổng deal tạo trong kỳ — khớp BC web (summary.deal_count). */
export function reportDealKpiCount(summary: OrgReportRow): number {
  return Number(summary.deal_count ?? 0) || 0;
}

export function reportDealKpiSub(): string {
  return 'Tạo trong kỳ';
}

/** DT dự kiến — khớp BC web (summary.expected_value). */
export function reportExpectedKpiValue(summary: OrgReportRow): number {
  return Number(summary.expected_value ?? 0) || 0;
}

export function formatReportDealKpi(summary: OrgReportRow): string {
  return String(reportDealKpiCount(summary));
}

export function formatReportPipelineKpi(summary: OrgReportRow): string {
  return formatVndShort(reportPipelineKpiValue(summary));
}

export function formatReportExpectedKpi(summary: OrgReportRow): string {
  return formatVndShort(reportExpectedKpiValue(summary));
}
