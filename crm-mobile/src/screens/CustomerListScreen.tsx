import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CustomerList'>;

export type CustomerRow = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
};

type Props = { navigation: Nav };

export default function CustomerListScreen({ navigation }: Props) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CustomerRow[]>('/crm/customers', {
        params: { search: q.trim() || undefined },
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
      const { data } = await api.get<CustomerRow[]>('/crm/customers', {
        params: { search: q.trim() || undefined },
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

  const saveNew = async () => {
    if (!name.trim()) {
      Alert.alert('Thiếu tên', 'Nhập tên khách hàng.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/crm/customers', { full_name: name.trim(), phone: phone.trim() || null });
      setModal(false);
      setName('');
      setPhone('');
      void onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      Alert.alert('Lỗi', msg || 'Không tạo được');
    } finally {
      setSaving(false);
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
          placeholder="Tìm tên, SĐT, email…"
          placeholderTextColor={CrmColors.gray400}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void load()}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.goBtn} onPress={() => void load()}>
          <Text style={styles.goTxt}>Tìm</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Không có khách hàng.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, CrmShadow.card]}
            onPress={() => navigation.navigate('CustomerDetail', { id: item.id })}
            activeOpacity={0.88}
          >
            <Text style={styles.name}>{item.full_name}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[item.phone, item.email, item.company].filter(Boolean).join(' · ') || '—'}
            </Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)} activeOpacity={0.9}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Khách hàng mới</Text>
            <TextInput
              style={styles.inp}
              placeholder="Tên *"
              placeholderTextColor={CrmColors.gray400}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.inp}
              placeholder="Số điện thoại"
              placeholderTextColor={CrmColors.gray400}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setModal(false)}>
                <Text style={styles.btnGhostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPri} onPress={() => void saveNew()} disabled={saving}>
                <Text style={styles.btnPriTxt}>{saving ? '…' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  search: {
    flex: 1,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  goBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CrmColors.blue700,
    borderRadius: CrmRadii.md,
  },
  goTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  listPad: { paddingHorizontal: 12, paddingBottom: 88 },
  empty: { textAlign: 'center', color: CrmColors.gray500, marginTop: 32 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  sub: { fontSize: 13, color: CrmColors.gray600, marginTop: 4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CrmColors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabTxt: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    padding: 18,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900, marginBottom: 14 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 12,
    fontSize: 15,
    marginBottom: 10,
    color: CrmColors.gray900,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  btnGhostTxt: { fontWeight: '700', color: CrmColors.gray600 },
  btnPri: {
    backgroundColor: CrmColors.blue700,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: CrmRadii.md,
  },
  btnPriTxt: { color: '#fff', fontWeight: '800' },
});
