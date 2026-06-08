import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { createDeal } from '../lib/productionApi';
import { HIT_TARGET, Radii, Spacing } from '../theme';

type Props = {
  visible: boolean;
  companyId?: string | null;
  onClose: () => void;
  onCreated: (msg: string) => void;
};

export default function CreateDealModal({ visible, companyId, onClose, onCreated }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, justifyContent: 'flex-end' },
        backdropTouch: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: Spacing.lg,
          paddingTop: 8,
          maxHeight: '90%',
        },
        handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 10 },
        headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
        title: { color: colors.text, fontSize: 18, fontWeight: '800' },
        closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm },
        errBox: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, borderRadius: Radii.md, padding: 10, marginBottom: 12 },
        errText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
        label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 6 },
        input: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.text,
        },
        textarea: { minHeight: 72, textAlignVertical: 'top' },
        row2: { flexDirection: 'row', gap: 10 },
        submitBtn: {
          marginTop: 18,
          backgroundColor: colors.primary,
          borderRadius: Radii.md,
          minHeight: HIT_TARGET + 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        submitDisabled: { opacity: 0.65 },
        submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
      }),
    [colors],
  );

  const reset = () => {
    setTitle('');
    setValue('');
    setCustomer('');
    setPhone('');
    setNotes('');
    setErr('');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const parsedValue = () => {
    const digits = value.replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };

  const submit = async () => {
    setErr('');
    if (!title.trim()) {
      setErr('Nhập tên Deal.');
      return;
    }
    setBusy(true);
    try {
      const res = await createDeal({
        title,
        estimatedValue: parsedValue(),
        customerName: customer,
        customerPhone: phone,
        notes,
        companyId: companyId ?? null,
      });
      reset();
      onCreated(`Đã tạo Deal ${res.code || ''}`.trim());
      onClose();
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const prettyValue = (() => {
    const n = parsedValue();
    if (!n) return '';
    return new Intl.NumberFormat('vi-VN').format(n);
  })();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdropTouch} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tạo Deal mới</Text>
            <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {err ? (
              <View style={styles.errBox}>
                <Text style={styles.errText}>{err}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Tên Deal *</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: Tủ bếp anh Hải - Quận 7"
              placeholderTextColor={colors.textFaint}
              value={title}
              onChangeText={setTitle}
              editable={!busy}
            />

            <Text style={styles.label}>Giá trị (đ)</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: 120.000.000"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              value={prettyValue}
              onChangeText={setValue}
              editable={!busy}
            />

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tên khách hàng</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tùy chọn"
                  placeholderTextColor={colors.textFaint}
                  value={customer}
                  onChangeText={setCustomer}
                  editable={!busy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Số điện thoại</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tùy chọn"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  editable={!busy}
                />
              </View>
            </View>

            <Text style={styles.label}>Ghi chú</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Tùy chọn"
              placeholderTextColor={colors.textFaint}
              value={notes}
              onChangeText={setNotes}
              editable={!busy}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBtn, busy && styles.submitDisabled]}
              onPress={submit}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                  <Text style={styles.submitText}>Tạo Deal</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
