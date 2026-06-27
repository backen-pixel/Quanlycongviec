import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgReportCompare, OrgReportRow, ReportTimelineRow } from '../../api/employeeReport';
import { compareTrendUp, formatComparePct, getCompareMetric } from '../../lib/reportCompare';
import { extractSparklineSeries } from '../../lib/reportChartData';
import {
  formatReportDealKpi,
  formatReportPipelineKpi,
  reportDealKpiSub,
} from '../../lib/reportKpiDisplay';
import { Radii, useColors, type ThemeColors } from '../../theme';
import ReportSparkline from './charts/ReportSparkline';

type Props = {
  summary: OrgReportRow;
  compare?: OrgReportCompare | null;
  timeline?: ReportTimelineRow[];
};

type KpiDef = {
  key: string;
  label: string;
  value: string;
  compareKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  bg: string;
  border: string;
  sparkKey: 'lead_count' | 'deal_count' | 'pipeline_value';
  sub: string;
};

export default function ReportKpiRow({ summary, compare, timeline = [] }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const cards: KpiDef[] = useMemo(() => [
    {
      key: 'lead',
      label: 'LEAD',
      value: String(summary.lead_count ?? 0),
      compareKey: 'lead_count',
      icon: 'people-outline',
      accent: '#818CF8',
      bg: 'rgba(99,102,241,0.14)',
      border: 'rgba(99,102,241,0.35)',
      sparkKey: 'lead_count',
      sub: 'Tạo trong kỳ',
    },
    {
      key: 'deal',
      label: 'DEAL',
      value: formatReportDealKpi(summary),
      compareKey: 'deal_count',
      icon: 'briefcase-outline',
      accent: '#34D399',
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(52,211,153,0.38)',
      sparkKey: 'deal_count',
      sub: reportDealKpiSub(),
    },
    {
      key: 'pipeline',
      label: 'PIPELINE',
      value: formatReportPipelineKpi(summary),
      compareKey: 'pipeline_value',
      icon: 'trending-up-outline',
      accent: '#FB923C',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(251,146,60,0.38)',
      sparkKey: 'pipeline_value',
      sub: 'GT hồ sơ kỳ',
    },
  ], [summary]);

  return (
    <View style={styles.row}>
      {cards.map((card) => {
        const cmp = getCompareMetric(compare, card.compareKey);
        const trend = formatComparePct(cmp?.pct, cmp?.delta, card.compareKey);
        const up = compareTrendUp(cmp?.pct, cmp?.delta);
        const spark = extractSparklineSeries(timeline, card.sparkKey, 14);

        return (
          <View
            key={card.key}
            style={[styles.card, { backgroundColor: card.bg, borderColor: card.border }]}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.label, { color: card.accent }]}>{card.label}</Text>
              <View style={[styles.iconWrap, { backgroundColor: `${card.accent}22` }]}>
                <Ionicons name={card.icon} size={14} color={card.accent} />
              </View>
            </View>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {card.value}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>{card.sub}</Text>
            {trend ? (
              <View style={styles.trendRow}>
                <Ionicons
                  name={up === false ? 'arrow-down' : 'arrow-up'}
                  size={11}
                  color={up === false ? Colors.red : Colors.green}
                />
                <Text style={[styles.trend, up === false && styles.trendDown]}>
                  {trend} vs kỳ trước
                </Text>
              </View>
            ) : (
              <Text style={styles.trendMuted}>—</Text>
            )}
            <View style={styles.sparkWrap}>
              <ReportSparkline data={spark} color={card.accent} width={88} height={26} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radii.lg,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 128,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  sub: {
    color: Colors.textFaint,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  trend: {
    color: Colors.green,
    fontSize: 9,
    fontWeight: '700',
    flexShrink: 1,
  },
  trendDown: { color: Colors.red },
  trendMuted: {
    color: Colors.textFaint,
    fontSize: 9,
    marginTop: 4,
    fontWeight: '600',
  },
  sparkWrap: {
    marginTop: 6,
    alignItems: 'flex-start',
  },
});
