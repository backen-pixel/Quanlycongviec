import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useCrmCompanyFilter } from '../context/CrmCompanyFilterContext';
import CrmCompanyPickerBar from '../components/CrmCompanyPickerBar';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CrmPipelineList'>;

type PipelineRow = {
  id: string;
  name: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  company_id?: string | null;
  company?: { name?: string } | null;
};

type Props = { navigation: Nav };

export default function CrmPipelineListScreen({ navigation }: Props) {
  const {
    showCompanyPicker,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    companyQueryParams,
  } = useCrmCompanyFilter();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PipelineRow[]>('/crm/pipelines');
      let list = Array.isArray(data) ? data : [];
      const cid = companyQueryParams.company_id;
      if (cid) {
        list = list.filter((r) => String(r.company_id || '') === String(cid));
      }
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyQueryParams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<PipelineRow[]>('/crm/pipelines');
      let list = Array.isArray(data) ? data : [];
      const cid = companyQueryParams.company_id;
      if (cid) {
        list = list.filter((r) => String(r.company_id || '') === String(cid));
      }
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [companyQueryParams]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading && !rows.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      ListHeaderComponent={
        <CrmCompanyPickerBar
          visible={showCompanyPicker}
          companies={companies}
          value={selectedCompanyId}
          onChange={setSelectedCompanyId}
        />
      }
      data={rows}
      keyExtractor={(it) => it.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={styles.pad}
      ListEmptyComponent={<Text style={styles.empty}>Không có pipeline.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.card, CrmShadow.card]}
          onPress={() => navigation.navigate('CrmPipelineDetail', { id: item.id })}
          activeOpacity={0.88}
        >
          <Text style={styles.name}>{item.name}</Text>
          {item.company?.name ? <Text style={styles.sub}>Công ty: {item.company.name}</Text> : null}
          <Text style={styles.meta}>
            {item.is_default ? 'Mặc định · ' : ''}
            {item.is_active === false ? 'Ngưng' : 'Đang dùng'}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 12, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: CrmColors.gray500, marginTop: 40 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 16,
    marginBottom: 10,
  },
  name: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  sub: { fontSize: 13, color: CrmColors.gray600, marginTop: 6 },
  meta: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
});
