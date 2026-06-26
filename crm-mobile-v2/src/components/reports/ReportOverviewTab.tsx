import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgOverviewReport } from '../../api/employeeReport';
import {
  buildDealOutcomePieFromSummary,
  buildFunnelChart,
  buildTimelineChart,
} from '../../lib/reportChartData';
import ReportKpiCarousel from './ReportKpiCarousel';
import ReportChartCard from './charts/ReportChartCard';
import ReportDonutChart from './charts/ReportDonutChart';
import ReportHorizontalBarChart from './charts/ReportHorizontalBarChart';
import ReportTimelineChart from './charts/ReportTimelineChart';

type Props = {
  report: OrgOverviewReport;
};

export default function ReportOverviewTab({ report }: Props) {
  const timeline = useMemo(() => buildTimelineChart(report.timeline || []), [report.timeline]);
  const funnel = useMemo(() => buildFunnelChart(report.pipeline_funnel || []), [report.pipeline_funnel]);
  const dealPie = useMemo(() => buildDealOutcomePieFromSummary(report.summary), [report.summary]);
  const funnelTotal = funnel.reduce((s, d) => s + (d.count ?? 0), 0);

  return (
    <>
      <ReportKpiCarousel summary={report.summary} compare={report.compare} companyId={report.company_id} />

      <ReportChartCard
        title="Xu hướng theo ngày"
        subtitle="Lead · Deal · GT chốt"
        empty={timeline.length === 0}
      >
        <ReportTimelineChart data={timeline} />
      </ReportChartCard>

      <ReportChartCard
        title="Kết quả Deal"
        subtitle="Deal tạo trong kỳ · cột Thắng trở đi (Chốt SL)"
        empty={dealPie.length === 0}
      >
        <ReportDonutChart segments={dealPie} layout="side" />
      </ReportChartCard>

      <ReportChartCard
        title="Pipeline theo giai đoạn"
        subtitle={funnelTotal > 0 ? `${funnelTotal} hồ sơ trong pipeline` : undefined}
        empty={funnel.length === 0}
      >
        <ReportHorizontalBarChart data={funnel} showPct total={funnelTotal} />
      </ReportChartCard>
    </>
  );
}
