import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Props = NativeStackScreenProps<MoreStackParamList, 'QuotationDetail'>;

type QItem = {
  id: string;
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number | null;
  vat_rate?: number | null;
};

type QuotationDetail = {
  id: string;
  code?: string;
  title?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  status?: string | null;
  notes?: string | null;
  valid_until?: string | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  items?: QItem[];
};

export default function QuotationDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [doc, setDoc] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<QuotationDetail>(`/crm/quotations/${id}`);
      setDoc(data);
      navigation.setOptions({ title: data.code || 'Báo giá' });
    } catch {
      setDoc(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = () => {
    Alert.alert('Xóa báo giá?', 'Thao tác không hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/crm/quotations/${id}`);
            navigation.goBack();
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không xóa được');
          }
        },
      },
    ]);
  };

  const convertOrder = () => {
    Alert.alert('Chuyển thành đơn hàng?', 'Báo giá sẽ chuyển trạng thái converted.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Chuyển',
        onPress: async () => {
          try {
            const { data } = await api.post<{ id: string; code?: string }>(`/crm/quotations/${id}/convert-to-order`);
            Alert.alert('Đã tạo đơn', data.code || 'Thành công', [
              { text: 'OK', onPress: () => navigation.navigate('OrderDetail', { id: data.id }) },
            ]);
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không chuyển được');
          }
        },
      },
    ]);
  };

  if (loading && !doc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Không tải được báo giá.</Text>
      </View>
    );
  }

  const converted = doc.status === 'converted';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      <View style={[styles.card, CrmShadow.card]}>
        <Text style={styles.title}>{doc.title || '—'}</Text>
        <Text style={styles.line}>KH: {doc.customer_name || '—'}</Text>
        <Text style={styles.line}>SĐT: {doc.customer_phone || '—'}</Text>
        <Text style={styles.line}>Địa chỉ: {doc.customer_address || '—'}</Text>
        {doc.valid_until ? <Text style={styles.line}>Hiệu lực đến: {doc.valid_until}</Text> : null}
        {doc.notes ? (
          <Text style={styles.notes} numberOfLines={8}>
            {doc.notes}
          </Text>
        ) : null}
        <View style={styles.totals}>
          <Text style={styles.tLine}>Trước thuế: {formatVnd(doc.subtotal)}</Text>
          <Text style={styles.tLine}>Giảm giá: {formatVnd(doc.discount_amount)}</Text>
          <Text style={styles.tLine}>VAT: {formatVnd(doc.tax_amount)}</Text>
          <Text style={styles.tGrand}>Tổng: {formatVnd(doc.total)}</Text>
        </View>
      </View>

      <Text style={styles.sec}>Hạng mục ({doc.items?.length || 0})</Text>
      {(doc.items || []).map((it) => (
        <View key={it.id} style={[styles.item, CrmShadow.card]}>
          <Text style={styles.itName}>{it.name}</Text>
          <Text style={styles.itMeta}>
            SL {it.quantity ?? '—'} {it.unit || ''} × {formatVnd(it.unit_price)} → {formatVnd(it.amount)}
            {it.vat_rate ? ` · VAT ${it.vat_rate}%` : ''}
          </Text>
        </View>
      ))}

      <View style={styles.footerBtns}>
        <TouchableOpacity style={styles.btnGhost} onPress={() => navigation.navigate('QuotationForm', { mode: 'edit', id })}>
          <Text style={styles.btnGhostTxt}>Sửa</Text>
        </TouchableOpacity>
        {!converted ? (
          <TouchableOpacity style={styles.btnAccent} onPress={() => void convertOrder()}>
            <Text style={styles.btnAccentTxt}>→ Đơn hàng</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.btnDanger} onPress={() => void remove()}>
          <Text style={styles.btnDangerTxt}>Xóa</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: CrmColors.gray500 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 16,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900, marginBottom: 10 },
  line: { fontSize: 13, color: CrmColors.gray700, marginBottom: 4 },
  notes: { fontSize: 12, color: CrmColors.gray600, marginTop: 10, lineHeight: 18 },
  totals: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: CrmColors.gray200 },
  tLine: { fontSize: 13, color: CrmColors.gray700, marginBottom: 4 },
  tGrand: { fontSize: 16, fontWeight: '800', color: CrmColors.blue700, marginTop: 4 },
  sec: { fontSize: 14, fontWeight: '800', color: CrmColors.gray800, marginBottom: 8 },
  item: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 8,
  },
  itName: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  itMeta: { fontSize: 12, color: CrmColors.gray600, marginTop: 4 },
  footerBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  btnGhost: {
    flexGrow: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderColor: CrmColors.gray300,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    backgroundColor: CrmColors.white,
  },
  btnGhostTxt: { fontWeight: '800', color: CrmColors.gray800 },
  btnAccent: {
    flexGrow: 1,
    minWidth: '30%',
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnAccentTxt: { fontWeight: '800', color: '#fff' },
  btnDanger: {
    flexGrow: 1,
    minWidth: '30%',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnDangerTxt: { fontWeight: '800', color: '#b91c1c' },
});
