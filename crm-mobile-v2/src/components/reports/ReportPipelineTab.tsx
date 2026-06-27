import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { OrgOverviewReport } from '../../api/employeeReport';
import { buildFunnelChart } from '../../lib/reportChartData';
import { formatCompareTrend } from '../../lib/reportCompare';
import { formatVndShort } from '../../lib/reportFormat';
import {
  reportClosedWonCount,
  reportClosedWonValue,
  reportKpiValueProgressPct,
} from '../../lib/reportMetrics';
import { Radii, useColors, type ThemeColors } from '../../theme';
import ReportActivityList from './ReportActivityList';
import ReportChartCard from './charts/ReportChartCard';
import ReportFunnelChart from './charts/ReportFunnelChart';
import ReportKpiRing from './charts/ReportKpiRing';

type Props = {
  report: OrgOverviewReport;
};

export default function ReportPipelineTab({ report }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const funnel = useMemo(() => buildFunnelChart(report.pipeline_funnel || []), [report.pipeline_funnel]);
  const summary = report.summary;
  const pipelineTotal = summary.open_pipeline_value ?? summary.pipeline_value ?? 0;
  const cohortTotal = summary.cohort_pipeline_value ?? 0;
  const goal = summary.expected_value ?? 0;
  const achieved = reportClosedWonValue(summary);
  const kpiPct = reportKpiValueProgressPct(summary);
  const { text: leadTrend, up: leadUp } = formatCompareTrend(report.compare, 'lead_count');
  const sparkValues = useMemo(
    () => (report.timeline || []).map((d) => d.lead_count ?? 0),
    [report.timeline],
  );

  return (
    <>
      <ReportChartCard
        title="Pipeline tổng quan"
        subtitle={`Pipeline mở: ${formatVndShort(pipelineTotal)}${cohortTotal > 0 ? ` · GT tạo trong kỳ: ${formatVndShort(cohortTotal)}` : ''}`}
        empty={funnel.length === 0}
      >
        <ReportFunnelChart data={funnel} />
      </ReportChartCard>

      <ReportChartCard title="Hoạt động nổi bật" subtitle="So với kỳ trước">
        <ReportActivityList summary={summary} compare={report.compare} />
      </ReportChartCard>

      <ReportChartCard title="Khách hàng mới" subtitle="Lead tạo mới trong kỳ (theo ngày tạo)">
        <View style={styles.newRow}>
          <View style={styles.newBody}>
            <Text style={styles.newValue}>+{summary.lead_count ?? 0}</Text>
            <Text style={styles.newLabel}>lead trong kỳ</Text>
            {leadTrend ? (
              <View style={styles.trendRow}>
                <Ionicons
                  name={leadUp === false ? 'arrow-down' : 'arrow-up'}
                  size={12}
                  color={leadUp === false ? Colors.red : Colors.green}
                />
                <Text style={[styles.trendText, leadUp === false && styles.trendDown]}>{leadTrend}</Text>
              </View>
            ) : null}
          </View>
          {sparkValues.length > 1 ? (
            <MiniSparkline values={sparkValues} color={Colors.green} />
          ) : null}
        </View>
      </ReportChartCard>

      <ReportChartCard
        title="Tiến độ KPI"
        subtitle={`Tỷ lệ chốt: ${summary.conversion_rate ?? 0}% · ${reportClosedWonCount(summary)}/${summary.deal_count ?? 0} deal (Thắng+ / tổng kỳ)`}
      >
        <View style={styles.kpiRow}>
          <ReportKpiRing pct={kpiPct} label="GT chốt/TH" ringColor={Colors.purple} />
          <View style={styles.kpiMeta}>
            <View style={styles.kpiLine}>
              <Text style={styles.kpiKey}>Mục tiêu (dự kiến)</Text>
              <Text style={styles.kpiVal}>{formatVndShort(goal)}</Text>
            </View>
            <View style={styles.kpiLine}>
              <Text style={styles.kpiKey}>GT chốt đạt được</Text>
              <Text style={[styles.kpiVal, { color: Colors.green }]}>{formatVndShort(achieved)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${kpiPct}%` }]} />
        </View>
        <Text style={styles.progressHint}>
          {formatVndShort(achieved)} / {formatVndShort(goal)}
          {summary.deal_close_value_rate_pct != null ? ` · ${summary.deal_close_value_rate_pct}% theo GT` : ''}
        </Text>
      </ReportChartCard>
    </>
  );
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const w = 88;
  const h = 36;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <Svg width={w} height={h}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} />
    </Svg>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  newBody: { flex: 1 },
  newValue: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  newLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  trendText: {
    color: Colors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  trendDown: { color: Colors.red },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  kpiMeta: {
    flex: 1,
    gap: 12,
  },
  kpiLine: {
    gap: 2,
  },
  kpiKey: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  kpiVal: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceSoft,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radii.pill,
    backgroundColor: Colors.purple,
  },
  progressHint: {
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
});
