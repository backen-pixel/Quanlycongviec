import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgReportRow } from '../../api/employeeReport';
import { formatVndShort } from '../../lib/reportFormat';
import { reportClosedWonCount, reportClosedWonValue } from '../../lib/reportMetrics';
import { truncLabel } from '../../lib/reportChartData';
import { Radii, useColors, type ThemeColors } from '../../theme';

const REGION_COLORS = ['#6366F1', '#22C55E', '#F97316', '#A855F7', '#06B6D4', '#EC4899'];

type Props = {
  regions: OrgReportRow[];
};

export default function ReportRegionCards({ regions }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const top = useMemo(
    () => [...(regions || [])]
      .sort((a, b) => reportClosedWonValue(b) - reportClosedWonValue(a)
        || (b.pipeline_value ?? 0) - (a.pipeline_value ?? 0))
      .slice(0, 4),
    [regions],
  );

  if (!top.length) {
    return <Text style={styles.empty}>Chưa có dữ liệu khu vực</Text>;
  }

  return (
    <View style={styles.grid}>
      {top.map((r, i) => (
        <View key={String(r.region_id || i)} style={styles.card}>
          <View style={[styles.dot, { backgroundColor: REGION_COLORS[i % REGION_COLORS.length] }]} />
          <Text style={styles.name} numberOfLines={1}>
            {truncLabel(r.region_name, 18)}
          </Text>
          <Text style={styles.value}>{formatVndShort(reportClosedWonValue(r))}</Text>
          <View style={styles.trend}>
            <Ionicons name="stats-chart-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.trendText}>
              {reportClosedWonCount(r)} chốt · PL {formatVndShort(r.pipeline_value)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    width: '48%',
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    minHeight: 92,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  name: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  value: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trendText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    flexShrink: 1,
  },
  empty: {
    color: Colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
