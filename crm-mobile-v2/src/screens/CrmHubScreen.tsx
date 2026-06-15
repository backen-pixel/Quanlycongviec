import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import ColumnPickerModal from '../components/ColumnPickerModal';
import CrmFilterSheet from '../components/CrmFilterSheet';
import CrmSearchFieldBar from '../components/CrmSearchFieldBar';
import MoveStageModal from '../components/MoveStageModal';
import {
  fetchCrmCompanies,
  fetchCrmEmployeesByCompany,
  fetchCrmRegions,
  type CrmCompany,
  type CrmDepartment,
  type CrmEmployee,
  type CrmRegion,
} from '../api/crmMeta';
import {
  fetchCrmBoardInitial,
  fetchCrmStageCountsBatch,
  fetchCrmStagePage,
  fetchStageCounts,
  invalidateCrmHubCache,
  invalidatePipelineStagesCache,
  KANBAN_PAGE_SIZE,
  moveCrmItemStage,
  peekCrmHubCache,
  peekCrmTotalsCache,
  setCrmHubCache,
  warmCrmHubPipelines,
} from '../api/crm';
import { formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCreateMenu } from '../context/CreateMenuContext';
import { colorFromName, initialsFromName } from '../lib/media';
import {
  activeFilterChips,
  buildStageFetchOpts,
  clientFilterKanbanItems,
  countActiveFilters,
  DEFAULT_CRM_FILTERS,
  looksLikePhoneSearch,
  ORPHAN_STAGE_ID,
  orphanVirtualStage,
  REGION_NONE,
  searchPlaceholder,
  serverFilterKey,
  type CrmHubFilters,
  type SearchField,
} from '../lib/crmFilters';
import { Colors, Radii, Spacing, stageColor } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { CrmHubData, CrmKanbanItem, CrmPipelineStage, CrmStageCache, LeadTemp } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CrmHub'>;
type Mode = 'leads' | 'deals';

const EMPTY_HUB: CrmHubData = { stages: [], stageCounts: {}, listTotal: null, cache: {} };
const EMPTY_STAGE: CrmStageCache = { items: [], hasMore: false, nextOffset: 0, loaded: false };

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

const TEMP_META: Record<LeadTemp, { label: string; color: string }> = {
  hot: { label: 'Hot', color: Colors.red },
  warm: { label: 'Warm', color: Colors.amber },
  cold: { label: 'Cold', color: Colors.cyan },
  new: { label: 'Mới', color: Colors.green },
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

type LoadingNoticeProps = {
  title: string;
  hint?: string;
  variant?: 'card' | 'banner';
};

function LoadingNotice({ title, hint, variant = 'card' }: LoadingNoticeProps) {
  if (variant === 'banner') {
    return (
      <View style={styles.loadingBanner}>
        <ActivityIndicator size="small" color={Colors.blue} />
        <View style={{ flex: 1 }}>
          <Text style={styles.loadingBannerTitle}>{title}</Text>
          {hint ? <Text style={styles.loadingBannerHint}>{hint}</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.loadingCard}>
      <ActivityIndicator color={Colors.blue} size="large" />
      <Text style={styles.loadingTitle}>{title}</Text>
      {hint ? <Text style={styles.loadingHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Trả về true chỉ khi `active` giữ nguyên đủ `delayMs`.
 * Dùng để báo "đang tải lâu" — load nhanh sẽ không kích hoạt nên không flash banner.
 */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!active) {
      setDelayed(false);
      return undefined;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return delayed;
}

/** Ngưỡng coi là "tải lâu" — dưới mức này không hiện thông báo để tránh nhấp nháy. */
const SLOW_LOAD_BANNER_MS = 2500;
const SLOW_LOAD_HINT_MS = 4000;

const KanbanCard = React.memo(function KanbanCard({
  item,
  accent,
  isMoving,
  onMove,
}: {
  item: CrmKanbanItem;
  accent: string;
  isMoving: boolean;
  onMove: () => void;
}) {
  const deadlineStr = item.dueIso ? formatDate(item.dueIso) : '';
  const createdStr = formatDate(item.createdAt);
  const tempMeta = item.temp ? TEMP_META[item.temp] : null;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.cardRow1}>
        <Text style={styles.cardCode}>{item.code}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardTagsScroll}
          contentContainerStyle={styles.cardTags}
        >
          {item.sourceLabel ? (
            <View style={[styles.tag, styles.tagGap, { backgroundColor: Colors.blueSoft, borderColor: Colors.blue }]}>
              <Text style={[styles.tagText, { color: Colors.cyan }]} numberOfLines={1}>{item.sourceLabel}</Text>
            </View>
          ) : null}
          {tempMeta ? (
            <View style={[styles.tag, styles.tagGap, { backgroundColor: tempMeta.color + '22', borderColor: tempMeta.color }]}>
              <Text style={[styles.tagText, { color: tempMeta.color }]}>{tempMeta.label}</Text>
            </View>
          ) : null}
          {item.valueLabel && item.valueLabel !== 'Chưa định giá' ? (
            <View style={[styles.tag, styles.tagGap, { backgroundColor: Colors.orangeSoft, borderColor: Colors.orange }]}>
              <Text style={[styles.tagText, { color: Colors.orange }]} numberOfLines={1}>{item.valueLabel}</Text>
            </View>
          ) : null}
          {item.overdue ? (
            <View style={[styles.tagOverdue, styles.tagGap]}>
              <Text style={styles.tagOverdueText}>Quá hạn</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Text style={styles.cardName} numberOfLines={2}>{item.title}</Text>

      <View style={styles.customerRow}>
        <Avatar name={item.contactName} initials={initialsFromName(item.contactName)} size={34} color={colorFromName(item.contactName)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.contactName}
            {item.phone ? (
              <Text style={styles.customerPhone}> · {item.phone}</Text>
            ) : null}
          </Text>
          {item.companyName ? (
            <Text style={styles.companyName} numberOfLines={1}>{item.companyName}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.personRow}>
        <Ionicons name="person-circle-outline" size={15} color={Colors.textMuted} />
        <Text style={styles.personLabel}>Phụ trách:</Text>
        <Text style={styles.personName} numberOfLines={1}>{item.ownerName || 'Chưa gán'}</Text>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.cardBottomLeft}>
          <View style={styles.dateMetaBox}>
            <View style={styles.dateMetaItem}>
              <Ionicons
                name="calendar-outline"
                size={14}
                color={item.overdue ? Colors.red : Colors.blue}
              />
              <View style={styles.dateMetaTextWrap}>
                <Text style={styles.dateMetaLabel}>Hẹn</Text>
                <Text
                  style={[
                    styles.dateMetaValue,
                    item.overdue && styles.dateMetaValueOverdue,
                    !deadlineStr && styles.dateMetaValueEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {deadlineStr || '—'}
                </Text>
              </View>
            </View>
            <View style={styles.dateMetaDivider} />
            <View style={styles.dateMetaItem}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <View style={styles.dateMetaTextWrap}>
                <Text style={styles.dateMetaLabel}>Ngày tạo</Text>
                <Text
                  style={[styles.dateMetaValue, !createdStr && styles.dateMetaValueEmpty]}
                  numberOfLines={1}
                >
                  {createdStr || '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
          onPress={onMove}
          disabled={isMoving}
          activeOpacity={0.75}
        >
          {isMoving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons name="swap-horizontal" size={18} color={Colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

function defaultCompanyIdForUser(
  user: { company_id?: string | null } | null,
  companies: { id: string }[],
): string {
  return user?.company_id || (companies.length === 1 ? companies[0]?.id : '') || '';
}

function resetCrmFilters(
  user: { company_id?: string | null } | null,
  companies: { id: string }[],
): CrmHubFilters {
  return { ...DEFAULT_CRM_FILTERS, companyId: defaultCompanyIdForUser(user, companies) };
}

function initialFiltersFromRoute(
  params?: RootStackParamList['CrmHub'],
  companyId?: string | null,
): CrmHubFilters {
  // Đặt companyId ngay từ đầu để filterKey khớp cache khi quay lại tab → hiển thị tức thì.
  const base = { ...DEFAULT_CRM_FILTERS, companyId: companyId || '' };
  if (params?.initialAssignee === 'mine') {
    return { ...base, assignee: 'mine' };
  }
  return base;
}

export default function CrmHubScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { toggle } = useCreateMenu();
  const myId = user?.id || user?.userId || '';

  const initialMode: Mode = route.params?.initialMode ?? 'leads';
  const [mode, setMode] = useState<Mode>(initialMode);
  const isLeads = mode === 'leads';

  // Seed từ cache module-level để khi quay lại tab hiển thị NGAY, không chờ load lại.
  const initialFilterKey0 = serverFilterKey(initialFiltersFromRoute(route.params, user?.company_id), '');
  const initialLeadSnap = myId ? peekCrmHubCache(myId, 'lead', initialFilterKey0) : null;
  const initialDealSnap = myId ? peekCrmHubCache(myId, 'deal', initialFilterKey0) : null;

  const [leadData, setLeadData] = useState<CrmHubData>(() => initialLeadSnap?.data ?? EMPTY_HUB);
  const [dealData, setDealData] = useState<CrmHubData>(() => initialDealSnap?.data ?? EMPTY_HUB);
  const [loadingByMode, setLoadingByMode] = useState<{ leads: boolean; deals: boolean }>({
    leads: false,
    deals: false,
  });
  const [stageLoading, setStageLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState<{ leads: boolean; deals: boolean }>(() => ({
    leads: !!initialLeadSnap,
    deals: !!initialDealSnap,
  }));

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [leadFilters, setLeadFilters] = useState<CrmHubFilters>(() => initialFiltersFromRoute(route.params, user?.company_id));
  const [dealFilters, setDealFilters] = useState<CrmHubFilters>(() => initialFiltersFromRoute(route.params, user?.company_id));
  const [filterOpen, setFilterOpen] = useState(false);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [companiesReady, setCompaniesReady] = useState(false);
  const [regions, setRegions] = useState<CrmRegion[]>([]);
  const [departments, setDepartments] = useState<CrmDepartment[]>([]);
  const [employees, setEmployees] = useState<CrmEmployee[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    () => (initialMode === 'leads' ? initialLeadSnap : initialDealSnap)?.activeIndex ?? 0,
  );
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveItem, setMoveItem] = useState<CrmKanbanItem | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingModeRef = useRef<{ leads: boolean; deals: boolean }>({ leads: false, deals: false });
  const countsInflightRef = useRef<{ leads: string; deals: string }>({ leads: '', deals: '' });
  const abortByModeRef = useRef<{ leads: AbortController | null; deals: AbortController | null }>({
    leads: null,
    deals: null,
  });
  const leadDataRef = useRef(leadData);
  const dealDataRef = useRef(dealData);
  // Nếu mode hiện tại đã có cache → đặt filterKeyRef khớp luôn để KHÔNG kích hoạt refresh thừa khi mount.
  const filterKeyRef = useRef(
    (initialMode === 'leads' ? initialLeadSnap : initialDealSnap) ? initialFilterKey0 : '',
  );
  const activeIndexRef = useRef(activeIndex);
  const modeRef = useRef(mode);
  const leadFiltersRef = useRef(leadFilters);
  const dealFiltersRef = useRef(dealFilters);
  leadDataRef.current = leadData;
  dealDataRef.current = dealData;
  activeIndexRef.current = activeIndex;
  modeRef.current = mode;
  leadFiltersRef.current = leadFilters;
  dealFiltersRef.current = dealFilters;

  function stageIdAtIndex(which: Mode, index: number): string | undefined {
    const hubNow = which === 'leads' ? leadDataRef.current : dealDataRef.current;
    const f = which === 'leads' ? leadFiltersRef.current : dealFiltersRef.current;
    const stages = f.showOrphan ? [...hubNow.stages, orphanVirtualStage()] : hubNow.stages;
    return stages[index]?.id;
  }

  const hub = isLeads ? leadData : dealData;
  const setHub = isLeads ? setLeadData : setDealData;
  const loading = loadingByMode[mode];
  const filters = isLeads ? leadFilters : dealFilters;
  const setFilters = isLeads ? setLeadFilters : setDealFilters;

  useEffect(() => {
    const t = setTimeout(() => {
      const q = searchDraft.trim();
      setSearch(q);
      if (filters.searchField === 'phone' || looksLikePhoneSearch(q)) {
        setFilters((prev) => (prev.phone === 'has_phone' ? prev : { ...prev, phone: 'has_phone' }));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchDraft, filters.searchField, setFilters]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const cid = user?.company_id;
    if (!cid) return;
    setLeadFilters((p) => (p.companyId ? p : { ...p, companyId: cid }));
    setDealFilters((p) => (p.companyId ? p : { ...p, companyId: cid }));
  }, [user?.company_id]);

  useEffect(() => {
    void warmCrmHubPipelines(user?.company_id || undefined);
  }, [user?.company_id]);

  const loadOrgMeta = useCallback(async (companyId: string) => {
    setMetaLoading(true);
    try {
      const [regs, org] = await Promise.all([
        companyId ? fetchCrmRegions(companyId) : Promise.resolve([]),
        companyId ? fetchCrmEmployeesByCompany(companyId) : Promise.resolve({ departments: [], users: [], companyId: null }),
      ]);
      setRegions(regs);
      setDepartments(org.departments);
      setEmployees(org.users);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchCrmCompanies();
        setCompanies(list);
        const cid = user?.company_id || (list.length === 1 ? list[0]?.id : '');
        if (cid) {
          setLeadFilters((p) => (p.companyId ? p : { ...p, companyId: cid }));
          setDealFilters((p) => (p.companyId ? p : { ...p, companyId: cid }));
          void loadOrgMeta(cid);
        }
      } finally {
        setCompaniesReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const onFilterCompanyChange = useCallback((companyId: string) => {
    void loadOrgMeta(companyId);
  }, [loadOrgMeta]);

  const fetchOpts = useCallback(
    () => buildStageFetchOpts(filters, search, myId),
    [filters, search, myId],
  );
  const fetchOptsRef = useRef(fetchOpts);
  fetchOptsRef.current = fetchOpts;

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  type ApplyBootstrapOpts = {
    keepIndex?: number;
    /** Silent refresh — không nhảy cột, giữ cache các cột đã tải. */
    preserveView?: boolean;
  };

  const applyBootstrap = useCallback((
    which: Mode,
    boot: Awaited<ReturnType<typeof fetchCrmBoardInitial>>,
    opts?: ApplyBootstrapOpts,
  ) => {
    const preserveView = opts?.preserveView ?? false;
    const keepIndex = opts?.keepIndex;
    const setter = which === 'leads' ? setLeadData : setDealData;

    setter((prev) => {
      const cache: Record<string, CrmStageCache> = preserveView ? { ...prev.cache } : {};
      cache[boot.initialStageId] = {
        items: boot.initialPage.items,
        hasMore: boot.initialPage.hasMore,
        nextOffset: boot.initialPage.nextOffset,
        loaded: true,
      };
      return {
        stages: boot.stages,
        stageCounts: preserveView
          ? { ...prev.stageCounts, ...boot.stageCounts }
          : boot.stageCounts,
        listTotal: preserveView
          ? prev.listTotal
          : (boot.listTotal ?? null),
        cache,
      };
    });

    const activeIdx =
      preserveView && which === modeRef.current
        ? activeIndexRef.current
        : typeof keepIndex === 'number' && keepIndex < boot.stages.length
          ? keepIndex
          : boot.stages.findIndex((s) => s.id === boot.initialStageId);

    if (which === modeRef.current && !preserveView) {
      setActiveIndex(activeIdx >= 0 ? activeIdx : 0);
    }

    return {
      activeIdx: activeIdx >= 0 ? activeIdx : 0,
      activeStageId: boot.initialStageId,
    };
  }, []);

  const applyCachedHub = useCallback((which: Mode, filterKey: string) => {
    if (!myId) return false;
    const type = which === 'leads' ? 'lead' : 'deal';
    const snap = peekCrmHubCache(myId, type, filterKey);
    if (!snap?.data?.stages?.length) return false;
    if (which === 'leads') setLeadData(snap.data);
    else setDealData(snap.data);
    if (which === mode) setActiveIndex(snap.activeIndex);
    setLoaded((p) => ({ ...p, [which]: true }));
    filterKeyRef.current = filterKey;
    return true;
  }, [myId, mode]);

  const resolveFetchStageId = useCallback((
    which: Mode,
    stageId?: string,
    preserveView?: boolean,
  ): string | undefined => {
    if (stageId) return stageId;
    if (preserveView && which === modeRef.current) {
      return stageIdAtIndex(which, activeIndexRef.current);
    }
    if (which === modeRef.current) {
      return stageIdAtIndex(which, activeIndexRef.current);
    }
    return undefined;
  }, []);

  const refreshStageCounts = useCallback(async (which: Mode, stageIds: string[], forceBatch = false) => {
    if (!stageIds.length) return;
    const type = which === 'leads' ? 'lead' : 'deal';
    const setter = which === 'leads' ? setLeadData : setDealData;
    const hubNow = which === 'leads' ? leadDataRef.current : dealDataRef.current;
    const missing = stageIds.filter((id) => hubNow.stageCounts[id] === undefined);
    if (!forceBatch && !missing.length) return;
    const fk = serverFilterKey(
      which === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
      search,
    );
    if (countsInflightRef.current[which] === fk) return;
    countsInflightRef.current[which] = fk;
    try {
      const needAll =
        forceBatch
        || missing.length >= Math.max(3, Math.floor(hubNow.stages.length * 0.6));
      if (needAll) {
        const batch = await fetchCrmStageCountsBatch(type, fetchOptsRef.current());
        setter((prev) => ({
          ...prev,
          stageCounts: { ...prev.stageCounts, ...batch.counts },
          listTotal: batch.total || prev.listTotal,
        }));
        return;
      }
      const counts = await fetchStageCounts(type, missing, fetchOptsRef.current());
      setter((prev) => ({ ...prev, stageCounts: { ...prev.stageCounts, ...counts } }));
    } catch {
      /* badge cột vẫn dùng total từng trang đã tải */
    } finally {
      if (countsInflightRef.current[which] === fk) countsInflightRef.current[which] = '';
    }
  }, [search]);

  const applyTotalsCache = useCallback((which: Mode) => {
    const type = which === 'leads' ? 'lead' : 'deal';
    const cached = peekCrmTotalsCache(type, fetchOptsRef.current());
    if (!cached) return;
    const setter = which === 'leads' ? setLeadData : setDealData;
    setter((prev) => ({
      ...prev,
      stageCounts: { ...cached.counts, ...prev.stageCounts },
      listTotal: cached.total || prev.listTotal,
    }));
  }, []);

  const loadBootstrap = useCallback(async (
    which: Mode,
    isRefresh = false,
    stageId?: string,
    silent = false,
  ) => {
    if (loadingModeRef.current[which] && !isRefresh && !silent) return;

    const type = which === 'leads' ? 'lead' : 'deal';
    const modeFilters = which === 'leads' ? leadFilters : dealFilters;
    const fk = serverFilterKey(modeFilters, search);

    if (!silent && !isRefresh && applyCachedHub(which, fk)) {
      applyTotalsCache(which);
      void loadBootstrap(which, false, stageId, true);
      return;
    }

    applyTotalsCache(which);
    abortByModeRef.current[which]?.abort();
    const ac = new AbortController();
    abortByModeRef.current[which] = ac;
    loadingModeRef.current[which] = true;
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoadingByMode((p) => ({ ...p, [which]: true }));
    if (!silent) setError('');

    if (isRefresh) {
      invalidatePipelineStagesCache(type);
      invalidateCrmHubCache(myId || undefined);
    }

    const preserveView = silent && which === modeRef.current;
    const isCurrentMode = which === modeRef.current;
    const keepIndex = preserveView || (isRefresh && isCurrentMode)
      ? activeIndexRef.current
      : undefined;
    const effectiveStageId = resolveFetchStageId(which, stageId, preserveView || (isRefresh && isCurrentMode));

    try {
      const fetchOpts = {
        ...fetchOptsRef.current(),
        signal: ac.signal,
        ...(isRefresh ? { skipCounts: false, lite: false } : { skipCounts: true, lite: true }),
      };
      const typeSetter = which === 'leads' ? setLeadData : setDealData;
      const countsPromise = fetchCrmStageCountsBatch(type, fetchOpts).catch(() => null);
      const boot = await fetchCrmBoardInitial(type, effectiveStageId, fetchOpts);
      if (ac.signal.aborted) return;

      void countsPromise.then((batch) => {
        if (ac.signal.aborted || !batch) return;
        typeSetter((prev) => ({
          ...prev,
          stageCounts: { ...prev.stageCounts, ...batch.counts },
          listTotal: batch.total || prev.listTotal,
        }));
      });
      const { activeIdx, activeStageId: activeSid } = applyBootstrap(which, boot, {
        keepIndex,
        preserveView,
      });

      if (boot.stages.length === 0) {
        if (!silent && !isRefresh) setError('Không tải được cột pipeline. Kéo xuống để thử lại.');
        return;
      }

      setLoaded((p) => ({ ...p, [which]: true }));
      filterKeyRef.current = serverFilterKey(
        which === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
        search,
      );

      if (myId) {
        const prevHub = which === 'leads' ? leadDataRef.current : dealDataRef.current;
        const fkNow = filterKeyRef.current;
        setCrmHubCache(myId, type, fkNow, {
          data: {
            stages: boot.stages,
            stageCounts: preserveView
              ? { ...prevHub.stageCounts, ...boot.stageCounts }
              : boot.stageCounts,
            listTotal: boot.listTotal ?? prevHub.listTotal,
            cache: {
              ...(preserveView ? prevHub.cache : {}),
              [boot.initialStageId]: {
                items: boot.initialPage.items,
                hasMore: boot.initialPage.hasMore,
                nextOffset: boot.initialPage.nextOffset,
                loaded: true,
              },
            },
          },
          activeStageId: preserveView ? (stageIdAtIndex(which, activeIndexRef.current) || activeSid) : activeSid,
          activeIndex: preserveView ? activeIndexRef.current : activeIdx,
        });
      }
    } catch (e) {
      if (!ac.signal.aborted && !silent) setError(formatApiError(e));
    } finally {
      if (abortByModeRef.current[which] === ac) {
        loadingModeRef.current[which] = false;
        setLoadingByMode((p) => ({ ...p, [which]: false }));
        setRefreshing(false);
      }
    }
  }, [applyBootstrap, applyCachedHub, applyTotalsCache, search, leadFilters, dealFilters, myId, resolveFetchStageId]);

  const loadStage = useCallback(async (which: Mode, stageId: string, append = false) => {
    const type = which === 'leads' ? 'lead' : 'deal';
    const setter = which === 'leads' ? setLeadData : setDealData;
    const hubNow = which === 'leads' ? leadDataRef.current : dealDataRef.current;
    const cur = hubNow.cache[stageId] ?? EMPTY_STAGE;
    if (append && !cur.hasMore) return;
    if (!append && cur.loaded) return;
    const validStageIds = new Set(hubNow.stages.map((s) => s.id));

    if (append) setMoreLoading(true);
    else setStageLoading(true);
    try {
      const offset = append ? cur.nextOffset : 0;
      const page = await fetchCrmStagePage(
        type,
        stageId,
        offset,
        KANBAN_PAGE_SIZE,
        fetchOptsRef.current(),
        validStageIds,
      );
      setter((prev) => {
        const prevCur = prev.cache[stageId] ?? EMPTY_STAGE;
        const items = append ? [...prevCur.items, ...page.items] : page.items;
        return {
          ...prev,
          stageCounts: { ...prev.stageCounts, [stageId]: page.total },
          cache: {
            ...prev.cache,
            [stageId]: {
              items,
              hasMore: page.hasMore,
              nextOffset: page.nextOffset,
              loaded: true,
            },
          },
        };
      });
    } catch {
      /* giữ cache cũ nếu có */
    } finally {
      setStageLoading(false);
      setMoreLoading(false);
    }
  }, []);

  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  const canLoadCrm = Boolean(user?.company_id) || companiesReady;
  const canLoadCrmRef = useRef(canLoadCrm);
  canLoadCrmRef.current = canLoadCrm;
  const loadBootstrapRef = useRef(loadBootstrap);
  loadBootstrapRef.current = loadBootstrap;
  const loadStageRef = useRef(loadStage);
  loadStageRef.current = loadStage;

  // Deps rỗng: chỉ chạy khi focus/blur, KHÔNG re-subscribe khi loadBootstrap đổi identity
  // (nếu phụ thuộc loadBootstrap, mỗi lần filters/search đổi sẽ hủy request đang chạy → cột trống).
  useFocusEffect(
    useCallback(() => {
      const which = modeRef.current;
      if (canLoadCrmRef.current && loadedRef.current[which]) {
        // Đã có dữ liệu trong phiên trước → làm mới ngầm, giữ nguyên cột đang xem.
        void loadBootstrapRef.current(which, false, undefined, true);
        // Phục hồi nếu cột đang xem bị rỗng (cache đã bị dọn lúc rời màn hình).
        const hubNow = which === 'leads' ? leadDataRef.current : dealDataRef.current;
        const sid = stageIdAtIndex(which, activeIndexRef.current);
        if (sid && !hubNow.cache[sid]?.loaded) void loadStageRef.current(which, sid, false);
      }
      return () => {
        abortByModeRef.current[which]?.abort();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const hubStages = hub.stages;
  const displayStages = useMemo(() => {
    if (!filters.showOrphan) return hubStages;
    return [...hubStages, orphanVirtualStage()];
  }, [hubStages, filters.showOrphan]);

  const filterKey = serverFilterKey(filters, search);
  useEffect(() => {
    if (!canLoadCrm) return;
    if (filterKeyRef.current === filterKey) return;
    const stageId = displayStages[activeIndexRef.current]?.id;
    if (!loaded[mode]) {
      void loadBootstrap(mode, false, stageId);
      return;
    }
    filterKeyRef.current = filterKey;
    if (stageId === ORPHAN_STAGE_ID) {
      void loadStage(mode, ORPHAN_STAGE_ID, false);
    } else {
      void loadBootstrap(mode, true, stageId);
    }
  }, [filterKey, mode, loaded, canLoadCrm, displayStages, loadBootstrap, loadStage]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setSearchDraft('');
    setSearch('');
    setLeadFilters(resetCrmFilters(user, companies));
    setDealFilters(resetCrmFilters(user, companies));
    setActiveIndex(0);
    filterKeyRef.current = '';
    if (!loaded[next]) void loadBootstrap(next, false);
  };

  const activeStage: CrmPipelineStage | undefined = displayStages[activeIndex];
  const activeStageId = activeStage?.id;

  useEffect(() => {
    if (!filters.showOrphan && activeStageId === ORPHAN_STAGE_ID) {
      setActiveIndex(0);
    }
  }, [filters.showOrphan, activeStageId]);

  useEffect(() => {
    if (!loaded[mode] || !activeStageId) return;
    const cur = hub.cache[activeStageId];
    // Cột đang xem chưa có dữ liệu → nạp lại. Không phụ thuộc cờ `loading` cấp board
    // (tránh kẹt khi cờ này không được reset đúng lúc); loadStage tự chống nạp trùng.
    if (!cur?.loaded && !stageLoading) {
      void loadStage(mode, activeStageId, false);
    }
  }, [loaded, mode, activeStageId, hub.cache, stageLoading, loadStage]);

  useEffect(() => {
    if (!columnPickerOpen || !loaded[mode]) return;
    const ids = displayStages.map((s) => s.id).filter((id) => id !== ORPHAN_STAGE_ID);
    void refreshStageCounts(mode, ids, true);
  }, [columnPickerOpen, loaded, mode, displayStages, refreshStageCounts]);

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < displayStages.length - 1;
  const accent = stageColor(activeStage?.color, activeIndex);

  const rawColumnItems = activeStageId
    ? (hub.cache[activeStageId]?.items ?? [])
    : [];
  const columnItems = useMemo(
    () => clientFilterKanbanItems(rawColumnItems, filters, search),
    [rawColumnItems, filters, search],
  );
  const columnHasMore = activeStageId ? (hub.cache[activeStageId]?.hasMore ?? false) : false;
  const serverFilterActive =
    search.length > 0
    || filters.phone !== DEFAULT_CRM_FILTERS.phone
    || filters.assignee !== 'all'
    || !!filters.assigneeUserId
    || !!filters.timePreset
    || !!filters.companyId;
  const clientDueActive = filters.due !== 'all';
  const clientRegionActive = !!filters.regionId;
  const clientSearchActive =
    !!search.trim()
    && (filters.searchField === 'assignee' || filters.searchField === 'title' || filters.searchField === 'code' || filters.searchField === 'phone');
  const filterActive = serverFilterActive || clientDueActive || clientRegionActive || clientSearchActive;
  const filterBadge = countActiveFilters(filters, search);

  const totalRecords = hub.listTotal ?? sumCounts(hub.stageCounts);

  const isInitialLoad = loading && !loaded[mode];
  const isColumnLoading = stageLoading && !columnItems.length;
  const waitingForCrm = !canLoadCrm && !loaded[mode];
  const showFullScreenLoad = waitingForCrm || (isInitialLoad && !hub.stages.length);

  // Chỉ coi là "tải lâu" khi đã chờ quá ngưỡng — load nhanh không hiện banner để tránh nhấp nháy.
  const inlineLoadingActive = isColumnLoading || (isInitialLoad && hub.stages.length > 0);
  const inlineLoadingSlow = useDelayedFlag(inlineLoadingActive, SLOW_LOAD_BANNER_MS);
  const fullScreenSlow = useDelayedFlag(showFullScreenLoad, SLOW_LOAD_HINT_MS);
  const showInlineLoadNotice = inlineLoadingActive && inlineLoadingSlow;

  const inlineLoadTitle = isColumnLoading
    ? `Đang tải cột «${activeStage?.name ?? '…'}»…`
    : `Đang tải ${isLeads ? 'Leads' : 'Deals'}…`;
  const inlineLoadHint = 'Dữ liệu hơi nhiều nên tải lâu hơn bình thường, vui lòng đợi một chút.';

  const filterChips = useMemo(() => {
    const companyName = companies.find((c) => c.id === filters.companyId)?.name;
    const regionName = filters.regionId === REGION_NONE
      ? 'Chưa gán KV'
      : regions.find((r) => r.id === filters.regionId)?.name;
    const assigneeName = employees.find((u) => u.id === filters.assigneeUserId)?.full_name
      || employees.find((u) => u.id === filters.assigneeUserId)?.email;
    return activeFilterChips(
      filters,
      search,
      { companyName, regionName, assigneeName: assigneeName || undefined },
      (patch) => setFilters((prev) => ({ ...prev, ...patch })),
      () => setSearchDraft(''),
    );
  }, [filters, search, setFilters, companies, regions, employees]);

  const countByStageId = hub.stageCounts;

  const compactStats = useMemo(() => {
    const colTotal = activeStageId ? (hub.stageCounts[activeStageId] ?? 0) : 0;
    const shown = filterActive ? columnItems.length : colTotal;
    return { total: totalRecords, column: shown, stages: displayStages.length };
  }, [hub.stageCounts, activeStageId, totalRecords, filterActive, columnItems.length, displayStages.length]);

  const goToStage = useCallback((stageId: string) => {
    const idx = displayStages.findIndex((s) => String(s.id) === String(stageId));
    if (idx >= 0) setActiveIndex(idx);
  }, [displayStages]);

  const moveCardTo = useCallback(
    async (item: CrmKanbanItem, targetStageId: string) => {
      const target = displayStages.find((s) => String(s.id) === String(targetStageId));
      if (!target) return;
      const fromStageId = item.stageId;
      const moved: CrmKanbanItem = {
        ...item,
        stageId: target.id,
        stageName: target.name,
        stageColor: target.color,
      };
      setMovingId(item.id);
      setHub((prev) => {
        const nextCache = { ...prev.cache };
        if (nextCache[fromStageId]) {
          nextCache[fromStageId] = {
            ...nextCache[fromStageId],
            items: nextCache[fromStageId].items.filter((it) => it.id !== item.id),
          };
        }
        if (nextCache[target.id]?.loaded) {
          nextCache[target.id] = {
            ...nextCache[target.id],
            items: [moved, ...nextCache[target.id].items],
          };
        } else {
          delete nextCache[target.id];
        }
        const nextCounts = { ...prev.stageCounts };
        if (fromStageId in nextCounts) {
          nextCounts[fromStageId] = Math.max(0, (nextCounts[fromStageId] ?? 1) - 1);
        }
        nextCounts[target.id] = (nextCounts[target.id] ?? 0) + 1;
        return { ...prev, cache: nextCache, stageCounts: nextCounts };
      });
      try {
        await moveCrmItemStage(item.id, target.id);
        showToast(`Đã chuyển ${item.code} → ${target.name}`, true);
      } catch (e) {
        void loadBootstrap(mode, true, activeStageId);
        showToast(formatApiError(e), false);
      } finally {
        setMovingId(null);
      }
    },
    [displayStages, setHub, showToast, loadBootstrap, mode, activeStageId],
  );

  if (showFullScreenLoad) {
    const fullScreenHint = waitingForCrm
      ? 'Đang lấy thông tin công ty và pipeline.'
      : fullScreenSlow
        ? 'Dữ liệu hơi nhiều nên tải lâu hơn bình thường, vui lòng đợi một chút.'
        : undefined;
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <LoadingNotice
          title={
            waitingForCrm
              ? 'Đang chuẩn bị CRM…'
              : `Đang tải ${isLeads ? 'Leads' : 'Deals'}…`
          }
          hint={fullScreenHint}
        />
      </View>
    );
  }

  if (error && !hub.stages.length) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Ionicons name="cloud-offline-outline" size={44} color={Colors.textFaint} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void loadBootstrap(mode)}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.fixedTop}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>{isLeads ? 'Quản lý Leads' : 'Quản lý Deals'}</Text>
            <View style={styles.syncRow}>
              <View style={styles.syncDot} />
              <Text style={styles.syncTxt}>{totalRecords} bản ghi · {displayStages.length} cột</Text>
            </View>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => void loadBootstrap(mode, true, activeStageId)} hitSlop={8}>
            <Ionicons name="refresh-outline" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.segment}>
          <Pressable
            style={[styles.segItem, isLeads && { backgroundColor: Colors.blue }]}
            onPress={() => switchMode('leads')}
          >
            <Ionicons name="people" size={15} color={isLeads ? '#fff' : Colors.textMuted} />
            <Text style={[styles.segTxt, isLeads && { color: '#fff' }]}>Leads</Text>
            {(leadData.listTotal ?? sumCounts(leadData.stageCounts)) > 0 && (
              <View style={styles.segCount}>
                <Text style={styles.segCountTxt}>{leadData.listTotal ?? sumCounts(leadData.stageCounts)}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.segItem, !isLeads && { backgroundColor: Colors.orange }]}
            onPress={() => switchMode('deals')}
          >
            <Ionicons name="pricetags" size={15} color={!isLeads ? '#fff' : Colors.textMuted} />
            <Text style={[styles.segTxt, !isLeads && { color: '#fff' }]}>Deals</Text>
            {(dealData.listTotal ?? sumCounts(dealData.stageCounts)) > 0 && (
              <View style={styles.segCount}>
                <Text style={styles.segCountTxt}>{dealData.listTotal ?? sumCounts(dealData.stageCounts)}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={Colors.textFaint} />
            <TextInput
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder={searchPlaceholder(filters.searchField, isLeads ? 'lead' : 'deal')}
              placeholderTextColor={Colors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              keyboardType={filters.searchField === 'phone' ? 'phone-pad' : 'default'}
            />
            {searchDraft ? (
              <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={Colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={[styles.filterBtn, filterBadge > 0 && styles.filterBtnActive]}
            onPress={() => setFilterOpen(true)}
            hitSlop={4}
          >
            <Ionicons name="options-outline" size={20} color={filterBadge > 0 ? Colors.blue : Colors.text} />
            {filterBadge > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeTxt}>{filterBadge}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <CrmSearchFieldBar
          value={filters.searchField}
          onChange={(field: SearchField) => {
            setFilters((p) => ({
              ...p,
              searchField: field,
              ...(field === 'phone' && searchDraft.trim() ? { phone: 'has_phone' as const } : {}),
            }));
          }}
          accent={isLeads ? Colors.blue : Colors.orange}
        />

        <View style={styles.metaRow}>
          <Text style={styles.metaTxt}>
            {compactStats.total} bản ghi · {compactStats.stages} cột · cột này {compactStats.column}
          </Text>
          <Text style={[styles.metaHint, { color: isLeads ? Colors.blue : Colors.orange }]}>
            {filters.phone === 'has_phone' ? 'Có SĐT' : filters.phone === 'no_phone' ? 'Chưa SĐT' : 'Mọi SĐT'}
          </Text>
        </View>

        {filterChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.activeChipScroll}
            contentContainerStyle={styles.activeChipContent}
            nestedScrollEnabled
          >
            {filterChips.map((chip) => (
              <Pressable
                key={chip.key}
                style={styles.activeChip}
                onPress={chip.onClear}
              >
                <Text style={styles.activeChipTxt} numberOfLines={1}>{chip.label}</Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ))}
            <Pressable
              style={styles.activeChipClear}
              onPress={() => {
                setSearchDraft('');
                setLeadFilters(resetCrmFilters(user, companies));
                setDealFilters(resetCrmFilters(user, companies));
              }}
            >
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        <View style={styles.colHeaderRow}>
          <Pressable
            onPress={() => setActiveIndex((i) => Math.max(0, i - 1))}
            disabled={!canPrev}
            hitSlop={10}
            style={[styles.colNavArrow, !canPrev && styles.colNavArrowHidden]}
          >
            <Ionicons name="chevron-back" size={20} color={canPrev ? Colors.text : Colors.textFaint} />
          </Pressable>

          <Pressable
            style={styles.colHeaderCenter}
            onPress={() => {
              void refreshStageCounts(mode, hubStages.map((s) => s.id));
              setColumnPickerOpen(true);
            }}
            hitSlop={6}
          >
            <Text style={styles.colIcon}>{activeStage?.icon || (isLeads ? '📋' : '💼')}</Text>
            <Text style={styles.colName} numberOfLines={1}>{activeStage?.name || '—'}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            <View style={[styles.colBadge, { backgroundColor: accent }]}>
              <Text style={styles.colBadgeText}>
                {filterActive ? columnItems.length : (activeStageId ? (hub.stageCounts[activeStageId] ?? columnItems.length) : 0)}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setActiveIndex((i) => Math.min(displayStages.length - 1, i + 1))}
            disabled={!canNext}
            hitSlop={10}
            style={[styles.colNavArrow, !canNext && styles.colNavArrowHidden]}
          >
            <Ionicons name="chevron-forward" size={20} color={canNext ? Colors.text : Colors.textFaint} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dotsScroll}
          contentContainerStyle={styles.dotsRow}
          nestedScrollEnabled
        >
          {displayStages.map((s, i) => {
            const active = i === activeIndex;
            return (
              <Pressable key={s.id} onPress={() => setActiveIndex(i)} hitSlop={8} style={i > 0 ? styles.dotGap : undefined}>
                <View
                  style={[
                    styles.dot,
                    active && { width: 20, backgroundColor: stageColor(s.color, i) },
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {showInlineLoadNotice ? (
        <LoadingNotice variant="banner" title={inlineLoadTitle} hint={inlineLoadHint} />
      ) : null}

      <FlatList
        style={styles.listFlex}
        data={columnItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadBootstrap(mode, true, activeStageId)}
            tintColor={Colors.blue}
          />
        }
        ListEmptyComponent={
          !isColumnLoading ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={38} color={Colors.textFaint} />
              <Text style={styles.emptyText}>
                {filterActive ? `Không tìm thấy ${isLeads ? 'lead' : 'deal'} phù hợp` : 'Cột này chưa có bản ghi'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          moreLoading ? (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator color={Colors.blue} size="small" />
              <Text style={styles.loadMoreLoadingTxt}>Đang tải thêm bản ghi…</Text>
            </View>
          ) : columnHasMore && !filterActive ? (
            <Pressable
              style={styles.loadMoreBtn}
              onPress={() => activeStageId && void loadStage(mode, activeStageId, true)}
            >
              <Text style={styles.loadMoreTxt}>Tải thêm</Text>
            </Pressable>
          ) : null
        }
        onEndReached={() => {
          if (activeStageId && columnHasMore && !moreLoading && !filterActive) {
            void loadStage(mode, activeStageId, true);
          }
        }}
        onEndReachedThreshold={0.35}
        removeClippedSubviews
        maxToRenderPerBatch={8}
        windowSize={7}
        initialNumToRender={10}
        renderItem={({ item }) => (
          <KanbanCard
            item={item}
            accent={accent}
            isMoving={movingId === item.id}
            onMove={() => setMoveItem(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {!keyboardVisible ? (
        <View style={[styles.fabRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={[styles.fabBtn, { backgroundColor: Colors.blueSoft, borderColor: Colors.blue }]}
            onPress={toggle}
          >
            <Ionicons name="people" size={18} color={Colors.blue} />
            <Text style={[styles.fabBtnTxt, { color: Colors.blue }]}>Thêm Lead</Text>
          </Pressable>
          <Pressable
            style={[styles.fabBtn, { backgroundColor: Colors.orangeSoft, borderColor: Colors.orange }]}
            onPress={toggle}
          >
            <Ionicons name="pricetags" size={18} color={Colors.orange} />
            <Text style={[styles.fabBtnTxt, { color: Colors.orange }]}>Thêm Deal</Text>
          </Pressable>
        </View>
      ) : null}

      <CrmFilterSheet
        visible={filterOpen}
        mode={mode}
        filters={filters}
        search={search}
        companies={companies}
        regions={regions}
        departments={departments}
        employees={employees}
        metaLoading={metaLoading}
        onApply={(next) => {
          setFilters(next);
          if (next.companyId !== filters.companyId) void loadOrgMeta(next.companyId);
        }}
        onCompanyChange={onFilterCompanyChange}
        onClose={() => setFilterOpen(false)}
      />

      <ColumnPickerModal
        visible={columnPickerOpen}
        stages={displayStages}
        activeStageId={activeStage?.id}
        countByStageId={countByStageId}
        onSelect={goToStage}
        onClose={() => setColumnPickerOpen(false)}
      />

      <MoveStageModal
        visible={!!moveItem}
        stages={hubStages}
        currentStageId={moveItem?.stageId}
        onSelect={(stageId) => {
          if (moveItem) void moveCardTo(moveItem, stageId);
          setMoveItem(null);
        }}
        onClose={() => setMoveItem(null)}
      />

      {toast ? (
        <View style={[styles.toast, { bottom: 80 + insets.bottom, backgroundColor: toast.ok ? Colors.green : Colors.red }]}>
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingCard: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 32,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 320,
    marginHorizontal: 24,
  },
  loadingTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  loadingHint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.blueSoft,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(47,107,255,0.25)',
  },
  loadingBannerTitle: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  loadingBannerHint: { color: Colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16 },
  errorText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: Colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: Colors.blue, fontWeight: '800', fontSize: 14 },
  fixedTop: { paddingHorizontal: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 8,
    marginBottom: 12,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.green },
  syncTxt: { color: Colors.textFaint, fontSize: 12 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    marginBottom: 10,
    gap: 4,
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 40,
    borderRadius: 9,
  },
  segTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '800' },
  segCount: {
    backgroundColor: Colors.surfaceSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  segCountTxt: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: Radii.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  metaTxt: { flex: 1, color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
  metaHint: { fontSize: 11, fontWeight: '800' },
  activeChipScroll: { marginTop: 8, maxHeight: 34 },
  activeChipContent: { paddingRight: 8, alignItems: 'center' },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  activeChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', maxWidth: 120 },
  activeChipClear: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: Radii.pill,
    backgroundColor: Colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeChipClearTxt: { color: Colors.red, fontSize: 12, fontWeight: '800' },
  colHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  colNavArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  colNavArrowHidden: { opacity: 0.3 },
  colHeaderCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radii.sm,
  },
  colIcon: { fontSize: 20 },
  colName: { color: Colors.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  colBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colBadgeText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  dotsScroll: { maxHeight: 16, marginBottom: 8 },
  dotsRow: { alignItems: 'center', paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotGap: { marginLeft: 6 },
  listFlex: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 4 },
  emptyBox: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyText: { color: Colors.textFaint, fontSize: 14, textAlign: 'center' },
  loadMoreBtn: {
    marginHorizontal: 32,
    marginVertical: 12,
    height: 42,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreTxt: { color: Colors.textMuted, fontWeight: '800', fontSize: 13 },
  loadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 16,
  },
  loadMoreLoadingTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    padding: 14,
  },
  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardCode: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  cardTagsScroll: { flex: 1 },
  cardTags: { flexDirection: 'row', alignItems: 'center' },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  tagGap: { marginRight: 6 },
  tagText: { fontSize: 10, fontWeight: '800' },
  tagOverdue: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    backgroundColor: Colors.redSoft,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  tagOverdueText: { color: Colors.red, fontSize: 10, fontWeight: '800' },
  cardName: { color: Colors.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  customerName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  customerPhone: { color: Colors.blue, fontWeight: '600' },
  companyName: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  personLabel: { color: Colors.textMuted, fontSize: 12 },
  personName: { color: Colors.text, fontSize: 12, fontWeight: '700', flex: 1 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  cardBottomLeft: { flex: 1 },
  dateMetaBox: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radii.sm,
    padding: 8,
  },
  dateMetaItem: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dateMetaTextWrap: { flex: 1 },
  dateMetaLabel: { color: Colors.textFaint, fontSize: 10, fontWeight: '600' },
  dateMetaValue: { color: Colors.text, fontSize: 12, fontWeight: '700', marginTop: 1 },
  dateMetaValueOverdue: { color: Colors.red },
  dateMetaValueEmpty: { color: Colors.textFaint },
  dateMetaDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 6 },
  cardActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionBtnPrimary: { backgroundColor: Colors.blue },
  fabRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
  },
  fabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  fabBtnTxt: { fontSize: 14, fontWeight: '800' },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radii.md,
  },
  toastTxt: { color: Colors.white, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
