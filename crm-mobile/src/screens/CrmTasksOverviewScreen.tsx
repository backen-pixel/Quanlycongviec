import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { navigationRef } from '../navigation/navigationRef';
import type { MoreStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CrmTasksOverview'>;

type LeadRef = {
  id: string;
  title?: string;
  code?: string;
  type?: string;
  customer?: { id?: string; full_name?: string | null } | null;
};

export type CrmOverviewTask = {
  id: string;
  lead_id: string;
  title: string;
  status: string;
  deadline?: string | null;
  stage_slug?: string | null;
  lead?: LeadRef | null;
};

type Props = { navigation: Nav };

const STATUS_CHIPS: { key: string | null; label: string }[] = [
  { key: null, label: 'Tất cả' },
  { key: 'pending', label: 'Chờ' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed', label: 'Xong' },
];

function goLead(navigation: Nav, leadId: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', {
      screen: 'CrmTab',
      params: { screen: 'LeadDetail', params: { id: leadId } },
    });
    return;
  }
  const p = navigation.getParent() as { navigate: (a: string, b: object) => void } | undefined;
  p?.navigate('CrmTab', { screen: 'LeadDetail', params: { id: leadId } });
}

export default function CrmTasksOverviewScreen({ navigation }: Props) {
  const { user } = useAuth();
  const uid = user?.id || user?.userId || '';
  const [rows, setRows] = useState<CrmOverviewTask[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (status) p.status = status;
    if (mineOnly && uid) p.assignee_id = uid;
    return p;
  }, [status, mineOnly, uid]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CrmOverviewTask[]>('/crm/tasks/overview', { params });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<CrmOverviewTask[]>('/crm/tasks/overview', { params });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [params]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const markDone = (t: CrmOverviewTask) => {
    Alert.alert('Hoàn thành', `Đánh dấu hoàn thành: "${t.title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Hoàn thành',
        onPress: async () => {
          try {
            await api.put(`/crm/leads/${t.lead_id}/tasks/${t.id}`, { status: 'completed' });
            void onRefresh();
          } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            Alert.alert('Lỗi', msg || 'Không cập nhật được');
          }
        },
      },
    ]);
  };

  if (loading && !rows.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.chips}>
        {STATUS_CHIPS.map((c) => (
          <TouchableOpacity
            key={c.label}
            style={[styles.chip, status === c.key && styles.chipOn]}
            onPress={() => setStatus(c.key)}
          >
            <Text style={[styles.chipTxt, status === c.key && styles.chipTxtOn]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.mineRow} onPress={() => setMineOnly((v) => !v)} activeOpacity={0.85}>
        <Text style={styles.mineLab}>{mineOnly ? 'Chỉ việc được giao cho tôi' : 'Mọi việc (theo quyền server)'}</Text>
        <Text style={styles.mineVal}>{mineOnly ? 'Bật' : 'Tắt'}</Text>
      </TouchableOpacity>

      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Không có công việc.</Text>}
        renderItem={({ item: t }) => (
          <TouchableOpacity
            style={[styles.card, CrmShadow.card]}
            onPress={() => goLead(navigation, t.lead_id)}
            activeOpacity={0.88}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t.title}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {t.lead?.code ? `${t.lead.code} · ` : ''}
                {t.lead?.title || 'Lead'}
                {t.lead?.customer?.full_name ? ` · ${t.lead.customer.full_name}` : ''}
              </Text>
              <Text style={styles.meta}>
                {t.status} {t.deadline ? `· Hạn ${new Date(t.deadline).toLocaleDateString('vi-VN')}` : ''}
              </Text>
            </View>
            {t.status !== 'completed' ? (
              <TouchableOpacity style={styles.doneBtn} onPress={() => markDone(t)}>
                <Text style={styles.doneTxt}>Xong</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipOn: { backgroundColor: CrmColors.blue700, borderColor: CrmColors.blue700 },
  chipTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray700 },
  chipTxtOn: { color: CrmColors.white },
  mineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  mineLab: { fontSize: 13, fontWeight: '600', color: CrmColors.gray800, flex: 1, paddingRight: 8 },
  mineVal: { fontSize: 13, fontWeight: '800', color: CrmColors.blue700 },
  listPad: { padding: 12, paddingBottom: 24 },
  empty: { textAlign: 'center', color: CrmColors.gray500, marginTop: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  title: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray600, marginTop: 4 },
  meta: { fontSize: 11, color: CrmColors.gray500, marginTop: 4, textTransform: 'capitalize' },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.emerald600,
  },
  doneTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
