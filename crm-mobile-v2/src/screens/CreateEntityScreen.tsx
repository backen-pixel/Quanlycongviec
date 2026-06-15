import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { createEntity } from '../api/crm';
import { currentUserId, useAuth } from '../context/AuthContext';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateEntity'>;

function Field({
  label,
  placeholder,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (t: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.textFaint}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export default function CreateEntityScreen({ navigation, route }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isLead = route.params.kind === 'lead';
  const accent = isLead ? Colors.blue : Colors.orange;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Thiếu thông tin', 'Nhập tên khách hàng.');
      return;
    }
    if (!isLead && !phone.trim()) {
      Alert.alert('Thiếu thông tin', 'Deal cần số điện thoại khách hàng.');
      return;
    }
    setSaving(true);
    try {
      await createEntity({
        kind: route.params.kind,
        name,
        phone,
        value: value ? parseFloat(value.replace(/[^\d]/g, '')) : 0,
        note,
        assigneeId: isLead ? currentUserId(user) : null,
      });
      Alert.alert('Thành công', isLead ? 'Đã tạo Lead mới.' : 'Đã tạo Deal mới.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={26} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isLead ? 'Thêm Lead' : 'Thêm Deal'}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.banner, { backgroundColor: accent + '1A', borderColor: accent }]}>
          <Ionicons name={isLead ? 'person-add' : 'pricetags'} size={20} color={accent} />
          <Text style={[styles.bannerTxt, { color: accent }]}>
            {isLead ? 'Tạo khách hàng tiềm năng mới' : 'Tạo cơ hội bán hàng / báo giá mới'}
          </Text>
        </View>

        <Field label="Tên khách hàng" placeholder="VD: Nguyễn Văn A" value={name} onChange={setName} />
        <Field label="Số điện thoại" placeholder="VD: 0909 xxx xxx" value={phone} onChange={setPhone} keyboardType="phone-pad" />
        {!isLead ? (
          <Field label="Giá trị dự kiến" placeholder="VD: 120.000.000" value={value} onChange={setValue} keyboardType="numeric" />
        ) : null}
        <View style={styles.field}>
          <Text style={styles.label}>Ghi chú</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Mô tả nhu cầu, nguồn khách..."
            placeholderTextColor={Colors.textFaint}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: accent }, saving && { opacity: 0.7 }]}
          onPress={() => void save()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveTxt}>{isLead ? 'Lưu Lead' : 'Lưu Deal'}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: Radii.md,
    borderWidth: 1,
    marginBottom: 18,
  },
  bannerTxt: { fontSize: 14, fontWeight: '700', flex: 1 },
  field: { marginBottom: 16 },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: Radii.md,
    marginTop: 8,
  },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
