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
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Props = NativeStackScreenProps<MoreStackParamList, 'InvoiceDetail'>;

type InvItem = { id: string; name?: string | null; quantity?: number | null; unit?: string | null; unit_price?: number | null; amount?: number | null };

type Payment = {
  id: string;
  amount?: number | null;
  payment_date?: string | null;
  payment_method?: string | null;
  reference_number?: string | null;
  notes?: string | null;
};

type InvoiceDetail = {
  id: string;
  code?: string;
  title?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  subtotal?: number | null;
  total?: number | null;
  paid_amount?: number | null;
  due_date?: string | null;
  notes?: string | null;
  items?: InvItem[];
  payments?: Payment[];
};

export default function InvoiceDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [doc, setDoc] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer');
  const [payRef, setPayRef] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<InvoiceDetail>(`/crm/invoices/${id}`);
      setDoc(data);
      navigation.setOptions({ title: data.code || 'Hóa đơn' });
      const total = Number(data.total) || 0;
      const paid = Number(data.paid_amount) || 0;
      setPayAmount(String(Math.max(0, Math.round(total - paid)) || ''));
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

  const submitPayment = async () => {
    const amt = parseFloat(payAmount.replace(/,/g, '.')) || 0;
    if (amt <= 0) {
      Alert.alert('Số tiền', 'Nhập số tiền thanh toán > 0');
      return;
    }
    setPayBusy(true);
    try {
      await api.post(`/crm/invoices/${id}/payments`, {
        amount: amt,
        payment_method: payMethod,
        reference_number: payRef.trim() || null,
        notes: null,
      });
      setPayOpen(false);
      void load();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không ghi được thanh toán');
    } finally {
      setPayBusy(false);
    }
  };

  const remove = () => {
    Alert.alert('Xóa hóa đơn?', 'Xóa luôn dòng hàng và lịch sử thanh toán.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/crm/invoices/${id}`);
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
        <Text style={styles.err}>Không tải được hóa đơn.</Text>
      </View>
    );
  }

  const total = Number(doc.total) || 0;
  const paid = Number(doc.paid_amount) || 0;
  const rest = Math.max(0, total - paid);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.title}>{doc.title || '—'}</Text>
          <Text style={styles.line}>KH: {doc.customer_name || '—'}</Text>
          <Text style={styles.line}>SĐT: {doc.customer_phone || '—'}</Text>
          {doc.due_date ? <Text style={styles.line}>Hạn TT: {doc.due_date}</Text> : null}
          <Text style={styles.line}>TT: {doc.payment_status || '—'} · {doc.status || '—'}</Text>
          {doc.notes ? (
            <Text style={styles.notes} numberOfLines={6}>
              {doc.notes}
            </Text>
          ) : null}
          <View style={styles.totals}>
            <Text style={styles.tLine}>Tổng: {formatVnd(doc.total)}</Text>
            <Text style={styles.tLine}>Đã thu: {formatVnd(doc.paid_amount)}</Text>
            <Text style={styles.tGrand}>Còn lại: {formatVnd(rest)}</Text>
          </View>
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

        <Text style={styles.sec}>Thanh toán đã ghi</Text>
        {(doc.payments || []).length === 0 ? <Text style={styles.muted}>Chưa có.</Text> : null}
        {(doc.payments || []).map((p) => (
          <View key={p.id} style={[styles.payRow, CrmShadow.card]}>
            <Text style={styles.payAmt}>{formatVnd(p.amount)}</Text>
            <Text style={styles.payMeta}>
              {p.payment_date || '—'} · {p.payment_method || '—'} {p.reference_number ? `· ${p.reference_number}` : ''}
            </Text>
          </View>
        ))}

        <View style={styles.footerBtns}>
          {rest > 0 ? (
            <TouchableOpacity style={styles.btnAccent} onPress={() => setPayOpen(true)}>
              <Text style={styles.btnAccentTxt}>Ghi thanh toán</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.btnDanger} onPress={() => void remove()}>
            <Text style={styles.btnDangerTxt}>Xóa HĐ</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <Pressable style={styles.modalBack} onPress={() => setPayOpen(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ghi nhận thanh toán</Text>
            <Text style={styles.modalLbl}>Số tiền</Text>
            <TextInput style={styles.inp} value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" />
            <Text style={styles.modalLbl}>Hình thức</Text>
            <View style={styles.row2}>
              <TouchableOpacity style={[styles.chip, payMethod === 'transfer' && styles.chipOn]} onPress={() => setPayMethod('transfer')}>
                <Text style={[styles.chipTxt, payMethod === 'transfer' && styles.chipTxtOn]}>Chuyển khoản</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, payMethod === 'cash' && styles.chipOn]} onPress={() => setPayMethod('cash')}>
                <Text style={[styles.chipTxt, payMethod === 'cash' && styles.chipTxtOn]}>Tiền mặt</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLbl}>Tham chiếu (optional)</Text>
            <TextInput style={styles.inp} value={payRef} onChangeText={setPayRef} placeholder="Số GD…" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setPayOpen(false)}>
                <Text style={styles.btnGhostTxt}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnOk, payBusy && styles.btnOff]} disabled={payBusy} onPress={() => void submitPayment()}>
                <Text style={styles.btnOkTxt}>{payBusy ? '…' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  notes: { fontSize: 12, color: CrmColors.gray600, marginTop: 8, lineHeight: 18 },
  totals: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: CrmColors.gray200 },
  tLine: { fontSize: 13, color: CrmColors.gray700, marginBottom: 4 },
  tGrand: { fontSize: 16, fontWeight: '800', color: '#b45309', marginTop: 4 },
  sec: { fontSize: 14, fontWeight: '800', color: CrmColors.gray800, marginBottom: 8, marginTop: 8 },
  muted: { fontSize: 13, color: CrmColors.gray400, marginBottom: 8 },
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
  payRow: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 8,
  },
  payAmt: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  payMeta: { fontSize: 12, color: CrmColors.gray600, marginTop: 4 },
  footerBtns: { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  btnAccent: {
    flex: 1,
    minWidth: 140,
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
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalBox: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    padding: 18,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900, marginBottom: 14 },
  modalLbl: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6, marginTop: 8 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  row2: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
    backgroundColor: CrmColors.white,
  },
  chipOn: { borderColor: CrmColors.blue600, backgroundColor: CrmColors.blue50 },
  chipTxt: { fontWeight: '700', fontSize: 13, color: CrmColors.gray600 },
  chipTxtOn: { color: CrmColors.blue700 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray300,
    alignItems: 'center',
  },
  btnGhostTxt: { fontWeight: '800', color: CrmColors.gray700 },
  btnOk: { flex: 1, paddingVertical: 12, borderRadius: CrmRadii.md, backgroundColor: CrmColors.blue600, alignItems: 'center' },
  btnOkTxt: { fontWeight: '800', color: '#fff' },
  btnOff: { opacity: 0.55 },
});
