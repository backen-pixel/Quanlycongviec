import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { api } from '../api/client';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

export type ProductCategory = {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  order_index?: number;
};

export default function CategoryListScreen() {
  const [rows, setRows] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ categories?: ProductCategory[] }>('/products/categories');
      setRows(Array.isArray(data?.categories) ? data.categories : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<{ categories?: ProductCategory[] }>('/products/categories');
      setRows(Array.isArray(data?.categories) ? data.categories : []);
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setName('');
    setModal(true);
  };

  const openEdit = (c: ProductCategory) => {
    setEditId(c.id);
    setName(c.name);
    setModal(true);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Thiếu tên', 'Nhập tên nhóm ngành.');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/products/categories/${editId}`, { name: name.trim() });
      } else {
        await api.post('/products/categories', { name: name.trim() });
      }
      setModal(false);
      void onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      Alert.alert('Lỗi', msg || 'Không lưu được');
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
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có nhóm ngành.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, CrmShadow.card]} onPress={() => openEdit(item)} activeOpacity={0.88}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.slug ? <Text style={styles.sub}>slug: {item.slug}</Text> : null}
            </View>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={openCreate} activeOpacity={0.9}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editId ? 'Sửa nhóm' : 'Nhóm mới'}</Text>
            <TextInput
              style={styles.inp}
              placeholder="Tên nhóm ngành"
              placeholderTextColor={CrmColors.gray400}
              value={name}
              onChangeText={setName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setModal(false)}>
                <Text style={styles.btnGhostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPri} onPress={() => void save()} disabled={saving}>
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
  listPad: { padding: 12, paddingBottom: 88 },
  empty: { textAlign: 'center', color: CrmColors.gray500, marginTop: 32 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  chev: { fontSize: 20, color: CrmColors.gray300 },
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
