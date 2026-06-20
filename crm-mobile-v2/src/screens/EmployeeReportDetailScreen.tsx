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
} from '../api/employeeReport';
import { formatApiError } from '../api/client';
import Avatar from '../components/Avatar';
import ReportMetricBlock from '../components/reports/ReportMetricBlock';
import { colorFromName } from '../lib/media';
import { formatKpiLedgerNet, formatViDateIso, formatVndShort } from '../lib/reportFormat';
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
  } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number | null>>({});
  const [pipelines, setPipelines] = useState<EmployeePipelineRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmployeePipelineDetail(userId, {
        date_from: dateFrom,
        date_to: dateTo,
        type: typeView,
      });
      setSummary(data.summary || {});
      setPipelines(data.pipelines || []);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [userId, dateFrom, dateTo, typeView]);

  useEffect(() => {
    void load();
  }, [load]);

  const conversionRate = useMemo(() => {
    const deals = Number(summary.deal_count ?? 0);
    const won = Number(summary.won_deal_count ?? 0);
    return deals > 0 ? Math.round((won / deals) * 100) : 0;
  }, [summary]);

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

          <View style={styles.metricsCard}>
            <View style={styles.grid}>
              <ReportMetricBlock label="Lead" value={summary.lead_count ?? 0} tone="blue" />
              <ReportMetricBlock label="Deal" value={summary.deal_count ?? 0} tone="cyan" />
              <ReportMetricBlock label="Dự kiến" value={formatVndShort(summary.expected_value as number)} tone="emerald" />
              <ReportMetricBlock label="Kỳ vọng" value={formatVndShort(summary.weighted_value as number)} tone="amber" />
              <ReportMetricBlock label="Thắng" value={formatVndShort(summary.won_value as number)} tone="sky" />
              <ReportMetricBlock label="Hoàn thành" value={formatVndShort(summary.completed_value as number)} tone="violet" />
              <ReportMetricBlock
                label="Quá hạn"
                value={String(summary.overdue_count ?? 0)}
                tone="rose"
              />
              <ReportMetricBlock
                label="Điểm KPI"
                value={formatKpiLedgerNet(summary.kpi_ledger_net as number)}
                tone="indigo"
              />
            </View>
            <View style={styles.convBox}>
              <Text style={styles.convLabel}>Tỷ lệ chốt deal</Text>
              <Text style={styles.convValue}>{conversionRate}%</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Theo pipeline</Text>
          {pipelines.length === 0 ? (
            <Text style={styles.emptyPipe}>Chưa có dữ liệu pipeline</Text>
          ) : (
            pipelines.map((p, idx) => (
              <View key={`${p.pipeline_id || p.pipeline_name || idx}`} style={styles.pipeCard}>
                <Text style={styles.pipeName}>{p.pipeline_name || 'Pipeline'}</Text>
                <View style={styles.grid}>
                  <ReportMetricBlock label="Lead" value={p.lead_count ?? 0} tone="blue" />
                  <ReportMetricBlock label="Deal" value={p.deal_count ?? 0} tone="cyan" />
                  <ReportMetricBlock label="Chốt" value={p.won_deal_count ?? 0} tone="emerald" />
                  <ReportMetricBlock label="Thua" value={p.lost_deal_count ?? 0} tone="rose" />
                  <ReportMetricBlock label="Đang mở" value={p.open_deal_count ?? 0} tone="amber" />
                  <ReportMetricBlock label="Giá trị" value={formatVndShort(p.total_value)} tone="indigo" />
                </View>
              </View>
            ))
          )}
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
  metricsCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 16,
    ...Shadow.card,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  convBox: {
    marginTop: 12,
    borderRadius: Radii.md,
    backgroundColor: Colors.blueSoft,
    borderWidth: 1,
    borderColor: Colors.blue,
    paddingVertical: 12,
    alignItems: 'center',
  },
  convLabel: { color: Colors.blue, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  convValue: { color: Colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  pipeCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
    ...Shadow.card,
  },
  pipeName: { color: Colors.text, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  emptyPipe: { color: Colors.textFaint, textAlign: 'center', paddingVertical: 20 },
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
