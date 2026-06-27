import Ionicons from '@expo/vector-icons/Ionicons';

import React, { useMemo } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { OrgOverviewReport } from '../../api/employeeReport';

import {

  buildDealOutcomePieFromSummary,

  buildTimelineChart,

  sliceTimelineLastDays,

} from '../../lib/reportChartData';

import { formatCompareTrend } from '../../lib/reportCompare';

import { Radii, useColors, type ThemeColors } from '../../theme';

import ReportKpiRow from './ReportKpiRow';

import ReportQuickOverview from './ReportQuickOverview';

import ReportChartCard from './charts/ReportChartCard';

import ReportDonutChart from './charts/ReportDonutChart';

import ReportTimelineChart from './charts/ReportTimelineChart';



type Props = {

  report: OrgOverviewReport;

  onViewPerformance?: () => void;

};



export default function ReportOverviewTab({ report, onViewPerformance }: Props) {

  const Colors = useColors();

  const styles = useMemo(() => makeStyles(Colors), [Colors]);



  const timelineFull = useMemo(() => buildTimelineChart(report.timeline || []), [report.timeline]);

  const timeline = useMemo(

    () => buildTimelineChart(sliceTimelineLastDays(report.timeline || [], 14)),

    [report.timeline],

  );

  const dealPie = useMemo(() => buildDealOutcomePieFromSummary(report.summary), [report.summary]);

  const conversionRate = report.summary.conversion_rate ?? 0;

  const { text: convTrend, up: convUp } = formatCompareTrend(report.compare, 'conversion_rate');



  return (

    <>

      <ReportKpiRow

        summary={report.summary}

        compare={report.compare}

        timeline={report.timeline}

      />



      <ReportChartCard

        title="Xu hướng Lead & Deal"

        subtitle="Lead · Deal · GT chốt (tỷ)"

        empty={timeline.length === 0}

        headerRight={(

          <View style={styles.windowChip}>

            <Text style={styles.windowText}>14 ngày</Text>

          </View>

        )}

      >

        <ReportTimelineChart data={timeline} />

      </ReportChartCard>



      <ReportChartCard

        title="Kết quả Deal"

        subtitle="Chốt · Thua · Đang mở"

        empty={dealPie.length === 0}

        footer={(

          <View style={styles.convFooter}>

            <Text style={styles.convLabel}>Tỷ lệ chốt:</Text>

            <Text style={styles.convValue}>{conversionRate}%</Text>

            {convTrend ? (

              <View style={styles.convTrendRow}>

                <Ionicons

                  name={convUp === false ? 'arrow-down' : 'arrow-up'}

                  size={12}

                  color={convUp === false ? Colors.red : Colors.green}

                />

                <Text style={[styles.convTrend, convUp === false && styles.convTrendDown]}>

                  {convTrend} kỳ trước

                </Text>

              </View>

            ) : null}

          </View>

        )}

      >

        <ReportDonutChart segments={dealPie} layout="side" />

      </ReportChartCard>



      <ReportQuickOverview

        summary={report.summary}

        compare={report.compare}

        timeline={timelineFull}

      />



      {onViewPerformance ? (

        <Pressable style={styles.cta} onPress={onViewPerformance}>

          <Ionicons name="analytics-outline" size={18} color={Colors.white} />

          <Text style={styles.ctaText}>Xem thêm phân tích chi tiết</Text>

          <Ionicons name="chevron-forward" size={16} color={Colors.white} />

        </Pressable>

      ) : null}

    </>

  );

}



const makeStyles = (Colors: ThemeColors) => StyleSheet.create({

  windowChip: {

    paddingHorizontal: 10,

    paddingVertical: 4,

    borderRadius: 999,

    backgroundColor: 'rgba(168,85,247,0.16)',

    borderWidth: 1,

    borderColor: 'rgba(168,85,247,0.35)',

  },

  windowText: {

    color: Colors.purple,

    fontSize: 10,

    fontWeight: '800',

  },

  convFooter: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 6,

    marginTop: 10,

    paddingTop: 10,

    borderTopWidth: StyleSheet.hairlineWidth,

    borderTopColor: Colors.border,

  },

  convLabel: {

    color: Colors.textMuted,

    fontSize: 13,

    fontWeight: '600',

  },

  convValue: {

    color: Colors.green,

    fontSize: 16,

    fontWeight: '900',

  },

  convTrendRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 2,

  },

  convTrend: {

    color: Colors.green,

    fontSize: 12,

    fontWeight: '700',

  },

  convTrendDown: { color: Colors.red },

  cta: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 8,

    backgroundColor: Colors.purple,

    borderRadius: Radii.lg,

    paddingVertical: 14,

    paddingHorizontal: 16,

    marginBottom: 8,

  },

  ctaText: {

    flex: 1,

    color: Colors.white,

    fontSize: 14,

    fontWeight: '800',

    textAlign: 'center',

  },

});


