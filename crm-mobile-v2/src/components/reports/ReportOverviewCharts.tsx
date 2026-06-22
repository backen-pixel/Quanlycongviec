import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrgOverviewReport } from '../../api/employeeReport';
import {
  buildDealOutcomePie,
  buildDealStackedRows,
  buildFirstStageSlaFromSummary,
  buildFunnelChart,
  buildLeadTypeChartData,
  buildRegionBarChart,
  buildTimelineChart,
} from '../../lib/reportChartData';
import ReportChartCard from './charts/ReportChartCard';
import ReportDonutChart from './charts/ReportDonutChart';
import ReportFirstStageSlaBlock from './charts/ReportFirstStageSlaBlock';
import ReportHorizontalBarChart from './charts/ReportHorizontalBarChart';
import ReportLeadTypeChart from './charts/ReportLeadTypeChart';
import ReportStackedBarChart from './charts/ReportStackedBarChart';
import ReportTimelineChart from './charts/ReportTimelineChart';
import ReportVerticalBarChart from './charts/ReportVerticalBarChart';
import ReportLeadTypeList from './ReportLeadTypeList';
import { useColors, type ThemeColors } from '../../theme';

type Props = {
  report: OrgOverviewReport;
};

export default function ReportOverviewCharts({ report }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const timeline = useMemo(() => buildTimelineChart(report.timeline || []), [report.timeline]);
  const funnel = useMemo(() => buildFunnelChart(report.pipeline_funnel || []), [report.pipeline_funnel]);
  const regionBars = useMemo(() => buildRegionBarChart(report.by_region || []), [report.by_region]);
  const dealPie = useMemo(() => buildDealOutcomePie(report.by_employee || []), [report.by_employee]);
  const employeeStacked = useMemo(
    () => buildDealStackedRows(report.by_employee || [], 'full_name', 8),
    [report.by_employee],
  );
  const leadTypeChart = useMemo(() => buildLeadTypeChartData(report.by_lead_type || []), [report.by_lead_type]);
  const firstStageSla = useMemo(() => buildFirstStageSlaFromSummary(report.summary), [report.summary]);

  return (
    <>
      <ReportChartCard
        title="Xu hướng theo ngày"
        subtitle="Lead / Deal tạo mới trong kỳ"
        empty={timeline.length === 0}
        emptyText="Chưa có dữ liệu xu hướng"
      >
        <ReportTimelineChart data={timeline} />
      </ReportChartCard>

      <ReportChartCard
        title="Kết quả Deal"
        subtitle="Chốt / thua / đang mở (toàn bộ NV trong phạm vi)"
        empty={dealPie.length === 0 && employeeStacked.length === 0}
        emptyText="Chưa có deal trong kỳ"
      >
        {dealPie.length > 0 ? <ReportDonutChart segments={dealPie} /> : null}
        {employeeStacked.length > 0 ? (
          <View style={styles.innerBlock}>
            <Text style={styles.innerTitle}>Top NV — phân bổ deal</Text>
            <ReportStackedBarChart data={employeeStacked} />
          </View>
        ) : null}
      </ReportChartCard>

      <ReportChartCard
        title="Phễu pipeline"
        subtitle="Số lead/deal theo giai đoạn"
        empty={funnel.length === 0}
        emptyText="Chưa có dữ liệu pipeline"
      >
        <ReportHorizontalBarChart data={funnel} />
      </ReportChartCard>

      <ReportChartCard
        title="Theo khu vực"
        subtitle="Top giá trị pipeline"
        empty={regionBars.length === 0}
        emptyText="Chưa có dữ liệu khu vực"
      >
        <ReportVerticalBarChart data={regionBars} />
      </ReportChartCard>

      <ReportChartCard
        title="Theo phân loại Lead/Deal"
        subtitle="Theo loại cấu hình Pipeline"
        empty={leadTypeChart.length === 0}
        emptyText="Chưa có lead/deal gắn phân loại trong kỳ"
      >
        <ReportLeadTypeChart data={leadTypeChart} />
        <ReportLeadTypeList rows={report.by_lead_type || []} />
      </ReportChartCard>

      <ReportChartCard
        title="SLA cột đầu tiên"
        subtitle="Lead/deal đang mở ở cột đầu pipeline"
        empty={!firstStageSla?.open_count}
        emptyText="Chưa có dữ liệu SLA cột đầu"
      >
        <ReportFirstStageSlaBlock sla={firstStageSla} />
      </ReportChartCard>
    </>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  innerBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  innerTitle: { color: Colors.text, fontSize: 13, fontWeight: '800', marginBottom: 8 },
});

/** Biểu đồ trên tab Nhân viên — top NV phân bổ deal */
export function ReportEmployeeListCharts({ report }: Props) {
  const employeeStacked = useMemo(
    () => buildDealStackedRows(report.by_employee || [], 'full_name', 8),
    [report.by_employee],
  );

  if (!employeeStacked.length) return null;

  return (
    <ReportChartCard title="Top NV — phân bổ deal" subtitle="Chốt / thua / đang mở">
      <ReportStackedBarChart data={employeeStacked} />
    </ReportChartCard>
  );
}

/** Biểu đồ stacked deal trên tab Khu vực */
export function ReportRegionCharts({ report }: Props) {
  const regionStacked = useMemo(
    () => buildDealStackedRows(report.by_region || [], 'region_name', 10),
    [report.by_region],
  );

  if (!regionStacked.length) return null;

  return (
    <ReportChartCard title="Deal theo khu vực" subtitle="Chốt / thua / đang mở">
      <ReportStackedBarChart data={regionStacked} />
    </ReportChartCard>
  );
}
