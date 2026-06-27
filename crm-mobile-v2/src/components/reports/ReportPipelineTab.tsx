import Ionicons from '@expo/vector-icons/Ionicons';

import React, { useMemo } from 'react';

import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { EmployeeReportQuery, OrgOverviewReport } from '../../api/employeeReport';

import { buildFunnelChart } from '../../lib/reportChartData';

import { useOrgActivityFeed } from '../../hooks/useOrgActivityFeed';

import { formatCompareTrend } from '../../lib/reportCompare';

import { formatVndShort } from '../../lib/reportFormat';

import { reportPipelineKpiValue } from '../../lib/reportKpiDisplay';

import { Radii, useColors, type ThemeColors } from '../../theme';

import ReportChartCard from './charts/ReportChartCard';

import ReportHorizontalFunnelChart from './charts/ReportHorizontalFunnelChart';

import ReportRecentActivityFeed from './ReportRecentActivityFeed';



type Props = {
  report: OrgOverviewReport;
  activityQuery: EmployeeReportQuery;
};



export default function ReportPipelineTab({ report, activityQuery }: Props) {

  const Colors = useColors();

  const styles = useMemo(() => makeStyles(Colors), [Colors]);



  const funnel = useMemo(() => buildFunnelChart(report.pipeline_funnel || []), [report.pipeline_funnel]);

  const summary = report.summary;

  const pipelineTotal = reportPipelineKpiValue(summary);

  const funnelDealTotal = funnel.reduce((s, d) => s + (d.count ?? 0), 0);



  const pipelineCompare = formatCompareTrend(report.compare, 'pipeline_value');

  const pipelineTrend = pipelineCompare.text;

  const pipelineUp = pipelineCompare.up;



  const { items: activityItems, loading: activityLoading } = useOrgActivityFeed(activityQuery);



  return (

    <>

      <ReportChartCard

        title="Pipeline theo giai đoạn"

        subtitle="Số deal · Tỷ lệ · Giá trị"

        empty={funnel.length === 0}

        headerRight={(

          <Text style={styles.headerValue}>{formatVndShort(pipelineTotal)}</Text>

        )}

        footer={(

          <View style={styles.footerRow}>

            <Text style={styles.footerLabel}>Tổng pipeline</Text>

            <View style={styles.footerRight}>

              <Text style={styles.footerValue}>{formatVndShort(pipelineTotal)}</Text>

              {pipelineTrend ? (

                <Text style={[styles.footerTrend, pipelineUp === false && styles.footerTrendDown]}>

                  {pipelineTrend} so kỳ trước

                </Text>

              ) : null}

            </View>

          </View>

        )}

      >

        {funnel.map((row) => {

          const pct = funnelDealTotal > 0

            ? Math.round(((row.count ?? 0) / funnelDealTotal) * 100)

            : 0;

          const barStyle: ViewStyle = {

            width: `${Math.max(6, pct)}%`,

            backgroundColor: row.color || Colors.purple,

          };

          return (

            <View key={row.name} style={styles.stageRow}>

              <View style={styles.stageHead}>

                <View style={[styles.dot, { backgroundColor: row.color || Colors.purple }]} />

                <Text style={styles.stageName} numberOfLines={1}>{row.name}</Text>

                <Text style={styles.stageCount}>{row.count ?? 0}</Text>

                <Text style={styles.stagePct}>{pct}%</Text>

              </View>

              <View style={styles.barTrack}>

                <View style={[styles.barFill, barStyle]} />

              </View>

            </View>

          );

        })}

      </ReportChartCard>



      <ReportChartCard

        title="Phễu chuyển đổi"

        subtitle="Tỷ lệ qua từng giai đoạn"

        empty={funnel.length === 0}

      >

        <ReportHorizontalFunnelChart data={funnel} />

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



const makeStyles = (Colors: ThemeColors) => StyleSheet.create({

  headerValue: {

    color: Colors.amber,

    fontSize: 13,

    fontWeight: '900',

  },

  stageRow: {

    marginBottom: 12,

  },

  stageHead: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

    marginBottom: 6,

  },

  dot: {

    width: 8,

    height: 8,

    borderRadius: 4,

  },

  stageName: {

    flex: 1,

    color: Colors.text,

    fontSize: 13,

    fontWeight: '700',

  },

  stageCount: {

    color: Colors.text,

    fontSize: 13,

    fontWeight: '800',

    minWidth: 28,

    textAlign: 'right',

  },

  stagePct: {

    color: Colors.textMuted,

    fontSize: 12,

    fontWeight: '700',

    minWidth: 36,

    textAlign: 'right',

  },

  barTrack: {

    height: 10,

    borderRadius: Radii.pill,

    backgroundColor: Colors.surfaceSoft,

    overflow: 'hidden',

  },

  barFill: {

    height: '100%',

    borderRadius: Radii.pill,

  },

  footerRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    marginTop: 10,

    paddingTop: 10,

    borderTopWidth: StyleSheet.hairlineWidth,

    borderTopColor: Colors.border,

  },

  footerLabel: {

    color: Colors.textMuted,

    fontSize: 13,

    fontWeight: '700',

  },

  footerRight: { alignItems: 'flex-end' },

  footerValue: {

    color: Colors.text,

    fontSize: 14,

    fontWeight: '900',

  },

  footerTrend: {

    color: Colors.green,

    fontSize: 11,

    fontWeight: '700',

    marginTop: 2,

  },

  footerTrendDown: { color: Colors.red },

});


