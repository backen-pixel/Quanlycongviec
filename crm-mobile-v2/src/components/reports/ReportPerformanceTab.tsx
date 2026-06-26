import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { EmployeeReportRow, OrgOverviewReport } from '../../api/employeeReport';
import { buildTimelineChart } from '../../lib/reportChartData';
import { formatCompareTrend } from '../../lib/reportCompare';
import { formatVndShort } from '../../lib/reportFormat';
import { reportClosedWonValue } from '../../lib/reportMetrics';
import { useColors, type ThemeColors } from '../../theme';
import ReportChartCard from './charts/ReportChartCard';
import ReportRegionCards from './ReportRegionCards';
import ReportTimelineChart from './charts/ReportTimelineChart';
import ReportTopEmployeeRow from './ReportTopEmployeeRow';

type Props = {
  report: OrgOverviewReport;
  onEmployeePress: (row: EmployeeReportRow) => void;
  onViewAllEmployees: () => void;
};

export default function ReportPerformanceTab({
  report,
  onEmployeePress,
  onViewAllEmployees,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const topEmployees = useMemo(
    () => [...(report.by_employee || [])]
      .sort((a, b) => reportClosedWonValue(b) - reportClosedWonValue(a)
        || (b.deal_count ?? 0) - (a.deal_count ?? 0))
      .slice(0, 3),
    [report.by_employee],
  );
  const wonTimeline = useMemo(() => buildTimelineChart(report.timeline || []), [report.timeline]);
  const { text: trend, up } = formatCompareTrend(report.compare, 'won_or_later_value');

  return (
    <>
      <ReportChartCard
        title="Top nhân viên"
        actionLabel="Xem tất cả"
        onAction={onViewAllEmployees}
        empty={topEmployees.length === 0}
      >
        {topEmployees.map((row, i) => (
          <Pressable key={row.user_id || i} onPress={() => onEmployeePress(row)}>
            <ReportTopEmployeeRow rank={i + 1} row={row} />
          </Pressable>
        ))}
      </ReportChartCard>

      <ReportChartCard title="Theo khu vực" subtitle="GT chốt theo vùng">
        <ReportRegionCards regions={report.by_region || []} />
      </ReportChartCard>

      <ReportChartCard title="Doanh thu dự kiến" subtitle="Deal tạo trong kỳ · cột doanh thu dự kiến">
        <View style={styles.revenueHead}>
          <View style={styles.revenueBody}>
            <Text style={styles.revenueLabel}>Dự kiến trong kỳ</Text>
            <Text style={styles.revenueValue}>
              {formatVndShort(report.summary.expected_value)}
            </Text>
            <Text style={styles.revenueSub}>
              Kỳ vọng CRM Hub: {formatVndShort(report.summary.open_pipeline_value ?? report.summary.weighted_value)}
            </Text>
            {(report.summary.open_pipeline_raw_value ?? 0) > 0 ? (
              <Text style={styles.revenueSub}>
                Dự kiến CRM Hub: {formatVndShort(report.summary.open_pipeline_raw_value)}
              </Text>
            ) : null}
            {trend ? (
              <View style={styles.trendRow}>
                <Ionicons
                  name={up === false ? 'trending-down' : 'trending-up'}
                  size={14}
                  color={up === false ? Colors.red : Colors.green}
                />
                <Text style={[styles.trendText, up === false && styles.trendDown]}>
                  GT chốt {trend}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.moneyIcon}>
            <Ionicons name="cash-outline" size={28} color={Colors.amber} />
          </View>
        </View>
        {wonTimeline.length > 0 ? (
          <ReportTimelineChart data={wonTimeline} height={160} mode="won-only" />
        ) : null}
      </ReportChartCard>
    </>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  revenueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  revenueBody: { flex: 1 },
  revenueLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  revenueValue: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  revenueSub: {
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
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
  moneyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
