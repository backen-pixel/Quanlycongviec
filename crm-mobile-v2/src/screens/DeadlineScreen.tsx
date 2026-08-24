import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
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
import { formatApiError } from '../api/client';
import {
  fetchDeadlineBucketCountsCached,
  fetchDeadlineBucketPageCached,
} from '../api/crmCached';
import {
  convertLeadToDeal,
  fetchDeadlineConfig,
  fetchPipelineStages,
  invalidateDeadlineBucketCounts,
  invalidateDeadlineResultCache,
  isDeadlineBucketCountsFresh,
  moveCrmItemStage,
  peekDeadlineBucketCounts,
  peekDeadlineResultCache,
  updateCrmAssignee,
  prefetchCrmProductionCompanies,
  type CrmSxProductionTarget,
  type DeadlineBucketCountMap,
  type DeadlineBucketCounts,
} from '../api/crm';
import { deadlineBucketFilterKey } from '../api/deadlineOverdue';
import {
  fetchCrmCompanies,
  fetchCrmEmployeesByCompany,
  fetchCrmRegions,
  type CrmCompany,
  type CrmDepartment,
  type CrmEmployee,
  type CrmRegion,
} from '../api/crmMeta';
import CrmSearchSuggestDropdown from '../components/CrmSearchSuggestDropdown';
import { useCrmSearchSuggest } from '../hooks/useCrmSearchSuggest';
import type { CrmKanbanItem } from '../types';
import CrmFilterSheet from '../components/CrmFilterSheet';
import DealWonSxPickerModal from '../components/DealWonSxPickerModal';
import MoveStageModal from '../components/MoveStageModal';
import DatePickerSheet from '../components/DatePickerSheet';
import PickerSheet from '../components/PickerSheet';
import SpinningLoader from '../components/SpinningLoader';
import { currentUserId, useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import {
  buildAssignPickerOptions,
  canAssignCrmCard,
  canClearCrmAssignee,
  canViewAllCrm,
  itemHasAssignee,
  lockCrmAssigneeScope,
  lockCrmCompanyScope,
  plannerAsAssigneeTarget,
} from '../lib/crmAssignee';
import {
  DEADLINE_BUCKET_COLOR,
  deadlineBucketLabel,
  deadlineIsoToTs,
  enabledDeadlineBuckets,
  resolveDeadlineBucket,
  type DeadlineBucketKey,
  type DeadlineConfig,
} from '../lib/crmDeadlineBuckets';
import { useCrmHubFilters } from '../hooks/useCrmHubFilters';
import {
  activeFilterChips,
  buildStageFetchOpts,
  clientFilterDeadlineItems,
  countActiveFilters,
  filtersForCrmSearchSuggest,
  searchPlaceholder,
  searchQueryForCrmItem,
} from '../lib/crmFilters';
import {
  readDefaultDealKhSplitEnabled,
  readStoredDealKhSplitPreference,
  storeDealKhSplitPreference,
} from '../lib/crmDealKhSplit';
import { isDeadlineMembershipStage } from '../lib/crmPipelineTabs';
import { deadlineIsoToYmd, planCrmStageMove } from '../lib/crmStageMove';
import {
  clearDeadlineOverdueBreakdown,
  publishDeadlineOverdueCounts,
  publishDeadlineOverdueFromItems,
} from '../lib/deadlineOverdueStore';
import { getDeadlineMaxBuffer, getDeadlinePerfLimits } from '../lib/devicePerf';
import { colorFromName, initialsFromName } from '../lib/media';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { CrmPipelineStage, PlannerItem, PlannerKind } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type SectionState = {
  items: PlannerItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

const EMPTY_SECTION: SectionState = { items: [], total: 0, hasMore: false, nextOffset: 0 };

/** Cùng thứ tự với API (hạn gần nhất trước, «chưa hẹn» cuối) — giữ đúng sau khi gộp trang. */
function byDeadlineAsc(a: PlannerItem, b: PlannerItem): number {
  if (a.dueIso && b.dueIso) return new Date(a.dueIso).getTime() - new Date(b.dueIso).getTime();
  if (a.dueIso) return -1;
  if (b.dueIso) return 1;
  return 0;
}

type KindMeta = { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; soft: string };

function kindMeta(Colors: ThemeColors): Record<PlannerKind, KindMeta> {
  return {
    lead: { label: 'Lead', icon: 'people', color: Colors.blue, soft: Colors.blueSoft },
    deal: { label: 'Deal', icon: 'pricetags', color: Colors.orange, soft: Colors.orangeSoft },
  };
}

const DEADLINE_KIND_KEY = 'crmv2_deadline_kind_v1';

async function readStoredDeadlineKind(): Promise<PlannerKind> {
  try {
    const v = await AsyncStorage.getItem(DEADLINE_KIND_KEY);
    if (v === 'lead' || v === 'deal') return v;
  } catch { /* ignore */ }
  return 'deal';
}

function persistDeadlineKind(next: PlannerKind) {
  AsyncStorage.setItem(DEADLINE_KIND_KEY, next).catch(() => undefined);
}

function plannerToSuggestItem(it: PlannerItem): CrmKanbanItem {
  return {
    id: it.id,
    kind: it.kind,
    code: it.code,
    title: it.title,
    stageId: it.stageId || '',
    stageName: it.status,
    stageColor: '',
    contactName: it.contactName,
    phone: it.phone,
    companyId: it.companyId || '',
    companyName: undefined,
    ownerName: it.ownerName,
    ownerInitials: it.ownerInitials,
    ownerColor: it.ownerColor,
    ownerId: it.ownerId,
    assignedToId: it.assignedToId || '',
    leadOwnerId: it.leadOwnerId || '',
    dueIso: it.dueIso,
    overdue: it.overdue,
    valueLabel: it.valueLabel,
    projectId: it.projectId,
  };
}

function kanbanToPlannerItem(it: CrmKanbanItem): PlannerItem {
  return {
    id: it.id,
    kind: it.kind,
    code: it.code || '',
    title: it.title || '',
    status: it.stageName || '—',
    stageId: it.stageId,
    companyId: it.companyId,
    contactName: it.contactName || '—',
    phone: it.phone || '',
    location: '—',
    valueLabel: it.valueLabel,
    ownerId: it.ownerId || '',
    assignedToId: it.assignedToId,
    leadOwnerId: it.leadOwnerId,
    ownerName: it.ownerName || '',
    ownerInitials: it.ownerInitials || '',
    ownerColor: it.ownerColor || '',
    deadlineLabel: it.dueIso ? 'đã hẹn' : '—',
    dueIso: it.dueIso,
    overdue: !!it.overdue,
    projectId: it.projectId,
  };
}

const DeadlineCard = React.memo(function DeadlineCard({
  item,
  accent,
  highlighted,
  canAssign,
  isAssigning,
  isMoving,
  onOpen,
  onAssign,
  onMove,
}: {
  item: PlannerItem;
  accent: string;
  highlighted?: boolean;
  canAssign: boolean;
  isAssigning: boolean;
  isMoving: boolean;
  /** Callback ổn định theo ref — không tạo lambda mới mỗi lần render FlatList. */
  onOpen: (item: PlannerItem) => void;
  onAssign: (item: PlannerItem) => void;
  onMove: (item: PlannerItem) => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const hasAssignee = itemHasAssignee(plannerAsAssigneeTarget(item));
  return (
    <View
      style={[
        styles.card,
        { borderLeftColor: accent },
        highlighted && {
          borderColor: Colors.red,
          borderWidth: 2,
          backgroundColor: `${Colors.red}12`,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [pressed && styles.cardPressed]}
        onPress={() => onOpen(item)}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardCode}>{item.code}</Text>
          {item.overdue ? (
            <View style={styles.overduePill}>
              <Ionicons name="alert-circle" size={11} color={Colors.red} />
              <Text style={styles.overdueTxt}>Quá hạn</Text>
            </View>
          ) : null}
          <Text style={[styles.cardDue, item.overdue && { color: Colors.red }]} numberOfLines={1}>
            {item.dueIso ? `Hẹn ${item.deadlineLabel}` : 'Chưa hẹn'}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardBottom}>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.contactName}
            {item.phone ? ` · ${item.phone}` : ''}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: `${accent}22` }]}>
            <Text style={[styles.statusTxt, { color: accent }]} numberOfLines={1}>
              {item.status}
            </Text>
          </View>
        </View>
        <View style={styles.personRow}>
          <Ionicons name="person-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.personLabel}>Phụ trách:</Text>
          <Text style={styles.personName} numberOfLines={1}>
            {item.ownerName || 'Chưa gán'}
          </Text>
        </View>
        {item.valueLabel ? (
          <Text style={styles.cardValue}>{item.valueLabel}</Text>
        ) : null}
      </Pressable>

      <View style={styles.cardActions}>
        {canAssign ? (
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => onAssign(item)}
            disabled={isAssigning || isMoving}
            activeOpacity={0.75}
            hitSlop={6}
          >
            {isAssigning ? (
              <SpinningLoader size={18} color={Colors.purple} />
            ) : (
              <Ionicons
                name={hasAssignee ? 'person-outline' : 'person-add-outline'}
                size={18}
                color={Colors.purple}
              />
            )}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
          onPress={() => onMove(item)}
          disabled={isMoving || isAssigning}
          activeOpacity={0.75}
          hitSlop={6}
        >
          {isMoving ? (
            <SpinningLoader size={18} color={Colors.white} />
          ) : (
            <Ionicons name="swap-horizontal" size={18} color={Colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

/** Số thẻ hiện trong FlatList mỗi lần — vuốt lên mới mở rộng / gọi API. */
const DEADLINE_CARD_PAGE_SIZE = 10;
/** Trang đầu / load-more từ server (cap API 20). */
const DEADLINE_BUCKET_PAGE_LIMIT = 10;

export default function DeadlineScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const deadlineTabFocused = useIsFocused();
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const userId = currentUserId(user);
  const viewAll = canViewAllCrm(user);
  const lockCompany = lockCrmCompanyScope(user);
  const lockAssignee = lockCrmAssigneeScope(user);

  const [kind, setKind] = useState<PlannerKind>('deal');
  const kindReadyRef = useRef(false);
  const userPickedKindRef = useRef(false);
  const [leadState, setLeadState] = useState<SectionState>(EMPTY_SECTION);
  const [dealState, setDealState] = useState<SectionState>(EMPTY_SECTION);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [drainingLead, setDrainingLead] = useState(false);
  const [drainingDeal, setDrainingDeal] = useState(false);
  /** Cửa sổ render trong cột — tránh FlatList nhận cả trăm thẻ cùng lúc. */
  const [visibleCount, setVisibleCount] = useState(DEADLINE_CARD_PAGE_SIZE);
  /** Số đếm cột từ lượt quét riêng (giống stageCounts của Kanban) — badge không phụ thuộc list. */
  const [countsByKind, setCountsByKind] = useState<Record<PlannerKind, DeadlineBucketCounts | null>>({
    lead: null,
    deal: null,
  });
  /** Phân trang theo cột bucket — khớp web deadline-bucket-pages. */
  const [bucketPageState, setBucketPageState] = useState<Record<string, {
    nextOffset: number;
    hasMore: boolean;
    loading: boolean;
    total: number;
  }>>({});
  const bucketPageStateRef = useRef(bucketPageState);
  bucketPageStateRef.current = bucketPageState;
  const bucketPagesLoadingRef = useRef(new Set<string>());
  const bucketPagesGenRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [deadlineConfig, setDeadlineConfig] = useState<DeadlineConfig | null>(null);
  const [bucketKey, setBucketKey] = useState<DeadlineBucketKey>('overdue');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
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
  const [dealKhSplitEnabled, setDealKhSplitEnabled] = useState(() =>
    readDefaultDealKhSplitEnabled(viewAll),
  );
  const bucketInitRef = useRef(false);

  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [orgReady, setOrgReady] = useState(false);
  const [regions, setRegions] = useState<CrmRegion[]>([]);
  const [departments, setDepartments] = useState<CrmDepartment[]>([]);
  const [employees, setEmployees] = useState<CrmEmployee[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);

  const [assignItem, setAssignItem] = useState<PlannerItem | null>(null);
  const [assignEmployees, setAssignEmployees] = useState<CrmEmployee[]>([]);
  const [assignEmployeesLoading, setAssignEmployeesLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [moveItem, setMoveItem] = useState<PlannerItem | null>(null);
  const [moveStages, setMoveStages] = useState<CrmPipelineStage[]>([]);
  const [moveDeadlineCtx, setMoveDeadlineCtx] = useState<{
    item: PlannerItem;
    target: CrmPipelineStage;
  } | null>(null);
  const [moveSxCtx, setMoveSxCtx] = useState<{
    item: PlannerItem;
    target: CrmPipelineStage;
  } | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Giới hạn tải theo máy — low/mid giảm buffer + song song để tránh giật. */
  const perf = useMemo(() => getDeadlinePerfLimits(), []);
  const maxBuffer = useMemo(() => getDeadlineMaxBuffer(), []);
  /** Đang cuộn list — tạm dừng setState từ drain để khỏi giật. */
  const listScrollingRef = useRef(false);
  const pendingProgressRef = useRef<{
    section: PlannerKind;
    partial: { items: PlannerItem[]; total: number; hasMore: boolean; nextOffset: number };
    mode: 'safe' | 'merge';
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** Mỗi loại một controller — Lead/Deal drain song song, không hủy lẫn nhau. */
  const drainAbortRef = useRef<Record<PlannerKind, AbortController | null>>({
    lead: null,
    deal: null,
  });
  const abortAllDrains = useCallback(() => {
    drainAbortRef.current.lead?.abort();
    drainAbortRef.current.deal?.abort();
    drainAbortRef.current = { lead: null, deal: null };
  }, []);
  /** Lượt đếm badge cột chạy độc lập list — như Kanban gọi stage-counts riêng. */
  const countsAbortRef = useRef<Record<PlannerKind, AbortController | null>>({
    lead: null,
    deal: null,
  });
  const abortAllCounts = useCallback(() => {
    countsAbortRef.current.lead?.abort();
    countsAbortRef.current.deal?.abort();
    countsAbortRef.current = { lead: null, deal: null };
  }, []);
  const loadingRef = useRef(false);
  const filtersRef = useRef(filters);
  const searchRef = useRef(search);
  const searchDraftRef = useRef(searchDraft);
  const dealKhSplitRef = useRef(dealKhSplitEnabled);
  const configRef = useRef<DeadlineConfig | null>(null);
  const leadStateRef = useRef(leadState);
  const dealStateRef = useRef(dealState);
  const kindRef = useRef(kind);
  const companiesRef = useRef(companies);
  const lastServerLoadAtRef = useRef(0);
  filtersRef.current = filters;
  searchRef.current = search;
  searchDraftRef.current = searchDraft;
  dealKhSplitRef.current = dealKhSplitEnabled;
  leadStateRef.current = leadState;
  dealStateRef.current = dealState;
  kindRef.current = kind;
  companiesRef.current = companies;

  const buckets = useMemo(
    () => enabledDeadlineBuckets(deadlineConfig?.buckets),
    [deadlineConfig],
  );

  const loadOrgMeta = useCallback(async (companyId: string) => {
    setMetaLoading(true);
    try {
      const [regs, org] = await Promise.all([
        companyId ? fetchCrmRegions(companyId) : Promise.resolve([]),
        companyId
          ? fetchCrmEmployeesByCompany(companyId)
          : Promise.resolve({ departments: [], users: [], companyId: null }),
      ]);
      setRegions(regs);
      setDepartments(org.departments || []);
      setEmployees(org.users || []);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedKind = await readStoredDeadlineKind();
      if (!cancelled) {
        setKind(storedKind);
        kindReadyRef.current = true;
      }
      try {
        const list = await fetchCrmCompanies();
        const scoped = lockCompany && user?.company_id
          ? list.filter((c) => String(c.id) === String(user.company_id))
          : list;
        if (!cancelled) setCompanies(scoped);
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) setOrgReady(true);
      }
      const pref = await readStoredDealKhSplitPreference(viewAll);
      if (!cancelled) setDealKhSplitEnabled(pref);
    })();
    return () => { cancelled = true; };
  }, [userId, user, viewAll, lockCompany, loadOrgMeta]);

  useEffect(() => {
    if (!filtersReady) return;
    if (filters.companyId) void loadOrgMeta(filters.companyId);
    else {
      setRegions([]);
      setDepartments([]);
      setEmployees([]);
    }
  }, [filtersReady, filters.companyId, loadOrgMeta]);

  /** Key lọc server — khớp Overview `deadlineBucketFilterKey` (cùng RPC cache). */
  const stageOptsForKey = useMemo(
    () => buildStageFetchOpts(filters, '', userId || ''),
    [filters, userId],
  );
  const serverFilterKey = useMemo(
    () =>
      deadlineBucketFilterKey({
        phone: filters.phone,
        assignee: filters.assignee,
        assigneeUserId: filters.assigneeUserId,
        companyId: stageOptsForKey.companyId || filters.companyId || '',
        regionId: stageOptsForKey.regionId || '',
        dateFrom: stageOptsForKey.dateFrom || '',
        dateTo: stageOptsForKey.dateTo || '',
        dealKhSplit: dealKhSplitEnabled,
        viewAll,
        userId: userId || '',
      }),
    [
      filters.phone,
      filters.assignee,
      filters.assigneeUserId,
      filters.companyId,
      stageOptsForKey,
      dealKhSplitEnabled,
      viewAll,
      userId,
    ],
  );
  const serverFilterKeyRef = useRef(serverFilterKey);
  serverFilterKeyRef.current = serverFilterKey;

  const applySectionPage = useCallback((section: PlannerKind, pageRes: {
    items: PlannerItem[];
    total: number;
    hasMore: boolean;
    nextOffset: number;
  }) => {
    const next: SectionState = {
      items: pageRes.items,
      total: pageRes.total,
      hasMore: pageRes.hasMore,
      nextOffset: pageRes.nextOffset,
    };
    // Cập nhật ref đồng bộ — onProgress/drain merge không đọc state cũ (mất item first-paint).
    if (section === 'lead') {
      leadStateRef.current = next;
      setLeadState(next);
    } else {
      dealStateRef.current = next;
      setDealState(next);
    }
  }, []);

  /**
   * Badge cột: một lượt đếm riêng theo bộ lọc (cache 90s) — số đúng ngay cả khi
   * list chỉ mới tải first-paint, và không nhảy theo tiến độ drain.
   */
  const refreshBucketCounts = useCallback((
    section: PlannerKind,
    optsBase: Record<string, unknown>,
    fk: string,
    force = false,
  ) => {
    if (serverFilterKeyRef.current !== fk) return;
    const cached = peekDeadlineBucketCounts(section, fk);
    if (cached && !force) setCountsByKind((prev) => ({ ...prev, [section]: cached }));
    if (!force && isDeadlineBucketCountsFresh(section, fk)) return;

    countsAbortRef.current[section]?.abort();
    const ac = new AbortController();
    countsAbortRef.current[section] = ac;
    void (async () => {
      try {
        const res = await fetchDeadlineBucketCountsCached(section, fk, {
          ...optsBase,
          signal: ac.signal,
          force,
        });
        if (ac.signal.aborted) return;
        if (serverFilterKeyRef.current !== fk) return;
        setCountsByKind((prev) => {
          const cur = prev[section];
          // Số chưa quét hết (cận dưới) không được đè số đã đủ — trừ khi force realtime.
          if (!force && cur?.complete && !res.complete) return prev;
          return { ...prev, [section]: res };
        });
      } catch {
        /* giữ số cũ/cache */
      } finally {
        if (countsAbortRef.current[section] === ac) countsAbortRef.current[section] = null;
      }
    })();
  }, []);

  const load = useCallback(async (opts?: {
    refresh?: boolean;
    silent?: boolean;
    /** Chỉ tải các tab này; mặc định là tab đang xem. */
    kinds?: PlannerKind[];
    force?: boolean;
    /** Realtime: luôn đếm lại badge cột + reset trang bucket. */
    forceCounts?: boolean;
    /** Đổi bộ lọc server: bỏ list cũ, không merge card của lọc trước. */
    resetList?: boolean;
  }) => {
    if (!filtersReady) return;
    if (!userId && !viewAll) return;
    const isRefresh = opts?.refresh ?? false;
    const silent = opts?.silent ?? false;
    const force = opts?.force ?? false;
    const resetList = opts?.resetList ?? false;
    if (loadingRef.current && !isRefresh && !force) return;

    abortRef.current?.abort();
    abortAllDrains();
    const ac = new AbortController();
    abortRef.current = ac;
    loadingRef.current = true;

    const kinds: PlannerKind[] = opts?.kinds?.length
      ? opts.kinds
      : [kindRef.current];
    const fkAtStart = serverFilterKeyRef.current;

    const clearSectionLoading = (section: PlannerKind) => {
      if (section === 'lead') {
        setLeadsLoading(false);
        setDrainingLead(false);
      } else {
        setDealsLoading(false);
        setDrainingDeal(false);
      }
    };
    /** Dọn cờ tải khi thoát sớm — nếu không, spinner và `loadingRef` kẹt vĩnh viễn. */
    const bailOut = () => {
      if (abortRef.current !== ac) return;
      loadingRef.current = false;
      if (!silent) setRefreshing(false);
      for (const k of kinds) clearSectionLoading(k);
    };

    // Hiện ngay dữ liệu cache cũ (nếu có) trong lúc tải nền — tránh màn "Đang tải…"
    // mỗi lần vào lại tab, giống trải nghiệm Kanban Hub.
    // Đổi lọc: không lấy cache/list cũ (tránh 1 card lọc trước + badge 23).
    if (resetList) {
      for (const k of kinds) {
        applySectionPage(k, { items: [], total: 0, hasMore: true, nextOffset: 0 });
      }
    } else {
      for (const k of kinds) {
        const stateNow = k === 'lead' ? leadStateRef.current : dealStateRef.current;
        if (stateNow.items.length > 0) continue;
        const cached = peekDeadlineResultCache(k, fkAtStart);
        if (cached) applySectionPage(k, cached);
      }
    }

    if (!silent) {
      // Chỉ hiện spinner che list khi tab đó còn trống — đã có data thì đồng bộ nền (draining).
      for (const k of kinds) {
        const empty = k === 'lead'
          ? leadStateRef.current.items.length === 0
          : dealStateRef.current.items.length === 0;
        if (empty) {
          if (k === 'lead') setLeadsLoading(true);
          else setDealsLoading(true);
        }
      }
    }
    if (isRefresh && !silent) setRefreshing(true);
    setError('');

    const f = filtersRef.current;
    // Không gửi search lên API — clientFilterDeadlineItems lo phần tìm kiếm.
    const listOpts = buildStageFetchOpts(f, '', userId || '');
    const companyId = listOpts.companyId;
    const companiesList = companiesRef.current;

    let cfg: DeadlineConfig;
    try {
      cfg = await fetchDeadlineConfig(companyId, ac.signal);
    } catch (e: unknown) {
      if (!ac.signal.aborted && !silent) {
        setError(formatApiError(e) || 'Không tải được cấu hình deadline');
      }
      bailOut();
      return;
    }
    if (ac.signal.aborted) {
      bailOut();
      return;
    }
    configRef.current = cfg;
    setDeadlineConfig(cfg);

    const deadlineOptsBase = {
      ...listOpts,
      signal: ac.signal,
      deadlineConfig: cfg,
      dealKhSplitEnabled: dealKhSplitRef.current,
      allowedCompanyIds:
        listOpts.companyId || !companiesList.length
          ? null
          : companiesList.map((c) => c.id).filter(Boolean),
    };

    // Badge cột hiện ngay từ cache lượt đếm trước (nếu có) — lượt quét mới chạy sau first-paint.
    for (const k of kinds) {
      const cached = peekDeadlineBucketCounts(k, fkAtStart);
      if (cached) setCountsByKind((prev) => ({ ...prev, [k]: cached }));
    }

    let leadErr = '';
    let dealErr = '';

    /**
     * Path nhẹ: không drain toàn stage (gây lag).
     * Card cột active lấy từ `/crm/deadline-bucket-pages` khi có counts.
     */
    const runOne = async (section: PlannerKind) => {
      const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
      const hadExisting = !resetList && prev.items.length > 0;
      try {
        if (!hadExisting) {
          applySectionPage(section, {
            items: [],
            total: 0,
            hasMore: true,
            nextOffset: 0,
          });
        } else {
          // Soft refresh: giữ list đã stamp; bucket-pages merge thêm.
          applySectionPage(section, { ...prev, hasMore: true });
          clearSectionLoading(section);
        }
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        const msg =
          (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
          (e as { message?: string })?.message ||
          (section === 'lead' ? 'Không tải được leads' : 'Không tải được deals');
        if (section === 'lead') leadErr = msg;
        else dealErr = msg;
        clearSectionLoading(section);
      }
    };

    // Máy yếu: chỉ chuẩn bị tab đang xem trước.
    if (perf.parallelKinds || kinds.length === 1) {
      await Promise.all(kinds.map((k) => runOne(k)));
    } else {
      const active = kindRef.current;
      const ordered = [active, ...kinds.filter((k) => k !== active)];
      for (const k of ordered) {
        if (ac.signal.aborted) break;
        await runOne(k);
      }
    }

    // Đếm badge cột sớm — card cột active load ngay sau khi có counts.
    // Pull-to-refresh (không silent) mới ép quét lại; realtime silent giữ cache + delay.
    if (!ac.signal.aborted) {
      const forceCounts = !!opts?.forceCounts || (isRefresh && !silent);
      if (forceCounts) {
        invalidateDeadlineBucketCounts();
        bucketPagesGenRef.current += 1;
        bucketPagesLoadingRef.current.clear();
        bucketPageStateRef.current = {};
        setBucketPageState({});
        const stripStamp = (rows: PlannerItem[]) => rows.map((row) => (
          row.deadlineBucket ? { ...row, deadlineBucket: undefined } : row
        ));
        setLeadState((prev) => {
          const next = { ...prev, items: stripStamp(prev.items) };
          leadStateRef.current = next;
          return next;
        });
        setDealState((prev) => {
          const next = { ...prev, items: stripStamp(prev.items) };
          dealStateRef.current = next;
          return next;
        });
      }
      setTimeout(() => {
        const { signal: _loadSignal, ...countsOpts } = deadlineOptsBase as typeof deadlineOptsBase & {
          signal?: AbortSignal;
        };
        for (const k of kinds) refreshBucketCounts(k, countsOpts, fkAtStart, forceCounts);
      }, forceCounts ? 0 : perf.countsDelayMs);
    }

    if (!ac.signal.aborted) {
      lastServerLoadAtRef.current = Date.now();
      if (leadErr && dealErr) setError(leadErr);
      else if (kinds.includes('lead') && leadErr && !leadStateRef.current.items.length) setError(leadErr);
      else if (kinds.includes('deal') && dealErr && !dealStateRef.current.items.length) setError(dealErr);
      else setError('');
    }
    // Lượt tải mới đã bắt đầu: không tắt cờ của nó.
    if (abortRef.current === ac) {
      loadingRef.current = false;
      if (!silent) setRefreshing(false);
    }
  }, [filtersReady, userId, viewAll, applySectionPage, abortAllDrains, refreshBucketCounts, perf]);

  /** Reload server chỉ khi lọc server đổi — search/due/searchField lọc client, không gọi lại API. */
  const prevServerFilterKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!filtersReady || !orgReady) return;
    const prev = prevServerFilterKeyRef.current;
    if (prev === serverFilterKey) return;
    prevServerFilterKeyRef.current = serverFilterKey;
    const isFirst = prev == null;
    if (!isFirst) {
      clearDeadlineOverdueBreakdown();
      invalidateDeadlineResultCache();
      userPickedKindRef.current = false;
    }
    setCountsByKind({
      lead: peekDeadlineBucketCounts('lead', serverFilterKey),
      deal: peekDeadlineBucketCounts('deal', serverFilterKey),
    });
    const t = setTimeout(() => {
      void load({
        refresh: !isFirst,
        kinds: ['lead', 'deal'],
        resetList: !isFirst,
      });
    }, isFirst ? 0 : 120);
    return () => clearTimeout(t);
  }, [filtersReady, orgReady, load, serverFilterKey]);

  /**
   * Có mạng trở lại: quét đếm + tải lại card.
   * Deadline gọi cache bằng `fetchQuery` (không có observer) nên
   * `refetchOnReconnect` của TanStack không chạm tới — phải tự kích hoạt,
   * nếu không màn hình giữ số 0 của lúc offline tới khi người dùng kéo refresh.
   */
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (!isOnline || !wasOffline) return;
    if (!filtersReady || !orgReady) return;
    if (!userId && !viewAll) return;
    void load({ refresh: true, silent: true, force: true, forceCounts: true, kinds: ['lead', 'deal'] });
  }, [isOnline, filtersReady, orgReady, userId, viewAll, load]);

  /** Đổi Lead ↔ Deal: chỉ tải khi tab đích trống (không chạy trùng lần mount). */
  const prevKindRef = useRef<PlannerKind | null>(null);
  useEffect(() => {
    if (!filtersReady) return;
    const switched = prevKindRef.current != null && prevKindRef.current !== kind;
    prevKindRef.current = kind;
    if (!switched) return;
    const state = kind === 'lead' ? leadStateRef.current : dealStateRef.current;
    if (state.items.length > 0) return;
    void load({ kinds: [kind] });
  }, [kind, filtersReady, load]);

  /** Tab đang xem trống mà tab kia có quá hạn → chuyển sang tab có dữ liệu (trừ khi user vừa chọn tay). */
  useEffect(() => {
    if (!filtersReady || !kindReadyRef.current) return;
    if (userPickedKindRef.current) return;
    const leadC = countsByKind.lead;
    const dealC = countsByKind.deal;
    if (!leadC || !dealC) return;
    const leadN = Math.max(leadC.overdue, leadC.total);
    const dealN = Math.max(dealC.overdue, dealC.total);
    const curN = kind === 'lead' ? leadN : dealN;
    const otherN = kind === 'lead' ? dealN : leadN;
    if (curN > 0 || otherN <= 0) return;
    const next: PlannerKind = kind === 'lead' ? 'deal' : 'lead';
    setKind(next);
    persistDeadlineKind(next);
  }, [filtersReady, countsByKind, kind]);

  useFocusEffect(
    useCallback(() => {
      if (!filtersReady || !orgReady) return undefined;
      if (!userId && !viewAll) return undefined;
      const hasData =
        leadStateRef.current.items.length > 0
        || dealStateRef.current.items.length > 0;
      const stale = Date.now() - lastServerLoadAtRef.current > 60_000;
      if (hasData && stale) {
        void load({ refresh: true, silent: true, kinds: ['lead', 'deal'] });
        return undefined;
      }
      if (!hasData) {
        const t = setTimeout(() => {
          if (loadingRef.current) return;
          if (leadStateRef.current.items.length || dealStateRef.current.items.length) return;
          if (lastServerLoadAtRef.current > 0) return;
          void load({ kinds: ['lead', 'deal'] });
        }, 280);
        return () => clearTimeout(t);
      }
      return undefined;
    }, [load, userId, viewAll, filtersReady, orgReady]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      if (!filtersReady) return;
      // Chỉ refresh tab đang xem; không forceCounts (tránh quét lại badge lead+deal mỗi bump).
      void load({
        refresh: true,
        silent: true,
        kinds: [kindRef.current],
      });
    }, [load, filtersReady]),
    Boolean(filtersReady && (userId || viewAll)),
  );

  // Badge tab Deadline: cập nhật ngay khi có dữ liệu, không chờ cả hai mục tải xong.
  useEffect(() => {
    if (!filtersReady) return;
    // Có lượt đếm riêng cho cả hai mục → dùng số quá hạn chính xác của lượt đếm đó.
    const leadCounts = countsByKind.lead;
    const dealCounts = countsByKind.deal;
    if (leadCounts && dealCounts) {
      publishDeadlineOverdueCounts(leadCounts.overdue, dealCounts.overdue, {
        partial: !leadCounts.complete || !dealCounts.complete,
      });
      return;
    }
    // Chưa mục nào xong → chưa có gì để hiển thị, tránh ghi đè badge = 0.
    if (leadsLoading && dealsLoading) return;
    // Chỉ coi là tạm khi còn đang tải/đồng bộ — không gắn hasMore (trần buffer)
    // nếu không badge mãi «partial» và bị số tạm ghi đè số đúng.
    const partial = leadsLoading || dealsLoading || drainingLead || drainingDeal;
    publishDeadlineOverdueFromItems(leadState.items, dealState.items, { partial });
  }, [
    filtersReady,
    countsByKind,
    leadState.items,
    dealState.items,
    leadsLoading,
    dealsLoading,
    drainingLead,
    drainingDeal,
  ]);

  const rawState = kind === 'lead' ? leadState : dealState;
  const loading = kind === 'lead' ? leadsLoading : dealsLoading;
  const draining = kind === 'lead' ? drainingLead : drainingDeal;
  /** Chỉ che UI khi chưa có dữ liệu — search/filter client không làm trống màn hình. */
  const showBlockingLoader = !filtersReady || (loading && rawState.items.length === 0);
  const meta = kindMeta(Colors)[kind];

  const filteredItems = useMemo(
    () => clientFilterDeadlineItems(rawState.items, filters, search),
    [rawState.items, filters, search],
  );

  const grouped = useMemo(() => {
    const out: Record<DeadlineBucketKey, PlannerItem[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      this_week: [],
      next_week: [],
      in_2_weeks: [],
      in_3_weeks: [],
      in_4_weeks: [],
      in_1_month: [],
      next_month: [],
      no_deadline: [],
    };
    for (const it of filteredItems) {
      const stamped = it.deadlineBucket;
      const key = (stamped && buckets.includes(stamped))
        ? stamped
        : resolveDeadlineBucket(deadlineIsoToTs(it.dueIso), deadlineConfig?.buckets);
      out[key].push(it);
    }
    return out;
  }, [filteredItems, deadlineConfig, buckets]);

  const loadedBucketCounts = useMemo(() => {
    const counts: DeadlineBucketCountMap = {};
    for (const k of buckets) counts[k] = grouped[k]?.length || 0;
    return counts;
  }, [buckets, grouped]);

  /** Tìm kiếm / lọc hạn chạy ở client → badge phải theo tập đã lọc, không dùng số đếm đầy đủ. */
  const clientFilterActive = !!search.trim() || filters.due !== 'all';
  const kindCounts = countsByKind[kind];
  const useScannedCounts = !clientFilterActive && !!kindCounts;

  /** Số badge cột — giống Kanban: lấy từ lượt đếm riêng, cột trống điền 0. */
  const bucketCounts = useMemo(() => {
    if (!useScannedCounts || !kindCounts) return loadedBucketCounts;
    const counts: DeadlineBucketCountMap = {};
    for (const k of buckets) counts[k] = kindCounts.counts[k] ?? 0;
    return counts;
  }, [useScannedCounts, kindCounts, loadedBucketCounts, buckets]);

  useEffect(() => {
    if (bucketInitRef.current) return;
    if (!filteredItems.length) return;
    const firstWithItems = buckets.find((k) => (grouped[k]?.length || 0) > 0);
    if (firstWithItems) {
      setBucketKey(firstWithItems);
      bucketInitRef.current = true;
    }
  }, [filteredItems.length, buckets, grouped]);

  useEffect(() => {
    bucketInitRef.current = false;
    bucketPagesGenRef.current += 1;
    bucketPagesLoadingRef.current.clear();
    bucketPageStateRef.current = {};
    setBucketPageState({});
    setLoadingMore(false);
  }, [kind, filters.phone, filters.assignee, filters.companyId, filters.regionId]);

  const safeBucket = buckets.includes(bucketKey) ? bucketKey : (buckets[0] || 'overdue');
  const columnItems = grouped[safeBucket] || [];
  const pagedColumnItems = useMemo(
    () => columnItems.slice(0, visibleCount),
    [columnItems, visibleCount],
  );

  const searchUiActive = searchDraft.trim().length >= 2 || !!search.trim();

  const deadlineSuggestFilters = useMemo(
    () => filtersForCrmSearchSuggest(filters),
    [filters],
  );

  const suggestLocalItems = useMemo(
    () => [...leadState.items, ...dealState.items].map(plannerToSuggestItem),
    [leadState.items, dealState.items],
  );
  const deadlineSuggestTypes = useMemo(() => ['lead', 'deal'] as Array<'lead' | 'deal'>, []);
  const {
    open: searchSuggestOpen,
    loading: searchSuggestLoading,
    items: searchSuggestItems,
    total: searchSuggestTotal,
    setDismissed: setSearchSuggestDismissed,
  } = useCrmSearchSuggest({
    enabled: deadlineTabFocused,
    type: kind,
    types: deadlineSuggestTypes,
    searchDraft,
    filters: deadlineSuggestFilters,
    myId: userId || '',
    localItems: suggestLocalItems,
    deadlineOnly: true,
  });

  const listRef = useRef<FlatList<PlannerItem>>(null);
  const pendingSearchFocusRef = useRef<PlannerItem | null>(null);
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
    const fromLead = leadStateRef.current.items.find((x) => x.id === item.id);
    const fromDeal = dealStateRef.current.items.find((x) => x.id === item.id);
    const found = fromLead || fromDeal || kanbanToPlannerItem({ ...item, kind: item.kind || kind });
    if (found.kind !== kind) {
      setKind(found.kind);
      persistDeadlineKind(found.kind);
    }
    const bucket = (found.deadlineBucket && buckets.includes(found.deadlineBucket))
      ? found.deadlineBucket
      : resolveDeadlineBucket(deadlineIsoToTs(found.dueIso), deadlineConfig?.buckets);
    if (bucket !== bucketKey) setBucketKey(bucket);
    pendingSearchFocusRef.current = found;
    // Đảm bảo thẻ nằm trong cửa sổ render
    setVisibleCount((n) => Math.max(n, DEADLINE_CARD_PAGE_SIZE * 3));
    setSearchFocusNonce((n) => n + 1);
  }, [
    setSearchSuggestDismissed,
    setSearchDraft,
    commitSearch,
    kind,
    buckets,
    deadlineConfig?.buckets,
    bucketKey,
  ]);

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
    // Đợi đúng tab kind
    if (pending.kind !== kind) return;
    const idx = pagedColumnItems.findIndex((it) => it.id === pending.id);
    if (idx < 0) {
      // Mở rộng cửa sổ nếu thẻ nằm sâu hơn
      const fullIdx = columnItems.findIndex((it) => it.id === pending.id);
      if (fullIdx >= 0 && visibleCount <= fullIdx) {
        setVisibleCount(fullIdx + 5);
        return;
      }
      // Chưa có trong cột — inject tạm vào state hiện tại
      if (fullIdx < 0) {
        const inject = (prev: SectionState): SectionState => {
          if (prev.items.some((x) => x.id === pending.id)) return prev;
          return { ...prev, items: [pending, ...prev.items] };
        };
        if (kind === 'lead') {
          setLeadState(inject);
          leadStateRef.current = inject(leadStateRef.current);
        } else {
          setDealState(inject);
          dealStateRef.current = inject(dealStateRef.current);
        }
      }
      return;
    }
    pendingSearchFocusRef.current = null;
    flashHighlight(pending.id);
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.25 });
      } catch {
        listRef.current?.scrollToOffset({ offset: Math.max(0, idx * 140), animated: true });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [
    kind,
    pagedColumnItems,
    columnItems,
    visibleCount,
    searchFocusNonce,
    flashHighlight,
  ]);

  const clientHasMore = visibleCount < columnItems.length;
  const bucketIdx = Math.max(0, buckets.indexOf(safeBucket));
  const canPrev = bucketIdx > 0;
  const canNext = bucketIdx < buckets.length - 1;
  const accent = DEADLINE_BUCKET_COLOR[safeBucket] || meta.color;
  const columnTitle = deadlineBucketLabel(safeBucket, deadlineConfig?.buckets);
  const columnPageKey = `${serverFilterKey}:${kind}:${safeBucket}`;
  const columnPageState = bucketPageState[columnPageKey];
  /** Ưu tiên số đếm server; nếu chưa có thì dùng total từ bucket-pages; tránh đếm list đã tải (lệch trên 4G). */
  const pageTotal = Number(columnPageState?.total);
  const columnBadgeCount = (() => {
    if (useScannedCounts && kindCounts) {
      return Number(kindCounts.counts[safeBucket]) || 0;
    }
    if (Number.isFinite(pageTotal) && pageTotal > 0) return pageTotal;
    return loadedBucketCounts[safeBucket] ?? columnItems.length;
  })();
  /** Chỉ đánh dấu «+» khi số vẫn là cận dưới (chưa đếm xong / chưa đếm riêng). */
  const columnBadgePending = useScannedCounts
    ? !kindCounts?.complete
    : ((loading || draining) && rawState.hasMore) || !(Number.isFinite(pageTotal) && pageTotal > 0);
  const columnHasMore = columnPageState
    ? columnPageState.hasMore !== false
      && (columnItems.length < (Number(bucketCounts[safeBucket]) || 0) || !!columnPageState.hasMore)
    : false;
  const listHasMore = searchUiActive ? clientHasMore : (clientHasMore || columnHasMore);

  useEffect(() => {
    setVisibleCount(DEADLINE_CARD_PAGE_SIZE);
  }, [safeBucket, kind, serverFilterKey, search, filters.due]);

  const goPrevBucket = useCallback(() => {
    setBucketKey((cur) => {
      const idx = buckets.indexOf(cur);
      if (idx <= 0) return buckets[0] || cur;
      return buckets[idx - 1];
    });
  }, [buckets]);
  const goNextBucket = useCallback(() => {
    setBucketKey((cur) => {
      const idx = buckets.indexOf(cur);
      if (idx < 0 || idx >= buckets.length - 1) return buckets[buckets.length - 1] || cur;
      return buckets[idx + 1];
    });
  }, [buckets]);

  /**
   * Tải thẻ đúng cột qua `/crm/deadline-bucket-pages` (khớp web) —
   * stamp deadlineBucket để badge và list không lệch.
   */
  const loadBucketColumn = useCallback(async (
    bucket: DeadlineBucketKey,
    { initialOnly = false }: { initialOnly?: boolean } = {},
  ) => {
    if (!filtersReady) return;
    if (!userId && !viewAll) return;
    const fk = serverFilterKeyRef.current;
    const pageKey = `${fk}:${kind}:${bucket}`;
    if (bucketPagesLoadingRef.current.has(pageKey)) return;
    const state = bucketPageStateRef.current[pageKey] || { nextOffset: 0, hasMore: true, loading: false, total: 0 };
    const total = Number(kindCounts?.counts?.[bucket]);
    /**
     * `complete: false` = lượt đếm chưa xong (mất mạng / chạm trần) nên số là cận dưới.
     * Không được dùng nó để kết luận «cột rỗng» hay «đã tải hết», nếu không cột sẽ
     * trống vĩnh viễn với số 0 của lúc offline.
     */
    const countsTrustworthy = kindCounts?.complete !== false;
    const finishLoading = () => {
      if (kind === 'lead') {
        setLeadsLoading(false);
        setDrainingLead(false);
      } else {
        setDealsLoading(false);
        setDrainingDeal(false);
      }
    };
    // Đang tìm: không phân trang cột phía dưới — dropdown/client filter đã có kết quả.
    if (searchDraftRef.current.trim().length >= 2 || searchRef.current.trim()) {
      finishLoading();
      setLoadingMore(false);
      return;
    }
    if (Number.isFinite(total) && total <= 0 && countsTrustworthy) {
      finishLoading();
      return;
    }
    if (state.hasMore === false) {
      finishLoading();
      return;
    }
    const offset = Math.max(Number(state.nextOffset) || 0, 0);
    if (initialOnly && offset > 0) {
      finishLoading();
      return;
    }
    if (Number.isFinite(total) && offset >= total && countsTrustworthy) {
      finishLoading();
      return;
    }

    const generation = bucketPagesGenRef.current;
    bucketPagesLoadingRef.current.add(pageKey);
    setBucketPageState((prev) => {
      const next = {
        ...prev,
        [pageKey]: { ...(prev[pageKey] || { nextOffset: 0, hasMore: true, total: 0 }), loading: true },
      };
      bucketPageStateRef.current = next;
      return next;
    });
    setLoadingMore(true);
    try {
      const listOpts = buildStageFetchOpts(filtersRef.current, '', userId || '');
      const companiesList = companiesRef.current;
      const pages = await fetchDeadlineBucketPageCached(
        kind,
        fk,
        bucket,
        offset,
        DEADLINE_BUCKET_PAGE_LIMIT,
        {
          ...listOpts,
          deadlineConfig: configRef.current,
          dealKhSplitEnabled: dealKhSplitRef.current,
          allowedCompanyIds:
            listOpts.companyId || !companiesList.length
              ? null
              : companiesList.map((c) => c.id).filter(Boolean),
        },
      );
      if (generation !== bucketPagesGenRef.current) return;
      if (serverFilterKeyRef.current !== fk) return;
      const page = pages[bucket] || {
        items: [] as PlannerItem[],
        total: 0,
        nextOffset: offset,
        hasMore: false,
      };

      const mergeItems = (prevItems: PlannerItem[]) => {
        // Trang đầu của cột: bỏ card cột này của lọc/trang cũ, không giữ 1 dòng stale.
        const base = offset > 0
          ? prevItems
          : prevItems.filter((i) => i.deadlineBucket && i.deadlineBucket !== bucket);
        const map = new Map(base.map((i) => [String(i.id), i]));
        for (const row of page.items) {
          const id = String(row.id);
          const prev = map.get(id);
          map.set(id, prev
            ? { ...prev, ...row, deadlineBucket: row.deadlineBucket || prev.deadlineBucket }
            : row);
        }
        return [...map.values()].sort(byDeadlineAsc).slice(0, maxBuffer);
      };

      if (kind === 'lead') {
        const prev = leadStateRef.current;
        const next = {
          items: mergeItems(prev.items),
          total: Math.max(prev.total, page.total, prev.items.length),
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        leadStateRef.current = next;
        setLeadState(next);
      } else {
        const prev = dealStateRef.current;
        const next = {
          items: mergeItems(prev.items),
          total: Math.max(prev.total, page.total, prev.items.length),
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        dealStateRef.current = next;
        setDealState(next);
      }

      setBucketPageState((prev) => {
        const next = {
          ...prev,
          [pageKey]: {
            loading: false,
            nextOffset: page.nextOffset,
            hasMore: page.hasMore,
            total: page.total,
          },
        };
        bucketPageStateRef.current = next;
        return next;
      });
    } catch {
      /* giữ list cũ */
    } finally {
      bucketPagesLoadingRef.current.delete(pageKey);
      // Luôn tắt cờ «đang tải thêm»: nếu bỏ qua khi generation đã đổi (đổi lọc/tab
      // giữa lúc request bay), cột trống sẽ hiện «Đang tải…» vĩnh viễn.
      setLoadingMore(false);
      if (kind === 'lead') {
        setLeadsLoading(false);
        setDrainingLead(false);
      } else {
        setDealsLoading(false);
        setDrainingDeal(false);
      }
      setBucketPageState((prev) => {
        if (!prev[pageKey]?.loading) return prev;
        const next = { ...prev, [pageKey]: { ...prev[pageKey], loading: false } };
        bucketPageStateRef.current = next;
        return next;
      });
    }
  }, [filtersReady, userId, viewAll, kind, kindCounts, serverFilterKey]);

  useEffect(() => {
    if (!filtersReady || !kindCounts) return;
    void loadBucketColumn(safeBucket, { initialOnly: true });
  }, [filtersReady, kindCounts, safeBucket, kind, serverFilterKey, loadBucketColumn]);

  const canPrevRef = useRef(canPrev);
  const canNextRef = useRef(canNext);
  canPrevRef.current = canPrev;
  canNextRef.current = canNext;
  /** Đã nhận diện vuốt ngang — không nhường FlatList (tránh lúc được lúc không). */
  const swipeClaimedRef = useRef(false);

  const trySwipeColumn = useCallback((dx: number, vx: number) => {
    const distance = 40;
    const fling = 0.35;
    if ((dx <= -distance || vx <= -fling) && canNextRef.current) {
      goNextBucket();
      return;
    }
    if ((dx >= distance || vx >= fling) && canPrevRef.current) {
      goPrevBucket();
    }
  }, [goNextBucket, goPrevBucket]);

  /**
   * Vuốt ngang đổi cột — gắn lên View bọc FlatList (giống CrmHub),
   * không gắn thẳng lên FlatList (ScrollView hay cướp gesture → lúc được lúc không).
   */
  const columnSwipe = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          const ok = Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2;
          if (ok) swipeClaimedRef.current = true;
          return ok;
        },
        onMoveShouldSetPanResponderCapture: (_, g) => {
          const ok = Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35;
          if (ok) swipeClaimedRef.current = true;
          return ok;
        },
        onPanResponderTerminationRequest: () => !swipeClaimedRef.current,
        onPanResponderRelease: (_, g) => {
          const claimed = swipeClaimedRef.current;
          swipeClaimedRef.current = false;
          if (!claimed) return;
          trySwipeColumn(g.dx, g.vx);
        },
        onPanResponderTerminate: (_, g) => {
          const claimed = swipeClaimedRef.current;
          swipeClaimedRef.current = false;
          // FlatList / RefreshControl xen ngang — vẫn đổi cột nếu đã vuốt đủ.
          if (!claimed) return;
          trySwipeColumn(g.dx, g.vx);
        },
      }),
    [trySwipeColumn],
  );

  const filterBadge = countActiveFilters(filters, search);
  const filterChips = useMemo(
    () => activeFilterChips(
      filters,
      search,
      {
        companyName: companies.find((c) => c.id === filters.companyId)?.name,
        regionName: regions.find((r) => r.id === filters.regionId)?.name,
        assigneeName: employees.find((e) => e.id === filters.assigneeUserId)?.full_name || undefined,
      },
      (patch) => setFilters((p) => ({ ...p, ...patch })),
      () => commitSearch(''),
      false,
      lockCompany,
      lockAssignee,
    ),
    [filters, search, companies, regions, employees, lockCompany, lockAssignee],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    if (searchDraftRef.current.trim().length >= 2 || searchRef.current.trim()) return;
    if (!userId && !viewAll) return;
    const pageKey = `${serverFilterKey}:${kind}:${safeBucket}`;
    const pageState = bucketPageStateRef.current[pageKey];
    if (pageState?.hasMore === false) return;
    const total = Number(kindCounts?.counts?.[safeBucket]);
    const loadedInCol = (grouped[safeBucket] || []).length;
    if (Number.isFinite(total) && loadedInCol >= total && pageState?.hasMore !== true) return;
    await loadBucketColumn(safeBucket, { initialOnly: false });
  }, [loadingMore, userId, viewAll, safeBucket, kind, kindCounts, grouped, loadBucketColumn, serverFilterKey]);

  const goDetail = useCallback((item: PlannerItem) => {
    navigation.navigate('LeadDealDetail', {
      leadId: item.id,
      kind: item.kind,
      code: item.code,
      title: item.title,
    });
  }, [navigation]);

  const flushPendingProgress = useCallback(() => {
    const pending = pendingProgressRef.current;
    if (!pending) return;
    pendingProgressRef.current = null;
    const { section, partial, mode } = pending;
    if (mode === 'safe') {
      const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
      if (prev.items.length > 0 && partial.items.length < prev.items.length) return;
      applySectionPage(section, partial);
      return;
    }
    const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
    const seen = new Set(prev.items.map((i) => i.id));
    const appended = partial.items.filter((i) => !seen.has(i.id));
    const items = prev.items.length
      ? [...prev.items, ...appended].sort(byDeadlineAsc).slice(0, maxBuffer)
      : partial.items.slice(0, maxBuffer);
    applySectionPage(section, {
      items,
      total: Math.max(prev.total, items.length, partial.total),
      hasMore: partial.hasMore && items.length < maxBuffer,
      nextOffset: Math.max(prev.nextOffset, partial.nextOffset, items.length),
    });
  }, [applySectionPage]);

  const onListScrollBegin = useCallback(() => {
    listScrollingRef.current = true;
  }, []);
  const onListScrollEnd = useCallback(() => {
    listScrollingRef.current = false;
    flushPendingProgress();
  }, [flushPendingProgress]);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const patchDeadlineItem = useCallback((
    section: PlannerKind,
    itemId: string,
    patch: Partial<PlannerItem> | null,
    opts?: { remove?: boolean },
  ) => {
    const apply = (prev: SectionState): SectionState => {
      if (opts?.remove) {
        return { ...prev, items: prev.items.filter((it) => it.id !== itemId) };
      }
      if (!patch) return prev;
      return {
        ...prev,
        items: prev.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
      };
    };
    if (section === 'lead') {
      const next = apply(leadStateRef.current);
      leadStateRef.current = next;
      setLeadState(next);
    } else {
      const next = apply(dealStateRef.current);
      dealStateRef.current = next;
      setDealState(next);
    }
  }, []);

  const shouldRemoveAfterAssign = useCallback(
    (assignedToId: string | null) => {
      if (filters.assignee === 'mine' && assignedToId && String(assignedToId) !== String(userId)) {
        return true;
      }
      if (
        filters.assignee === 'user'
        && filters.assigneeUserId
        && String(assignedToId || '') !== String(filters.assigneeUserId)
      ) {
        return true;
      }
      if (filters.assignee === 'mine' && !assignedToId) return true;
      return false;
    },
    [filters.assignee, filters.assigneeUserId, userId],
  );

  const openAssignForItem = useCallback(
    (item: PlannerItem) => {
      const companyId = item.companyId || filters.companyId || user?.company_id || '';
      if (!companyId) {
        showToast('Thẻ chưa có công ty — không gán được phụ trách', false);
        return;
      }
      setAssignItem(item);
      if (companyId === filters.companyId && employees.length) {
        setAssignEmployees(employees);
        return;
      }
      setAssignEmployeesLoading(true);
      void (async () => {
        try {
          const org = await fetchCrmEmployeesByCompany(companyId);
          setAssignEmployees(org.users);
        } catch {
          setAssignEmployees([]);
        } finally {
          setAssignEmployeesLoading(false);
        }
      })();
    },
    [employees, filters.companyId, user?.company_id, showToast],
  );

  const assignCardTo = useCallback(
    async (item: PlannerItem, nextUserId: string | null) => {
      const pick = assignEmployees.find((u) => String(u.id) === String(nextUserId || ''));
      const ownerName = nextUserId
        ? (pick?.full_name || pick?.email || '—').trim()
        : 'Chưa gán';
      const ownerId = nextUserId || 'unassigned';
      const patch: Partial<PlannerItem> = {
        assignedToId: nextUserId || '',
        leadOwnerId: nextUserId || '',
        ownerId,
        ownerName,
        ownerInitials: initialsFromName(ownerName),
        ownerColor: colorFromName(ownerName),
      };
      const remove = shouldRemoveAfterAssign(nextUserId);
      setAssigningId(item.id);
      if (remove) patchDeadlineItem(item.kind, item.id, null, { remove: true });
      else patchDeadlineItem(item.kind, item.id, patch);
      try {
        const res = await updateCrmAssignee(item.id, nextUserId);
        const finalName = res.ownerName || ownerName;
        if (!remove) {
          patchDeadlineItem(item.kind, item.id, {
            assignedToId: res.assignedToId,
            leadOwnerId: res.assignedToId,
            ownerId: res.assignedToId || 'unassigned',
            ownerName: finalName,
            ownerInitials: initialsFromName(finalName),
            ownerColor: colorFromName(finalName),
          });
        }
        showToast(
          nextUserId
            ? `Đã gán ${item.code} → ${finalName}`
            : `Đã bỏ gán phụ trách ${item.code}`,
          true,
        );
      } catch (e) {
        showToast(formatApiError(e), false);
        void load({ refresh: true, silent: true, kinds: [item.kind] });
      } finally {
        setAssigningId(null);
      }
    },
    [assignEmployees, shouldRemoveAfterAssign, patchDeadlineItem, showToast, load],
  );

  const openMoveForItem = useCallback(
    (item: PlannerItem) => {
      setMovingId(item.id);
      const companyId = item.companyId || filters.companyId || user?.company_id || undefined;
      const regionId = filters.regionId && filters.regionId !== '__none__'
        ? filters.regionId
        : undefined;
      if (item.kind === 'deal') {
        prefetchCrmProductionCompanies(companyId);
      }
      void (async () => {
        try {
          const stages = await fetchPipelineStages(item.kind, { companyId, regionId });
          setMoveStages(stages);
          setMoveItem(item);
        } catch {
          setMoveStages([]);
          showToast('Không tải được danh sách giai đoạn', false);
        } finally {
          setMovingId(null);
        }
      })();
    },
    [filters.companyId, filters.regionId, user?.company_id, showToast],
  );

  const renderDeadlineItem = useCallback(({ item: it }: { item: PlannerItem }) => {
    const companyId = it.companyId || filters.companyId || user?.company_id || '';
    const canAssign = canAssignCrmCard(
      user,
      plannerAsAssigneeTarget(it),
      userId || '',
      companyId,
    );
    return (
      <View style={{ paddingHorizontal: 16 }}>
        <DeadlineCard
          item={it}
          accent={accent}
          highlighted={highlightCardId === it.id}
          canAssign={canAssign}
          isAssigning={assigningId === it.id}
          isMoving={movingId === it.id}
          onOpen={goDetail}
          onAssign={openAssignForItem}
          onMove={openMoveForItem}
        />
      </View>
    );
  }, [
    accent,
    assigningId,
    movingId,
    highlightCardId,
    filters.companyId,
    user,
    userId,
    goDetail,
    openAssignForItem,
    openMoveForItem,
  ]);

  const applyDeadlineStageMove = useCallback(
    async (
      item: PlannerItem,
      target: CrmPipelineStage,
      kanbanDeadlineAt?: string,
      sxTargets?: CrmSxProductionTarget[],
    ) => {
      const staysOnDeadline = isDeadlineMembershipStage(target);
      setMovingId(item.id);
      if (!staysOnDeadline) {
        patchDeadlineItem(item.kind, item.id, null, { remove: true });
      } else {
        patchDeadlineItem(item.kind, item.id, {
          stageId: target.id,
          status: target.name,
          ...(kanbanDeadlineAt ? { dueIso: kanbanDeadlineAt, overdue: false } : null),
          ...(sxTargets?.length ? { projectId: item.projectId || 'pending' } : null),
        });
      }
      try {
        if (sxTargets?.length) {
          showToast(`Đang tạo dự án SX cho ${item.code}…`, true);
        }
        await moveCrmItemStage(item.id, target.id, {
          kanbanDeadlineAt: kanbanDeadlineAt || undefined,
          targets: sxTargets,
        });
        showToast(
          staysOnDeadline
            ? (sxTargets?.length
              ? `Đã chuyển ${item.code} → ${target.name} (đã tạo SX)`
              : `Đã chuyển ${item.code} → ${target.name}`)
            : `Đã chuyển ${item.code} → ${target.name} (ra khỏi Deadline)`,
          true,
        );
      } catch (e) {
        showToast(formatApiError(e), false);
        void load({ refresh: true, silent: true, kinds: [item.kind] });
      } finally {
        setMovingId(null);
      }
    },
    [patchDeadlineItem, showToast, load],
  );

  const moveCardTo = useCallback(
    async (item: PlannerItem, targetStageId: string) => {
      const target = moveStages.find((s) => String(s.id) === String(targetStageId));
      if (!target) {
        showToast('Không tìm thấy cột đích', false);
        return;
      }
      const plan = planCrmStageMove({
        kind: item.kind,
        target,
        existingDeadlineIso: item.dueIso,
        projectId: item.projectId,
        stages: moveStages,
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
                      regionId: undefined,
                      companyId: item.companyId,
                    });
                    showToast(`Đã chuyển ${item.code} sang Deal`, true);
                    patchDeadlineItem(item.kind, item.id, null, { remove: true });
                  } catch (e) {
                    showToast(formatApiError(e), false);
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
      await applyDeadlineStageMove(item, target, plan.kanbanDeadlineAt);
    },
    [moveStages, showToast, applyDeadlineStageMove, patchDeadlineItem, filters.companyId],
  );

  const assignPickerOptions = useMemo(
    () => buildAssignPickerOptions(assignEmployees, user, userId || ''),
    [assignEmployees, user, userId],
  );

  const phoneHint =
    filters.phone === 'has_phone' ? 'Có SĐT'
    : filters.phone === 'no_phone' ? 'Chưa SĐT'
    : 'Mọi SĐT';

  return (
    <View style={styles.root}>
      {/* Header cố định — chỉ danh sách card cuộn */}
      <View style={[styles.stickyChrome, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <View style={styles.kindTabs}>
            {(['lead', 'deal'] as PlannerKind[]).map((k) => {
              const km = kindMeta(Colors)[k];
              const active = kind === k;
              return (
                <Pressable
                  key={k}
                  style={[styles.kindTab, active && { backgroundColor: km.color, borderColor: km.color }]}
                  onPress={() => {
                    userPickedKindRef.current = true;
                    setKind(k);
                    persistDeadlineKind(k);
                  }}
                >
                  <Ionicons name={km.icon} size={16} color={active ? '#fff' : km.color} />
                  <Text style={[styles.kindTabTxt, { color: active ? '#fff' : Colors.text }]}>
                    {km.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.searchRowWrap}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={Colors.textFaint} />
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
              keyboardType={filters.searchField === 'phone' ? 'phone-pad' : 'default'}
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
              setFilterOpen(true);
            }}
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

        <View style={styles.metaRow}>
          <Text style={styles.metaTxt}>
            {columnItems.length}/{columnBadgeCount}{columnBadgePending ? '+' : ''} {columnTitle}
            {' · '}đã tải {filteredItems.length}
            {' · '}{buckets.length} cột
          </Text>
          <Text style={[styles.metaHint, { color: meta.color }]}>{phoneHint}</Text>
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
              <Pressable key={chip.key} style={styles.activeChip} onPress={chip.onClear}>
                <Text style={styles.activeChipTxt} numberOfLines={1}>{chip.label}</Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ))}
            <Pressable
              style={styles.activeChipClear}
              onPress={() => resetFilters()}
            >
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        <View style={styles.colHeaderRow} {...columnSwipe.panHandlers}>
          <Pressable
            onPress={goPrevBucket}
            disabled={!canPrev}
            hitSlop={10}
            style={[styles.colNavArrow, !canPrev && styles.colNavArrowHidden]}
          >
            <Ionicons name="chevron-back" size={20} color={canPrev ? Colors.text : Colors.textFaint} />
          </Pressable>

          <Pressable style={styles.colHeaderCenter} onPress={() => setPickerOpen(true)} hitSlop={6}>
            <View style={[styles.colColorBar, { backgroundColor: accent }]} />
            <Text style={styles.colName} numberOfLines={1}>{columnTitle}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            <View style={[styles.colBadge, { backgroundColor: accent }]}>
              <Text style={styles.colBadgeText}>
                {columnBadgePending ? `${columnBadgeCount}+` : columnBadgeCount}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={goNextBucket}
            disabled={!canNext}
            hitSlop={10}
            style={[styles.colNavArrow, !canNext && styles.colNavArrowHidden]}
          >
            <Ionicons name="chevron-forward" size={20} color={canNext ? Colors.text : Colors.textFaint} />
          </Pressable>
        </View>

        <View style={styles.dotsRow}>
          {buckets.map((k) => (
            <Pressable
              key={k}
              onPress={() => setBucketKey(k)}
              hitSlop={6}
              style={[
                styles.dot,
                {
                  backgroundColor: k === safeBucket ? accent : Colors.border,
                  width: k === safeBucket ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.swipeHint}>Vuốt ngang để chuyển cột · {bucketIdx + 1}/{buckets.length}</Text>

        {!showBlockingLoader && !searchUiActive && draining && rawState.items.length > 0 ? (
          <View style={styles.inlineLoading}>
            <SpinningLoader size={16} color={accent} />
            <Text style={styles.inlineLoadingTxt}>Đang đồng bộ thêm dữ liệu…</Text>
          </View>
        ) : !showBlockingLoader && !searchUiActive && loading && rawState.items.length > 0 ? (
          <View style={styles.inlineLoading}>
            <SpinningLoader size={16} color={accent} />
            <Text style={styles.inlineLoadingTxt}>Đang tải…</Text>
          </View>
        ) : null}
      </View>

      {showBlockingLoader ? (
        <View style={styles.loadingBox}>
          <SpinningLoader variant="large" color={accent} />
          <Text style={[styles.empty, { marginTop: 10 }]}>Đang tải…</Text>
        </View>
      ) : (
        <View style={styles.cardListWrap} {...columnSwipe.panHandlers}>
        <FlatList
          ref={listRef}
          style={styles.cardList}
          data={pagedColumnItems}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true,
            });
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
          ListHeaderComponent={
            error ? (
              <View style={[styles.errBox, { paddingHorizontal: 16 }]}>
                <Ionicons name="cloud-offline-outline" size={32} color={Colors.textFaint} />
                <Text style={styles.errTxt}>{error}</Text>
                <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true, force: true })}>
                  <Text style={styles.retryTxt}>Thử lại</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
              {(!searchUiActive && (columnPageState?.loading || loadingMore || loading)) ? (
                <>
                  <SpinningLoader size={22} color={accent} />
                  <Text style={[styles.empty, { marginTop: 10 }]}>Đang tải…</Text>
                </>
              ) : (
                <Text style={styles.empty}>
                  {filteredItems.length === 0
                    ? `Không có ${kind === 'lead' ? 'lead' : 'deal'} khớp bộ lọc.`
                    : `Cột «${columnTitle}» trống.`}
                </Text>
              )}
            </View>
          }
          renderItem={renderDeadlineItem}
          extraData={`${assigningId || ''}|${movingId || ''}|${accent}|${visibleCount}|${highlightCardId || ''}`}
          onScrollBeginDrag={onListScrollBegin}
          onMomentumScrollBegin={onListScrollBegin}
          onScrollEndDrag={onListScrollEnd}
          onMomentumScrollEnd={onListScrollEnd}
          ListFooterComponent={
            listHasMore ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Pressable
                  style={[styles.loadMoreBtn, { borderColor: accent }]}
                  onPress={() => {
                    if (clientHasMore) {
                      setVisibleCount((n) => Math.min(n + DEADLINE_CARD_PAGE_SIZE, columnItems.length));
                      return;
                    }
                    void loadMore();
                  }}
                  disabled={loadingMore || !!columnPageState?.loading}
                >
                  {loadingMore || columnPageState?.loading ? (
                    <SpinningLoader size={18} color={accent} />
                  ) : (
                    <Text style={[styles.loadMoreTxt, { color: accent }]}>Tải thêm</Text>
                  )}
                </Pressable>
              </View>
            ) : null
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (clientHasMore) {
              setVisibleCount((n) => Math.min(n + DEADLINE_CARD_PAGE_SIZE, columnItems.length));
              return;
            }
            void loadMore();
          }}
          initialNumToRender={Math.min(perf.listInitial, DEADLINE_CARD_PAGE_SIZE)}
          maxToRenderPerBatch={perf.listBatch}
          windowSize={perf.listWindow}
          updateCellsBatchingPeriod={perf.tier === 'low' ? 80 : 50}
          removeClippedSubviews
        />
        </View>
      )}

      <CrmFilterSheet
        visible={filterOpen}
        mode={kind === 'lead' ? 'leads' : 'deals'}
        filters={filters}
        search={search}
        companies={companies}
        regions={regions}
        departments={departments}
        employees={employees}
        metaLoading={metaLoading}
        lockCompany={lockCompany}
        lockAssignee={lockAssignee}
        showDealOrderSplit={kind === 'deal'}
        dealKhSplitEnabled={dealKhSplitEnabled}
        onDealKhSplitChange={(enabled) => {
          setDealKhSplitEnabled(enabled);
          void storeDealKhSplitPreference(enabled);
        }}
        onApply={(next) => {
          const forced = {
            ...next,
            companyId: lockCompany ? (user?.company_id || next.companyId) : next.companyId,
            assignee: lockAssignee ? 'mine' as const : next.assignee,
            assigneeUserId: lockAssignee ? '' : next.assigneeUserId,
          };
          setFilters(forced);
          if (forced.companyId !== filters.companyId) void loadOrgMeta(forced.companyId);
        }}
        onCompanyChange={(companyId) => {
          if (lockCompany) return;
          void loadOrgMeta(companyId);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <MoveStageModal
        visible={!!moveItem}
        stages={moveStages}
        currentStageId={moveItem?.stageId}
        kind={moveItem?.kind === 'lead' ? 'lead' : 'deal'}
        onSelect={(stageId) => {
          if (moveItem) void moveCardTo(moveItem, stageId);
          setMoveItem(null);
        }}
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
          void applyDeadlineStageMove(ctx.item, ctx.target, undefined, targets);
        }}
        onClose={() => setMoveSxCtx(null)}
      />

      <DatePickerSheet
        visible={!!moveDeadlineCtx}
        value={deadlineIsoToYmd(moveDeadlineCtx?.item.dueIso)}
        accent={Colors.blue}
        onSelect={(ymd) => {
          const ctx = moveDeadlineCtx;
          setMoveDeadlineCtx(null);
          if (!ctx) return;
          const iso = new Date(`${ymd}T09:00:00`).toISOString();
          void applyDeadlineStageMove(ctx.item, ctx.target, iso);
        }}
        onClose={() => setMoveDeadlineCtx(null)}
      />

      <PickerSheet
        visible={!!assignItem}
        title={assignItem?.kind === 'deal' ? 'Gán phụ trách Deal' : 'Gán phụ trách Lead'}
        options={assignPickerOptions}
        selectedId={assignItem?.assignedToId || assignItem?.leadOwnerId || null}
        searchable={canViewAllCrm(user)}
        emptyLabel={canClearCrmAssignee(user) ? '— Bỏ gán —' : undefined}
        loading={assignEmployeesLoading || metaLoading}
        accent={Colors.purple}
        onSelect={(opt) => {
          if (!assignItem) return;
          const nextId = opt?.id || null;
          void assignCardTo(assignItem, nextId);
          setAssignItem(null);
        }}
        onClose={() => setAssignItem(null)}
      />

      {toast ? (
        <View style={[styles.toast, { bottom: 24 + insets.bottom, backgroundColor: toast.ok ? Colors.green : Colors.red }]}>
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </View>
      ) : null}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Chọn cột Deadline</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {buckets.map((k) => {
                const color = DEADLINE_BUCKET_COLOR[k];
                const label = deadlineBucketLabel(k, deadlineConfig?.buckets);
                const count = bucketCounts[k] || 0;
                const active = k === safeBucket;
                return (
                  <Pressable
                    key={k}
                    style={[styles.pickerRow, active && { backgroundColor: `${color}18` }]}
                    onPress={() => {
                      setBucketKey(k);
                      setPickerOpen(false);
                    }}
                  >
                    <View style={[styles.pickerDot, { backgroundColor: color }]} />
                    <Text style={[styles.pickerLabel, active && { color, fontWeight: '900' }]}>{label}</Text>
                    <View style={[styles.pickerCount, { backgroundColor: active ? color : Colors.surfaceSoft }]}>
                      <Text style={[styles.pickerCountTxt, active && { color: '#fff' }]}>
                        {columnBadgePending ? `${count}+` : count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  stickyChrome: {
    backgroundColor: Colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSoft,
    paddingBottom: 6,
    zIndex: 20,
    overflow: 'visible',
    elevation: 8,
  },
  cardListWrap: { flex: 1 },
  cardList: { flex: 1 },
  kindTabs: { flex: 1, flexDirection: 'row', gap: 10, marginBottom: 0, paddingHorizontal: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  kindTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  kindTabTxt: { fontSize: 13, fontWeight: '800' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
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
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radii.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  metaTxt: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  metaHint: { fontSize: 11, fontWeight: '800' },
  activeChipScroll: { maxHeight: 36, marginTop: 6 },
  activeChipContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 180,
  },
  activeChipTxt: { color: Colors.text, fontSize: 11, fontWeight: '700', maxWidth: 140 },
  activeChipClear: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.redSoft,
  },
  activeChipClearTxt: { color: Colors.red, fontSize: 11, fontWeight: '800' },
  colHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
    marginTop: 8,
  },
  colNavArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colNavArrowHidden: { opacity: 0.35 },
  colHeaderCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: Radii.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colColorBar: { width: 4, height: 22, borderRadius: 2 },
  colName: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '900' },
  colBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  dot: { height: 6, borderRadius: 3 },
  swipeHint: {
    textAlign: 'center',
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  empty: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', marginVertical: 24 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 4,
  },
  inlineLoadingTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  cardPressed: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCode: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
  overduePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.redSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  overdueTxt: { color: Colors.red, fontSize: 9, fontWeight: '800' },
  cardDue: { flex: 1, textAlign: 'right', color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  cardMeta: { flex: 1, color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  statusChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radii.pill, maxWidth: '42%' },
  statusTxt: { fontSize: 10, fontWeight: '800' },
  cardValue: { color: Colors.amber, fontSize: 12, fontWeight: '800', marginTop: 6 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  personLabel: { color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
  personName: { flex: 1, color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  cardActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionBtnPrimary: { backgroundColor: Colors.blue },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radii.md,
    zIndex: 50,
  },
  toastTxt: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 8,
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
  errBox: { alignItems: 'center', gap: 12, padding: 32, marginTop: 12 },
  errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: Radii.md,
    backgroundColor: Colors.blue,
  },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: Colors.bgElevated || Colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 12,
  },
  pickerTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '900',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: Radii.md,
  },
  pickerDot: { width: 10, height: 10, borderRadius: 5 },
  pickerLabel: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700' },
  pickerCount: {
    minWidth: 28,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCountTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '800' },
});
