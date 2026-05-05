import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import type { InvoiceRow } from '../types/salesDocs';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';
import { useCrmCompanyFilter } from '../context/CrmCompanyFilterContext';
import CrmCompanyPickerBar from '../components/CrmCompanyPickerBar';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'InvoiceList'>;

type Props = { navigation: Nav };

export default function InvoiceListScreen({ navigation }: Props) {
  const {
    showCompanyPicker,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    companyQueryParams,
  } = useCrmCompanyFilter();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<InvoiceRow[]>('/crm/invoices', {
        params: { limit: 100, search: q.trim() || undefined, ...companyQueryParams },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q, companyQueryParams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<InvoiceRow[]>('/crm/invoices', {
        params: { limit: 100, search: q.trim() || undefined, ...companyQueryParams },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [q, companyQueryParams]);

  useEffect(() => {
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
    <View style={styles.screen}>
      <CrmCompanyPickerBar
        visible={showCompanyPicker}
        companies={companies}
        value={selectedCompanyId}
        onChange={setSelectedCompanyId}
      />
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Tìm mã, tiêu đề…"
          placeholderTextColor={CrmColors.gray400}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void load()}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.btnGo} onPress={() => void load()}>
          <Text style={styles.btnGoTxt}>Tìm</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Không có hóa đơn.</Text>}
        renderItem={({ item }) => {
          const paid = Number(item.paid_amount) || 0;
          const total = Number(item.total) || 0;
          const rest = Math.max(0, total - paid);
          return (
            <TouchableOpacity style={[styles.row, CrmShadow.card]} onPress={() => navigation.navigate('InvoiceDetail', { id: item.id })}>
              <View style={styles.rowTop}>
                <Text style={styles.code}>{item.code}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{item.payment_status || item.status || '—'}</Text>
                </View>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title || '—'}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.customer_name || '—'}
              </Text>
              <Text style={styles.total}>{formatVnd(item.total)}</Text>
              {rest > 0 ? <Text style={styles.debt}>Còn lại: {formatVnd(rest)}</Text> : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', padding: 12, gap: 8 },
  search: {
    flex: 1,
    minWidth: 0,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  btnGo: {
    flexShrink: 0,
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  btnGoTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  listPad: { padding: 12, paddingBottom: 24 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 40 },
  row: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  code: { fontSize: 13, fontWeight: '800', color: CrmColors.blue700 },
  badge: { backgroundColor: CrmColors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '700', color: CrmColors.gray700 },
  title: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  total: { fontSize: 14, fontWeight: '800', color: CrmColors.gray900, marginTop: 8 },
  debt: { fontSize: 12, fontWeight: '700', color: '#b45309', marginTop: 4 },
});
