import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Props = NativeStackScreenProps<MoreStackParamList, 'ProductDetail'>;

type Structure = { id: string; quantity?: number; component?: { name?: string; code?: string; unit?: string; unit_price?: number } };

type ProductPayload = {
  id: string;
  code?: string;
  name: string;
  description?: string | null;
  unit?: string;
  base_price?: number;
  selling_price?: number;
  cost_price?: number;
  vat_rate?: number;
  status?: string;
  material?: string | null;
  category?: { name?: string } | null;
  structures?: Structure[];
  bomCost?: number;
};

export default function ProductDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [product, setProduct] = useState<ProductPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ product: ProductPayload }>(`/products/${id}`);
      setProduct(data?.product || null);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<{ product: ProductPayload }>(`/products/${id}`);
      setProduct(data?.product || null);
    } catch {
      setProduct(null);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: product?.code || product?.name || 'Sản phẩm' });
  }, [navigation, product?.code, product?.name]);

  if (loading && !product) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Không tải được sản phẩm.</Text>
      </View>
    );
  }

  const structs = product.structures || [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={[styles.card, CrmShadow.card]}>
        <Text style={styles.h1}>{product.name}</Text>
        <Text style={styles.meta}>Mã: {product.code || '—'}</Text>
        {product.category?.name ? <Text style={styles.meta}>Nhóm: {product.category.name}</Text> : null}
        <Text style={styles.price}>Giá bán: {formatVnd(product.selling_price)}</Text>
        <Text style={styles.meta}>Giá vốn / giá gốc: {formatVnd(product.cost_price)} / {formatVnd(product.base_price)}</Text>
        <Text style={styles.meta}>VAT: {product.vat_rate ?? '—'}% · Đơn vị: {product.unit || 'cái'}</Text>
        {product.status ? <Text style={styles.meta}>Trạng thái: {product.status}</Text> : null}
        {product.material ? <Text style={styles.desc}>Vật liệu: {product.material}</Text> : null}
        {product.description ? <Text style={styles.desc}>{product.description}</Text> : null}
      </View>

      <Text style={styles.sec}>Cấu trúc / BOM ({structs.length})</Text>
      {typeof product.bomCost === 'number' ? (
        <Text style={styles.bomTotal}>Ước tính chi phí BOM: {formatVnd(product.bomCost)}</Text>
      ) : null}
      {structs.map((s) => (
        <View key={s.id} style={[styles.row, CrmShadow.card]}>
          <Text style={styles.rowTit} numberOfLines={2}>
            {s.component?.name || 'Thành phần'}
          </Text>
          <Text style={styles.rowSub}>
            {s.component?.code ? `${s.component.code} · ` : ''}
            SL {s.quantity ?? '—'} · {formatVnd(s.component?.unit_price)} / {s.component?.unit || 'đơn vị'}
          </Text>
        </View>
      ))}
      {!structs.length ? <Text style={styles.muted}>Chưa có cấu trúc sản phẩm.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: CrmColors.gray600 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 16,
    marginBottom: 16,
  },
  h1: { fontSize: 20, fontWeight: '800', color: CrmColors.gray900 },
  meta: { fontSize: 13, color: CrmColors.gray600, marginTop: 6 },
  price: { fontSize: 17, fontWeight: '800', color: CrmColors.blue800, marginTop: 10 },
  desc: { fontSize: 14, color: CrmColors.gray700, marginTop: 10, lineHeight: 21 },
  sec: { fontSize: 15, fontWeight: '800', color: CrmColors.gray800, marginBottom: 8 },
  bomTotal: { fontSize: 14, fontWeight: '700', color: CrmColors.gray800, marginBottom: 10 },
  row: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 8,
  },
  rowTit: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  rowSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  muted: { fontSize: 13, color: CrmColors.gray500 },
});
