import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgReportRow } from '../../api/employeeReport';
import { formatKpiLedgerNet, formatVndShort } from '../../lib/reportFormat';
import { Radii, Shadow, useColors, type ThemeColors } from '../../theme';
import ReportMetricBlock from './ReportMetricBlock';

type Props = {
  summary: OrgReportRow;
};

export default function ReportOverviewSummary({ summary }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const overdue = summary.overdue_count ?? 0;
  const overduePct = summary.overdue_rate_pct;
  const overdueLabel = overduePct != null ? `${overdue} (${overduePct}%)` : String(overdue);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Tổng hợp kỳ báo cáo</Text>
      <View style={styles.grid}>
        <ReportMetricBlock label="Lead" value={summary.lead_count ?? 0} tone="blue" />
        <ReportMetricBlock label="Deal" value={summary.deal_count ?? 0} tone="cyan" />
        <ReportMetricBlock label="Pipeline" value={formatVndShort(summary.pipeline_value)} tone="indigo" />
        <ReportMetricBlock label="Tỷ lệ chốt" value={`${summary.conversion_rate ?? 0}%`} tone="slate" />
        <ReportMetricBlock label="Dự kiến" value={formatVndShort(summary.expected_value)} tone="emerald" />
        <ReportMetricBlock label="Kỳ vọng" value={formatVndShort(summary.weighted_value)} tone="amber" />
        <ReportMetricBlock label="Thắng" value={formatVndShort(summary.won_value)} tone="sky" />
        <ReportMetricBlock label="Hoàn thành" value={formatVndShort(summary.completed_value)} tone="violet" />
        <ReportMetricBlock label="Quá hạn" value={overdueLabel} tone="rose" />
        <ReportMetricBlock label="Điểm KPI" value={formatKpiLedgerNet(summary.kpi_ledger_net)} tone="indigo" />
        <ReportMetricBlock label="Chốt SL" value={summary.won_deal_count ?? 0} tone="emerald" />
        <ReportMetricBlock label="Thua" value={summary.lost_deal_count ?? 0} tone="rose" />
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    ...Shadow.card,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
