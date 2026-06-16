import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  fetchOrders,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderRow,
  type PaymentStatus,
} from '../api/orders';
import { formatDateShort } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Segment = 'all' | 'draft';
type PayFilter = '' | PaymentStatus;
type DatePreset = 'all' | '7d' | '30d' | 'month';

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Mọi ngày' },
  { key: '7d', label: '7 ngày qua' },
  { key: '30d', label: '30 ngày qua' },
  { key: 'month', label: 'Tháng này' },
];

const PAY_FILTERS: { key: PayFilter; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'unpaid', label: 'Chưa TT' },
  { key: 'partial', label: 'TT 1 phần' },
  { key: 'paid', label: 'Đã TT' },
];

function datePresetRange(preset: DatePreset): { from: number; to: number } | null {
  if (preset === 'all') return null;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  if (preset === '7d') return { from: end - 7 * 86400000, to: end };
  if (preset === '30d') return { from: end - 30 * 86400000, to: end };
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return { from: start, to: end };
}

function formatOrderTotal(value?: number | null): { text: string; isZero: boolean } {
  if (!value || value <= 0) return { text: '0đ', isZero: true };
  return { text: `${Math.round(value).toLocaleString('vi-VN')}đ`, isZero: false };
}

function formatSummaryTotal(value: number): string {
  if (value <= 0) return '0đ';
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

function showComingSoon(feature: string) {
  Alert.alert('Đang cập nhật', `Tính năng ${feature} đang được cập nhật. Vui lòng thử lại sau.`);
}

function orderStatusStyle(status: string | null | undefined, Colors: ThemeColors) {
  if (status === 'draft') {
    return { bg: Colors.blueSoft, text: Colors.blue, border: 'rgba(47,107,255,0.35)' };
  }
  return { bg: Colors.surfaceSoft, text: Colors.textMuted, border: Colors.border };
}

function payStatusStyle(pay: string | null | undefined, Colors: ThemeColors) {
  switch (pay) {
    case 'paid':
      return { bg: Colors.greenSoft, text: Colors.green, border: 'rgba(34,197,94,0.35)' };
    case 'partial':
      return { bg: Colors.amberSoft, text: Colors.amber, border: 'rgba(245,158,11,0.35)' };
    case 'unpaid':
    default:
      return { bg: Colors.amberSoft, text: Colors.amber, border: 'rgba(245,158,11,0.45)' };
  }
}

function payStripeColor(pay: string | null | undefined, Colors: ThemeColors): string {
  if (pay === 'paid') return Colors.green;
  return Colors.amber;
}

export default function OrdersScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [payFilter, setPayFilter] = useState<PayFilter>('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const load = useCallback(async (isRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const list = await fetchOrders({ signal: ac.signal });
      if (!ac.signal.aborted) setRows(list);
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        setError(formatApiError(e));
        setRows([]);
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  const summary = useMemo(() => {
    let total = 0;
    let draft = 0;
    let value = 0;
    for (const o of rows) {
      total += 1;
      if (o.status === 'draft') draft += 1;
      value += o.total || 0;
    }
    return { total, draft, value };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (segment === 'draft') list = list.filter((o) => o.status === 'draft');
    if (payFilter) list = list.filter((o) => o.payment_status === payFilter);

    const range = datePresetRange(datePreset);
    if (range) {
      list = list.filter((o) => {
        const t = o.created_at ? new Date(o.created_at).getTime() : 0;
        return t >= range.from && t <= range.to;
      });
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.code || '').toLowerCase().includes(s) ||
          (o.title || '').toLowerCase().includes(s) ||
          (o.customer_name || '').toLowerCase().includes(s) ||
          (o.customer?.full_name || '').toLowerCase().includes(s),
      );
    }

    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [rows, segment, payFilter, datePreset, search]);

  const hasExtraFilter = payFilter !== '' || datePreset !== 'all';

  const renderCard = ({ item: o }: { item: OrderRow }) => {
    const pay = o.payment_status || 'unpaid';
    const st = orderStatusStyle(o.status, Colors);
    const pst = payStatusStyle(pay, Colors);
    const amount = formatOrderTotal(o.total);
    const customer = o.customer_name || o.customer?.full_name || '';

    return (
      <View style={[styles.card, pay !== 'paid' && styles.cardUnpaid, pay === 'paid' && styles.cardPaid]}>
        <View style={[styles.leftStripe, { backgroundColor: payStripeColor(pay, Colors) }]} />
        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <Text style={styles.code}>{o.code || '—'}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: st.bg, borderColor: st.border }]}>
                <Text style={[styles.badgeTxt, { color: st.text }]}>
                  {ORDER_STATUS_LABEL[o.status || ''] || o.status || '—'}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: pst.bg, borderColor: pst.border }]}>
                <Text style={[styles.badgeTxt, { color: pst.text }]}>
                  {PAYMENT_STATUS_LABEL[pay] || pay}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {o.title || 'Đơn hàng'}
          </Text>

          {customer ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={14} color={Colors.textFaint} />
              <Text style={styles.metaTxt} numberOfLines={2}>
                {customer}
              </Text>
            </View>
          ) : null}

          <View style={styles.amountBox}>
            <View style={styles.amountLeft}>
              <Text style={styles.amountLabel}>Tổng tiền</Text>
              <Text style={[styles.amountValue, amount.isZero ? styles.amountZero : styles.amountPositive]}>
                {amount.text}
              </Text>
            </View>
            <Pressable style={styles.invoiceTag} onPress={() => showComingSoon('chuyển hóa đơn')}>
              <Ionicons name="receipt-outline" size={13} color={Colors.purple} />
              <Text style={styles.invoiceTagTxt}>Chuyển HĐ</Text>
            </Pressable>
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.footerMeta}>
              {o.creator?.full_name ? (
                <View style={styles.footerMetaLine}>
                  <Ionicons name="person-circle-outline" size={13} color={Colors.textFaint} />
                  <Text style={styles.footerMetaTxt} numberOfLines={1}>
                    {o.creator.full_name}
                  </Text>
                </View>
              ) : null}
              <View style={styles.footerMetaLine}>
                <Ionicons name="calendar-outline" size={13} color={Colors.textFaint} />
                <Text style={styles.footerMetaTxt}>{formatDateShort(o.created_at)}</Text>
              </View>
            </View>
            <View style={styles.footerActions}>
              <Pressable style={styles.iconBtn} onPress={() => showComingSoon('tải PDF')}>
                <Ionicons name="download-outline" size={18} color={Colors.textMuted} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => showComingSoon('xem chi tiết')}>
                <Ionicons name="document-text-outline" size={18} color={Colors.textMuted} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => showComingSoon('xóa đơn hàng')}>
                <Ionicons name="trash-outline" size={18} color={Colors.red} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const listHeader = (
    <>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="cart" size={24} color={Colors.green} />
            <Text style={styles.headerTitle}>Đơn hàng</Text>
          </View>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryCount}>{summary.total}</Text>
            {' đơn · '}
            <Text style={styles.summaryValue}>{formatSummaryTotal(summary.value)}</Text>
          </Text>
        </View>
        <Pressable style={styles.createTopBtn} onPress={() => showComingSoon('tạo đơn hàng')}>
          <Ionicons name="add" size={16} color={Colors.text} />
          <Text style={styles.createTopTxt}>Tạo đơn</Text>
        </Pressable>
      </View>

      <View style={styles.segmentRow}>
        <Pressable
          style={[styles.segment, segment === 'all' && styles.segmentAllActive]}
          onPress={() => setSegment('all')}
        >
          <Text style={[styles.segmentTxt, segment === 'all' && styles.segmentAllTxtActive]}>
            Tất cả ({summary.total})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'draft' && styles.segmentDraftActive]}
          onPress={() => setSegment('draft')}
        >
          <Text style={[styles.segmentTxt, segment === 'draft' && styles.segmentDraftTxtActive]}>
            Nháp ({summary.draft})
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm mã, tên, KH..."
            placeholderTextColor={Colors.textFaint}
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
          />
          <Pressable
            style={[styles.gearBtn, (filtersOpen || hasExtraFilter) && styles.gearBtnActive]}
            onPress={() => setFiltersOpen((v) => !v)}
            hitSlop={8}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={filtersOpen || hasExtraFilter ? Colors.green : Colors.textMuted}
            />
          </Pressable>
        </View>
      </View>

      {filtersOpen ? (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Thanh toán</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {PAY_FILTERS.map((p) => (
              <Pressable
                key={p.key || 'all'}
                style={[styles.filterChip, payFilter === p.key && styles.filterChipActive]}
                onPress={() => setPayFilter(p.key)}
              >
                <Text style={[styles.filterChipTxt, payFilter === p.key && styles.filterChipTxtActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.filterLabel}>Khoảng ngày</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {DATE_PRESETS.map((p) => (
              <Pressable
                key={p.key}
                style={[styles.filterChip, datePreset === p.key && styles.filterChipActive]}
                onPress={() => setDatePreset(p.key)}
              >
                <Text style={[styles.filterChipTxt, datePreset === p.key && styles.filterChipTxtActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {hasExtraFilter ? (
            <Pressable
              style={styles.clearFiltersBtn}
              onPress={() => {
                setPayFilter('');
                setDatePreset('all');
              }}
            >
              <Text style={styles.clearFiltersTxt}>Xóa bộ lọc</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.listMeta}>
        <Text style={styles.listMetaTxt}>
          Hiển thị <Text style={styles.listMetaStrong}>{filtered.length}</Text> đơn hàng
          {hasExtraFilter || search || segment !== 'all' ? ' (đã lọc)' : ''}
        </Text>
        <View style={styles.sortBadge}>
          <Ionicons name="swap-vertical" size={14} color={Colors.textFaint} />
          <Text style={styles.sortTxt}>Mới nhất</Text>
        </View>
      </View>
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {loading && !rows.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.green} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 88 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.green} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error || 'Không có đơn hàng phù hợp'}</Text>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 8 }]}
        onPress={() => showComingSoon('tạo đơn hàng')}
      >
        <Ionicons name="add" size={22} color={Colors.white} />
        <Text style={styles.fabTxt}>Tạo đơn hàng</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 12,
      marginHorizontal: -8,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    headerBody: { flex: 1, paddingRight: 8 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle: { color: Colors.text, fontSize: 26, fontWeight: '900' },
    summaryLine: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 6 },
    summaryCount: { color: Colors.text, fontWeight: '800' },
    summaryValue: { color: Colors.green, fontWeight: '900' },
    createTopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      marginTop: 4,
    },
    createTopTxt: { color: Colors.text, fontSize: 12, fontWeight: '800' },
    segmentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    segment: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      alignItems: 'center',
    },
    segmentAllActive: { borderColor: Colors.green, backgroundColor: Colors.greenSoft },
    segmentDraftActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
    segmentTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '800' },
    segmentAllTxtActive: { color: Colors.green },
    segmentDraftTxtActive: { color: Colors.blue },
    searchRow: { marginBottom: 8 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingLeft: 12,
      paddingRight: 6,
      height: 46,
    },
    searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    gearBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gearBtnActive: { backgroundColor: Colors.greenSoft },
    filtersPanel: {
      backgroundColor: Colors.cardAlt,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      marginBottom: 10,
    },
    filterLabel: {
      color: Colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
      marginTop: 4,
    },
    chipScroll: { gap: 8, paddingRight: 8, marginBottom: 4 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    filterChipActive: { borderColor: Colors.green, backgroundColor: Colors.greenSoft },
    filterChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    filterChipTxtActive: { color: Colors.green, fontWeight: '800' },
    clearFiltersBtn: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: 4 },
    clearFiltersTxt: { color: Colors.red, fontSize: 12, fontWeight: '800' },
    listMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    listMetaTxt: { color: Colors.textFaint, fontSize: 12, flex: 1 },
    listMetaStrong: { color: Colors.textMuted, fontWeight: '800' },
    sortBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sortTxt: { color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 12,
      overflow: 'hidden',
    },
    cardUnpaid: { borderColor: 'rgba(245,158,11,0.35)' },
    cardPaid: { borderColor: 'rgba(34,197,94,0.35)' },
    leftStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    cardInner: { padding: 14, paddingLeft: 16 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
    code: { color: Colors.green, fontSize: 14, fontWeight: '900', flexShrink: 0 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flex: 1 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.pill,
      borderWidth: 1,
    },
    badgeTxt: { fontSize: 10, fontWeight: '800' },
    cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', marginBottom: 6, lineHeight: 21 },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
    metaTxt: { color: Colors.textMuted, fontSize: 13, flex: 1, lineHeight: 18 },
    amountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Colors.surfaceSoft,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.borderSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      gap: 8,
    },
    amountLeft: { flex: 1 },
    amountLabel: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', marginBottom: 2 },
    amountValue: { fontSize: 20, fontWeight: '900' },
    amountPositive: { color: Colors.green },
    amountZero: { color: Colors.textFaint },
    invoiceTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.pill,
      backgroundColor: 'rgba(168,85,247,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(168,85,247,0.35)',
    },
    invoiceTagTxt: { color: Colors.purple, fontSize: 11, fontWeight: '800' },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
    },
    footerMeta: { flex: 1, gap: 4 },
    footerMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    footerMetaTxt: { color: Colors.textFaint, fontSize: 11, flexShrink: 1 },
    footerActions: { flexDirection: 'row', gap: 4 },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: Colors.surfaceSoft,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: { textAlign: 'center', color: Colors.textFaint, marginTop: 48, fontSize: 14 },
    fab: {
      position: 'absolute',
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: Radii.pill,
      backgroundColor: Colors.green,
      ...Shadow.fab,
    },
    fabTxt: { color: Colors.white, fontSize: 14, fontWeight: '900' },
  });
