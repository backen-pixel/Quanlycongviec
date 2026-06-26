import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EmployeeReportRow } from '../../api/employeeReport';
import Avatar from '../Avatar';
import { colorFromName } from '../../lib/media';
import { STACK_COLORS } from '../../lib/reportChartData';
import { reportClosedWonCount, reportOpenDealCount } from '../../lib/reportMetrics';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  rank: number;
  row: EmployeeReportRow;
  onPress?: () => void;
};

export default function ReportTopEmployeeRow({ rank, row }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const won = reportClosedWonCount(row);
  const lost = row.lost_deal_count || 0;
  const open = reportOpenDealCount(row);
  const total = won + lost + open || 1;

  return (
    <View style={styles.row}>
      <Text style={styles.rank}>{rank}</Text>
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
          {open > 0 ? (
            <View style={[styles.barSeg, { flex: open, backgroundColor: STACK_COLORS.open }]} />
          ) : null}
          {lost > 0 ? (
            <View style={[styles.barSeg, { flex: lost, backgroundColor: STACK_COLORS.lost }]} />
          ) : null}
        </View>
        <Text style={styles.meta}>{total} deal · {row.conversion_rate ?? 0}% chốt</Text>
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
    width: 18,
    color: Colors.purple,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: { flex: 1, minWidth: 0 },
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
