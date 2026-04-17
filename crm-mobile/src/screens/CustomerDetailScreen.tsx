import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { navigationRef } from '../navigation/navigationRef';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVnd } from '../lib/formatVnd';

type Props = NativeStackScreenProps<MoreStackParamList, 'CustomerDetail'>;
type Nav = NativeStackNavigationProp<MoreStackParamList, 'CustomerDetail'>;

type Doc = { id: string; code?: string; title?: string; total?: number; status?: string; payment_status?: string };
type LeadR = { id: string; title?: string; code?: string; estimated_value?: number };

type Overview = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  company?: string | null;
  tax_code?: string | null;
  notes?: string | null;
  leads?: LeadR[];
  quotes?: Doc[];
  orders?: Doc[];
  invoices?: Doc[];
};

function goLead(nav: Nav, leadId: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', {
      screen: 'CrmTab',
      params: { screen: 'LeadDetail', params: { id: leadId } },
    });
    return;
  }
  const p = nav.getParent() as { navigate: (a: string, b: object) => void } | undefined;
  p?.navigate('CrmTab', { screen: 'LeadDetail', params: { id: leadId } });
}

export default function CustomerDetailScreen({ navigation, route }: Props) {
  const { id } = route.params;
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get<Overview>(`/crm/customers-overview/${id}`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: d } = await api.get<Overview>(`/crm/customers-overview/${id}`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: data?.full_name || 'Khách hàng' });
  }, [navigation, data?.full_name]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Không tải được dữ liệu.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={[styles.card, CrmShadow.card]}>
        <Text style={styles.h1}>{data.full_name}</Text>
        {data.phone ? <Text style={styles.line}>📞 {data.phone}</Text> : null}
        {data.email ? <Text style={styles.line}>✉️ {data.email}</Text> : null}
        {data.company ? <Text style={styles.line}>🏢 {data.company}</Text> : null}
        {data.address ? <Text style={styles.line}>📍 {data.address}</Text> : null}
        {data.tax_code ? <Text style={styles.line}>MST: {data.tax_code}</Text> : null}
        {data.notes ? <Text style={styles.notes}>{data.notes}</Text> : null}
      </View>

      <Text style={styles.sec}>Lead / Deal</Text>
      {(data.leads || []).length ? (
        (data.leads || []).map((l) => (
          <TouchableOpacity key={l.id} style={[styles.row, CrmShadow.card]} onPress={() => goLead(navigation, l.id)}>
            <Text style={styles.code}>{l.code}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.tit} numberOfLines={2}>
                {l.title}
              </Text>
              <Text style={styles.meta}>{formatVnd(l.estimated_value)}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.muted}>Chưa có lead/deal.</Text>
      )}

      <Text style={styles.sec}>Báo giá</Text>
      {(data.quotes || []).map((q) => (
        <TouchableOpacity
          key={q.id}
          style={[styles.row, CrmShadow.card]}
          onPress={() => navigation.navigate('QuotationDetail', { id: q.id })}
        >
          <Text style={styles.code}>{q.code}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tit} numberOfLines={1}>
              {q.title}
            </Text>
            <Text style={styles.meta}>
              {formatVnd(q.total)} · {q.status || '—'}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}
      {!(data.quotes || []).length ? <Text style={styles.muted}>Chưa có báo giá.</Text> : null}

      <Text style={styles.sec}>Đơn hàng</Text>
      {(data.orders || []).map((o) => (
        <TouchableOpacity
          key={o.id}
          style={[styles.row, CrmShadow.card]}
          onPress={() => navigation.navigate('OrderDetail', { id: o.id })}
        >
          <Text style={styles.code}>{o.code}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tit} numberOfLines={1}>
              {o.title}
            </Text>
            <Text style={styles.meta}>
              {formatVnd(o.total)} · {o.status || '—'}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}
      {!(data.orders || []).length ? <Text style={styles.muted}>Chưa có đơn hàng.</Text> : null}

      <Text style={styles.sec}>Hóa đơn</Text>
      {(data.invoices || []).map((i) => (
        <TouchableOpacity
          key={i.id}
          style={[styles.row, CrmShadow.card]}
          onPress={() => navigation.navigate('InvoiceDetail', { id: i.id })}
        >
          <Text style={styles.code}>{i.code}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tit} numberOfLines={1}>
              {i.title}
            </Text>
            <Text style={styles.meta}>
              {formatVnd(i.total)} · {i.payment_status || i.status || '—'}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}
      {!(data.invoices || []).length ? <Text style={styles.muted}>Chưa có hóa đơn.</Text> : null}
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
  h1: { fontSize: 22, fontWeight: '800', color: CrmColors.gray900 },
  line: { fontSize: 14, color: CrmColors.gray700, marginTop: 8 },
  notes: { fontSize: 13, color: CrmColors.gray600, marginTop: 12, lineHeight: 20 },
  sec: { fontSize: 15, fontWeight: '800', color: CrmColors.gray800, marginBottom: 10, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  code: { fontSize: 12, fontWeight: '800', color: CrmColors.blue700, width: 76 },
  tit: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  meta: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  chev: { fontSize: 20, color: CrmColors.gray300 },
  muted: { fontSize: 13, color: CrmColors.gray500, marginBottom: 12 },
});
