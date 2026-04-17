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

type Props = NativeStackScreenProps<MoreStackParamList, 'OrderDetail'>;

type OItem = { id: string; name?: string | null; quantity?: number | null; unit?: string | null; unit_price?: number | null; amount?: number | null };

type OrderDetail = {
  id: string;
  code?: string;
  title?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  status?: string | null;
  subtotal?: number | null;
  total?: number | null;
  items?: OItem[];
};

const STATUS_FLOW = ['draft', 'confirmed', 'processing', 'shipped', 'delivered'] as const;

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [doc, setDoc] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<OrderDetail>(`/crm/orders/${id}`);
      setDoc(data);
      navigation.setOptions({ title: data.code || 'Đơn hàng' });
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

  const setStatus = (status: string) => {
    Alert.alert('Đổi trạng thái?', status, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'OK',
        onPress: async () => {
          try {
            await api.put(`/crm/orders/${id}`, { status });
            void load();
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không cập nhật được');
          }
        },
      },
    ]);
  };

  const createInvoice = () => {
    Alert.alert('Tạo hóa đơn?', 'Sao chép dòng hàng từ đơn này.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Tạo',
        onPress: async () => {
          try {
            const { data } = await api.post<{ id: string; code?: string }>(`/crm/orders/${id}/create-invoice`);
            Alert.alert('Đã tạo', data.code || '', [
              { text: 'Xem HĐ', onPress: () => navigation.navigate('InvoiceDetail', { id: data.id }) },
            ]);
            void load();
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tạo được');
          }
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert('Xóa đơn hàng?', 'Không hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/crm/orders/${id}`);
            navigation.goBack();
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không xóa được');
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
        <Text style={styles.err}>Không tải được đơn hàng.</Text>
      </View>
    );
  }

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
        <Text style={styles.line}>Trạng thái: {doc.status}</Text>
        <Text style={styles.tGrand}>Tổng: {formatVnd(doc.total)}</Text>
      </View>

      <Text style={styles.sec}>Trạng thái nhanh</Text>
      <View style={styles.flow}>
        {STATUS_FLOW.map((s) => (
          <TouchableOpacity key={s} style={[styles.flowChip, doc.status === s && styles.flowChipOn]} onPress={() => setStatus(s)}>
            <Text style={[styles.flowTxt, doc.status === s && styles.flowTxtOn]}>{s}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.flowChipDanger} onPress={() => setStatus('cancelled')}>
          <Text style={styles.flowTxtDanger}>Hủy</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sec}>Dòng hàng</Text>
      {(doc.items || []).map((it) => (
        <View key={it.id} style={[styles.item, CrmShadow.card]}>
          <Text style={styles.itName}>{it.name}</Text>
          <Text style={styles.itMeta}>
            {it.quantity} {it.unit || ''} × {formatVnd(it.unit_price)} → {formatVnd(it.amount)}
          </Text>
        </View>
      ))}

      <View style={styles.footerBtns}>
        <TouchableOpacity style={styles.btnAccent} onPress={() => void createInvoice()}>
          <Text style={styles.btnAccentTxt}>+ Hóa đơn</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnDanger} onPress={() => void remove()}>
          <Text style={styles.btnDangerTxt}>Xóa đơn</Text>
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
  title: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900, marginBottom: 8 },
  line: { fontSize: 13, color: CrmColors.gray700, marginBottom: 4 },
  tGrand: { fontSize: 16, fontWeight: '800', color: CrmColors.blue700, marginTop: 10 },
  sec: { fontSize: 14, fontWeight: '800', color: CrmColors.gray800, marginBottom: 8 },
  flow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  flowChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: CrmRadii.full,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  flowChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  flowTxt: { fontSize: 11, fontWeight: '700', color: CrmColors.gray600 },
  flowTxtOn: { color: CrmColors.blue700 },
  flowChipDanger: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: CrmRadii.full,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  flowTxtDanger: { fontSize: 11, fontWeight: '700', color: '#b91c1c' },
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
  footerBtns: { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  btnAccent: {
    flex: 1,
    minWidth: 120,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnAccentTxt: { color: '#fff', fontWeight: '800' },
  btnDanger: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnDangerTxt: { color: '#b91c1c', fontWeight: '800' },
});
