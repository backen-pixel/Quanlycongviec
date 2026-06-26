import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgReportCompare, OrgReportRow } from '../../api/employeeReport';
import { compareTrendUp, formatComparePct, getCompareMetric } from '../../lib/reportCompare';
import { reportClosedWonCount } from '../../lib/reportMetrics';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Activity = {
  key: string;
  label: string;
  value: number;
  compareKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

function buildActivities(summary: OrgReportRow): Activity[] {
  return [
    {
      key: 'lead',
      label: 'Lead mới',
      value: summary.lead_count ?? 0,
      compareKey: 'lead_count',
      icon: 'people-outline',
      color: '#34D399',
      bg: 'rgba(34,197,94,0.16)',
    },
    {
      key: 'deal',
      label: 'Deal mới',
      value: summary.deal_count ?? 0,
      compareKey: 'deal_count',
      icon: 'mail-outline',
      color: '#60A5FA',
      bg: 'rgba(96,165,250,0.16)',
    },
    {
      key: 'won',
      label: 'Chốt deal',
      value: reportClosedWonCount(summary),
      compareKey: 'won_or_later_deal_count',
      icon: 'checkmark-circle-outline',
      color: '#FB923C',
      bg: 'rgba(249,115,22,0.16)',
    },
    {
      key: 'completed',
      label: 'Hoàn thành',
      value: summary.completed_deal_count ?? 0,
      compareKey: 'completed_deal_count',
      icon: 'calendar-outline',
      color: '#C084FC',
      bg: 'rgba(192,132,252,0.16)',
    },
  ];
}

type Props = {
  summary: OrgReportRow;
  compare?: OrgReportCompare | null;
};

export default function ReportActivityList({ summary, compare }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const items = useMemo(() => buildActivities(summary), [summary]);

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const cmp = getCompareMetric(compare, item.compareKey);
        const trend = formatComparePct(cmp?.pct, cmp?.delta, item.compareKey);
        const up = compareTrendUp(cmp?.pct, cmp?.delta);
        return (
          <View key={item.key} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon} size={18} color={item.color} />
            </View>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.value}>{item.value}</Text>
            {trend ? (
              <View style={styles.trend}>
                <Ionicons
                  name={up === false ? 'arrow-down' : 'arrow-up'}
                  size={10}
                  color={up === false ? Colors.red : Colors.green}
                />
                <Text style={[styles.trendText, up === false && styles.trendDown]}>{trend}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  list: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  value: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '900',
    minWidth: 36,
    textAlign: 'right',
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 44,
    justifyContent: 'flex-end',
  },
  trendText: {
    color: Colors.green,
    fontSize: 11,
    fontWeight: '800',
  },
  trendDown: { color: Colors.red },
});
