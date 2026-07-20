import Ionicons from '@expo/vector-icons/Ionicons';

import React, { useMemo, useState } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EmployeeReportRow, OrgOverviewReport } from '../../api/employeeReport';

import { buildRegionBarChart, buildTimelineChart, sliceTimelineLastDays } from '../../lib/reportChartData';

import { filterEmployeesByMode } from '../../lib/reportActivityFeed';
import { formatKpiLedgerNet, formatVndShort } from '../../lib/reportFormat';

import {

  reportClosedWonCount,

  reportClosedWonValue,

  reportKpiValueProgressPct,

} from '../../lib/reportMetrics';

import { Radii, Shadow, useColors, type ThemeColors } from '../../theme';

import ReportChartCard from './charts/ReportChartCard';

import ReportTimelineChart from './charts/ReportTimelineChart';

import ReportVerticalBarChart from './charts/ReportVerticalBarChart';

import ReportTopEmployeeRow from './ReportTopEmployeeRow';



type Props = {

  report: OrgOverviewReport;

  onEmployeePress: (row: EmployeeReportRow) => void;

  onViewAllEmployees: () => void;

};



type EmpFilter = 'all' | 'won' | 'open';



const FILTERS: { key: EmpFilter; label: string }[] = [

  { key: 'all', label: 'Tất cả' },

  { key: 'won', label: 'Chốt nhiều' },

  { key: 'open', label: 'Đang mở' },

];



export default function ReportPerformanceTab({

  report,

  onEmployeePress,

  onViewAllEmployees,

}: Props) {

  const Colors = useColors();

  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const summary = report.summary;

  const [empFilter, setEmpFilter] = useState<EmpFilter>('all');



  const timeline = useMemo(

    () => buildTimelineChart(sliceTimelineLastDays(report.timeline || [], 30)),

    [report.timeline],

  );



  const regionBars = useMemo(

    () => buildRegionBarChart(report.by_region || [], 6),

    [report.by_region],

  );



  const topEmployees = useMemo(() => {

    const sorted = [...(report.by_employee || [])]

      .sort((a, b) => reportClosedWonValue(b) - reportClosedWonValue(a)

        || (b.kpi_ledger_net ?? 0) - (a.kpi_ledger_net ?? 0));

    return filterEmployeesByMode(sorted, empFilter).slice(0, 6);

  }, [report.by_employee, empFilter]);



  const kpiScore = summary.kpi_ledger_net ?? 0;

  // Khớp web BC tổ chức — tách QH SLA Lead / Deal (không trộn tiếp nhận).
  const overdueLead = summary.lead_overdue_count ?? 0;
  const overdueDeal = summary.deal_overdue_count ?? 0;
  const openLead = summary.lead_open_count ?? 0;
  const openDealSla = summary.deal_open_count ?? 0;
  const overdueLeadPct = summary.lead_overdue_rate_pct;
  const overdueDealPct = summary.deal_overdue_rate_pct;
  const overdueLeadSub = overdueLeadPct != null
    ? `${overdueLeadPct}% trên ${openLead} lead đang mở`
    : openLead > 0
      ? `${openLead} lead đang mở`
      : '—';
  const overdueDealSub = overdueDealPct != null
    ? `${overdueDealPct}% trên ${openDealSla} deal đang mở`
    : openDealSla > 0
      ? `${openDealSla} deal đang mở`
      : '—';

  const achieved = reportClosedWonValue(summary);

  const goal = summary.expected_value ?? 0;

  const completionPct = summary.deal_count

    ? Math.min(100, Math.round(((summary.completed_deal_count ?? 0) / summary.deal_count) * 100))

    : reportKpiValueProgressPct(summary);



  return (

    <>

      <View style={styles.kpiGrid}>

        <View style={[styles.kpiHero, styles.kpiHeroBlue]}>

          <Text style={styles.kpiHeroLabel}>ĐIỂM KPI</Text>

          <Text style={[styles.kpiHeroValue, { color: '#60A5FA' }]}>

            {formatKpiLedgerNet(kpiScore)}

          </Text>

          <Text style={styles.kpiHeroSub}>Xếp hạng tháng</Text>

        </View>

        <View style={[styles.kpiHero, styles.kpiHeroRed]}>

          <Text style={styles.kpiHeroLabel}>QH SLA LEAD</Text>

          <Text style={[styles.kpiHeroValue, { color: Colors.red }]}>{overdueLead}</Text>

          <Text style={[styles.kpiHeroSub, { color: Colors.red }]}>{overdueLeadSub}</Text>

        </View>

        <View style={[styles.kpiHero, styles.kpiHeroRed]}>

          <Text style={styles.kpiHeroLabel}>QH SLA DEAL</Text>

          <Text style={[styles.kpiHeroValue, { color: Colors.red }]}>{overdueDeal}</Text>

          <Text style={[styles.kpiHeroSub, { color: Colors.red }]}>{overdueDealSub}</Text>

        </View>

        <View style={[styles.kpiHero, styles.kpiHeroGreen]}>

          <Text style={styles.kpiHeroLabel}>DT THỰC HIỆN</Text>

          <Text style={styles.kpiHeroValue}>{formatVndShort(achieved)}</Text>

          <Text style={styles.kpiHeroSub}>/ Mục tiêu {formatVndShort(goal)}</Text>

        </View>

        <View style={[styles.kpiHero, styles.kpiHeroAmber]}>

          <Text style={styles.kpiHeroLabel}>TỶ LỆ HOÀN THÀNH</Text>

          <Text style={[styles.kpiHeroValue, { color: Colors.amber }]}>{completionPct}%</Text>

          <View style={styles.progressTrack}>

            <View style={[styles.progressFill, { width: `${completionPct}%` }]} />

          </View>

        </View>

      </View>



      <ReportChartCard

        title="Xu hướng 30 ngày"

        subtitle="Lead · Deal · GT chốt (tỷ)"

        empty={timeline.length === 0}

        headerRight={(

          <View style={styles.badge}>

            <Text style={styles.badgeText}>30 ngày</Text>

          </View>

        )}

      >

        <ReportTimelineChart data={timeline} height={200} />

      </ReportChartCard>



      <ReportChartCard

        title="Top nhân viên"

        actionLabel="Xem tất cả"

        onAction={onViewAllEmployees}

        empty={topEmployees.length === 0}

      >

        <View style={styles.filterRow}>

          {FILTERS.map((f) => {

            const active = empFilter === f.key;

            return (

              <Pressable

                key={f.key}

                style={[styles.filterChip, active && styles.filterChipActive]}

                onPress={() => setEmpFilter(f.key)}

              >

                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>

              </Pressable>

            );

          })}

        </View>

        {topEmployees.map((row, i) => (

          <Pressable key={row.user_id || i} onPress={() => onEmployeePress(row)}>

            <ReportTopEmployeeRow rank={i + 1} row={row} showKpi />

          </Pressable>

        ))}

        <View style={styles.legendRow}>

          <LegendDot color="#059669" label="Chốt" />

          <LegendDot color="#e11d48" label="Thua" />

          <LegendDot color="#A855F7" label="Đang mở" />

        </View>

      </ReportChartCard>



      <ReportChartCard

        title="Pipeline theo khu vực"

        subtitle="Giá trị deal đang mở"

        empty={regionBars.length === 0}

      >

        <ReportVerticalBarChart
          data={regionBars}
          height={220}
          barColor={Colors.purple}
          valueFormatter={formatVndShort}
          showBarLabels
        />

      </ReportChartCard>

    </>

  );

}



function LegendDot({ color, label }: { color: string; label: string }) {

  const Colors = useColors();

  return (

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>

      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />

      <Text style={{ color: Colors.textMuted, fontSize: 10, fontWeight: '600' }}>{label}</Text>

    </View>

  );

}



const makeStyles = (Colors: ThemeColors) => StyleSheet.create({

  kpiGrid: {

    flexDirection: 'row',

    flexWrap: 'wrap',

    gap: 8,

    marginBottom: 14,

  },

  kpiHero: {

    width: '48%',

    flexGrow: 1,

    borderRadius: Radii.lg,

    borderWidth: 1,

    padding: 12,

    minHeight: 96,

    ...Shadow.card,

  },

  kpiHeroBlue: {

    backgroundColor: 'rgba(96,165,250,0.08)',

    borderColor: 'rgba(96,165,250,0.25)',

  },

  kpiHeroRed: {

    backgroundColor: 'rgba(239,68,68,0.08)',

    borderColor: 'rgba(239,68,68,0.25)',

  },

  kpiHeroGreen: {

    backgroundColor: 'rgba(34,197,94,0.08)',

    borderColor: 'rgba(34,197,94,0.25)',

  },

  kpiHeroAmber: {

    backgroundColor: 'rgba(251,146,60,0.08)',

    borderColor: 'rgba(251,146,60,0.25)',

  },

  kpiHeroLabel: {

    color: Colors.textFaint,

    fontSize: 9,

    fontWeight: '800',

    letterSpacing: 0.4,

    marginBottom: 4,

  },

  kpiHeroValue: {

    color: Colors.text,

    fontSize: 22,

    fontWeight: '900',

  },

  kpiHeroSub: {

    color: Colors.textMuted,

    fontSize: 10,

    fontWeight: '600',

    marginTop: 4,

  },

  progressTrack: {

    height: 6,

    borderRadius: Radii.pill,

    backgroundColor: Colors.surfaceSoft,

    marginTop: 8,

    overflow: 'hidden',

  },

  progressFill: {

    height: '100%',

    borderRadius: Radii.pill,

    backgroundColor: Colors.amber,

  },

  badge: {

    paddingHorizontal: 10,

    paddingVertical: 4,

    borderRadius: 999,

    backgroundColor: 'rgba(168,85,247,0.16)',

    borderWidth: 1,

    borderColor: 'rgba(168,85,247,0.35)',

  },

  badgeText: {

    color: Colors.purple,

    fontSize: 10,

    fontWeight: '800',

  },

  filterRow: {

    flexDirection: 'row',

    gap: 6,

    marginBottom: 8,

  },

  filterChip: {

    paddingHorizontal: 10,

    paddingVertical: 5,

    borderRadius: 999,

    borderWidth: 1,

    borderColor: Colors.border,

    backgroundColor: Colors.surfaceSoft,

  },

  filterChipActive: {

    backgroundColor: 'rgba(168,85,247,0.16)',

    borderColor: Colors.purple,

  },

  filterText: {

    color: Colors.textMuted,

    fontSize: 11,

    fontWeight: '700',

  },

  filterTextActive: {

    color: Colors.purple,

  },

  legendRow: {

    flexDirection: 'row',

    gap: 12,

    marginTop: 8,

    justifyContent: 'center',

  },

});


