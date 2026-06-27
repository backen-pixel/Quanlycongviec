import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchPlannerSectionPage,
  fetchPlannerSectionTotal,
  invalidatePlannerCache,
  setPlannerCache,
  type PlannerFetchOpts,
} from '../api/crm';
import { fetchCrmCompanies } from '../api/crmMeta';
import NotificationBadge from '../components/NotificationBadge';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { currentUserId, useAuth } from '../context/AuthContext';
import {
  filterPlannerItems,
  PLANNER_PAGE_SIZE,
  plannerSearchPlaceholder,
  type PlannerQuickFilter,
} from '../lib/plannerFilters';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { PlannerItem, PlannerKind } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type KindMeta = { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; soft: string };

function kindMeta(Colors: ThemeColors): Record<PlannerKind, KindMeta> {
  return {
    lead: { label: 'Leads của tôi', icon: 'people', color: Colors.blue, soft: Colors.blueSoft },
    deal: { label: 'Deals của tôi', icon: 'pricetags', color: Colors.orange, soft: Colors.orangeSoft },
  };
}

const QUICK_FILTERS: { key: PlannerQuickFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'today', label: 'Hẹn hôm nay' },
  { key: 'no_due', label: 'Chưa hẹn' },
  { key: 'has_phone', label: 'Có SĐT' },
];

type SectionState = {
  items: PlannerItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

const EMPTY_SECTION: SectionState = { items: [], total: 0, hasMore: false, nextOffset: 0 };

function CompactCard({ item }: { item: PlannerItem }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const meta = kindMeta(Colors)[item.kind];
  return (
    <View style={[styles.card, { borderLeftColor: meta.color }]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardCode}>{item.code}</Text>
        {item.overdue ? (
          <View style={styles.overduePill}>
            <Text style={styles.overdueTxt}>Quá hạn</Text>
          </View>
        ) : null}
        <Text style={[styles.cardDue, item.overdue && { color: Colors.red }]} numberOfLines={1}>
          {item.deadlineLabel}
        </Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      <View style={styles.cardBottom}>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.contactName}
          {item.phone ? ` · ${item.phone}` : ''}
        </Text>
        <View style={[styles.statusChip, { backgroundColor: meta.soft }]}>
          <Text style={[styles.statusTxt, { color: meta.color }]} numberOfLines={1}>
            {item.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PlannerSection({
  kind,
  state,
  loading,
  loadingMore,
  onLoadMore,
}: {
  kind: PlannerKind;
  state: SectionState;
  loading?: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const meta = kindMeta(Colors)[kind];
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<PlannerQuickFilter>('all');
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    setPage(0);
  }, [search, quickFilter]);

  const filtered = useMemo(
    () => filterPlannerItems(state.items, search, quickFilter),
    [state.items, search, quickFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PLANNER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(
    safePage * PLANNER_PAGE_SIZE,
    safePage * PLANNER_PAGE_SIZE + PLANNER_PAGE_SIZE,
  );
  const filterActive = !!search || quickFilter !== 'all';
  const overdueCount = state.items.filter((i) => i.overdue).length;

  const loadMoreFromServer = useCallback(() => {
    if (!state.hasMore || loadingMore) return;
    onLoadMore();
  }, [state.hasMore, loadingMore, onLoadMore]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionBadge, { backgroundColor: meta.soft }]}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
        </View>
        <Text style={styles.sectionTitle}>{meta.label}</Text>
        <View style={[styles.countBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.countTxt}>{state.total}</Text>
        </View>
        {overdueCount > 0 ? <Text style={styles.sectionOverdue}>{overdueCount} quá hạn</Text> : null}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textFaint} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder={plannerSearchPlaceholder(kind)}
            placeholderTextColor={Colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            keyboardType="default"
          />
          {searchDraft ? (
            <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.filterToggle, (filtersOpen || filterActive) && { borderColor: meta.color, backgroundColor: meta.soft }]}
          onPress={() => setFiltersOpen((v) => !v)}
          hitSlop={4}
        >
          <Ionicons name="options-outline" size={18} color={filterActive ? meta.color : Colors.text} />
        </Pressable>
      </View>

      {filtersOpen ? (
        <View style={styles.filterBlock}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {QUICK_FILTERS.map((f) => {
              const active = quickFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[styles.chip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                  onPress={() => setQuickFilter(f.key)}
                >
                  <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {filterActive ? (
        <Text style={styles.filterHint}>
          Hiển thị {filtered.length}/{state.items.length} đã tải · tổng {state.total}
          {state.hasMore ? ' · còn trên server' : ''}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={meta.color} style={{ marginVertical: 16 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>
          {filterActive
            ? `Không có ${kind === 'lead' ? 'lead' : 'deal'} phù hợp bộ lọc.`
            : `Không có ${kind === 'lead' ? 'lead' : 'deal'} nào được giao.`}
        </Text>
      ) : (
        <>
          {pageItems.map((it) => <CompactCard key={it.id} item={it} />)}

          {totalPages > 1 ? (
            <View style={styles.pageRow}>
              <Pressable
                style={[styles.pageBtn, safePage === 0 && styles.pageBtnDisabled]}
                disabled={safePage === 0}
                onPress={() => setPage((p) => Math.max(0, p - 1))}
              >
                <Ionicons name="chevron-back" size={18} color={safePage === 0 ? Colors.textFaint : meta.color} />
              </Pressable>
              <Text style={styles.pageInfo}>
                Trang {safePage + 1}/{totalPages} · {filtered.length} mục
              </Text>
              <Pressable
                style={[styles.pageBtn, safePage >= totalPages - 1 && styles.pageBtnDisabled]}
                disabled={safePage >= totalPages - 1}
                onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <Ionicons name="chevron-forward" size={18} color={safePage >= totalPages - 1 ? Colors.textFaint : meta.color} />
              </Pressable>
            </View>
          ) : null}

          {state.hasMore ? (
            <Pressable
              style={[styles.loadMoreBtn, { borderColor: meta.color }]}
              onPress={() => void loadMoreFromServer()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={meta.color} />
              ) : (
                <Text style={[styles.loadMoreTxt, { color: meta.color }]}>
                  Tải thêm từ server ({state.items.length}/{state.total})
                </Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function PlannerScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const userId = currentUserId(user);

  const [leadState, setLeadState] = useState<SectionState>(EMPTY_SECTION);
  const [dealState, setDealState] = useState<SectionState>(EMPTY_SECTION);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [leadsLoadingMore, setLeadsLoadingMore] = useState(false);
  const [dealsLoadingMore, setDealsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const unreadNotifCount = useUnreadNotificationCount();
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const companyIdRef = useRef<string | undefined>(undefined);

  const resolvePlannerCompanyId = useCallback(async (): Promise<string | undefined> => {
    const fromUser = user?.company_id;
    if (fromUser) return fromUser;
    try {
      const companies = await fetchCrmCompanies();
      return companies[0]?.id;
    } catch {
      return undefined;
    }
  }, [user?.company_id]);

  const load = useCallback(async (opts?: { refresh?: boolean; silent?: boolean }) => {
    if (!userId) return;
    const isRefresh = opts?.refresh ?? false;
    const silent = opts?.silent ?? false;
    if (loadingRef.current && !isRefresh) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    loadingRef.current = true;

    if (!silent) {
      setLeadsLoading(true);
      setDealsLoading(true);
    }
    if (isRefresh) {
      invalidatePlannerCache(userId);
      if (!silent) setRefreshing(true);
    }
    if (!silent) setError('');

    const companyId = await resolvePlannerCompanyId();
    if (ac.signal.aborted) {
      loadingRef.current = false;
      return;
    }
    companyIdRef.current = companyId;
    const plannerOpts: PlannerFetchOpts = { signal: ac.signal, companyId };

    let leadErr = '';
    let dealErr = '';
    let leadResult = EMPTY_SECTION;
    let dealResult = EMPTY_SECTION;

    const leadPromise = Promise.all([
      fetchPlannerSectionPage('lead', userId, 0, undefined, plannerOpts),
      fetchPlannerSectionTotal('lead', userId, plannerOpts),
    ])
      .then(([page, listTotal]) => {
        leadResult = {
          items: page.items,
          total: listTotal,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        if (!ac.signal.aborted) setLeadState(leadResult);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) {
          leadErr =
            (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
            (e as { message?: string })?.message ||
            'Không tải được leads';
        }
      })
      .finally(() => {
        if (!silent && !ac.signal.aborted) setLeadsLoading(false);
      });

    const dealPromise = Promise.all([
      fetchPlannerSectionPage('deal', userId, 0, undefined, plannerOpts),
      fetchPlannerSectionTotal('deal', userId, plannerOpts),
    ])
      .then(([page, listTotal]) => {
        dealResult = {
          items: page.items,
          total: listTotal,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        if (!ac.signal.aborted) setDealState(dealResult);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) {
          dealErr =
            (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
            (e as { message?: string })?.message ||
            'Không tải được deals';
        }
      })
      .finally(() => {
        if (!silent && !ac.signal.aborted) setDealsLoading(false);
      });

    await Promise.all([leadPromise, dealPromise]);

    if (!ac.signal.aborted) {
      if (leadErr && dealErr) setError(leadErr);
      else setError('');
      setPlannerCache(userId, { leads: leadResult.items, deals: dealResult.items });
    }
    loadingRef.current = false;
    if (!silent) setRefreshing(false);
  }, [userId, resolvePlannerCompanyId]);

  useEffect(() => {
    if (!userId) {
      setLeadState(EMPTY_SECTION);
      setDealState(EMPTY_SECTION);
      setLeadsLoading(false);
      setDealsLoading(false);
      return;
    }
    invalidatePlannerCache(userId);
    setLeadState(EMPTY_SECTION);
    setDealState(EMPTY_SECTION);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      void load({ refresh: true, silent: true });
    }, [load]),
    Boolean(userId),
  );

  const overdueCount =
    leadState.items.filter((l) => l.overdue).length + dealState.items.filter((d) => d.overdue).length;

  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const displayName = user?.full_name || user?.fullName || '';

  const summary = useMemo(() => ({
    leads: leadState.total,
    deals: dealState.total,
    overdue: overdueCount,
  }), [leadState.total, dealState.total, overdueCount]);

  const loadMoreLeads = useCallback(async () => {
    if (!userId || leadsLoadingMore || !leadState.hasMore) return;
    setLeadsLoadingMore(true);
    try {
      const page = await fetchPlannerSectionPage('lead', userId, leadState.nextOffset, undefined, {
        companyId: companyIdRef.current,
      });
      const mergedItems = [...leadState.items, ...page.items];
      const merged: SectionState = {
        items: mergedItems,
        total: leadState.total,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
      };
      setLeadState(merged);
      setPlannerCache(userId, { leads: merged.items, deals: dealState.items });
    } finally {
      setLeadsLoadingMore(false);
    }
  }, [userId, leadsLoadingMore, leadState, dealState.items]);

  const loadMoreDeals = useCallback(async () => {
    if (!userId || dealsLoadingMore || !dealState.hasMore) return;
    setDealsLoadingMore(true);
    try {
      const page = await fetchPlannerSectionPage('deal', userId, dealState.nextOffset, undefined, {
        companyId: companyIdRef.current,
      });
      const mergedItems = [...dealState.items, ...page.items];
      const merged: SectionState = {
        items: mergedItems,
        total: dealState.total,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
      };
      setDealState(merged);
      setPlannerCache(userId, { leads: leadState.items, deals: merged.items });
    } finally {
      setDealsLoadingMore(false);
    }
  }, [userId, dealsLoadingMore, dealState, leadState.items]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Kế hoạch của tôi</Text>
            <Text style={styles.date}>
              {today}{displayName ? ` · ${displayName}` : ''}
            </Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={20} color={Colors.text} />
            <NotificationBadge count={unreadNotifCount} style={styles.bellBadge} />
          </Pressable>
        </View>

        <View style={styles.summary}>
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.blue }]}>{summary.leads}</Text>
            <Text style={styles.sumLabel}>Leads</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.orange }]}>{summary.deals}</Text>
            <Text style={styles.sumLabel}>Deals</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.red }]}>{summary.overdue}</Text>
            <Text style={styles.sumLabel}>Quá hạn</Text>
          </View>
        </View>

        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickBtn, { borderColor: Colors.blue }]}
            onPress={() => navigation.navigate('CrmHub', { initialMode: 'leads', initialAssignee: 'mine' })}
          >
            <View style={[styles.quickIcon, { backgroundColor: Colors.blueSoft }]}>
              <Ionicons name="people" size={22} color={Colors.blue} />
            </View>
            <View style={styles.quickBody}>
              <Text style={styles.quickTitle}>Quản lý Leads</Text>
              <Text style={styles.quickSub}>Danh sách · tìm kiếm · lọc</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
          </Pressable>
          <Pressable
            style={[styles.quickBtn, { borderColor: Colors.orange }]}
            onPress={() => navigation.navigate('CrmHub', { initialMode: 'deals', initialAssignee: 'mine' })}
          >
            <View style={[styles.quickIcon, { backgroundColor: Colors.orangeSoft }]}>
              <Ionicons name="pricetags" size={22} color={Colors.orange} />
            </View>
            <View style={styles.quickBody}>
              <Text style={styles.quickTitle}>Quản lý Deals</Text>
              <Text style={styles.quickSub}>Pipeline · giá trị · trạng thái</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
          {error && !leadsLoading && !dealsLoading ? (
            <View style={styles.errBox}>
              <Ionicons name="cloud-offline-outline" size={32} color={Colors.textFaint} />
              <Text style={styles.errTxt}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
                <Text style={styles.retryTxt}>Thử lại</Text>
              </Pressable>
            </View>
          ) : null}
          <PlannerSection
            kind="lead"
            state={leadState}
            loading={leadsLoading}
            loadingMore={leadsLoadingMore}
            onLoadMore={() => void loadMoreLeads()}
          />
          <PlannerSection
            kind="deal"
            state={dealState}
            loading={dealsLoading}
            loadingMore={dealsLoadingMore}
            onLoadMore={() => void loadMoreDeals()}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  greeting: { color: Colors.text, fontSize: 24, fontWeight: '900' },
  date: { color: Colors.textMuted, fontSize: 13, marginTop: 3 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: { top: -4, right: -4 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sumItem: { flex: 1, alignItems: 'center' },
  sumValue: { fontSize: 26, fontWeight: '900' },
  sumLabel: { color: Colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600' },
  sumDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  quickRow: { paddingHorizontal: 16, marginTop: 14, gap: 10 },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickBody: { flex: 1 },
  quickTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  quickSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '900' },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  sectionOverdue: { color: Colors.red, fontSize: 12, fontWeight: '800', marginLeft: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 10,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, paddingVertical: 0 },
  filterToggle: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBlock: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '800' },
  filterHint: { color: Colors.textFaint, fontSize: 11, fontWeight: '600', marginBottom: 8 },
  empty: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', marginVertical: 14 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCode: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
  overduePill: {
    backgroundColor: Colors.redSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  overdueTxt: { color: Colors.red, fontSize: 9, fontWeight: '800' },
  cardDue: { flex: 1, textAlign: 'right', color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardMeta: { flex: 1, color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  statusChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radii.pill, maxWidth: '42%' },
  statusTxt: { fontSize: 10, fontWeight: '800' },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  pageBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageInfo: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radii.pill,
    borderWidth: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreTxt: { fontSize: 12, fontWeight: '800' },
  errBox: { alignItems: 'center', gap: 12, padding: 32, marginTop: 20 },
  errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: Radii.md,
    backgroundColor: Colors.blue,
  },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
