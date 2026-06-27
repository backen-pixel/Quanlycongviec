import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { OrgReportCompare, OrgReportRow } from '../../api/employeeReport';
import { compareTrendUp, formatComparePct, getCompareMetric } from '../../lib/reportCompare';
import { formatVndShort } from '../../lib/reportFormat';
import { Radii, useColors, type ThemeColors } from '../../theme';

type KpiCard = {
  key: string;
  label: string;
  value: string;
  compareKey?: string;
  hideCompare?: boolean;
  sub?: string;
  bg: string;
  border: string;
  accent: string;
};

type Props = {
  summary: OrgReportRow;
  compare?: OrgReportCompare | null;
  /** null/undefined = đang xem tất cả công ty */
  companyId?: string | null;
};

const CARD_W = 132;
const CARD_GAP = 10;

function pipelineDisplayValue(summary: OrgReportRow): number {
  return summary.open_pipeline_value ?? 0;
}

function dealKpiDisplay(summary: OrgReportRow, companyId?: string | null): { value: string; sub: string } {
  const hub = summary.hub_deal_kpi;
  if (companyId && hub != null && hub >= 0) {
    return {
      value: String(hub),
      sub: 'Tab Deal · có SĐT · khớp CRM Hub',
    };
  }
  const merged = summary.deal_has_phone_total;
  if (!companyId && merged != null && merged >= 0) {
    return {
      value: String(merged),
      sub: 'Deal có SĐT · gộp tất cả công ty',
    };
  }
  return {
    value: String(summary.deal_count ?? 0),
    sub: 'Deal tạo trong kỳ · mọi công ty',
  };
}

function buildCards(summary: OrgReportRow, companyId?: string | null): KpiCard[] {
  const dealKpi = dealKpiDisplay(summary, companyId);
  return [
    {
      key: 'lead',
      label: 'LEAD',
      value: String(summary.lead_count ?? 0),
      sub: 'Tạo trong kỳ · khớp CRM Hub',
      bg: 'rgba(47,107,255,0.22)',
      border: 'rgba(47,107,255,0.45)',
      accent: '#5B8CFF',
    },
    {
      key: 'deal',
      label: 'DEAL',
      value: dealKpi.value,
      hideCompare: true,
      sub: dealKpi.sub,
      bg: 'rgba(34,197,94,0.18)',
      border: 'rgba(34,197,94,0.42)',
      accent: '#34D399',
    },
    {
      key: 'pipeline',
      label: 'KỲ VỌNG',
      value: formatVndShort(pipelineDisplayValue(summary)),
      hideCompare: true,
      sub: 'Deal có SĐT · kỳ đã chọn',
      bg: 'rgba(168,85,247,0.18)',
      border: 'rgba(168,85,247,0.42)',
      accent: '#C084FC',
    },
  ];
}

const COMPARE_KEYS: Record<string, string> = {
  lead: 'lead_count',
  deal: 'deal_count',
};

export default function ReportKpiCarousel({ summary, compare, companyId }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const cards = useMemo(() => buildCards(summary, companyId), [summary, companyId]);
  const [page, setPage] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / (CARD_W + CARD_GAP));
    setPage(Math.max(0, Math.min(cards.length - 1, idx)));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>KPI tổng quan</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {cards.map((card) => {
          const compareKey = COMPARE_KEYS[card.key] || card.key;
          const cmp = card.hideCompare ? null : getCompareMetric(compare, compareKey);
          const trend = card.hideCompare ? null : formatComparePct(cmp?.pct, cmp?.delta, compareKey);
          const up = card.hideCompare ? null : compareTrendUp(cmp?.pct, cmp?.delta);
          const sub = card.sub || null;
          return (
            <View
              key={card.key}
              style={[
                styles.card,
                { backgroundColor: card.bg, borderColor: card.border },
              ]}
            >
              <Text style={[styles.cardLabel, { color: card.accent }]}>{card.label}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
              {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
              {trend ? (
                <View style={styles.trendRow}>
                  <Ionicons
                    name={up === false ? 'trending-down' : 'trending-up'}
                    size={12}
                    color={up === false ? Colors.red : Colors.green}
                  />
                  <Text style={[styles.trendText, up === false && styles.trendDown]}>
                    {trend} so với kỳ trước
                  </Text>
                </View>
              ) : card.hideCompare ? (
                <Text style={styles.trendMuted}>Snapshot hiện tại</Text>
              ) : (
                <Text style={styles.trendMuted}>— so với kỳ trước</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.dots}>
        {cards.map((c, i) => (
          <View key={c.key} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: { marginBottom: 4 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  scroll: {
    gap: CARD_GAP,
    paddingRight: 4,
  },
  card: {
    width: CARD_W,
    borderRadius: Radii.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 108,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  cardValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  cardSub: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  trendText: {
    color: Colors.green,
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  trendDown: { color: Colors.red },
  trendMuted: {
    color: Colors.textFaint,
    fontSize: 10,
    marginTop: 8,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.purple,
    width: 16,
  },
});
