import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgReportCompare, OrgReportRow, ReportTimelineRow } from '../../api/employeeReport';
import { formatCompareTrend } from '../../lib/reportCompare';
import { extractSparklineSeries } from '../../lib/reportChartData';
import { formatVndShort } from '../../lib/reportFormat';
import { Radii, Shadow, useColors, type ThemeColors } from '../../theme';
import ReportSparkline from './charts/ReportSparkline';

type Props = {
  summary: OrgReportRow;
  compare?: OrgReportCompare | null;
  timeline?: ReportTimelineRow[];
};

type QuickItem = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  compareKey?: string;
  sparkKey?: 'won_value' | 'deal_count' | 'customer_order_count' | 'lead_count' | 'pipeline_value';
};

export default function ReportQuickOverview({ summary, compare, timeline = [] }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const items: QuickItem[] = useMemo(() => [
    {
      key: 'expected',
      label: 'DT Dự kiến',
      value: formatVndShort(summary.expected_value),
      icon: 'cash-outline',
      accent: '#34D399',
      compareKey: 'expected_value',
      // Không dùng won_value — lệch nghĩa với DT dự kiến.
      sparkKey: 'pipeline_value',
    },
    {
      key: 'orders',
      // Khớp KPI "Đơn hàng" web (BC tổ chức + Tách đơn hàng): deal ở cột Thắng trở đi.
      label: 'Đơn hàng mới',
      value: `${summary.customer_order_count ?? 0}`,
      sub: formatVndShort(summary.customer_order_value),
      icon: 'cart-outline',
      accent: '#22D3EE',
      compareKey: 'customer_order_count',
      sparkKey: 'customer_order_count',
    },
  ], [summary]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Tổng quan nhanh</Text>
        <Text style={styles.sub}>So với kỳ trước</Text>
      </View>
      <View style={styles.grid}>
        {items.map((item) => {
          const { text: trend, up } = item.compareKey
            ? formatCompareTrend(compare, item.compareKey)
            : { text: null, up: null };
          const spark = item.sparkKey
            ? extractSparklineSeries(timeline, item.sparkKey, 10)
            : [];

          return (
            <View key={item.key} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.iconWrap, { backgroundColor: `${item.accent}18` }]}>
                  <Ionicons name={item.icon} size={16} color={item.accent} />
                </View>
                {trend ? (
                  <Text style={[styles.trend, up === false && styles.trendDown]}>
                    {trend}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                {item.value}
              </Text>
              {item.sub ? (
                <Text style={styles.valueSub} numberOfLines={1}>
                  {item.sub}
                </Text>
              ) : null}
              <ReportSparkline data={spark} color={item.accent} width={120} height={22} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: { marginBottom: 14 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  sub: {
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    minHeight: 108,
    ...Shadow.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trend: {
    color: Colors.green,
    fontSize: 10,
    fontWeight: '800',
  },
  trendDown: { color: Colors.red },
  label: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  value: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  valueSub: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
});
