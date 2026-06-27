import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EmployeeReportRow } from '../../api/employeeReport';
import Avatar from '../Avatar';
import { colorFromName } from '../../lib/media';
import { formatKpiLedgerNet } from '../../lib/reportFormat';
import { STACK_COLORS } from '../../lib/reportChartData';
import { reportClosedWonCount, reportOpenDealCount } from '../../lib/reportMetrics';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  rank: number;
  row: EmployeeReportRow;
  onPress?: () => void;
  showKpi?: boolean;
};

export default function ReportTopEmployeeRow({ rank, row, showKpi = false }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const won = reportClosedWonCount(row);
  const lost = row.lost_deal_count || 0;
  const open = reportOpenDealCount(row);
  const total = won + lost + open || 1;

  const rankBg = rank === 1 ? '#EAB308' : rank === 2 ? '#94A3B8' : rank === 3 ? '#D97706' : undefined;

  const openColor = '#A855F7';

  return (
    <View style={styles.row}>
      <Text style={[styles.rank, rankBg ? styles.rankTop : null, rankBg ? { backgroundColor: rankBg } : null]}>
        {rank}
      </Text>
      <Avatar
        name={row.full_name || '?'}
        size={40}
        color={colorFromName(row.full_name || row.user_id || '?')}
        avatarUrl={row.avatar}
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{row.full_name}</Text>
        <View style={styles.barTrack}>
          {won > 0 ? (
            <View style={[styles.barSeg, { flex: won, backgroundColor: STACK_COLORS.won }]} />
          ) : null}
          {lost > 0 ? (
            <View style={[styles.barSeg, { flex: lost, backgroundColor: STACK_COLORS.lost }]} />
          ) : null}
          {open > 0 ? (
            <View style={[styles.barSeg, { flex: open, backgroundColor: openColor }]} />
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.dealCount}>{total}</Text>
        {showKpi && row.kpi_ledger_net != null ? (
          <Text style={[
            styles.kpiScore,
            (row.kpi_ledger_net ?? 0) < 0 && styles.kpiScoreDown,
          ]}>
            {formatKpiLedgerNet(row.kpi_ledger_net)}
          </Text>
        ) : (
          <Text style={styles.meta}>{row.conversion_rate ?? 0}% chốt</Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 22,
    backgroundColor: Colors.surfaceSoft,
  },
  rankTop: {
    color: '#fff',
  },
  body: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', minWidth: 44 },
  dealCount: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  kpiScore: {
    color: Colors.green,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  kpiScoreDown: { color: Colors.red },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  barTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: Radii.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSoft,
  },
  barSeg: {
    minWidth: 2,
  },
  meta: {
    color: Colors.textFaint,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
});
