import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  invalidatePlannerCache,
  peekPlannerCache,
  plannerCacheAgeMs,
  PLANNER_FETCH_LIMIT,
  PLANNER_MAX_BUFFER,
  PLANNER_SILENT_REFRESH_AFTER_MS,
  setPlannerCache,
  type PlannerFetchOpts,
} from '../api/crm';
import Avatar from '../components/Avatar';
import HeaderMenuBell from '../components/HeaderMenuBell';
import PlannerCompactCard, { plannerKindMeta } from '../components/planner/PlannerCompactCard';
import SpinningLoader from '../components/SpinningLoader';
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

/** Tên gọi ngắn (từ cuối) — giống app xưởng. */
function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || full || 'bạn';
}

function greetingByHour(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatVnWeekdayDate(now = new Date()): string {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${days[now.getDay()]}, ${d}/${m}/${now.getFullYear()}`;
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

function PlannerSection({
  kind,
  state,
  loading,
  loadingMore,
  showOwner,
  maxBuffer,
  onLoadMore,
}: {
  kind: PlannerKind;
  state: SectionState;
  loading?: boolean;
  loadingMore?: boolean;
  showOwner?: boolean;
  maxBuffer: number;
  onLoadMore: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const meta = plannerKindMeta(Colors, !!showOwner)[kind];
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
    if (state.items.length >= maxBuffer) return;
    onLoadMore();
  }, [state.hasMore, state.items.length, loadingMore, onLoadMore, maxBuffer]);

  const canLoadMoreServer = state.hasMore && state.items.length < maxBuffer;
  const bufferCapped = state.hasMore && state.items.length >= maxBuffer;

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
        <View style={styles.loadingBox}>
          <SpinningLoader variant="large" color={meta.color} />
          <Text style={[styles.empty, { marginTop: 10 }]}>Đang tải…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>
          {filterActive
            ? `Không có ${kind === 'lead' ? 'lead' : 'deal'} phù hợp bộ lọc.`
            : `Không có ${kind === 'lead' ? 'lead' : 'deal'} nào được giao.`}
        </Text>
      ) : (
        <>
          {pageItems.map((it) => <PlannerCompactCard key={it.id} item={it} showOwner={showOwner} />)}

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

          {canLoadMoreServer ? (
            <Pressable
              style={[styles.loadMoreBtn, { borderColor: meta.color }]}
              onPress={() => void loadMoreFromServer()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <SpinningLoader size={18} color={meta.color} />
              ) : (
                <Text style={[styles.loadMoreTxt, { color: meta.color }]}>
                  Tải thêm từ server ({state.items.length}/{state.total})
                </Text>
              )}
            </Pressable>
          ) : null}
          {bufferCapped ? (
            <Text style={styles.filterHint}>
              Đã tải tối đa {maxBuffer} bản ghi gần nhất — dùng tìm kiếm/lọc để thu hẹp.
            </Text>
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
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const companyIdRef = useRef<string | undefined>(undefined);
  const leadStateRef = useRef(leadState);
  const dealStateRef = useRef(dealState);
  leadStateRef.current = leadState;
  dealStateRef.current = dealState;

  /** Planner cá nhân — luôn lọc đúng user đăng nhập, không có phạm vi khác. */
  const plannerScopeOpts = useMemo(
    (): Omit<PlannerFetchOpts, 'signal' | 'companyId'> => (userId ? { assignedTo: userId } : {}),
    [userId],
  );

  const showOwner = false;
  const maxBuffer = PLANNER_MAX_BUFFER;
  const fetchLimit = PLANNER_FETCH_LIMIT;

  const resolvePlannerCompanyId = useCallback(async (): Promise<string | undefined> => {
    // Planner cá nhân: ưu tiên company của user; không ép công ty đầu danh sách (tránh lệch data).
    return user?.company_id || undefined;
  }, [user?.company_id]);

  const load = useCallback(async (opts?: { refresh?: boolean; silent?: boolean }) => {
    if (!userId) return;
    const isRefresh = opts?.refresh ?? false;
    const silent = opts?.silent ?? false;
    // Hủy request cũ rồi tải lại — tránh kẹt khi đổi phạm vi NV.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    loadingRef.current = true;

    if (!silent) {
      if (leadStateRef.current.items.length === 0 && leadStateRef.current.total === 0) {
        setLeadsLoading(true);
      }
      if (dealStateRef.current.items.length === 0 && dealStateRef.current.total === 0) {
        setDealsLoading(true);
      }
    }
    if (isRefresh) {
      invalidatePlannerCache(userId);
      if (!silent) setRefreshing(true);
    }
    if (!silent) setError('');

    const companyId = await resolvePlannerCompanyId();
    if (ac.signal.aborted) {
      loadingRef.current = false;
      if (!silent) {
        setLeadsLoading(false);
        setDealsLoading(false);
        setRefreshing(false);
      }
      return;
    }
    companyIdRef.current = companyId;
    const plannerOpts: PlannerFetchOpts = {
      signal: ac.signal,
      companyId,
      ...plannerScopeOpts,
    };

    let leadErr = '';
    let dealErr = '';
    let leadResult = EMPTY_SECTION;
    let dealResult = EMPTY_SECTION;

    const leadPromise = fetchPlannerSectionPage('lead', userId, 0, fetchLimit, plannerOpts)
      .then((page) => {
        leadResult = {
          items: page.items,
          total: page.total,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        if (!ac.signal.aborted) {
          setLeadState(leadResult);
          if (!silent) setLeadsLoading(false);
          if (page.totalPromise) {
            void page.totalPromise.then((total) => {
              if (ac.signal.aborted) return;
              setLeadState((prev) => (
                prev.nextOffset === leadResult.nextOffset ? { ...prev, total } : prev
              ));
            }).catch(() => { /* giữ total tạm */ });
          }
        }
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) {
          leadErr =
            (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
            (e as { message?: string })?.message ||
            'Không tải được leads';
          if (!silent) setLeadsLoading(false);
        }
      });

    const dealPromise = fetchPlannerSectionPage('deal', userId, 0, fetchLimit, plannerOpts)
      .then((page) => {
        dealResult = {
          items: page.items,
          total: page.total,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        if (!ac.signal.aborted) {
          setDealState(dealResult);
          if (!silent) setDealsLoading(false);
          if (page.totalPromise) {
            void page.totalPromise.then((total) => {
              if (ac.signal.aborted) return;
              setDealState((prev) => (prev.nextOffset === dealResult.nextOffset
                ? { ...prev, total }
                : prev));
            }).catch(() => { /* giữ total tạm */ });
          }
        }
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) {
          dealErr =
            (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
            (e as { message?: string })?.message ||
            'Không tải được deals';
          if (!silent) setDealsLoading(false);
        }
      });

    await Promise.all([leadPromise, dealPromise]);

    if (!ac.signal.aborted) {
      if (leadErr && dealErr) setError(leadErr);
      else setError('');
      setPlannerCache(userId, { leads: leadResult.items, deals: dealResult.items }, plannerScopeOpts);
    }
    loadingRef.current = false;
    if (!silent) {
      setLeadsLoading(false);
      setDealsLoading(false);
      setRefreshing(false);
    }
  }, [userId, resolvePlannerCompanyId, plannerScopeOpts, fetchLimit]);

  useEffect(() => {
    if (!userId) {
      setLeadState(EMPTY_SECTION);
      setDealState(EMPTY_SECTION);
      setLeadsLoading(false);
      setDealsLoading(false);
      return;
    }
    const cached = peekPlannerCache(userId, plannerScopeOpts);
    if (cached) {
      setLeadState({
        items: cached.leads,
        total: cached.leads.length,
        hasMore: cached.leads.length >= fetchLimit,
        nextOffset: cached.leads.length,
      });
      setDealState({
        items: cached.deals,
        total: cached.deals.length,
        hasMore: cached.deals.length >= fetchLimit,
        nextOffset: cached.deals.length,
      });
      setLeadsLoading(false);
      setDealsLoading(false);
    } else {
      setLeadState(EMPTY_SECTION);
      setDealState(EMPTY_SECTION);
      setLeadsLoading(true);
      setDealsLoading(true);
    }
  }, [userId, plannerScopeOpts, fetchLimit]);

  useEffect(() => {
    if (!userId) return;
    void load();
  }, [userId, load]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return undefined;
      const age = plannerCacheAgeMs(userId, plannerScopeOpts);
      const hasData =
        leadStateRef.current.items.length > 0
        || leadStateRef.current.total > 0
        || dealStateRef.current.items.length > 0
        || dealStateRef.current.total > 0;
      // Chỉ silent refresh khi quay lại tab và đã có data cũ.
      if (hasData && (age == null || age >= PLANNER_SILENT_REFRESH_AFTER_MS)) {
        void load({ refresh: true, silent: true });
      }
      return () => abortRef.current?.abort();
    }, [load, userId, plannerScopeOpts]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      void load({ refresh: true, silent: true });
    }, [load]),
    Boolean(userId),
  );

  const overdueCount =
    leadState.items.filter((l) => l.overdue).length + dealState.items.filter((d) => d.overdue).length;

  const userName = user?.full_name || user?.fullName || user?.email || 'Bạn';
  const greetName = firstName(userName);
  const todayLabel = formatVnWeekdayDate();

  const leadsStatsPending =
    leadsLoading && leadState.total === 0 && leadState.items.length === 0;
  const dealsStatsPending =
    dealsLoading && dealState.total === 0 && dealState.items.length === 0;
  const overdueStatsPending = leadsStatsPending && dealsStatsPending;

  const summary = useMemo(() => ({
    leads: leadState.total,
    deals: dealState.total,
    overdue: overdueCount,
  }), [leadState.total, dealState.total, overdueCount]);

  const loadMoreLeads = useCallback(async () => {
    if (!userId || leadsLoadingMore || !leadState.hasMore) return;
    if (leadState.items.length >= maxBuffer) return;
    setLeadsLoadingMore(true);
    try {
      const page = await fetchPlannerSectionPage('lead', userId, leadState.nextOffset, fetchLimit, {
        companyId: companyIdRef.current,
        ...plannerScopeOpts,
      });
      const mergedItems = [...leadState.items, ...page.items].slice(0, maxBuffer);
      const merged: SectionState = {
        items: mergedItems,
        total: leadState.total,
        hasMore: page.hasMore && mergedItems.length < maxBuffer,
        nextOffset: page.nextOffset,
      };
      setLeadState(merged);
      setPlannerCache(userId, { leads: merged.items, deals: dealState.items }, plannerScopeOpts);
    } finally {
      setLeadsLoadingMore(false);
    }
  }, [userId, leadsLoadingMore, leadState, dealState.items, maxBuffer, fetchLimit, plannerScopeOpts]);

  const loadMoreDeals = useCallback(async () => {
    if (!userId || dealsLoadingMore || !dealState.hasMore) return;
    if (dealState.items.length >= maxBuffer) return;
    setDealsLoadingMore(true);
    try {
      const page = await fetchPlannerSectionPage('deal', userId, dealState.nextOffset, fetchLimit, {
        companyId: companyIdRef.current,
        ...plannerScopeOpts,
      });
      const mergedItems = [...dealState.items, ...page.items].slice(0, maxBuffer);
      const merged: SectionState = {
        items: mergedItems,
        total: dealState.total,
        hasMore: page.hasMore && mergedItems.length < maxBuffer,
        nextOffset: page.nextOffset,
      };
      setDealState(merged);
      setPlannerCache(userId, { leads: leadState.items, deals: merged.items }, plannerScopeOpts);
    } finally {
      setDealsLoadingMore(false);
    }
  }, [userId, dealsLoadingMore, dealState, leadState.items, maxBuffer, fetchLimit, plannerScopeOpts]);

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
          <View style={styles.headerLeft}>
            <Avatar name={userName} avatarUrl={user?.avatar} size={48} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle} numberOfLines={1}>
                {greetingByHour()}, {greetName}!
              </Text>
              <Text style={styles.greetDate} numberOfLines={1}>
                {todayLabel}
              </Text>
            </View>
          </View>
          <HeaderMenuBell />
        </View>
        <Text style={styles.motivateTxt} numberOfLines={1}>
          Chúc bạn một ngày làm việc hiệu quả! 👋
        </Text>

        <View style={styles.summary}>
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.blue }]}>{leadsStatsPending ? '…' : summary.leads}</Text>
            <Text style={styles.sumLabel}>Leads</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.orange }]}>{dealsStatsPending ? '…' : summary.deals}</Text>
            <Text style={styles.sumLabel}>Deals</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.red }]}>{overdueStatsPending ? '…' : summary.overdue}</Text>
            <Text style={styles.sumLabel}>Quá hạn</Text>
          </View>
        </View>

        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickBtn, { borderColor: Colors.blue }]}
            onPress={() => navigation.navigate('Tabs', { screen: 'Lead' })}
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
            onPress={() => navigation.navigate('Tabs', { screen: 'Deal' })}
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
            showOwner={showOwner}
            maxBuffer={maxBuffer}
            onLoadMore={() => void loadMoreLeads()}
          />
          <PlannerSection
            kind="deal"
            state={dealState}
            loading={dealsLoading}
            loadingMore={dealsLoadingMore}
            showOwner={showOwner}
            maxBuffer={maxBuffer}
            onLoadMore={() => void loadMoreDeals()}
          />
        </View>
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
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12, minWidth: 0 },
  headerTextWrap: { flex: 1, minWidth: 0 },
  greetTitle: { color: Colors.text, fontSize: 20, fontWeight: '900' },
  greetDate: { color: Colors.textMuted, fontSize: 12.5, marginTop: 3, fontWeight: '600' },
  motivateTxt: {
    color: Colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
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
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
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
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ownerTxt: { flex: 1, color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
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
