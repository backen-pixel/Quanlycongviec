import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EmployeeReportQuery, OrgOverviewReport } from '../../api/employeeReport';
import { useOrgActivityFeed } from '../../hooks/useOrgActivityFeed';
import { CHART_COLORS } from '../../lib/reportChartData';
import { formatCompareTrend } from '../../lib/reportCompare';
import { formatVndShort } from '../../lib/reportFormat';
import {
  reportCancelLostTotal,
  reportClosedWonCount,
  reportClosedWonValue,
  reportDealConversionRate,
  reportOpenDealCount,
} from '../../lib/reportMetrics';
import { useColors, type ThemeColors } from '../../theme';
import ReportChartCard from './charts/ReportChartCard';
import ReportRecentActivityFeed from './ReportRecentActivityFeed';

type Props = {
  report: OrgOverviewReport;
  activityQuery: EmployeeReportQuery;
};

type FlowRow = {
  key: string;
  label: string;
  count: number;
  value?: number;
  hint?: string;
  accent: string;
  compareKey?: string;
};

export default function ReportPipelineTab({ report, activityQuery }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const summary = report.summary;

  const leadCount = Number(summary.lead_count ?? 0) || 0;
  const dealOpen = reportOpenDealCount(summary);
  const orders = Number(summary.customer_order_count ?? 0) || 0;
  const orderValue = Number(summary.customer_order_value ?? 0) || 0;
  const closed = reportClosedWonCount(summary);
  const closedValue = reportClosedWonValue(summary);
  const lost = reportCancelLostTotal(summary);
  const lostDeals = Number(summary.lost_deal_count ?? 0) || 0;
  const conversion = reportDealConversionRate(summary);
  /**
   * GT dự kiến / kỳ vọng — trực tiếp từ org-overview (khớp web tuyệt đối,
   * không qua snapshot Hub — tránh lệch số do khác phạm vi lọc/tính toán).
   */
  const expectedValue = Number(summary.expected_value ?? 0) || 0;
  const weightedValue = Number(summary.weighted_value ?? 0) || 0;

  const flowRows: FlowRow[] = useMemo(() => [
    {
      key: 'lead',
      label: 'Lead',
      count: leadCount,
      hint: 'Trong kỳ lọc',
      accent: CHART_COLORS.lead,
      compareKey: 'lead_count',
    },
    {
      key: 'deal',
      label: 'Deal đang mở',
      count: dealOpen,
      hint: 'Không gồm thua / ĐH',
      accent: CHART_COLORS.deal,
      compareKey: 'deal_count',
    },
    {
      key: 'orders',
      label: 'Đơn hàng',
      count: orders,
      value: orderValue,
      hint: 'Thắng + sau Thắng (BC kỳ)',
      accent: '#22D3EE',
      compareKey: 'customer_order_count',
    },
    {
      key: 'won',
      label: 'Đã chốt',
      count: closed,
      value: closedValue,
      hint: `${conversion}% tỷ lệ chốt`,
      accent: STACK_WON,
      compareKey: 'won_deal_count',
    },
    {
      key: 'lost',
      label: 'Thua / hủy',
      count: lost,
      hint: lostDeals > 0 ? `${lostDeals} deal thua` : undefined,
      accent: '#F43F5E',
      compareKey: 'lost_deal_count',
    },
  ], [
    leadCount, dealOpen, orders, orderValue,
    closed, closedValue, conversion, lost, lostDeals,
  ]);

  const { items: activityItems, loading: activityLoading } = useOrgActivityFeed(activityQuery);

  return (
    <>
      <ReportChartCard
        title="Luồng kỳ"
        subtitle="Khớp BC tổ chức web · theo bộ lọc ngày"
        headerRight={(
          <Text style={styles.headerValue}>{conversion}% chốt</Text>
        )}
        footer={(
          <View style={styles.footerRow}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerLabel}>GT kỳ vọng Deal</Text>
              {expectedValue > 0 ? (
                <Text style={styles.footerHint}>
                  Dự kiến {formatVndShort(expectedValue)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.footerValue}>{formatVndShort(weightedValue)}</Text>
          </View>
        )}
      >
        {flowRows.map((row, idx) => {
          const trend = row.compareKey
            ? formatCompareTrend(report.compare, row.compareKey)
            : { text: null, up: null };
          return (
            <View key={row.key} style={styles.flowRow}>
              <View style={styles.flowLeft}>
                <View style={[styles.flowStep, { backgroundColor: `${row.accent}22` }]}>
                  <Text style={[styles.flowStepText, { color: row.accent }]}>{idx + 1}</Text>
                </View>
                {idx < flowRows.length - 1 ? <View style={styles.flowRail} /> : null}
              </View>
              <View style={styles.flowBody}>
                <View style={styles.flowHead}>
                  <Text style={styles.flowLabel}>{row.label}</Text>
                  <Text style={[styles.flowCount, { color: row.accent }]}>{row.count}</Text>
                </View>
                <View style={styles.flowMeta}>
                  {row.value != null && row.value > 0 ? (
                    <Text style={styles.flowValue}>{formatVndShort(row.value)}</Text>
                  ) : null}
                  {row.hint ? <Text style={styles.flowHint}>{row.hint}</Text> : null}
                  {trend.text ? (
                    <Text style={[
                      styles.flowTrend,
                      trend.up === false && styles.flowTrendDown,
                    ]}>
                      {trend.text} vs kỳ trước
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </ReportChartCard>

      <ReportChartCard
        title="Hoạt động gần đây"
        subtitle="Sự kiện thực · cập nhật realtime"
        empty={!activityLoading && activityItems.length === 0}
      >
        <ReportRecentActivityFeed items={activityItems} loading={activityLoading} />
      </ReportChartCard>
    </>
  );
}

const STACK_WON = '#059669';

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  headerValue: {
    color: Colors.amber,
    fontSize: 13,
    fontWeight: '900',
  },
  flowRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
  },
  flowLeft: {
    width: 28,
    alignItems: 'center',
  },
  flowStep: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowStepText: {
    fontSize: 11,
    fontWeight: '900',
  },
  flowRail: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: 2,
    backgroundColor: Colors.border,
    borderRadius: 1,
  },
  flowBody: {
    flex: 1,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  flowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  flowLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  flowCount: {
    fontSize: 18,
    fontWeight: '900',
  },
  flowMeta: {
    marginTop: 2,
    gap: 2,
  },
  flowValue: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  flowHint: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  flowTrend: {
    color: Colors.green,
    fontSize: 11,
    fontWeight: '700',
  },
  flowTrendDown: { color: Colors.red },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerLeft: { flex: 1, paddingRight: 8 },
  footerLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  footerHint: {
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  footerValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
});
