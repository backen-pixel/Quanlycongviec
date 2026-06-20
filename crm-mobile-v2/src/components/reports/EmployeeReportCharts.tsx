import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EmployeePipelineRow, EmployeeReportRow } from '../../api/employeeReport';
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
import ReportHorizontalBarChart from './charts/ReportHorizontalBarChart';
import ReportKpiRing from './charts/ReportKpiRing';
import ReportStackedBarChart from './charts/ReportStackedBarChart';
import ReportMetricBlock from './ReportMetricBlock';

type Props = {
  summary: Record<string, number | null | undefined>;
  pipelines: EmployeePipelineRow[];
  timeline: Array<{ date: string; lead_count?: number; deal_count?: number; lead_value?: number; deal_value?: number }>;
  row?: Partial<EmployeeReportRow>;
  conversionRate?: number;
};

export default function EmployeeReportCharts({
  summary,
  pipelines,
  timeline,
  row,
  conversionRate = 0,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const timelineChart = useMemo(() => buildEmployeeTimelineChart(timeline), [timeline]);
  const conversionPie = useMemo(() => buildConversionPie(summary, row), [summary, row]);
  const dealOutcomePie = useMemo(() => buildEmployeeDealOutcomePie(summary, row), [summary, row]);
  const rates = useMemo(() => computeConversionRates(summary, row), [summary, row]);
  const pipelineBars = useMemo(() => buildPipelineValueBars(pipelines), [pipelines]);
  const pipelineStacked = useMemo(() => buildPipelineStackedRows(pipelines), [pipelines]);

  const overdue = summary.overdue_count ?? row?.overdue_count ?? 0;
  const overduePct = summary.overdue_rate_pct ?? row?.overdue_rate_pct;
  const overdueLabel = overduePct != null ? `${overdue} (${overduePct}%)` : String(overdue);

  return (
    <>
      <View style={styles.metricsRow}>
        <ReportMetricBlock label="Dự kiến" value={formatVndShort(summary.expected_value as number)} tone="emerald" />
        <ReportMetricBlock label="Kỳ vọng" value={formatVndShort(summary.weighted_value as number)} tone="amber" />
        <ReportMetricBlock label="GT thắng" value={formatVndShort(summary.won_value as number)} tone="sky" />
        <ReportMetricBlock label="Hoàn thành" value={formatVndShort(summary.completed_value as number)} tone="violet" />
        <ReportMetricBlock label="Quá hạn SLA" value={overdueLabel} tone="rose" />
        <ReportMetricBlock label="Điểm KPI" value={formatKpiLedgerNet(summary.kpi_ledger_net as number)} tone="indigo" />
      </View>

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
            Quá hạn {rates.overduePct != null ? `${rates.overduePct}%` : '—'}
          </Text>
        </View>
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
        <ReportChartCard title="Deal theo pipeline" subtitle="Chốt / thua / đang mở">
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
  chipTextViolet: { color: '#5b21b6', fontSize: 11, fontWeight: '700' },
  chipTextRose: { color: '#9f1239', fontSize: 11, fontWeight: '700' },
  chipTextAmber: { color: '#92400e', fontSize: 11, fontWeight: '700' },
  twoCol: { gap: 0 },
  halfCard: { marginBottom: 0 },
});
