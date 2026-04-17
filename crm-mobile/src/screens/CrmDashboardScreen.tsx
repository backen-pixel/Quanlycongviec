import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Props = NativeStackScreenProps<MoreStackParamList, 'CrmDashboard'>;

type StageRow = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  count: number;
  value: number;
  weighted?: number;
  is_won?: boolean;
  is_lost?: boolean;
};

type DashboardPayload = {
  pipeline: StageRow[];
  kpis: Record<string, number>;
  recent_quotations?: { id: string; code?: string; title?: string; total?: number; status?: string }[];
  recent_orders?: { id: string; code?: string; title?: string; total?: number; status?: string }[];
};

const KPI_LABELS: Record<string, string> = {
  total_leads: 'Lead trong kỳ',
  converted_to_deals: 'Deal (toàn hệ thống)',
  conversion_rate: 'Tỷ lệ chuyển đổi (%)',
  total_value: 'Giá trị pipeline',
  conversion_value: 'Giá trị thắng / chuyển',
  total_deals: 'Deal trong kỳ',
  won_deals: 'Deal thắng',
  won_rate: 'Tỷ lệ thắng (%)',
  won_value: 'Giá trị deal thắng',
};

export default function CrmDashboardScreen({ route }: Props) {
  const initial = route.params?.initialType === 'deal' ? 'deal' : 'lead';
  const [dashType, setDashType] = useState<'lead' | 'deal'>(initial);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get<DashboardPayload>('/crm/dashboard', { params: { type: dashType } });
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dashType]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: d } = await api.get<DashboardPayload>('/crm/dashboard', { params: { type: dashType } });
      setData(d);
    } catch {
      setData(null);
    } finally {
      setRefreshing(false);
    }
  }, [dashType]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggle, dashType === 'lead' && styles.toggleOn]}
          onPress={() => setDashType('lead')}
        >
          <Text style={[styles.toggleTxt, dashType === 'lead' && styles.toggleTxtOn]}>Lead</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggle, dashType === 'deal' && styles.toggleOn]}
          onPress={() => setDashType('deal')}
        >
          <Text style={[styles.toggleTxt, dashType === 'deal' && styles.toggleTxtOn]}>Deal</Text>
        </TouchableOpacity>
      </View>

      {data?.kpis ? (
        <View style={styles.kpiGrid}>
          {Object.entries(data.kpis).map(([k, v]) => (
            <View key={k} style={[styles.kpiCard, CrmShadow.card]}>
              <Text style={styles.kpiLab}>{KPI_LABELS[k] || k}</Text>
              <Text style={styles.kpiVal}>
                {typeof v === 'number' && (k.includes('rate') || k.includes('Rate')) ? `${v}%` : typeof v === 'number' && k.includes('value') ? formatVnd(v) : String(v)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.secTitle}>Ống bán hàng (theo giai đoạn)</Text>
      {(data?.pipeline || []).map((s) => (
        <View key={s.id} style={[styles.stageRow, CrmShadow.card]}>
          <Text style={styles.stageIcon}>{s.icon || '•'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stageName}>{s.name}</Text>
            <Text style={styles.stageMeta}>
              {s.count} cơ hội · {formatVnd(s.value)}
              {typeof s.weighted === 'number' ? ` · Trọng số ${formatVnd(s.weighted)}` : ''}
            </Text>
          </View>
        </View>
      ))}

      {dashType === 'deal' && data?.recent_quotations?.length ? (
        <>
          <Text style={styles.secTitle}>Báo giá gần đây</Text>
          {data.recent_quotations.map((q) => (
            <View key={q.id} style={[styles.miniRow, CrmShadow.card]}>
              <Text style={styles.miniCode}>{q.code}</Text>
              <Text style={styles.miniTitle} numberOfLines={1}>
                {q.title}
              </Text>
              <Text style={styles.miniAmt}>{formatVnd(q.total)}</Text>
            </View>
          ))}
        </>
      ) : null}

      {dashType === 'deal' && data?.recent_orders?.length ? (
        <>
          <Text style={styles.secTitle}>Đơn hàng gần đây</Text>
          {data.recent_orders.map((o) => (
            <View key={o.id} style={[styles.miniRow, CrmShadow.card]}>
              <Text style={styles.miniCode}>{o.code}</Text>
              <Text style={styles.miniTitle} numberOfLines={1}>
                {o.title}
              </Text>
              <Text style={styles.miniAmt}>{formatVnd(o.total)}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
  },
  toggleOn: { backgroundColor: CrmColors.blue700, borderColor: CrmColors.blue700 },
  toggleTxt: { fontWeight: '700', color: CrmColors.gray700 },
  toggleTxtOn: { color: CrmColors.white },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: {
    width: '48%',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
  },
  kpiLab: { fontSize: 11, color: CrmColors.gray500, fontWeight: '600' },
  kpiVal: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900, marginTop: 6 },
  secTitle: { fontSize: 15, fontWeight: '800', color: CrmColors.gray800, marginBottom: 10, marginTop: 8 },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 8,
  },
  stageIcon: { fontSize: 22 },
  stageName: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  stageMeta: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 10,
    marginBottom: 6,
  },
  miniCode: { fontSize: 12, fontWeight: '800', color: CrmColors.blue700, width: 72 },
  miniTitle: { flex: 1, fontSize: 13, color: CrmColors.gray800 },
  miniAmt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray900 },
});
