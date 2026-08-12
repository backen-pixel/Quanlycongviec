import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCrmCompanies } from '../api/crm';
import { formatApiError } from '../api/client';
import {
  CUSTOMERS_PAGE_SIZE,
  fetchCustomerDetail,
  fetchCustomersOverviewPage,
  type CustomerActivityFilter,
  type CustomerDetail,
  type CustomerOverviewRow,
  type CustomersOverviewSummary,
  type CustomerSort,
} from '../api/customers';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { formatDateShort } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ActivityFilter = CustomerActivityFilter;
type SortOrder = CustomerSort;

const EMPTY_SUMMARY: CustomersOverviewSummary = {
  total: 0,
  active: 0,
  leads: 0,
  deals: 0,
  won: 0,
  revenue: 0,
  debt: 0,
};

type TimelineItem = {
  key: string;
  type: string;
  icon: keyof typeof Ionicons.glyphMap;
  code: string;
  title: string;
  amount: number;
  date?: string | null;
  dotColor: string;
  typeColor: string;
  statusText: string;
  statusBg: string;
  statusTextColor: string;
};

const ORDER_STATUS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Xác nhận',
  processing: 'SX',
  shipped: 'Giao',
  delivered: 'Đã giao',
  cancelled: 'Hủy',
};

const QUOTE_STATUS: Record<string, string> = {
  draft: 'Nháp',
  sent: 'Đã gửi',
  accepted: 'Chấp nhận',
  rejected: 'Từ chối',
  converted: '→ĐH',
};

function isAdminLike(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'sales_admin';
}

function isSystemAdmin(user: { role?: string | null; company_id?: string | null } | null): boolean {
  return String(user?.role || '').trim().toLowerCase() === 'admin' && !user?.company_id;
}

function showComingSoon(feature: string) {
  Alert.alert('Đang cập nhật', `Tính năng ${feature} đang được cập nhật. Vui lòng thử lại sau.`);
}

function formatMoney(value?: number | null): string {
  if (!value || value <= 0) return '0đ';
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

function buildTimeline(detail: CustomerDetail): TimelineItem[] {
  const items: TimelineItem[] = [];

  (detail.leads || []).forEach((l) => {
    const won = l.stage?.is_won;
    items.push({
      key: `lead-${l.id}`,
      type: l.type === 'deal' ? 'Deal' : 'Lead',
      icon: l.type === 'deal' ? 'pricetags' : 'locate',
      code: l.code || '—',
      title: l.title || '',
      amount: l.estimated_value || 0,
      date: l.created_at,
      dotColor: '#2F6BFF',
      typeColor: '#2F6BFF',
      statusText: l.stage?.name || '—',
      statusBg: won ? 'rgba(34,197,94,0.16)' : 'rgba(47,107,255,0.16)',
      statusTextColor: won ? '#22C55E' : '#2F6BFF',
    });
  });

  (detail.quotes || []).forEach((q) => {
    items.push({
      key: `quote-${q.id}`,
      type: 'Báo giá',
      icon: 'document-text-outline',
      code: q.code || '—',
      title: q.title || '',
      amount: q.total || 0,
      date: q.created_at,
      dotColor: '#F59E0B',
      typeColor: '#F59E0B',
      statusText: QUOTE_STATUS[q.status || ''] || q.status || '—',
      statusBg: 'rgba(245,158,11,0.16)',
      statusTextColor: '#F59E0B',
    });
  });

  (detail.orders || []).forEach((o) => {
    items.push({
      key: `order-${o.id}`,
      type: 'Đơn hàng',
      icon: 'cart-outline',
      code: o.code || '—',
      title: o.title || '',
      amount: o.total || 0,
      date: o.created_at,
      dotColor: '#22C55E',
      typeColor: '#22C55E',
      statusText: ORDER_STATUS[o.status || ''] || o.status || '—',
      statusBg: 'rgba(34,197,94,0.16)',
      statusTextColor: '#22C55E',
    });
  });

  (detail.invoices || []).forEach((i) => {
    const pay = i.payment_status || 'unpaid';
    items.push({
      key: `inv-${i.id}`,
      type: 'Hóa đơn',
      icon: 'receipt-outline',
      code: i.code || '—',
      title: i.title || '',
      amount: i.total || 0,
      date: i.created_at,
      dotColor: '#A855F7',
      typeColor: '#A855F7',
      statusText: pay === 'paid' ? 'Đã TT' : pay === 'partial' ? 'TT 1 phần' : 'Chưa TT',
      statusBg: pay === 'paid' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.14)',
      statusTextColor: pay === 'paid' ? '#22C55E' : '#EF4444',
    });
  });

  return items.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });
}

export default function CustomersScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  const [rows, setRows] = useState<CustomerOverviewRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<CustomersOverviewSummary>(EMPTY_SUMMARY);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const showCompanyPicker = isAdminLike(user?.role);
  const companyQuery = isSystemAdmin(user) && companyFilter ? companyFilter : undefined;

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (!showCompanyPicker) return;
    void fetchCrmCompanies()
      .then((list) => setCompanies(list.map((c) => ({ id: c.id, name: c.shortName || c.name }))))
      .catch(() => setCompanies([]));
  }, [showCompanyPicker]);

  const fetchPage = useCallback(
    async (pageNum: number, mode: 'reset' | 'more' | 'refresh') => {
      if (mode === 'more') {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else if (mode === 'refresh') {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setRefreshing(true);
      } else {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setLoading(true);
        setError('');
      }

      const ac = abortRef.current!;

      try {
        const result = await fetchCustomersOverviewPage({
          company_id: companyQuery,
          page: pageNum,
          limit: CUSTOMERS_PAGE_SIZE,
          sort: sortOrder,
          search,
          activity: activityFilter,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;

        setTotalCount(result.total);
        setHasMore(result.hasMore);
        setPage(result.page);
        if (result.summary) setSummary(result.summary);

        setRows((prev) => {
          if (mode === 'more') {
            const seen = new Set(prev.map((r) => r.id));
            const merged = [...prev];
            for (const row of result.customers) {
              if (!seen.has(row.id)) merged.push(row);
            }
            return merged;
          }
          return result.customers;
        });

        if (mode !== 'more') {
          setExpandedId(null);
          setDetail(null);
        }
      } catch (e: unknown) {
        if (!ac.signal.aborted) {
          if (mode !== 'more') {
            setError(formatApiError(e));
            setRows([]);
            setTotalCount(0);
            setHasMore(false);
            setSummary(EMPTY_SUMMARY);
          }
        }
      } finally {
        if (!ac.signal.aborted) {
          if (mode === 'more') {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          } else if (mode === 'refresh') {
            setRefreshing(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [companyQuery, sortOrder, search, activityFilter],
  );

  const reload = useCallback(() => {
    void fetchPage(1, 'reset');
  }, [fetchPage]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => abortRef.current?.abort();
    }, [reload]),
  );

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current || loading) return;
    void fetchPage(page + 1, 'more');
  }, [fetchPage, hasMore, loading, page]);

  const companyLabel = useMemo(() => {
    if (!companyFilter) return 'Tất cả công ty';
    return companies.find((c) => c.id === companyFilter)?.name || 'Công ty';
  }, [companyFilter, companies]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await fetchCustomerDetail(id, companyQuery);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const renderCustomer = ({ item: c }: { item: CustomerOverviewRow }) => {
    const expanded = expandedId === c.id;
    const timeline = expanded && detail?.id === c.id ? buildTimeline(detail) : [];
    const name = c.full_name || 'Khách hàng';

    return (
      <View style={[styles.card, expanded && styles.cardExpanded]}>
        <Pressable style={styles.cardHeader} onPress={() => void toggleExpand(c.id)}>
          <Avatar name={name} size={44} color={Colors.purple} />
          <View style={styles.cardBody}>
            <Text style={styles.custName} numberOfLines={1}>
              {name}
            </Text>
            {c.phone ? (
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={13} color={Colors.textFaint} />
                <Text style={styles.phoneTxt}>{c.phone}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.badgeCol}>
            {c.stats.lead_count > 0 ? (
              <View style={styles.leadBadge}>
                <Ionicons name="locate" size={11} color={Colors.blue} />
                <Text style={styles.leadBadgeTxt}>{c.stats.lead_count} lead</Text>
              </View>
            ) : null}
            {c.stats.order_count > 0 ? (
              <View style={styles.orderBadge}>
                <Ionicons name="cart" size={11} color={Colors.green} />
                <Text style={styles.orderBadgeTxt}>{c.stats.order_count} ĐH</Text>
              </View>
            ) : null}
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textFaint}
          />
        </Pressable>

        {expanded ? (
          <View style={styles.expanded}>
            <View style={styles.historyHead}>
              <View style={styles.historyTitleRow}>
                <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.historyTitle}>Lịch sử giao dịch</Text>
              </View>
              <Pressable style={styles.createLeadBtn} onPress={() => showComingSoon('tạo lead')}>
                <Ionicons name="add" size={14} color={Colors.text} />
                <Text style={styles.createLeadTxt}>Tạo Lead</Text>
              </Pressable>
            </View>

            {detailLoading ? (
              <SpinningLoader color={Colors.blue} style={{ marginVertical: 16 }} />
            ) : timeline.length === 0 ? (
              <Text style={styles.emptyTimeline}>Chưa có giao dịch nào</Text>
            ) : (
              <View style={styles.timeline}>
                {timeline.map((item) => (
                  <View key={item.key} style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: item.dotColor }]} />
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineTop}>
                        <View style={styles.timelineTypeRow}>
                          <Ionicons name={item.icon} size={12} color={item.typeColor} />
                          <Text style={[styles.timelineType, { color: item.typeColor }]}>
                            {item.type}
                          </Text>
                          <Text style={styles.timelineCode}>{item.code}</Text>
                        </View>
                        <Text style={styles.timelineDate}>{formatDateShort(item.date)}</Text>
                      </View>
                      {item.title ? (
                        <Text style={styles.timelineTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                      ) : null}
                      <View style={styles.timelineBottom}>
                        {item.amount > 0 ? (
                          <Text style={styles.timelineAmount}>{formatMoney(item.amount)}</Text>
                        ) : null}
                        <View style={[styles.timelineStatus, { backgroundColor: item.statusBg }]}>
                          <Text style={[styles.timelineStatusTxt, { color: item.statusTextColor }]}>
                            {item.statusText}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable style={styles.actionBtn} onPress={() => showComingSoon('gọi điện')}>
                <Ionicons name="call-outline" size={16} color={Colors.text} />
                <Text style={styles.actionBtnTxt}>Gọi</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => showComingSoon('nhắn tin')}>
                <Ionicons name="chatbubble-outline" size={16} color={Colors.text} />
                <Text style={styles.actionBtnTxt}>Nhắn tin</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => showComingSoon('sửa khách hàng')}>
                <Ionicons name="create-outline" size={16} color={Colors.text} />
                <Text style={styles.actionBtnTxt}>Sửa</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
            <LinearGradient
              colors={['#2F6BFF', '#A855F7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIcon}
            >
              <Ionicons name="people" size={22} color={Colors.white} />
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>Khách hàng CRM</Text>
              <Text style={styles.headerSub}>
                {summary.total.toLocaleString('vi-VN')} khách hàng
              </Text>
            </View>
          </View>
        </View>
      </View>

      {showCompanyPicker ? (
        <Pressable style={styles.companyPill} onPress={() => setCompanyPickerOpen(true)}>
          <Ionicons name="business-outline" size={16} color={Colors.blue} />
          <Text style={styles.companyPillTxt} numberOfLines={1}>
            {companyLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>TỔNG KH</Text>
          <Text style={[styles.statVal, { color: Colors.purple }]}>
            {summary.total.toLocaleString('vi-VN')}
          </Text>
          <Text style={styles.statSub}>{summary.active} đang giao dịch</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>LEAD / DEAL</Text>
          <Text style={[styles.statVal, { color: Colors.blue }]}>
            {(summary.leads + summary.deals).toLocaleString('vi-VN')}
          </Text>
          <Text style={styles.statSub}>
            {summary.leads} lead · {summary.deals} deal · {summary.won} chốt
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>DOANH THU</Text>
          <Text style={[styles.statVal, { color: Colors.green }]}>{formatMoney(summary.revenue)}</Text>
          <Text style={styles.statSub}>Đã thu</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>CÔNG NỢ</Text>
          <Text style={[styles.statVal, { color: Colors.red }]}>{formatMoney(summary.debt)}</Text>
          <Text style={styles.statSub}>Còn nợ</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm tên, SĐT, email, công ty..."
            placeholderTextColor={Colors.textFaint}
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
          />
          <Pressable
            style={[styles.filterBtn, (filtersOpen || activityFilter !== 'all') && styles.filterBtnActive]}
            onPress={() => setFiltersOpen((v) => !v)}
            hitSlop={8}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={filtersOpen || activityFilter !== 'all' ? Colors.blue : Colors.textMuted}
            />
          </Pressable>
        </View>
      </View>

      {filtersOpen ? (
        <View style={styles.filtersPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {(
              [
                { key: 'all', label: 'Tất cả' },
                { key: 'active', label: 'Đang giao dịch' },
                { key: 'debt', label: 'Có công nợ' },
              ] as const
            ).map((f) => (
              <Pressable
                key={f.key}
                style={[styles.filterChip, activityFilter === f.key && styles.filterChipActive]}
                onPress={() => setActivityFilter(f.key)}
              >
                <Text
                  style={[styles.filterChipTxt, activityFilter === f.key && styles.filterChipTxtActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.listMeta}>
        <Text style={styles.listMetaTxt}>
          Hiển thị <Text style={styles.listMetaStrong}>{rows.length.toLocaleString('vi-VN')}</Text>
          {totalCount > rows.length ? ` / ${totalCount.toLocaleString('vi-VN')}` : ''} khách hàng
        </Text>
        <Pressable
          style={[styles.sortBadge, sortOrder === 'newest' && styles.sortBadgeActive]}
          onPress={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
        >
          <Ionicons name="swap-vertical" size={14} color={sortOrder === 'newest' ? Colors.blue : Colors.textFaint} />
          <Text style={[styles.sortTxt, sortOrder === 'newest' && styles.sortTxtActive]}>
            {sortOrder === 'newest' ? 'Mới nhất' : 'Cũ nhất'}
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {loading && !rows.length ? (
        <View style={styles.center}>
          <SpinningLoader color={Colors.blue} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          renderItem={renderCustomer}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 88 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void fetchPage(1, 'refresh')}
              tintColor={Colors.blue}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={8}
          removeClippedSubviews
          ListFooterComponent={
            loadingMore ? (
              <SpinningLoader color={Colors.blue} style={{ marginVertical: 16 }} />
            ) : hasMore && rows.length > 0 ? (
              <Text style={styles.loadMoreHint}>Cuộn để tải thêm...</Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error || 'Không tìm thấy khách hàng'}</Text>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 8 }]}
        onPress={() => showComingSoon('thêm khách hàng')}
      >
        <Ionicons name="add" size={22} color={Colors.white} />
        <Text style={styles.fabTxt}>Thêm khách hàng</Text>
      </Pressable>

      <Modal visible={companyPickerOpen} transparent animationType="fade" onRequestClose={() => setCompanyPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCompanyPickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Chọn công ty</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {[{ id: '', name: 'Tất cả công ty' }, ...companies].map((c) => (
                <Pressable
                  key={c.id || 'all'}
                  style={styles.modalItem}
                  onPress={() => {
                    setCompanyFilter(c.id);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemTxt, companyFilter === c.id && styles.modalItemTxtActive]}>
                    {c.name}
                  </Text>
                  {companyFilter === c.id ? (
                    <Ionicons name="checkmark" size={18} color={Colors.blue} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    headerSub: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
    companyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      marginBottom: 12,
    },
    companyPillTxt: { color: Colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 12,
    },
    statCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      minWidth: '46%',
    },
    statLbl: {
      color: Colors.textFaint,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    statVal: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
    statSub: { color: Colors.textMuted, fontSize: 11 },
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
    filterBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBtnActive: { backgroundColor: Colors.blueSoft },
    filtersPanel: {
      backgroundColor: Colors.cardAlt,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 10,
      marginBottom: 10,
    },
    chipScroll: { gap: 8 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    filterChipActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
    filterChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    filterChipTxtActive: { color: Colors.blue, fontWeight: '800' },
    listMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    listMetaTxt: { color: Colors.textFaint, fontSize: 12, flex: 1 },
    listMetaStrong: { color: Colors.textMuted, fontWeight: '800' },
    sortBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    sortBadgeActive: { backgroundColor: Colors.blueSoft },
    sortTxt: { color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
    sortTxtActive: { color: Colors.blue },
    loadMoreHint: { textAlign: 'center', color: Colors.textFaint, fontSize: 12, marginVertical: 12 },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 10,
      overflow: 'hidden',
    },
    cardExpanded: { borderColor: 'rgba(168,85,247,0.45)' },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
    },
    cardBody: { flex: 1, minWidth: 0 },
    custName: { color: Colors.text, fontSize: 15, fontWeight: '800' },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    phoneTxt: { color: Colors.textMuted, fontSize: 12 },
    badgeCol: { alignItems: 'flex-end', gap: 4, marginRight: 4 },
    leadBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.pill,
      backgroundColor: Colors.blueSoft,
    },
    leadBadgeTxt: { color: Colors.blue, fontSize: 10, fontWeight: '800' },
    orderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.pill,
      backgroundColor: Colors.greenSoft,
    },
    orderBadgeTxt: { color: Colors.green, fontSize: 10, fontWeight: '800' },
    expanded: {
      borderTopWidth: 1,
      borderTopColor: Colors.borderSoft,
      padding: 14,
      backgroundColor: Colors.surfaceSoft,
    },
    historyHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 8,
    },
    historyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    historyTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' },
    createLeadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    createLeadTxt: { color: Colors.text, fontSize: 11, fontWeight: '800' },
    emptyTimeline: { color: Colors.textFaint, fontSize: 12, marginBottom: 12 },
    timeline: { gap: 10, marginBottom: 12 },
    timelineItem: { flexDirection: 'row', gap: 10 },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
    },
    timelineContent: { flex: 1 },
    timelineTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    timelineTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap' },
    timelineType: { fontSize: 11, fontWeight: '800' },
    timelineCode: { color: Colors.green, fontSize: 11, fontWeight: '800' },
    timelineDate: { color: Colors.textFaint, fontSize: 10 },
    timelineTitle: { color: Colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    timelineBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      flexWrap: 'wrap',
    },
    timelineAmount: { color: Colors.text, fontSize: 12, fontWeight: '900' },
    timelineStatus: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.pill,
    },
    timelineStatusTxt: { fontSize: 10, fontWeight: '800' },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    actionBtnTxt: { color: Colors.text, fontSize: 12, fontWeight: '700' },
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
      backgroundColor: Colors.blue,
      ...Shadow.fab,
    },
    fabTxt: { color: Colors.white, fontSize: 14, fontWeight: '900' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: Colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    modalTitle: { color: Colors.text, fontSize: 16, fontWeight: '900', marginBottom: 12 },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
    },
    modalItemTxt: { color: Colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
    modalItemTxtActive: { color: Colors.blue, fontWeight: '800' },
  });
