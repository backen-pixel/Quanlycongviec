import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import type { ParsedExcelResponse } from '../types/salesDocs';
import { mapParsedItemsToQuotationItems } from '../lib/mapExcelParseToQuotationItems';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Props = NativeStackScreenProps<MoreStackParamList, 'QuotationExcelReview'>;

export default function QuotationExcelReviewScreen({ route, navigation }: Props) {
  const raw = route.params.parsed as ParsedExcelResponse;
  const mapped = useMemo(() => mapParsedItemsToQuotationItems(raw), [raw]);

  const [title, setTitle] = useState(raw.title || '');
  const [customerName, setCustomerName] = useState(raw.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(raw.customer_phone || '');
  const [customerAddress, setCustomerAddress] = useState(raw.customer_address || '');
  const [notesExtra, setNotesExtra] = useState('');
  const [discountValue, setDiscountValue] = useState(String(mapped.discountValue));
  const [busy, setBusy] = useState(false);

  const notesParts = [];
  if (raw.kts_info) notesParts.push(`KT Phụ trách: ${raw.kts_info}`);
  if (raw.notes) notesParts.push(raw.notes);
  if (notesExtra.trim()) notesParts.push(notesExtra.trim());
  const mergedNotes = notesParts.join('\n\n');

  const previewCount = mapped.items.length;

  const submit = async () => {
    if (!mapped.items.length) {
      Alert.alert('Không có dòng hàng', 'File không có hạng mục sau khi lọc.');
      return;
    }
    setBusy(true);
    try {
      const dv = Math.max(0, parseFloat(discountValue) || 0);
      const { data } = await api.post<{ id: string }>('/crm/quotations', {
        title: title.trim() || `Báo giá ${customerName || 'Excel'}`.trim(),
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_address: customerAddress.trim() || null,
        notes: mergedNotes || null,
        items: mapped.items,
        discount_type: 'amount',
        discount_value: dv,
        payment_terms: 'Thanh toán theo thỏa thuận hợp đồng',
      });
      Alert.alert('Đã tạo báo giá', '', [
        { text: 'Xem', onPress: () => navigation.replace('QuotationDetail', { id: data.id }) },
      ]);
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tạo được');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.kicker}>Review import Excel</Text>
      <Text style={styles.h1}>Kiểm tra trước khi lưu</Text>
      <Text style={styles.meta}>{previewCount} dòng hàng · Tổng gợi ý file: {formatVnd(raw.summary?.total)}</Text>

      <Text style={styles.label}>Tiêu đề báo giá</Text>
      <TextInput style={styles.inp} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Khách hàng</Text>
      <TextInput style={styles.inp} value={customerName} onChangeText={setCustomerName} />
      <TextInput style={styles.inp} value={customerPhone} onChangeText={setCustomerPhone} placeholder="SĐT" keyboardType="phone-pad" />
      <TextInput style={[styles.inp, styles.tarea]} value={customerAddress} onChangeText={setCustomerAddress} placeholder="Địa chỉ" multiline />

      <Text style={styles.label}>Giảm giá (số tiền, đồng)</Text>
      <TextInput style={styles.inp} value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" />

      <Text style={styles.label}>Ghi chú thêm</Text>
      <TextInput style={[styles.inp, styles.tarea]} value={notesExtra} onChangeText={setNotesExtra} multiline placeholder="Nối vào cuối ghi chú import" />

      <Text style={styles.sec}>Xem nhanh 10 dòng đầu</Text>
      {mapped.items.slice(0, 10).map((it, idx) => (
        <View key={`${it.name}-${idx}`} style={[styles.row, CrmShadow.card]}>
          <Text style={styles.rowName} numberOfLines={2}>
            {it.name}
          </Text>
          <Text style={styles.rowMeta}>
            {it.quantity} {it.unit} × {formatVnd(it.unit_price)}
            {(it.spec_factor || 0) > 0 ? ` · Hệ số ${it.spec_factor}` : ''}
            {(it.discount_percent || 0) > 0 ? ` · CK ${it.discount_percent}%` : ''}
            {it.vat_rate ? ` · VAT ${it.vat_rate}%` : ''}
          </Text>
        </View>
      ))}
      {previewCount > 10 ? <Text style={styles.more}>… và {previewCount - 10} dòng khác</Text> : null}

      <TouchableOpacity style={[styles.cta, busy && styles.ctaOff]} onPress={() => void submit()} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Tạo báo giá từ Excel</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 40 },
  kicker: { fontSize: 11, fontWeight: '600', color: CrmColors.gray500, textTransform: 'uppercase' },
  h1: { fontSize: 20, fontWeight: '800', color: CrmColors.gray900, marginTop: 4, marginBottom: 6 },
  meta: { fontSize: 13, color: CrmColors.gray600, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6, marginTop: 8 },
  inp: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
    marginBottom: 8,
  },
  tarea: { minHeight: 64, textAlignVertical: 'top' },
  sec: { fontSize: 14, fontWeight: '800', color: CrmColors.gray800, marginTop: 16, marginBottom: 8 },
  row: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 10,
    marginBottom: 6,
  },
  rowName: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  rowMeta: { fontSize: 11, color: CrmColors.gray600, marginTop: 4 },
  more: { fontSize: 12, color: CrmColors.gray500, marginBottom: 12 },
  cta: {
    marginTop: 16,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    alignItems: 'center',
  },
  ctaOff: { opacity: 0.6 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
