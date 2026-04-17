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
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ProductList'>;

type ProductRow = {
  id: string;
  code?: string;
  name: string;
  selling_price?: number;
  status?: string;
  category?: { name?: string } | null;
};

type Props = { navigation: Nav };

export default function ProductListScreen({ navigation }: Props) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ products?: ProductRow[] }>('/products', {
        params: { limit: 100, page: 1, search: q.trim() || undefined, status: 'all' },
      });
      setRows(Array.isArray(data?.products) ? data.products : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<{ products?: ProductRow[] }>('/products', {
        params: { limit: 100, page: 1, search: q.trim() || undefined, status: 'all' },
      });
      setRows(Array.isArray(data?.products) ? data.products : []);
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
          placeholder="Tìm tên sản phẩm…"
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
        ListEmptyComponent={<Text style={styles.empty}>Không có sản phẩm.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, CrmShadow.card]}
            onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
            activeOpacity={0.88}
          >
            <Text style={styles.code}>{item.code || '—'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.sub}>
                {item.category?.name ? `${item.category.name} · ` : ''}
                {formatVnd(item.selling_price)}
                {item.status ? ` · ${item.status}` : ''}
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
        )}
      />
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
  listPad: { paddingHorizontal: 12, paddingBottom: 24 },
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
    gap: 10,
  },
  code: { fontSize: 12, fontWeight: '800', color: CrmColors.blue700, width: 72 },
  name: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray600, marginTop: 4 },
  chev: { fontSize: 20, color: CrmColors.gray300 },
});
