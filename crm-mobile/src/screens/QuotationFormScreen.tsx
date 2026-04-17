import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import type { QuotationItemPayload } from '../types/salesDocs';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'QuotationForm'>;

type Line = QuotationItemPayload & { _key: string };

function newKey() {
  return `k_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function toLine(p: QuotationItemPayload): Line {
  return {
    _key: newKey(),
    name: p.name,
    description: p.description ?? null,
    unit: p.unit || 'bộ',
    quantity: p.quantity ?? 1,
    unit_price: p.unit_price ?? 0,
    spec_factor: p.spec_factor ?? 0,
    discount_percent: p.discount_percent ?? 0,
    vat_rate: p.vat_rate ?? 0,
    group_name: p.group_name ?? null,
    notes: p.notes ?? null,
  };
}

const STATUS_OPTS = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;

export default function QuotationFormScreen({ route, navigation }: Props) {
  const { mode, id } = route.params;
  const isEdit = mode === 'edit' && id;

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Sửa báo giá' : 'Tạo báo giá' });
  }, [isEdit, navigation]);

  const [loading, setLoading] = useState(!!isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('0');
  const [lines, setLines] = useState<Line[]>([]);

  const load = useCallback(async () => {
    if (!isEdit || !id) return;
    setLoading(true);
    try {
      const { data } = await api.get<{
        title?: string | null;
        customer_name?: string | null;
        customer_phone?: string | null;
        customer_address?: string | null;
        notes?: string | null;
        valid_until?: string | null;
        status?: string | null;
        discount_type?: string | null;
        discount_value?: number | null;
        items?: QuotationItemPayload[];
      }>(`/crm/quotations/${id}`);
      setTitle(data.title || '');
      setCustomerName(data.customer_name || '');
      setCustomerPhone(data.customer_phone || '');
      setCustomerAddress(data.customer_address || '');
      setNotes(data.notes || '');
      setValidUntil((data.valid_until || '').slice(0, 10));
      setStatus(data.status || 'draft');
      setDiscountType((data.discount_type as 'percent' | 'amount') || 'percent');
      setDiscountValue(String(data.discount_value ?? 0));
      const its = (data.items || []).map((it) =>
        toLine({
          name: it.name || '',
          unit: it.unit || 'bộ',
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          spec_factor: Number(it.spec_factor) || 0,
          discount_percent: Number(it.discount_percent) || 0,
          vat_rate: Number(it.vat_rate) || 0,
          description: it.description,
          notes: it.notes,
          group_name: it.group_name,
        }),
      );
      setLines(its.length ? its : [toLine({ name: '', unit: 'bộ', quantity: 1, unit_price: 0, vat_rate: 0 })]);
    } catch {
      Alert.alert('Lỗi', 'Không tải được báo giá');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, navigation]);

  useEffect(() => {
    if (isEdit) void load();
    else {
      setLines([toLine({ name: '', unit: 'bộ', quantity: 1, unit_price: 0, vat_rate: 10 })]);
    }
  }, [isEdit, load]);

  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l._key !== key)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, toLine({ name: '', unit: 'bộ', quantity: 1, unit_price: 0, vat_rate: 10 })]);
  };

  const payloadItems = (): QuotationItemPayload[] =>
    lines
      .filter((l) => (l.name || '').trim().length > 0)
      .map(({ _key: _k, ...rest }) => ({
        ...rest,
        name: (rest.name || '').trim(),
        quantity: Number(rest.quantity) || 1,
        unit_price: Number(rest.unit_price) || 0,
        spec_factor: Number(rest.spec_factor) || 0,
        discount_percent: Number(rest.discount_percent) || 0,
        vat_rate: Number(rest.vat_rate) || 0,
      }));

  const save = async () => {
    const items = payloadItems();
    if (!items.length) {
      Alert.alert('Thiếu hàng', 'Thêm ít nhất một dòng có tên hạng mục.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: title.trim() || null,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_address: customerAddress.trim() || null,
        notes: notes.trim() || null,
        valid_until: validUntil.trim() || null,
        status,
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        items,
      };
      if (isEdit && id) {
        await api.put(`/crm/quotations/${id}`, body);
        Alert.alert('Đã lưu', '', [{ text: 'OK', onPress: () => navigation.navigate('QuotationDetail', { id }) }]);
      } else {
        const { data } = await api.post<{ id: string }>('/crm/quotations', body);
        Alert.alert('Đã tạo', '', [{ text: 'OK', onPress: () => navigation.replace('QuotationDetail', { id: data.id }) }]);
      }
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Tiêu đề</Text>
      <TextInput style={styles.inp} value={title} onChangeText={setTitle} placeholder="VD: Báo giá tủ bếp…" />

      <Text style={styles.label}>Khách hàng</Text>
      <TextInput style={styles.inp} value={customerName} onChangeText={setCustomerName} />
      <TextInput style={styles.inp} value={customerPhone} onChangeText={setCustomerPhone} placeholder="SĐT" keyboardType="phone-pad" />
      <TextInput style={[styles.inp, styles.tarea]} value={customerAddress} onChangeText={setCustomerAddress} placeholder="Địa chỉ" multiline />

      <Text style={styles.label}>Hiệu lực đến (YYYY-MM-DD)</Text>
      <TextInput style={styles.inp} value={validUntil} onChangeText={setValidUntil} placeholder="2026-12-31" />

      {isEdit ? (
        <>
          <Text style={styles.label}>Trạng thái</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {STATUS_OPTS.map((s) => (
              <TouchableOpacity key={s} style={[styles.chip, status === s && styles.chipOn]} onPress={() => setStatus(s)}>
                <Text style={[styles.chipTxt, status === s && styles.chipTxtOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text style={styles.label}>Giảm giá toàn báo giá</Text>
      <View style={styles.row2}>
        <TouchableOpacity style={[styles.mini, discountType === 'percent' && styles.miniOn]} onPress={() => setDiscountType('percent')}>
          <Text style={styles.miniTxt}>%</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mini, discountType === 'amount' && styles.miniOn]} onPress={() => setDiscountType('amount')}>
          <Text style={styles.miniTxt}>Số tiền</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.inp, styles.flex1]}
          value={discountValue}
          onChangeText={setDiscountValue}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </View>

      <Text style={styles.label}>Ghi chú</Text>
      <TextInput style={[styles.inp, styles.tarea]} value={notes} onChangeText={setNotes} multiline />

      <View style={styles.lineHead}>
        <Text style={styles.sec}>Dòng hàng</Text>
        <TouchableOpacity onPress={() => addLine()}>
          <Text style={styles.link}>+ Thêm dòng</Text>
        </TouchableOpacity>
      </View>

      {lines.map((l) => (
        <View key={l._key} style={[styles.lineCard, CrmShadow.card]}>
          <TextInput style={styles.inp} value={l.name} onChangeText={(t) => updateLine(l._key, { name: t })} placeholder="Tên hạng mục *" />
          <View style={styles.row4}>
            <TextInput
              style={[styles.inp, styles.cell]}
              value={String(l.quantity)}
              onChangeText={(t) => updateLine(l._key, { quantity: parseFloat(t) || 0 })}
              keyboardType="decimal-pad"
              placeholder="SL"
            />
            <TextInput style={[styles.inp, styles.cell2]} value={l.unit} onChangeText={(t) => updateLine(l._key, { unit: t })} placeholder="ĐVT" />
            <TextInput
              style={[styles.inp, styles.cell2]}
              value={String(l.unit_price)}
              onChangeText={(t) => updateLine(l._key, { unit_price: parseFloat(t) || 0 })}
              keyboardType="decimal-pad"
              placeholder="Đơn giá"
            />
            <TextInput
              style={[styles.inp, styles.cell]}
              value={String(l.vat_rate)}
              onChangeText={(t) => updateLine(l._key, { vat_rate: parseFloat(t) || 0 })}
              keyboardType="decimal-pad"
              placeholder="VAT%"
            />
          </View>
          <TouchableOpacity onPress={() => removeLine(l._key)}>
            <Text style={styles.del}>Xóa dòng</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={[styles.save, saving && styles.saveOff]} onPress={() => void save()} disabled={saving}>
        <Text style={styles.saveTxt}>{saving ? 'Đang lưu…' : isEdit ? 'Cập nhật' : 'Tạo báo giá'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6, marginTop: 10 },
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
  tarea: { minHeight: 72, textAlignVertical: 'top' },
  chips: { marginBottom: 8, maxHeight: 44 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.full,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 8,
    backgroundColor: CrmColors.white,
  },
  chipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  chipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  chipTxtOn: { color: CrmColors.blue700 },
  row2: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  mini: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: CrmRadii.md, borderWidth: 1, borderColor: CrmColors.gray200, backgroundColor: CrmColors.white },
  miniOn: { borderColor: CrmColors.blue600, backgroundColor: CrmColors.blue50 },
  miniTxt: { fontWeight: '700', fontSize: 13, color: CrmColors.gray800 },
  flex1: { flex: 1, marginBottom: 0 },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  sec: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  link: { fontWeight: '700', color: CrmColors.blue600, fontSize: 14 },
  lineCard: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 10,
  },
  row4: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  cell: { flex: 1, minWidth: 56, marginBottom: 0 },
  cell2: { flex: 1.3, minWidth: 72, marginBottom: 0 },
  del: { color: '#b91c1c', fontWeight: '700', fontSize: 13, marginTop: 8 },
  save: {
    marginTop: 20,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    alignItems: 'center',
  },
  saveOff: { opacity: 0.55 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
