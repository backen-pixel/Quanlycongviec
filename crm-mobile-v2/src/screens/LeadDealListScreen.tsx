import AsyncStorage from '@react-native-async-storage/async-storage';
import SpinningLoader from '../components/SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError, isAbortError, isNetworkError } from '../api/client';
import {
  convertLeadToDeal,
  fetchCrmListPage,
  fetchCrmStageCountsBatch,
  fetchPipelineStages,
  KANBAN_PAGE_SIZE,
  moveCrmItemStage,
  setCrmHubCache,
  setCrmKanbanDeadline,
  setCrmLeadInteracted,
  prefetchCrmProductionCompanies,
  type CrmSxProductionTarget,
} from '../api/crm';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import {
  fetchCrmCompanies,
  fetchCrmEmployeesByCompany,
  fetchCrmRegions,
  type CrmCompany,
  type CrmDepartment,
  type CrmEmployee,
  type CrmRegion,
} from '../api/crmMeta';
import CrmFilterSheet from '../components/CrmFilterSheet';
import CrmListCard from '../components/CrmListCard';
import CrmListCardOptionsSheet, {
  type CrmListCardMenuAction,
} from '../components/CrmListCardOptionsSheet';
import CrmSearchSuggestDropdown from '../components/CrmSearchSuggestDropdown';
import DatePickerSheet from '../components/DatePickerSheet';
import DealWonSxPickerModal from '../components/DealWonSxPickerModal';
import MoveStageModal from '../components/MoveStageModal';
import NotificationBadge from '../components/NotificationBadge';
import { useAuth, currentUserId } from '../context/AuthContext';
import { useCreateMenu } from '../context/CreateMenuContext';
import { applyCrmBadgeFieldsToItem } from '../lib/crmBadgePatch';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import { useCrmSearchSuggest, scoreCrmSearchSuggestItem } from '../hooks/useCrmSearchSuggest';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { lockCrmAssigneeScope, lockCrmCompanyScope, canViewAllCrm } from '../lib/crmAssignee';
import ListCreateFab from '../components/ListCreateFab';
import {
  activeFilterChips,
  buildStageFetchOpts,
  countActiveFilters,
  filtersForCrmSearchSuggest,
  REGION_NONE,
  searchPlaceholder,
  searchQueryForCrmItem,
  serverFilterKey,
} from '../lib/crmFilters';
import {
  listDateSectionLabel,
  listDateSectionOrder,
} from '../lib/crmListDateSections';
import {
  CRM_LIST_SORT_OPTIONS,
  crmListSortLabel,
  isCrmListSort,
  sortCrmListItems,
  type CrmListSort,
} from '../lib/crmListSort';
import {
  readDefaultDealKhSplitEnabled,
  readStoredDealKhSplitPreference,
  storeDealKhSplitPreference,
} from '../lib/crmDealKhSplit';
import {
  hasCrmCustomerOrderTab,
  resolveCrmHubDisplayStages,
} from '../lib/crmPipelineTabs';
import { useCrmHubFilters } from '../hooks/useCrmHubFilters';
import { deadlineIsoToYmd, planCrmStageMove } from '../lib/crmStageMove';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { CrmKanbanItem, CrmPipelineStage } from '../types';
import CrmHubScreen from './CrmHubScreen';
import PickerSheet from '../components/PickerSheet';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Kind = 'lead' | 'deal';
type ViewMode = 'list' | 'kanban';
type DealListTab = 'deals' | 'orders';
type Section = { title: string; data: CrmKanbanItem[]; count: number };
type Props = { kind: Kind };

const viewModeKey = (kind: Kind) => `crmv2_tab_view_mode:${kind}`;
const sortKey = (kind: Kind) => `crmv2_tab_list_sort:${kind}`;

export default function LeadDealListScreen({ kind }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const myId = currentUserId(user);
  const lockCompany = lockCrmCompanyScope(user);
  const lockAssignee = lockCrmAssigneeScope(user);
  const adminLike = canViewAllCrm(user);
  const unreadNotif = useUnreadNotificationCount();

  const [dealKhSplitEnabled, setDealKhSplitEnabled] = useState(() =>
    readDefaultDealKhSplitEnabled(adminLike),
  );
  const [dealListTab, setDealListTab] = useState<DealListTab>('deals');
  const isOrdersList = kind === 'deal' && dealKhSplitEnabled && dealListTab === 'orders';
  const title = kind === 'lead' ? 'Leads' : (isOrdersList ? 'Đơn hàng' : 'Deals');
  const mode = kind === 'lead' ? 'leads' : 'deals';
  const { toggle: toggleCreateMenu } = useCreateMenu();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [viewModeReady, setViewModeReady] = useState(false);
  const [switchingToKanban, setSwitchingToKanban] = useState(false);
  const [listSort, setListSort] = useState<CrmListSort>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const {
    ready: filtersReady,
    filters,
    search,
    searchDraft,
    setSearchDraft,
    commitSearch,
    setFilters,
    resetFilters,
  } = useCrmHubFilters();
  const [stageId, setStageId] = useState('');
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [items, setItems] = useState<CrmKanbanItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<CrmKanbanItem | null>(null);
  const [moveItem, setMoveItem] = useState<CrmKanbanItem | null>(null);
  const [deadlineItem, setDeadlineItem] = useState<CrmKanbanItem | null>(null);
  const [moveDeadlineCtx, setMoveDeadlineCtx] = useState<{
    item: CrmKanbanItem;
    target: CrmPipelineStage;
  } | null>(null);
  const [moveSxCtx, setMoveSxCtx] = useState<{
    item: CrmKanbanItem;
    target: CrmPipelineStage;
  } | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');

  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [regions, setRegions] = useState<CrmRegion[]>([]);
  const [departments, setDepartments] = useState<CrmDepartment[]>([]);
  const [employees, setEmployees] = useState<CrmEmployee[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const loadGenRef = useRef(0);
  const skipNextFocusRefresh = useRef(true);
  const lastFocusLoadAtRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const searchRef = useRef(search);
  const searchDraftRef = useRef(searchDraft);
  const itemsRef = useRef(items);
  searchRef.current = search;
  searchDraftRef.current = searchDraft;
  itemsRef.current = items;
  const filterKey = serverFilterKey(filters, '');
  const listActive = viewModeReady && viewMode === 'list';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedView, savedSort] = await Promise.all([
        AsyncStorage.getItem(viewModeKey(kind)).catch(() => null),
        AsyncStorage.getItem(sortKey(kind)).catch(() => null),
      ]);
      if (cancelled) return;
      if (savedView === 'kanban' || savedView === 'list') setViewMode(savedView);
      if (isCrmListSort(savedSort)) setListSort(savedSort);
      setViewModeReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const { isOnline } = useNetworkStatus();
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const switchViewMode = useCallback((next: ViewMode) => {
    if (next === viewMode) return;
    if (next === 'kanban') {
      // Một frame cho press highlight — mount Hub ngay (cache warm làm paint nhanh).
      setSwitchingToKanban(true);
      requestAnimationFrame(() => {
        setViewMode('kanban');
        setSwitchingToKanban(false);
        void AsyncStorage.setItem(viewModeKey(kind), 'kanban').catch(() => undefined);
      });
      return;
    }
    setViewMode('list');
    void AsyncStorage.setItem(viewModeKey(kind), 'list').catch(() => undefined);
  }, [kind, viewMode]);

  const switchListSort = useCallback((next: CrmListSort) => {
    setListSort(next);
    setSortOpen(false);
    void AsyncStorage.setItem(sortKey(kind), next).catch(() => undefined);
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pref = await readStoredDealKhSplitPreference(adminLike);
      if (!cancelled) setDealKhSplitEnabled(pref);
    })();
    return () => { cancelled = true; };
  }, [adminLike]);

  const applyDealKhSplit = useCallback((enabled: boolean) => {
    setDealKhSplitEnabled(enabled);
    void storeDealKhSplitPreference(enabled);
    if (!enabled) {
      setDealListTab('deals');
      setStageId('');
    }
  }, []);

  // Đổi công ty → pipeline/stage khác ID; giữ stageId cũ khiến list trống.
  const prevCompanyRef = useRef(filters.companyId);
  useEffect(() => {
    if (prevCompanyRef.current === filters.companyId) return;
    prevCompanyRef.current = filters.companyId;
    setStageId('');
    setStageCounts({});
    setStages([]);
  }, [filters.companyId]);

  // Đổi bộ lọc chung (ngày / SĐT / NV…) → về «Tất cả» giai đoạn.
  // Tránh KPI «Lead hôm nay» = 2 trong khi List còn kẹt 1 cột chỉ hiện 1 thẻ.
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    setStageId('');
  }, [filterKey]);

  // Stage đã chọn không còn trong pipeline (theo tab Deal/ĐH) → về «Tất cả».
  useEffect(() => {
    if (!stageId) return;
    const pool = kind === 'deal'
      ? resolveCrmHubDisplayStages(
        dealListTab === 'orders' ? 'orders' : 'deals',
        [],
        stages,
        dealKhSplitEnabled,
      )
      : stages;
    if (!pool.length) return;
    if (!pool.some((s) => String(s.id) === String(stageId))) {
      setStageId('');
    }
  }, [stages, stageId, kind, dealListTab, dealKhSplitEnabled]);

  const displayStages = useMemo(() => {
    if (kind !== 'deal') return stages;
    return resolveCrmHubDisplayStages(
      dealListTab === 'orders' ? 'orders' : 'deals',
      [],
      stages,
      dealKhSplitEnabled,
    );
  }, [kind, stages, dealListTab, dealKhSplitEnabled]);

  const showOrdersTab = kind === 'deal' && hasCrmCustomerOrderTab(stages) && dealKhSplitEnabled;

  const allowedStageIds = useMemo(
    () => new Set(displayStages.map((s) => String(s.id))),
    [displayStages],
  );

  /** Khi Tách + «Tất cả»: chỉ hiện thẻ thuộc cột tab Deal hoặc Đơn hàng. */
  const visibleItems = useMemo(() => {
    let rows = items;
    if (kind === 'deal' && dealKhSplitEnabled && !stageId && allowedStageIds.size) {
      rows = rows.filter((it) => it.stageId && allowedStageIds.has(String(it.stageId)));
    }
    const q = search.trim();
    if (q) {
      rows = rows.filter((it) => scoreCrmSearchSuggestItem(it, q, filters.searchField) > 0);
    }
    return rows;
  }, [kind, dealKhSplitEnabled, stageId, items, allowedStageIds, search, filters.searchField]);

  const fetchOpts = useMemo(
    () => buildStageFetchOpts(filters, '', myId || ''),
    [filters, myId],
  );

  const loadMeta = useCallback(async (overrideCompanyId?: string) => {
    setMetaLoading(true);
    try {
      const companyId = overrideCompanyId || filters.companyId || user?.company_id || undefined;
      const [cos, regs, empPack] = await Promise.all([
        fetchCrmCompanies().catch(() => [] as CrmCompany[]),
        fetchCrmRegions(companyId || '').catch(() => [] as CrmRegion[]),
        fetchCrmEmployeesByCompany(companyId || '').catch(() => ({
          departments: [] as CrmDepartment[],
          users: [] as CrmEmployee[],
          companyId: null,
        })),
      ]);
      setCompanies(
        lockCompany && user?.company_id
          ? cos.filter((c) => String(c.id) === String(user.company_id))
          : cos,
      );
      setRegions(regs);
      setEmployees(empPack.users || []);
      setDepartments(empPack.departments || []);
    } finally {
      setMetaLoading(false);
    }
  }, [filters.companyId, user?.company_id, lockCompany]);

  // Prefetch meta để chip «đang lọc» hiện đúng tên CT / KV / NV. Kanban: Hub tự tải.
  useEffect(() => {
    if (!listActive) return;
    void loadMeta();
  }, [filters.companyId, listActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPage = useCallback(
    async (modeLoad: 'replace' | 'append' | 'refresh') => {
      if (
        modeLoad === 'append'
        && (searchDraftRef.current.trim().length >= 2 || searchRef.current.trim())
      ) {
        setLoadingMore(false);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++loadGenRef.current;

      if (modeLoad === 'append') setLoadingMore(true);
      else if (modeLoad === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError('');

      try {
        const offset = modeLoad === 'append' ? nextOffsetRef.current : 0;
        const listOpts = { ...fetchOpts, signal: ac.signal, stageId: stageId || undefined };

        const pagePromise = fetchCrmListPage(kind, offset, KANBAN_PAGE_SIZE, listOpts);
        const metaPromise =
          modeLoad === 'append'
            ? Promise.resolve(null)
            : Promise.all([
                fetchPipelineStages(kind, { ...fetchOpts, signal: ac.signal }),
                fetchCrmStageCountsBatch(kind, { ...fetchOpts, signal: ac.signal }).catch(() => null),
              ]);

        const [page, meta] = await Promise.all([pagePromise, metaPromise]);
        if (ac.signal.aborted || gen !== loadGenRef.current) return;

        setItems((prev) => (modeLoad === 'append' ? [...prev, ...page.items] : page.items));
        setHasMore(page.hasMore);
        nextOffsetRef.current = page.nextOffset;
        setNextOffset(page.nextOffset);

        if (meta) {
          const [stg, batch] = meta;
          setListTotal(batch?.total ?? page.total);
          setStages(stg);
          const nextCounts = batch?.counts || {};
          if (batch?.counts) setStageCounts(batch.counts);
          // Warm cache cho Kanban — List→Kanban offline vẫn còn cột + badge.
          if (myId && stg.length) {
            const counts: Record<string, number> = { ...nextCounts };
            for (const s of stg) {
              if (counts[s.id] === undefined) counts[s.id] = 0;
            }
            setCrmHubCache(myId, kind, serverFilterKey(filters, ''), {
              data: {
                stages: stg,
                stageCounts: counts,
                listTotal: batch?.total ?? page.total,
                cache: {},
              },
              activeStageId: String(stg[0]?.id || ''),
              activeIndex: 0,
            });
          }
        } else if (modeLoad !== 'append') {
          setListTotal((prev) => prev ?? page.total);
        }
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted || gen !== loadGenRef.current) return;
        const msg = formatApiError(e);
        if (!msg) return;
        // Offline / lỗi mạng: giữ danh sách + badge đã có — tránh giật về 0.
        if (isNetworkError(e) || !isOnlineRef.current) {
          setError(msg);
          return;
        }
        setError(msg);
        if (modeLoad !== 'append') setItems([]);
      } finally {
        if (!ac.signal.aborted && gen === loadGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [kind, fetchOpts, stageId, myId, filters],
  );

  useEffect(() => {
    if (!filtersReady || !listActive) return;
    const searching = !!searchRef.current.trim() || searchDraftRef.current.trim().length >= 2;
    if (searching && itemsRef.current.length > 0) {
      setLoading(false);
      return;
    }
    nextOffsetRef.current = 0;
    skipNextFocusRefresh.current = true;
    lastFocusLoadAtRef.current = Date.now();
    void loadPage('replace');
  }, [kind, filterKey, stageId, loadPage, filtersReady, listActive]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefresh.current) {
        skipNextFocusRefresh.current = false;
        return;
      }
      if (!filtersReady || !listActive) return;
      if (!isOnlineRef.current) return;
      const LIST_FOCUS_TTL_MS = 45_000;
      if (Date.now() - lastFocusLoadAtRef.current < LIST_FOCUS_TTL_MS) return;
      lastFocusLoadAtRef.current = Date.now();
      void loadPage('refresh');
    }, [loadPage, filtersReady, listActive]),
  );

  useCrmRealtimeRefresh((payload) => {
    if (!isOnlineRef.current) return;
    const detail = payload?.detail;
    const LIST_REALTIME_TTL_MS = 45_000;
    const scheduleRefresh = (force = false) => {
      if (!listActive) return;
      if (!force && Date.now() - lastFocusLoadAtRef.current < LIST_REALTIME_TTL_MS) return;
      lastFocusLoadAtRef.current = Date.now();
      void loadPage('refresh');
    };
    if (
      detail?.lead_id
      && (
        payload?.reason === 'badge_updated'
        || detail.action === 'stage_changed'
        || detail.reason === 'project_deleted'
        || detail.action === 'deleted'
      )
    ) {
      const lid = String(detail.lead_id);
      if (detail.reason === 'project_deleted' || detail.action === 'deleted') {
        setItems((list) => list.filter((it) => it.id !== lid));
      } else {
        const sid = detail.stage_id != null ? String(detail.stage_id) : null;
        const stage = sid ? stages.find((s) => String(s.id) === sid) : null;
        setItems((list) => list.map((it) => {
          if (it.id !== lid) return it;
          return applyCrmBadgeFieldsToItem({
            ...it,
            ...(sid
              ? {
                  stageId: sid,
                  stageName: stage?.name || it.stageName,
                  stageColor: stage?.color || it.stageColor,
                }
              : null),
          }, detail);
        }));
      }
      // Chip đã hiện ngay — đồng bộ list nền sau (tránh giật), tôn trọng TTL.
      if (payload?.reason === 'badge_updated') {
        setTimeout(() => scheduleRefresh(false), 2500);
        return;
      }
      // Xóa / đổi cột: refresh ngay (force).
      scheduleRefresh(true);
      return;
    }
    scheduleRefresh(false);
  }, listActive);

  const sections: Section[] = useMemo(() => {
    const sorted = sortCrmListItems(visibleItems, listSort);
    if (listSort !== 'newest' && listSort !== 'last_week' && listSort !== 'last_month') {
      return [{
        title: `Sắp xếp: ${crmListSortLabel(listSort)}`,
        data: sorted,
        count: sorted.length,
      }];
    }
    const map = new Map<string, CrmKanbanItem[]>();
    for (const it of sorted) {
      const label = listDateSectionLabel(it.createdAt);
      const arr = map.get(label) || [];
      arr.push(it);
      map.set(label, arr);
    }
    return [...map.entries()]
      .map(([secTitle, data]) => ({ title: secTitle, data, count: data.length }))
      .sort((a, b) => listDateSectionOrder(a.title) - listDateSectionOrder(b.title));
  }, [visibleItems, listSort]);

  const deadlineSuggestFilters = useMemo(
    () => filtersForCrmSearchSuggest(filters),
    [filters],
  );
  const searchUiActive = searchDraft.trim().length >= 2 || !!search.trim();
  const {
    open: searchSuggestOpen,
    loading: searchSuggestLoading,
    items: searchSuggestItems,
    total: searchSuggestTotal,
    setDismissed: setSearchSuggestDismissed,
  } = useCrmSearchSuggest({
    enabled: listActive,
    type: kind,
    searchDraft,
    filters: deadlineSuggestFilters,
    myId: myId || '',
    localItems: items,
  });

  const listRef = useRef<SectionList<CrmKanbanItem, Section>>(null);
  const pendingSearchFocusRef = useRef<CrmKanbanItem | null>(null);
  const [highlightCardId, setHighlightCardId] = useState<string | null>(null);
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHighlight = useCallback((id: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightCardId(id);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightCardId(null);
      highlightTimerRef.current = null;
    }, 2800);
  }, []);

  const focusSearchResult = useCallback((item: CrmKanbanItem) => {
    setSearchSuggestDismissed(true);
    const q = searchQueryForCrmItem(item);
    if (q) {
      setSearchDraft(q);
      commitSearch(q);
    }
    Keyboard.dismiss();
    pendingSearchFocusRef.current = item;
    if (stageId && item.stageId && String(stageId) !== String(item.stageId)) {
      setStageId(item.stageId);
    } else {
      setItems((prev) => (prev.some((it) => it.id === item.id) ? prev : [item, ...prev]));
    }
    setSearchFocusNonce((n) => n + 1);
  }, [stageId, setSearchSuggestDismissed, setSearchDraft, commitSearch]);

  const openSearchResultDetail = useCallback((item: CrmKanbanItem) => {
    setSearchSuggestDismissed(true);
    Keyboard.dismiss();
    navigation.navigate('LeadDealDetail', {
      leadId: item.id,
      kind: item.kind,
      code: item.code,
      title: item.title,
    });
  }, [navigation, setSearchSuggestDismissed]);

  useEffect(() => {
    const pending = pendingSearchFocusRef.current;
    if (!pending) return;
    if (!items.some((it) => it.id === pending.id)) {
      setItems((prev) => (prev.some((it) => it.id === pending.id) ? prev : [pending, ...prev]));
      return;
    }
    let sectionIndex = -1;
    let itemIndex = -1;
    for (let si = 0; si < sections.length; si += 1) {
      const ii = sections[si].data.findIndex((it) => it.id === pending.id);
      if (ii >= 0) {
        sectionIndex = si;
        itemIndex = ii;
        break;
      }
    }
    if (sectionIndex < 0 || itemIndex < 0) return;
    pendingSearchFocusRef.current = null;
    flashHighlight(pending.id);
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex,
          animated: true,
          viewPosition: 0.25,
        });
      } catch {
        /* ignore */
      }
    }, 80);
    return () => clearTimeout(t);
  }, [items, sections, searchFocusNonce, flashHighlight]);

  const filterBadge = countActiveFilters(filters, search);
  /** Badge khớp dữ liệu đang xem: cột đang chọn / tab Deal·ĐH / toàn pipeline. */
  const displayTotal = (() => {
    if (stageId) return stageCounts[stageId] ?? visibleItems.length;
    if (kind === 'deal' && dealKhSplitEnabled && displayStages.length) {
      return displayStages.reduce((sum, s) => sum + (stageCounts[s.id] ?? 0), 0);
    }
    return listTotal ?? visibleItems.length;
  })();

  const filterChips = useMemo(() => {
    const companyName = companies.find((c) => c.id === filters.companyId)?.name
      || companies.find((c) => c.id === filters.companyId)?.short_name
      || undefined;
    const regionName = filters.regionId === REGION_NONE
      ? 'Chưa gán KV'
      : regions.find((r) => r.id === filters.regionId)?.name;
    const assigneeName = employees.find((u) => u.id === filters.assigneeUserId)?.full_name
      || employees.find((u) => u.id === filters.assigneeUserId)?.email;
    return activeFilterChips(
      filters,
      search,
      {
        companyName: companyName || undefined,
        regionName: regionName || undefined,
        assigneeName: assigneeName || undefined,
      },
      (patch) => {
        if (
          Object.prototype.hasOwnProperty.call(patch, 'companyId')
          && String(patch.companyId || '') !== String(filters.companyId || '')
        ) {
          setStageId('');
        }
        setFilters((prev) => ({ ...prev, ...patch }));
      },
      () => commitSearch(''),
      false,
      lockCompany,
      lockAssignee,
    );
  }, [filters, search, companies, regions, employees, lockCompany, lockAssignee, commitSearch]);

  const clearAllFilters = useCallback(() => {
    setStageId('');
    resetFilters();
  }, [resetFilters]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<CrmKanbanItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const applyListStageMove = useCallback(
    async (
      item: CrmKanbanItem,
      target: CrmPipelineStage,
      kanbanDeadlineAt?: string,
      sxTargets?: CrmSxProductionTarget[],
    ) => {
      setMovingId(item.id);
      setMoveItem(null);
      const prev = { ...item };
      const leaveFilteredColumn = !!stageId && String(stageId) !== String(target.id);
      if (leaveFilteredColumn) {
        setItems((list) => list.filter((it) => it.id !== item.id));
      } else {
        patchItem(item.id, {
          stageId: target.id,
          stageName: target.name,
          stageColor: target.color,
          ...(kanbanDeadlineAt ? { dueIso: kanbanDeadlineAt, overdue: false } : null),
          ...(sxTargets?.length ? { projectId: item.projectId || 'pending' } : null),
        });
      }
      setStageCounts((c) => {
        const next = { ...c };
        if (prev.stageId) next[prev.stageId] = Math.max(0, (next[prev.stageId] ?? 1) - 1);
        next[target.id] = (next[target.id] ?? 0) + 1;
        return next;
      });
      try {
        if (sxTargets?.length) {
          showToast(`Đang tạo dự án SX…`);
        }
        await moveCrmItemStage(item.id, target.id, {
          kanbanDeadlineAt: kanbanDeadlineAt || undefined,
          targets: sxTargets,
        });
        showToast(
          sxTargets?.length
            ? `Đã chuyển → ${target.name} (đã tạo SX)`
            : `Đã chuyển → ${target.name}`,
        );
      } catch (e) {
        if (leaveFilteredColumn) {
          setItems((list) => [prev, ...list]);
        } else {
          patchItem(item.id, prev);
        }
        showToast(formatApiError(e));
      } finally {
        setMovingId(null);
      }
    },
    [stageId, patchItem, showToast],
  );

  const handleMoveToStage = useCallback(
    async (targetStageId: string) => {
      const item = moveItem;
      if (!item) return;
      const target = stages.find((s) => String(s.id) === String(targetStageId));
      if (!target) {
        showToast('Không tìm thấy cột đích');
        return;
      }
      setMoveItem(null);
      const plan = planCrmStageMove({
        kind: item.kind,
        target,
        existingDeadlineIso: item.dueIso,
        projectId: item.projectId,
        stages,
        itemCode: item.code,
      });
      if (plan.action === 'convert_deal') {
        Alert.alert(
          'Chuyển Deal',
          `«${target.name}» là cột thắng — không chuyển cột trực tiếp. Dùng Chuyển Deal để tạo Deal đúng quy trình (giống web).`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Chuyển Deal ngay',
              onPress: () => {
                void (async () => {
                  try {
                    await convertLeadToDeal(item.id, {
                      regionId: item.regionId,
                      companyId: item.companyId,
                    });
                    showToast('Đã chuyển sang Deal');
                    setItems((list) => list.filter((it) => it.id !== item.id));
                  } catch (e) {
                    showToast(formatApiError(e));
                  }
                })();
              },
            },
          ],
        );
        return;
      }
      if (plan.action === 'block_need_won_sx') {
        Alert.alert('Cần tạo dự án SX trước', plan.message, [{ text: 'OK' }]);
        return;
      }
      if (plan.action === 'need_sx_pick') {
        prefetchCrmProductionCompanies(item.companyId || filters.companyId);
        setMoveSxCtx({ item, target });
        return;
      }
      if (plan.action === 'need_deadline') {
        setMoveDeadlineCtx({ item, target });
        return;
      }
      await applyListStageMove(item, target, plan.kanbanDeadlineAt);
    },
    [moveItem, stages, showToast, applyListStageMove, filters.companyId],
  );

  const handleMenuAction = useCallback(
    (action: CrmListCardMenuAction) => {
      const item = menuItem;
      if (!item) return;
      if (action === 'deadline') {
        setDeadlineItem(item);
        return;
      }
      if (action === 'comments') {
        navigation.navigate('LeadDealDetail', {
          leadId: item.id,
          kind: item.kind,
          code: item.code,
          title: item.title,
          initialTab: 'comments',
        });
        return;
      }
      if (action === 'interacted') {
        const next = !item.isInteracted;
        patchItem(item.id, { isInteracted: next });
        void (async () => {
          try {
            await setCrmLeadInteracted(item.id, next);
            showToast(next ? 'Đã đánh dấu tương tác' : 'Đã bỏ tương tác');
          } catch (e) {
            patchItem(item.id, { isInteracted: !next });
            showToast(formatApiError(e));
          }
        })();
      }
    },
    [menuItem, navigation, patchItem, showToast],
  );

  const handleDeadlineSelect = useCallback(
    async (ymd: string) => {
      const item = deadlineItem;
      setDeadlineItem(null);
      if (!item) return;
      const prevDue = item.dueIso;
      const nextIso = `${ymd}T09:00:00`;
      patchItem(item.id, { dueIso: nextIso, overdue: false });
      try {
        await setCrmKanbanDeadline(item.id, ymd);
        showToast('Đã đặt deadline');
      } catch (e) {
        patchItem(item.id, { dueIso: prevDue });
        showToast(formatApiError(e));
      }
    },
    [deadlineItem, patchItem, showToast],
  );

  const handleDeadlineClear = useCallback(async () => {
    const item = deadlineItem;
    setDeadlineItem(null);
    if (!item) return;
    const prevDue = item.dueIso;
    patchItem(item.id, { dueIso: null, overdue: false });
    try {
      await setCrmKanbanDeadline(item.id, null);
      showToast('Đã xóa deadline');
    } catch (e) {
      patchItem(item.id, { dueIso: prevDue });
      showToast(formatApiError(e));
    }
  }, [deadlineItem, patchItem, showToast]);

  const stageChips = useMemo(() => {
    const visible = filters.hideEmptyStages
      ? displayStages.filter((s) => (stageCounts[s.id] ?? 0) > 0 || s.id === stageId)
      : displayStages;
    return visible.length ? visible : displayStages;
  }, [displayStages, stageCounts, filters.hideEmptyStages, stageId]);

  const switchDealListTab = useCallback((next: DealListTab) => {
    if (next === dealListTab) return;
    setDealListTab(next);
    setStageId('');
  }, [dealListTab]);

  if (!viewModeReady || switchingToKanban) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 48, alignItems: 'center' }]}>
        <SpinningLoader color={Colors.blue} />
        {switchingToKanban ? (
          <Text style={{ marginTop: 12, color: Colors.textMuted, fontWeight: '600' }}>
            Đang chuyển sang Kanban…
          </Text>
        ) : null}
      </View>
    );
  }

  if (viewMode === 'kanban') {
    return (
      <CrmHubScreen
        navigation={navigation as React.ComponentProps<typeof CrmHubScreen>['navigation']}
        route={{
          key: `embedded-${kind}`,
          name: 'CrmHub',
          params: {
            initialMode: mode,
            embedded: true,
            lockMode: true,
          },
        }}
        onSwitchToList={() => switchViewMode('list')}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Menu')} hitSlop={6}>
          <Ionicons name="menu-outline" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countTxt}>{displayTotal > 9999 ? '9999+' : displayTotal}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={6}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.text} />
            <NotificationBadge count={unreadNotif} style={styles.bellBadge} />
          </Pressable>
        </View>
      </View>

      {showOrdersTab ? (
        <View style={styles.dealOrderSeg}>
          <Pressable
            style={[styles.dealOrderSegItem, dealListTab === 'deals' && styles.dealOrderSegDealOn]}
            onPress={() => switchDealListTab('deals')}
          >
            <Ionicons
              name="pricetags"
              size={14}
              color={dealListTab === 'deals' ? '#fff' : Colors.textMuted}
            />
            <Text style={[styles.dealOrderSegTxt, dealListTab === 'deals' && { color: '#fff' }]}>
              Deal
            </Text>
          </Pressable>
          <Pressable
            style={[styles.dealOrderSegItem, dealListTab === 'orders' && styles.dealOrderSegOrderOn]}
            onPress={() => switchDealListTab('orders')}
          >
            <Ionicons
              name="cart"
              size={14}
              color={dealListTab === 'orders' ? '#fff' : Colors.textMuted}
            />
            <Text style={[styles.dealOrderSegTxt, dealListTab === 'orders' && { color: '#fff' }]}>
              Đơn hàng
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchRowWrap}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={Colors.textFaint} />
          <TextInput
            value={searchDraft}
            onChangeText={(t) => {
              setSearchDraft(t);
              setSearchSuggestDismissed(false);
            }}
            onFocus={() => setSearchSuggestDismissed(false)}
            placeholder={searchPlaceholder(filters.searchField, kind)}
            placeholderTextColor={Colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => {
              setSearchSuggestDismissed(true);
              commitSearch(searchDraft.trim());
            }}
          />
          {searchDraft ? (
            <Pressable
              onPress={() => {
                setSearchDraft('');
                setSearchSuggestDismissed(false);
              }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={17} color={Colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.filterBtn, filterBadge > 0 && styles.filterBtnActive]}
          onPress={() => {
            setSearchSuggestDismissed(true);
            void loadMeta();
            setFilterOpen(true);
          }}
        >
          <Ionicons name="options-outline" size={16} color={filterBadge > 0 ? '#fff' : Colors.text} />
          <Text style={[styles.filterTxt, filterBadge > 0 && { color: '#fff' }]}>Bộ lọc</Text>
          {filterBadge > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeTxt}>{filterBadge}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <CrmSearchSuggestDropdown
        open={searchSuggestOpen}
        query={searchDraft}
        loading={searchSuggestLoading}
        items={searchSuggestItems}
        total={searchSuggestTotal}
        onDismiss={() => setSearchSuggestDismissed(true)}
        onSelect={focusSearchResult}
        onOpenDetail={openSearchResultDetail}
      />
      </View>

      {filterChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeChipScroll}
          contentContainerStyle={styles.activeChipContent}
        >
          {filterChips.map((chip) => (
            <Pressable
              key={chip.key}
              style={styles.activeChip}
              onPress={chip.onClear}
              disabled={lockAssignee && chip.key === 'mine'}
            >
              <Text style={styles.activeChipTxt} numberOfLines={1}>{chip.label}</Text>
              {!(lockAssignee && chip.key === 'mine') ? (
                <Ionicons name="close" size={13} color={Colors.blue} />
              ) : null}
            </Pressable>
          ))}
          <Pressable style={styles.activeChipClear} onPress={clearAllFilters}>
            <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        <Pressable
          style={[styles.chip, !stageId && styles.chipActive]}
          onPress={() => setStageId('')}
        >
          <Text style={[styles.chipTxt, !stageId && styles.chipTxtActive]}>Tất cả</Text>
          {displayTotal > 0 ? (
            <View style={[styles.chipBadge, !stageId && styles.chipBadgeActive]}>
              <Text style={[styles.chipBadgeTxt, !stageId && styles.chipBadgeTxtActive]}>
                {displayTotal > 999 ? '999+' : displayTotal}
              </Text>
            </View>
          ) : null}
        </Pressable>
        {stageChips.map((s) => {
          const active = s.id === stageId;
          const count = stageCounts[s.id] ?? 0;
          return (
            <Pressable
              key={s.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStageId(s.id)}
            >
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]} numberOfLines={1}>
                {s.name}
              </Text>
              {count > 0 ? (
                <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                  <Text style={[styles.chipBadgeTxt, active && styles.chipBadgeTxtActive]}>
                    {count > 999 ? '999+' : count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sortRow}>
        <Pressable
          style={styles.sortBtn}
          onPress={() => setSortOpen(true)}
          accessibilityLabel="Chọn cách sắp xếp"
        >
          <Ionicons name="swap-vertical" size={15} color={Colors.blue} />
          <Text style={styles.sortTxt}>
            Sắp xếp: <Text style={styles.sortStrong}>{crmListSortLabel(listSort)}</Text>
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </Pressable>
        <View style={styles.viewMode}>
          <Text style={styles.viewModeLbl}>Chế độ xem:</Text>
          <Pressable
            style={[styles.viewBtn, styles.viewBtnOn]}
            onPress={() => switchViewMode('list')}
            accessibilityLabel="Xem dạng list"
          >
            <Ionicons name="list" size={15} color={Colors.blue} />
          </Pressable>
          <Pressable
            style={styles.viewBtn}
            onPress={() => switchViewMode('kanban')}
            accessibilityLabel="Xem dạng kanban"
          >
            <Ionicons name="grid-outline" size={15} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && !items.length && !searchUiActive ? (
        <View style={styles.center}>
          <SpinningLoader color={Colors.blue} />
        </View>
      ) : (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(it) => it.id}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={() => undefined}
          renderItem={({ item }) => (
            <CrmListCard
              item={item}
              moving={movingId === item.id}
              highlighted={highlightCardId === item.id}
              onPress={() =>
                navigation.navigate('LeadDealDetail', {
                  leadId: item.id,
                  kind: item.kind,
                  code: item.code,
                  title: item.title,
                })
              }
              onMore={() => setMenuItem(item)}
              onMove={() => setMoveItem(item)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.count} {kind === 'lead' ? 'Lead' : 'Deal'}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadPage('refresh')}
              tintColor={Colors.blue}
            />
          }
          onEndReached={() => {
            if (searchUiActive) return;
            if (hasMore && !loadingMore && !loading) void loadPage('append');
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            !searchUiActive && loadingMore ? (
              <SpinningLoader color={Colors.blue} style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error
                || (kind === 'lead'
                  ? 'Không có Lead'
                  : (isOrdersList ? 'Không có Đơn hàng' : 'Không có Deal'))}
            </Text>
          }
        />
      )}

      <ListCreateFab
        kind={kind}
        onPress={toggleCreateMenu}
        bottom={12}
      />

      <PickerSheet
        visible={sortOpen}
        title="Sắp xếp danh sách"
        options={CRM_LIST_SORT_OPTIONS}
        selectedId={listSort}
        accent={kind === 'lead' ? Colors.blue : Colors.orange}
        onSelect={(opt) => {
          if (opt && isCrmListSort(opt.id)) switchListSort(opt.id);
          else setSortOpen(false);
        }}
        onClose={() => setSortOpen(false)}
      />

      <CrmFilterSheet
        visible={filterOpen}
        mode={isOrdersList ? 'orders' : mode}
        filters={filters}
        search={search}
        companies={companies}
        regions={regions}
        departments={departments}
        employees={employees}
        metaLoading={metaLoading}
        lockCompany={lockCompany}
        lockAssignee={lockAssignee}
        showDealOrderSplit={kind === 'deal' && hasCrmCustomerOrderTab(stages)}
        dealKhSplitEnabled={dealKhSplitEnabled}
        onDealKhSplitChange={applyDealKhSplit}
        onApply={(f) => {
          if (String(f.companyId || '') !== String(filters.companyId || '')) {
            setStageId('');
          }
          setFilters(f);
          setFilterOpen(false);
        }}
        onCompanyChange={(companyId) => {
          if (lockCompany) return;
          setStageId('');
          setFilters((prev) => ({
            ...prev,
            companyId,
            regionId: '',
            departmentId: '',
            assigneeUserId: '',
            assignee: lockAssignee ? 'mine' : 'all',
          }));
          void loadMeta(companyId);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <CrmListCardOptionsSheet
        visible={!!menuItem}
        item={menuItem}
        onAction={handleMenuAction}
        onClose={() => setMenuItem(null)}
      />

      <MoveStageModal
        visible={!!moveItem}
        stages={displayStages.length ? displayStages : stages}
        currentStageId={moveItem?.stageId}
        kind={kind}
        onSelect={(stageId) => void handleMoveToStage(stageId)}
        onClose={() => setMoveItem(null)}
      />

      <DealWonSxPickerModal
        visible={!!moveSxCtx}
        dealCode={moveSxCtx?.item.code}
        dealTitle={moveSxCtx?.item.title}
        crmCompanyId={moveSxCtx?.item.companyId || filters.companyId}
        onConfirm={(targets) => {
          const ctx = moveSxCtx;
          setMoveSxCtx(null);
          if (!ctx) return;
          void applyListStageMove(ctx.item, ctx.target, undefined, targets);
        }}
        onClose={() => setMoveSxCtx(null)}
      />

      <DatePickerSheet
        visible={!!deadlineItem}
        value={
          deadlineItem?.dueIso
            ? String(deadlineItem.dueIso).slice(0, 10)
            : null
        }
        accent={kind === 'lead' ? Colors.blue : Colors.orange}
        onSelect={(ymd) => void handleDeadlineSelect(ymd)}
        onClear={deadlineItem?.dueIso ? () => void handleDeadlineClear() : undefined}
        onClose={() => setDeadlineItem(null)}
      />

      <DatePickerSheet
        visible={!!moveDeadlineCtx}
        value={deadlineIsoToYmd(moveDeadlineCtx?.item.dueIso)}
        accent={kind === 'lead' ? Colors.blue : Colors.orange}
        onSelect={(ymd) => {
          const ctx = moveDeadlineCtx;
          setMoveDeadlineCtx(null);
          if (!ctx) return;
          const iso = new Date(`${ymd}T09:00:00`).toISOString();
          void applyListStageMove(ctx.item, ctx.target, iso);
        }}
        onClose={() => setMoveDeadlineCtx(null)}
      />

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '900' },
  countBadge: {
    backgroundColor: Colors.blue,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealOrderSeg: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 3,
    borderRadius: Radii.md,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 3,
  },
  dealOrderSegItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radii.sm,
  },
  dealOrderSegDealOn: { backgroundColor: Colors.orange },
  dealOrderSegOrderOn: { backgroundColor: Colors.purple },
  dealOrderSegTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  bellBadge: { top: -4, right: -4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  searchRowWrap: {
    zIndex: 30,
    elevation: 12,
    overflow: 'visible',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600', padding: 0 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radii.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  filterTxt: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeChipScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 8,
    minHeight: 36,
  },
  activeChipContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignItems: 'center',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Colors.blueSoft,
    borderWidth: 1,
    borderColor: Colors.blue,
    marginRight: 8,
  },
  activeChipTxt: { color: Colors.blue, fontSize: 12, fontWeight: '700', maxWidth: 160 },
  activeChipClear: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
    justifyContent: 'center',
  },
  activeChipClearTxt: { color: Colors.red, fontSize: 12, fontWeight: '800' },
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 10,
    // Tránh maxHeight chặt cắt mép trên/dưới của chip trên Android
    minHeight: 44,
  },
  chipRow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    maxWidth: 200,
    overflow: 'hidden',
  },
  chipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  /** flexShrink để chữ dài cắt ellipsis, không đẩy badge ra ngoài chip. */
  chipTxt: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: 148,
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTxtActive: { color: '#fff' },
  chipBadge: {
    flexShrink: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chipBadgeActive: { backgroundColor: Colors.red },
  chipBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chipBadgeTxtActive: { color: '#fff' },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingVertical: 4,
    paddingRight: 4,
  },
  sortTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  sortStrong: { color: Colors.text, fontWeight: '800' },
  viewMode: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewModeLbl: { color: Colors.textFaint, fontSize: 12, fontWeight: '600' },
  viewBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewBtnOn: { backgroundColor: Colors.blueSoft, borderColor: Colors.blue },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Colors.bg,
  },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  sectionCount: { color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 48, fontWeight: '600' },
  error: { color: Colors.red, paddingHorizontal: 16, marginBottom: 6, fontWeight: '600' },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 110,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 40,
  },
  toastTxt: { color: Colors.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
