import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchEmployeePipelineDetail,
  type EmployeePipelineRow,
  type EmployeeTimelineRow,
  type FirstStageSla,
  type LeadTypeReportRow,
} from '../api/employeeReport';
import { formatApiError } from '../api/client';
import Avatar from '../components/Avatar';
import EmployeeReportCharts from '../components/reports/EmployeeReportCharts';
import ReportMetricBlock from '../components/reports/ReportMetricBlock';
import { colorFromName } from '../lib/media';
import { formatViDateIso } from '../lib/reportFormat';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EmployeeReportDetail'>;

export default function EmployeeReportDetailScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {
    userId,
    fullName,
    avatar,
    departmentName,
    dateFrom,
    dateTo,
    typeView = 'all',
    companyId,
    regionId,
  } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number | null>>({});
  const [pipelines, setPipelines] = useState<EmployeePipelineRow[]>([]);
  const [timeline, setTimeline] = useState<EmployeeTimelineRow[]>([]);
  const [byLeadType, setByLeadType] = useState<LeadTypeReportRow[]>([]);
  const [firstStageSla, setFirstStageSla] = useState<FirstStageSla | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmployeePipelineDetail(userId, {
        date_from: dateFrom,
        date_to: dateTo,
        type: typeView,
        ...(companyId ? { company_id: companyId } : {}),
        ...(regionId ? { region_id: regionId } : {}),
      });
      setSummary(data.summary || {});
      setPipelines(data.pipelines || []);
      setTimeline(data.timeline || []);
      setByLeadType(data.by_lead_type || []);
      setFirstStageSla(data.first_stage_sla || null);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [userId, dateFrom, dateTo, typeView, companyId, regionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const conversionRate = useMemo(() => {
    const deals = Number(summary.deal_count ?? 0);
    const won = Number(summary.won_deal_count ?? 0);
    return deals > 0 ? Math.round((won / deals) * 100) : 0;
  }, [summary]);

  const rowSnapshot = useMemo(() => ({
    user_id: userId,
    full_name: fullName,
    lead_count: summary.lead_count ?? undefined,
    deal_count: summary.deal_count ?? undefined,
    won_deal_count: summary.won_deal_count ?? undefined,
    lost_deal_count: summary.lost_deal_count ?? undefined,
    lost_lead_count: summary.lost_lead_count ?? undefined,
    overdue_rate_pct: summary.overdue_rate_pct ?? undefined,
    reception_overdue_rate_pct: summary.reception_overdue_rate_pct ?? undefined,
    first_stage_overdue_rate_pct: summary.first_stage_overdue_rate_pct ?? undefined,
    reception_eligible_count: summary.reception_eligible_count ?? undefined,
    reception_overdue_count: summary.reception_overdue_count ?? undefined,
    conversion_rate: conversionRate,
  }), [userId, fullName, summary, conversionRate]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{fullName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={Colors.blue} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}><Text style={styles.retry}>Thử lại</Text></Pressable>
            </View>
          ) : null}

          <View style={styles.profileCard}>
            <Avatar
              name={fullName}
              size={72}
              color={colorFromName(fullName || userId)}
              avatarUrl={avatar}
            />
            <Text style={styles.profileName}>{fullName}</Text>
            <Text style={styles.profileDept}>{departmentName || '—'}</Text>
            <Text style={styles.profileRange}>
              Kỳ {formatViDateIso(dateFrom)} – {formatViDateIso(dateTo)}
            </Text>
          </View>

          <View style={styles.quickMetrics}>
            <ReportMetricBlock label="Lead" value={summary.lead_count ?? 0} tone="blue" />
            <ReportMetricBlock label="Deal" value={summary.deal_count ?? 0} tone="cyan" />
            <ReportMetricBlock label="Tỷ lệ chốt" value={`${conversionRate}%`} tone="violet" full />
          </View>

          <EmployeeReportCharts
            summary={summary}
            pipelines={pipelines}
            timeline={timeline}
            row={rowSnapshot}
            conversionRate={conversionRate}
            byLeadType={byLeadType}
            firstStageSla={firstStageSla}
          />
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileCard: {
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    marginBottom: 12,
    ...Shadow.card,
  },
  profileName: { color: Colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  profileDept: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  profileRange: { color: Colors.textFaint, fontSize: 12, marginTop: 8 },
  quickMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  errorBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Radii.md,
    backgroundColor: Colors.redSoft,
    borderWidth: 1,
    borderColor: Colors.red,
  },
  errorText: { color: Colors.red, fontSize: 13 },
  retry: { color: Colors.blue, fontWeight: '700', marginTop: 6, fontSize: 13 },
});

