import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EmployeePipelineRow, EmployeeReportRow, FirstStageSla, LeadTypeReportRow } from '../../api/employeeReport';
import {
  buildConversionPie,
  buildEmployeeDealOutcomePie,
  buildEmployeeTimelineChart,
  buildPipelineStackedRows,
  buildPipelineValueBars,
  computeConversionRates,
} from '../../lib/employeeChartData';
import { formatKpiLedgerNet, formatVndShort } from '../../lib/reportFormat';
import { Radii, useColors, type ThemeColors } from '../../theme';
import ReportChartCard from './charts/ReportChartCard';
import ReportDonutChart from './charts/ReportDonutChart';
import ReportEmployeeTimelineChart from './charts/ReportEmployeeTimelineChart';
import ReportFirstStageSlaBlock from './charts/ReportFirstStageSlaBlock';
import ReportHorizontalBarChart from './charts/ReportHorizontalBarChart';
import ReportKpiRing from './charts/ReportKpiRing';
import ReportLeadTypeChart from './charts/ReportLeadTypeChart';
import ReportStackedBarChart from './charts/ReportStackedBarChart';
import ReportMetricBlock from './ReportMetricBlock';
import ReportLeadTypeList from './ReportLeadTypeList';
import { buildLeadTypeChartData } from '../../lib/reportChartData';

type Props = {
  summary: Record<string, number | null | undefined>;
  pipelines: EmployeePipelineRow[];
  timeline: Array<{ date: string; lead_count?: number; deal_count?: number; lead_value?: number; deal_value?: number }>;
  row?: Partial<EmployeeReportRow>;
  conversionRate?: number;
  byLeadType?: LeadTypeReportRow[];
  firstStageSla?: FirstStageSla | null;
};

export default function EmployeeReportCharts({
  summary,
  pipelines,
  timeline,
  row,
  conversionRate = 0,
  byLeadType = [],
  firstStageSla = null,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const timelineChart = useMemo(() => buildEmployeeTimelineChart(timeline), [timeline]);
  const conversionPie = useMemo(() => buildConversionPie(summary, row), [summary, row]);
  const dealOutcomePie = useMemo(() => buildEmployeeDealOutcomePie(summary, row), [summary, row]);
  const rates = useMemo(() => computeConversionRates(summary, row), [summary, row]);
  const pipelineBars = useMemo(() => buildPipelineValueBars(pipelines), [pipelines]);
  const pipelineStacked = useMemo(() => buildPipelineStackedRows(pipelines), [pipelines]);
  const leadTypeChart = useMemo(() => buildLeadTypeChartData(byLeadType), [byLeadType]);

  const overdue = summary.overdue_count ?? row?.overdue_count ?? 0;
  const overduePct = summary.overdue_rate_pct ?? row?.overdue_rate_pct;
  const overdueLabel = overduePct != null ? `${overdue} (${overduePct}%)` : String(overdue);
  const receptionEligible = summary.reception_eligible_count ?? row?.reception_eligible_count ?? 0;
  const receptionOverdue = summary.reception_overdue_count ?? row?.reception_overdue_count ?? 0;
  const receptionPct = summary.reception_overdue_rate_pct ?? row?.reception_overdue_rate_pct;
  const firstStageOverduePct = summary.first_stage_overdue_rate_pct ?? row?.first_stage_overdue_rate_pct;
  const receptionLabel = receptionEligible > 0 && receptionPct != null
    ? `${receptionOverdue}/${receptionEligible} (${receptionPct}%)`
    : receptionEligible > 0 ? String(receptionOverdue) : '—';

  return (
    <>
      <View style={styles.metricsRow}>
        <ReportMetricBlock label="Dự kiến" value={formatVndShort(summary.expected_value as number)} tone="emerald" />
        <ReportMetricBlock label="Kỳ vọng" value={formatVndShort(summary.weighted_value as number)} tone="amber" />
        <ReportMetricBlock label="GT thắng" value={formatVndShort(summary.won_value as number)} tone="sky" />
        <ReportMetricBlock label="Hoàn thành" value={formatVndShort(summary.completed_value as number)} tone="violet" />
        <ReportMetricBlock label="Quá hạn SLA cột" value={overdueLabel} tone="rose" />
        <ReportMetricBlock label="QH tiếp nhận" value={receptionLabel} tone="amber" />
        <ReportMetricBlock label="Điểm KPI" value={formatKpiLedgerNet(summary.kpi_ledger_net as number)} tone="indigo" />
      </View>

      <ReportChartCard
        title="Phân loại Lead/Deal"
        subtitle="Theo loại cấu hình Pipeline"
        empty={leadTypeChart.length === 0}
        emptyText="Chưa có dữ liệu phân loại"
      >
        <ReportLeadTypeChart data={leadTypeChart} />
        <ReportLeadTypeList rows={byLeadType} />
      </ReportChartCard>

      <ReportChartCard
        title="SLA cột đầu tiên"
        subtitle="Lead/deal đang mở ở cột đầu pipeline"
        empty={!firstStageSla?.open_count}
        emptyText="Chưa có lead/deal ở cột đầu"
      >
        <ReportFirstStageSlaBlock sla={firstStageSla} />
      </ReportChartCard>

      <ReportChartCard
        title="Tổng quan pipeline"
        subtitle="Lead / Deal / giá trị theo ngày trong kỳ"
        empty={timelineChart.length === 0}
        emptyText="Chưa có dữ liệu xu hướng"
      >
        <ReportEmployeeTimelineChart data={timelineChart} />
      </ReportChartCard>

      <View style={styles.rateChips}>
        {rates.leadToDealPct != null ? (
          <View style={[styles.chip, styles.chipViolet]}>
            <Text style={styles.chipTextViolet}>Chuyển đổi {rates.leadToDealPct}%</Text>
          </View>
        ) : null}
        <View style={[styles.chip, styles.chipRose]}>
          <Text style={styles.chipTextRose}>
            Hủy {rates.cancelPct != null ? `${rates.cancelPct}%` : '—'}
          </Text>
        </View>
        <View style={[styles.chip, styles.chipAmber]}>
          <Text style={styles.chipTextAmber}>
            QH SLA {rates.overduePct != null ? `${rates.overduePct}%` : '—'}
          </Text>
        </View>
        <View style={[styles.chip, styles.chipSky]}>
          <Text style={styles.chipTextSky}>
            QH cột 1 {firstStageOverduePct != null ? `${firstStageOverduePct}%` : '—'}
          </Text>
        </View>
        {receptionPct != null ? (
          <View style={[styles.chip, styles.chipOrange]}>
            <Text style={styles.chipTextOrange}>QH tiếp nhận {receptionPct}%</Text>
          </View>
        ) : null}
      </View>

      <ReportChartCard
        title="Tỷ lệ chuyển đổi"
        subtitle="Lead → Deal · phân bổ cơ hội trong kỳ"
        empty={conversionPie.length === 0}
        emptyText="Chưa có dữ liệu"
      >
        <ReportDonutChart segments={conversionPie} size={170} />
      </ReportChartCard>

      <View style={styles.twoCol}>
        <View style={styles.halfCard}>
          <ReportChartCard
            title="Kết quả Deal"
            subtitle="Chốt / thua / mở"
            empty={dealOutcomePie.length === 0}
            emptyText="Chưa có deal"
          >
            <ReportDonutChart segments={dealOutcomePie} size={160} />
          </ReportChartCard>
        </View>
        <View style={styles.halfCard}>
          <ReportChartCard title="Hiệu suất chốt" subtitle="Tỷ lệ chốt deal trong kỳ">
            <ReportKpiRing
              pct={conversionRate}
              subtitle={`${summary.won_deal_count ?? row?.won_deal_count ?? 0} / ${summary.deal_count ?? row?.deal_count ?? 0} deal`}
            />
          </ReportChartCard>
        </View>
      </View>

      {pipelineBars.length > 0 ? (
        <ReportChartCard title="Giá trị theo pipeline" subtitle="Top pipeline theo giá trị ước tính">
          <ReportHorizontalBarChart data={pipelineBars} valueMode barColor="#6366f1" rowHeight={34} />
        </ReportChartCard>
      ) : null}

      {pipelineStacked.length > 0 ? (
        <ReportChartCard title="Deal theo pipeline" subtitle="Chốt / hoàn thành (tím) / thua / mở">
          <ReportStackedBarChart data={pipelineStacked} rowHeight={34} />
        </ReportChartCard>
      ) : null}
    </>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  rateChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipViolet: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  chipRose: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  chipAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  chipSky: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  chipOrange: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  chipTextViolet: { color: '#5b21b6', fontSize: 11, fontWeight: '700' },
  chipTextRose: { color: '#9f1239', fontSize: 11, fontWeight: '700' },
  chipTextAmber: { color: '#92400e', fontSize: 11, fontWeight: '700' },
  chipTextSky: { color: '#0c4a6e', fontSize: 11, fontWeight: '700' },
  chipTextOrange: { color: '#9a3412', fontSize: 11, fontWeight: '700' },
  twoCol: { gap: 0 },
  halfCard: { marginBottom: 0 },
});
