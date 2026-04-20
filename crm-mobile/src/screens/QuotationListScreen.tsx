import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, formatApiError, postMultipart } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import type { ParsedExcelResponse, QuotationRow } from '../types/salesDocs';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'QuotationList'>;

type Props = { navigation: Nav };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  sent: 'Đã gửi',
  accepted: 'Chấp nhận',
  rejected: 'Từ chối',
  expired: 'Hết hạn',
  converted: 'Đã chuyển ĐH',
};

export default function QuotationListScreen({ navigation }: Props) {
  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [parsing, setParsing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<QuotationRow[]>('/crm/quotations', {
        params: { limit: 100, search: q.trim() || undefined },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<QuotationRow[]>('/crm/quotations', {
        params: { limit: 100, search: q.trim() || undefined },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const pickExcel = async () => {
    setParsing(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.name || 'bao-gia.xlsx',
        type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as unknown as Blob);

      const { data } = await postMultipart<ParsedExcelResponse>('/crm/quotations/parse-excel', form);
      navigation.navigate('QuotationExcelReview', { parsed: data });
    } catch (e: unknown) {
      Alert.alert('Không đọc được Excel', formatApiError(e));
    } finally {
      setParsing(false);
    }
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
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Tìm mã, tiêu đề, KH…"
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
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btnPrimary, CrmShadow.card]}
          onPress={() => navigation.navigate('QuotationForm', { mode: 'create' })}
        >
          <Text style={styles.btnPrimaryTxt}>+ Tạo báo giá</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, parsing && styles.btnOff]} onPress={() => void pickExcel()} disabled={parsing}>
          <Text style={styles.btnSecondaryTxt}>{parsing ? 'Đang đọc…' : '↑ Excel'}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Không có báo giá.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, CrmShadow.card]}
            onPress={() => navigation.navigate('QuotationDetail', { id: item.id })}
          >
            <View style={styles.rowTop}>
              <Text style={styles.code}>{item.code}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{STATUS_LABEL[item.status || ''] || item.status || '—'}</Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {item.title || 'Không tiêu đề'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {item.customer_name || '—'}
            </Text>
            <Text style={styles.total}>{formatVnd(item.total)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'center' },
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
  actions: { flexDirection: 'row', paddingHorizontal: 12, gap: 10, marginBottom: 8 },
  btnPrimary: {
    flex: 1,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondary: {
    flexShrink: 0,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray300,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    justifyContent: 'center',
  },
  btnSecondaryTxt: { fontWeight: '800', color: CrmColors.gray800, fontSize: 14 },
  btnOff: { opacity: 0.55 },
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
});
