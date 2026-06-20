import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrgReportRow } from '../../api/employeeReport';
import { formatKpiLedgerNet, formatVndShort } from '../../lib/reportFormat';
import { Radii, Shadow, useColors, type ThemeColors } from '../../theme';
import ReportMetricBlock from './ReportMetricBlock';

type Props = {
  row: OrgReportRow;
  variant: 'company' | 'region';
  onPress: () => void;
};

export default function ReportOrgRowCard({ row, variant, onPress }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const title = variant === 'company'
    ? (row.company_name || 'Công ty')
    : (row.region_name || 'Khu vực');
  const subtitle = variant === 'region' ? (row.company_name || null) : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={variant === 'company' ? 'business-outline' : 'location-outline'}
            size={20}
            color={Colors.blue}
          />
        </View>
        <View style={styles.headBody}>
          <Text style={styles.name} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={styles.rateBadge}>
          <Text style={styles.rateText}>{row.conversion_rate ?? 0}%</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
      </View>

      <View style={styles.grid}>
        <ReportMetricBlock label="Lead" value={row.lead_count ?? 0} tone="blue" />
        <ReportMetricBlock label="Deal" value={row.deal_count ?? 0} tone="cyan" />
        <ReportMetricBlock label="Pipeline" value={formatVndShort(row.pipeline_value)} tone="indigo" />
        <ReportMetricBlock label="Dự kiến" value={formatVndShort(row.expected_value)} tone="emerald" />
        <ReportMetricBlock label="Thắng" value={formatVndShort(row.won_value)} tone="sky" />
        <ReportMetricBlock label="Điểm KPI" value={formatKpiLedgerNet(row.kpi_ledger_net)} tone="violet" />
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
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: Colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBody: { flex: 1, minWidth: 0 },
  name: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
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
