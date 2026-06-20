import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EmployeeReportRow } from '../../api/employeeReport';
import Avatar from '../Avatar';
import { colorFromName } from '../../lib/media';
import { formatKpiLedgerNet, formatVndShort } from '../../lib/reportFormat';
import { Radii, Shadow, useColors, type ThemeColors } from '../../theme';
import ReportMetricBlock from './ReportMetricBlock';

type Props = {
  row: EmployeeReportRow;
  onPress: () => void;
};

export default function EmployeeReportCard({ row, onPress }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const overdue = row.overdue_count ?? 0;
  const overduePct = row.overdue_rate_pct;
  const overdueLabel = overduePct != null ? `${overdue} (${overduePct}%)` : String(overdue);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.head}>
        <Avatar
          name={row.full_name || '?'}
          size={48}
          color={colorFromName(row.full_name || row.user_id || '?')}
          avatarUrl={row.avatar}
        />
        <View style={styles.headBody}>
          <Text style={styles.name} numberOfLines={1}>{row.full_name}</Text>
          <Text style={styles.dept} numberOfLines={1}>
            {row.department_name || 'Nhân viên kinh doanh'}
          </Text>
        </View>
        <View style={styles.rateBadge}>
          <Text style={styles.rateText}>{row.conversion_rate ?? 0}%</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <ReportMetricBlock label="Lead" value={row.lead_count ?? 0} tone="blue" />
        <ReportMetricBlock label="Deal" value={row.deal_count ?? 0} tone="cyan" />
        <ReportMetricBlock label="Dự kiến" value={formatVndShort(row.expected_value)} tone="emerald" />
        <ReportMetricBlock label="Kỳ vọng" value={formatVndShort(row.weighted_value)} tone="amber" />
        <ReportMetricBlock label="Thắng" value={formatVndShort(row.won_value)} tone="sky" />
        <ReportMetricBlock label="Hoàn thành" value={formatVndShort(row.completed_value)} tone="violet" />
        <ReportMetricBlock label="Quá hạn" value={overdueLabel} tone="rose" />
        <ReportMetricBlock label="Điểm KPI" value={formatKpiLedgerNet(row.kpi_ledger_net)} tone="indigo" />
      </View>
    </Pressable>
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
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
    borderColor: Colors.blue,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headBody: { flex: 1, minWidth: 0 },
  name: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  dept: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  rateBadge: {
    backgroundColor: Colors.blueSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rateText: { color: Colors.blue, fontSize: 11, fontWeight: '800' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
});
