import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
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
  DEADLINE_BG_SYNC_LIMIT,
  DEADLINE_FIRST_PAINT_LIMIT,
  DEADLINE_MAX_BUFFER,
  fetchDeadlineBucketCounts,
  fetchDeadlineConfig,
  fetchDeadlineSectionPage,
  fetchPipelineStages,
  isDeadlineBucketCountsFresh,
  moveCrmItemStage,
  peekDeadlineBucketCounts,
  peekDeadlineResultCache,
  setDeadlineResultCache,
  updateCrmAssignee,
  type DeadlineBucketCountMap,
  type DeadlineBucketCounts,
} from '../api/crm';
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
import CrmSearchFieldBar from '../components/CrmSearchFieldBar';
import MoveStageModal from '../components/MoveStageModal';
import PickerSheet from '../components/PickerSheet';
import SpinningLoader from '../components/SpinningLoader';
import { currentUserId, useAuth } from '../context/AuthContext';
import {
  buildAssignPickerOptions,
  canAssignCrmCard,
  canClearCrmAssignee,
  canViewAllCrm,
  itemHasAssignee,
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
import {
  activeFilterChips,
  buildStageFetchOpts,
  clientFilterDeadlineItems,
  countActiveFilters,
  DEFAULT_CRM_FILTERS,
  searchPlaceholder,
  type CrmHubFilters,
  type SearchField,
} from '../lib/crmFilters';
import {
  loadCrmHubFilterSnapshot,
  saveCrmHubFilterSnapshot,
} from '../lib/crmHubFilterStorage';
import {
  readDefaultDealKhSplitEnabled,
  readStoredDealKhSplitPreference,
  storeDealKhSplitPreference,
} from '../lib/crmDealKhSplit';
import { isOpenPipelineValueStage } from '../lib/crmPipelineTabs';
import {
  clearDeadlineOverdueBreakdown,
  publishDeadlineOverdueCounts,
  publishDeadlineOverdueFromItems,
} from '../lib/deadlineOverdueStore';
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

function resetDeadlineFilters(
  user: { company_id?: string | null; role?: string } | null,
): CrmHubFilters {
  const base: CrmHubFilters = {
    ...DEFAULT_CRM_FILTERS,
    companyId: user?.company_id || '',
  };
  if (!canViewAllCrm(user)) {
    base.assignee = 'mine';
    base.assigneeUserId = '';
  }
  return base;
}

const DeadlineCard = React.memo(function DeadlineCard({
  item,
  accent,
  canAssign,
  isAssigning,
  isMoving,
  onPress,
  onAssign,
  onMove,
}: {
  item: PlannerItem;
  accent: string;
  canAssign: boolean;
  isAssigning: boolean;
  isMoving: boolean;
  onPress: () => void;
  onAssign: () => void;
  onMove: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const hasAssignee = itemHasAssignee(plannerAsAssigneeTarget(item));
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Pressable
        style={({ pressed }) => [pressed && styles.cardPressed]}
        onPress={onPress}
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
            onPress={onAssign}
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
          onPress={onMove}
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

export default function DeadlineScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const userId = currentUserId(user);
  const viewAll = canViewAllCrm(user);
  const lockScope = !viewAll;

  const [kind, setKind] = useState<PlannerKind>('deal');
  const [leadState, setLeadState] = useState<SectionState>(EMPTY_SECTION);
  const [dealState, setDealState] = useState<SectionState>(EMPTY_SECTION);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [drainingLead, setDrainingLead] = useState(false);
  const [drainingDeal, setDrainingDeal] = useState(false);
  /** Số đếm cột từ lượt quét riêng (giống stageCounts của Kanban) — badge không phụ thuộc list. */
  const [countsByKind, setCountsByKind] = useState<Record<PlannerKind, DeadlineBucketCounts | null>>({
    lead: null,
    deal: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [deadlineConfig, setDeadlineConfig] = useState<DeadlineConfig | null>(null);
  const [bucketKey, setBucketKey] = useState<DeadlineBucketKey>('overdue');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [dealKhSplitEnabled, setDealKhSplitEnabled] = useState(() =>
    readDefaultDealKhSplitEnabled(viewAll),
  );
  const bucketInitRef = useRef(false);

  const [filters, setFilters] = useState<CrmHubFilters>(() => resetDeadlineFilters(user));
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');

  const [companies, setCompanies] = useState<CrmCompany[]>([]);
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
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const dealKhSplitRef = useRef(dealKhSplitEnabled);
  const configRef = useRef<DeadlineConfig | null>(null);
  const leadStateRef = useRef(leadState);
  const dealStateRef = useRef(dealState);
  const kindRef = useRef(kind);
  const companiesRef = useRef(companies);
  const lastServerLoadAtRef = useRef(0);
  filtersRef.current = filters;
  searchRef.current = search;
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
      try {
        const list = await fetchCrmCompanies();
        if (!cancelled) setCompanies(list);
      } catch {
        if (!cancelled) setCompanies([]);
      }
      const pref = await readStoredDealKhSplitPreference(viewAll);
      if (!cancelled) setDealKhSplitEnabled(pref);

      if (!userId) {
        if (!cancelled) setFiltersReady(true);
        return;
      }
      const snap = await loadCrmHubFilterSnapshot(userId);
      if (cancelled) return;
      if (snap?.filters) {
        const next = {
          ...DEFAULT_CRM_FILTERS,
          ...snap.filters,
          companyId: snap.filters.companyId || user?.company_id || '',
        };
        if (!viewAll) {
          next.assignee = 'mine';
          next.assigneeUserId = '';
          if (!next.companyId && user?.company_id) next.companyId = user.company_id;
        }
        setFilters(next);
        if (next.companyId) void loadOrgMeta(next.companyId);
      } else {
        const next = resetDeadlineFilters(user);
        setFilters(next);
        if (next.companyId) void loadOrgMeta(next.companyId);
      }
      if (snap?.search) {
        setSearch(snap.search);
        setSearchDraft(snap.search);
      }
      setFiltersReady(true);
    })();
    return () => { cancelled = true; };
  }, [userId, user, viewAll, loadOrgMeta]);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = searchDraft.trim();
      setSearch(q);
      // Không đổi phone filter khi gõ SĐT — tránh reload server nặng; lọc phone trên client.
    }, 280);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (!filtersReady || !userId) return;
    const t = setTimeout(() => {
      void saveCrmHubFilterSnapshot(userId, {
        filters: filtersRef.current,
        search: searchRef.current,
      });
    }, 400);
    return () => {
      clearTimeout(t);
      void saveCrmHubFilterSnapshot(userId, {
        filters: filtersRef.current,
        search: searchRef.current,
      });
    };
  }, [filtersReady, userId, filters, search]);

  /** Key lọc server — bỏ search/due/searchField (lọc client). */
  const serverFilterKey = useMemo(
    () =>
      [
        filters.phone,
        filters.assignee,
        filters.assigneeUserId,
        filters.timePreset,
        filters.companyId,
        filters.regionId,
        dealKhSplitEnabled ? '1' : '0',
        viewAll ? '1' : '0',
        userId || '',
        // Admin «Tất cả CT» cần danh sách companies để lọc khối CRM.
        filters.companyId ? '1' : String(companies.length),
      ].join('|'),
    [
      filters.phone,
      filters.assignee,
      filters.assigneeUserId,
      filters.timePreset,
      filters.companyId,
      filters.regionId,
      dealKhSplitEnabled,
      viewAll,
      userId,
      companies.length,
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
    if (cached) setCountsByKind((prev) => ({ ...prev, [section]: cached }));
    if (!force && isDeadlineBucketCountsFresh(section, fk)) return;

    countsAbortRef.current[section]?.abort();
    const ac = new AbortController();
    countsAbortRef.current[section] = ac;
    void (async () => {
      try {
        const res = await fetchDeadlineBucketCounts(section, fk, {
          ...optsBase,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (serverFilterKeyRef.current !== fk) return;
        setCountsByKind((prev) => {
          const cur = prev[section];
          // Số chưa quét hết (cận dưới) không được đè số đã đủ.
          if (cur?.complete && !res.complete) return prev;
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
  }) => {
    if (!filtersReady) return;
    if (!userId && !viewAll) return;
    const isRefresh = opts?.refresh ?? false;
    const silent = opts?.silent ?? false;
    const force = opts?.force ?? false;
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

    // Hiện ngay dữ liệu cache cũ (nếu có) trong lúc tải nền — tránh màn "Đang tải…"
    // mỗi lần vào lại tab, giống trải nghiệm Kanban Hub.
    for (const k of kinds) {
      const stateNow = k === 'lead' ? leadStateRef.current : dealStateRef.current;
      if (stateNow.items.length > 0) continue;
      const cached = peekDeadlineResultCache(k, fkAtStart);
      if (cached) applySectionPage(k, cached);
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
    if (!silent) setError('');

    const f = filtersRef.current;
    // Không gửi search lên API — clientFilterDeadlineItems lo phần tìm kiếm.
    const listOpts = buildStageFetchOpts(f, '', userId || '');
    const companyId = listOpts.companyId;
    const companiesList = companiesRef.current;

    const cfg = await fetchDeadlineConfig(companyId, ac.signal);
    if (ac.signal.aborted) {
      loadingRef.current = false;
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

    const mergeSectionPage = (
      _section: PlannerKind,
      prev: SectionState,
      pageRes: { items: PlannerItem[]; total: number; hasMore: boolean; nextOffset: number },
    ): SectionState => {
      const seen = new Set(prev.items.map((i) => i.id));
      const appended = pageRes.items.filter((i) => !seen.has(i.id));
      const items = prev.items.length
        ? [...prev.items, ...appended].sort(byDeadlineAsc).slice(0, DEADLINE_MAX_BUFFER)
        : pageRes.items.slice(0, DEADLINE_MAX_BUFFER);
      return {
        items,
        total: Math.max(prev.total, items.length, pageRes.total),
        hasMore: pageRes.hasMore && items.length < DEADLINE_MAX_BUFFER,
        nextOffset: Math.max(prev.nextOffset, pageRes.nextOffset, items.length),
      };
    };

    /** Không bao giờ thay list đang lớn bằng snapshot nhỏ hơn → badge cột nhảy/tuột. */
    const applyProgressSafe = (
      section: PlannerKind,
      partial: { items: PlannerItem[]; total: number; hasMore: boolean; nextOffset: number },
    ) => {
      const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
      if (prev.items.length > 0 && partial.items.length < prev.items.length) return;
      applySectionPage(section, partial);
    };

    const drainSectionBackground = (
      section: PlannerKind,
      startPage: SectionState,
      optsBase: typeof deadlineOptsBase,
      fk: string,
    ) => {
      const room = DEADLINE_BG_SYNC_LIMIT - startPage.items.length;
      if (!startPage.hasMore || room <= 0) {
        if (section === 'lead') setDrainingLead(false);
        else setDrainingDeal(false);
        return;
      }
      drainAbortRef.current[section]?.abort();
      const drainAc = new AbortController();
      drainAbortRef.current[section] = drainAc;
      applySectionPage(section, startPage);
      if (section === 'lead') setDrainingLead(true);
      else setDrainingDeal(true);

      let lastUiAt = 0;
      const publishMerged = (
        partial: { items: PlannerItem[]; total: number; hasMore: boolean; nextOffset: number },
        force = false,
      ) => {
        if (drainAc.signal.aborted) return;
        const now = Date.now();
        if (!force && now - lastUiAt < 600) return;
        lastUiAt = now;
        const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
        applySectionPage(section, mergeSectionPage(section, prev, partial));
      };

      void (async () => {
        try {
          // Quét lại từ đầu (không bỏ qua theo offset): thứ tự cột mở giữa 2 lượt
          // có thể khác nhau nên «skip N bản ghi đầu» dễ làm mất thẻ. Trùng thì gộp theo id.
          const pageRes = await fetchDeadlineSectionPage(
            section,
            0,
            DEADLINE_BG_SYNC_LIMIT,
            {
              ...optsBase,
              signal: drainAc.signal,
              progressEvery: 150,
              onProgress: (partial) => publishMerged(partial, false),
            },
          );
          if (drainAc.signal.aborted) return;
          const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
          const merged = mergeSectionPage(section, prev, pageRes);
          const capped: SectionState = {
            ...merged,
            hasMore: merged.hasMore || merged.items.length >= DEADLINE_BG_SYNC_LIMIT,
          };
          applySectionPage(section, capped);
          setDeadlineResultCache(section, fk, capped);
        } catch {
          /* giữ first-paint */
        } finally {
          if (drainAbortRef.current[section] === drainAc) {
            if (section === 'lead') setDrainingLead(false);
            else setDrainingDeal(false);
          }
        }
      })();
    };

    const runOne = async (section: PlannerKind) => {
      const hadExisting = (section === 'lead' ? leadStateRef.current : dealStateRef.current).items.length > 0;
      try {
        const pageRes = await fetchDeadlineSectionPage(
          section,
          0,
          DEADLINE_FIRST_PAINT_LIMIT,
          {
            ...deadlineOptsBase,
            firstPaintOnly: true,
            // Đã có cache/list → khỏi đẩy progress trung gian (tránh badge nhảy).
            onProgress: hadExisting
              ? undefined
              : (partial) => {
                if (ac.signal.aborted) return;
                applyProgressSafe(section, partial);
              },
          },
        );
        if (ac.signal.aborted) return;

        const prev = section === 'lead' ? leadStateRef.current : dealStateRef.current;
        // Soft refresh: giữ list cũ nếu first-paint nhỏ hơn — drain sẽ bổ sung / refresh nền.
        if (hadExisting && prev.items.length > pageRes.items.length) {
          if (section === 'lead') setLeadsLoading(false);
          else setDealsLoading(false);
          // Vẫn drain từ đầu list mới: thay thế khi đủ lớn hơn hoặc hết drain.
          drainAbortRef.current[section]?.abort();
          const drainAc = new AbortController();
          drainAbortRef.current[section] = drainAc;
          if (section === 'lead') setDrainingLead(true);
          else setDrainingDeal(true);
          void (async () => {
            try {
              const full = await fetchDeadlineSectionPage(section, 0, DEADLINE_BG_SYNC_LIMIT, {
                ...deadlineOptsBase,
                signal: drainAc.signal,
                progressEvery: 150,
                onProgress: (partial) => {
                  if (drainAc.signal.aborted) return;
                  // Chỉ đổi UI khi snapshot mới không nhỏ hơn list đang hiện.
                  applyProgressSafe(section, {
                    ...partial,
                    hasMore: partial.hasMore || partial.items.length >= DEADLINE_BG_SYNC_LIMIT,
                  });
                },
              });
              if (drainAc.signal.aborted) return;
              applySectionPage(section, {
                items: full.items,
                total: full.total,
                hasMore: full.hasMore || full.items.length >= DEADLINE_BG_SYNC_LIMIT,
                nextOffset: full.nextOffset,
              });
              setDeadlineResultCache(section, fkAtStart, {
                items: full.items,
                total: full.total,
                hasMore: full.hasMore || full.items.length >= DEADLINE_BG_SYNC_LIMIT,
                nextOffset: full.nextOffset,
              });
            } catch {
              /* giữ list cũ */
            } finally {
              if (drainAbortRef.current[section] === drainAc) {
                if (section === 'lead') setDrainingLead(false);
                else setDrainingDeal(false);
              }
            }
          })();
          return;
        }

        applySectionPage(section, pageRes);
        setDeadlineResultCache(section, fkAtStart, pageRes);
        if (section === 'lead') setLeadsLoading(false);
        else setDealsLoading(false);
        drainSectionBackground(section, {
          items: pageRes.items,
          total: pageRes.total,
          hasMore: pageRes.hasMore,
          nextOffset: pageRes.nextOffset,
        }, deadlineOptsBase, fkAtStart);
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        const msg =
          (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
          (e as { message?: string })?.message ||
          (section === 'lead' ? 'Không tải được leads' : 'Không tải được deals');
        if (section === 'lead') leadErr = msg;
        else dealErr = msg;
      } finally {
        if (!ac.signal.aborted) {
          if (section === 'lead') setLeadsLoading(false);
          else setDealsLoading(false);
        }
      }
    };

    // Lead + Deal chạy song song như Kanban — mỗi mục hiện ngay khi có dữ liệu riêng.
    await Promise.all(kinds.map((k) => runOne(k)));

    // Đếm badge cột sau first-paint — refresh ngầm (socket/focus) dùng lại cache còn mới.
    if (!ac.signal.aborted) {
      const forceCounts = isRefresh && !silent;
      setTimeout(() => {
        for (const k of kinds) refreshBucketCounts(k, deadlineOptsBase, fkAtStart, forceCounts);
      }, 400);
    }

    if (!ac.signal.aborted) {
      lastServerLoadAtRef.current = Date.now();
      if (leadErr && dealErr) setError(leadErr);
      else if (kinds.includes('lead') && leadErr && !leadStateRef.current.items.length) setError(leadErr);
      else if (kinds.includes('deal') && dealErr && !dealStateRef.current.items.length) setError(dealErr);
      else setError('');
    }
    loadingRef.current = false;
    if (!silent) setRefreshing(false);
  }, [filtersReady, userId, viewAll, applySectionPage, abortAllDrains, refreshBucketCounts]);

  /** Reload server chỉ khi lọc server đổi — search/due/searchField lọc client, không gọi lại API. */
  useEffect(() => {
    if (!filtersReady) return;
    // Bộ lọc đổi → xóa badge cũ để số tạm không bị giữ cao hơn thực tế (monotonic).
    clearDeadlineOverdueBreakdown();
    // Số đếm cột của bộ lọc cũ không còn đúng — dùng lại cache của bộ lọc mới nếu có.
    setCountsByKind({
      lead: peekDeadlineBucketCounts('lead', serverFilterKey),
      deal: peekDeadlineBucketCounts('deal', serverFilterKey),
    });
    const t = setTimeout(() => {
      // Giống Kanban: Lead + Deal cùng một lượt, song song → đổi tab tức thì, badge đúng sớm.
      void load({ refresh: true, kinds: ['lead', 'deal'] });
    }, 120);
    return () => clearTimeout(t);
  }, [filtersReady, load, serverFilterKey]);

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

  useFocusEffect(
    useCallback(() => {
      if (!filtersReady) return undefined;
      if (!userId && !viewAll) return undefined;
      const hasData =
        leadStateRef.current.items.length > 0
        || dealStateRef.current.items.length > 0;
      const stale = Date.now() - lastServerLoadAtRef.current > 60_000;
      if (hasData && stale) {
        void load({ refresh: true, silent: true, kinds: ['lead', 'deal'] });
      } else if (!hasData) {
        void load({ kinds: ['lead', 'deal'] });
      }
      return () => {
        abortRef.current?.abort();
        abortAllDrains();
        abortAllCounts();
      };
    }, [load, userId, viewAll, filtersReady, abortAllDrains, abortAllCounts]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      if (!filtersReady) return;
      // Đồng bộ cả Lead + Deal khi CRM đổi (socket / live-version / push).
      void load({ refresh: true, silent: true, kinds: ['lead', 'deal'] });
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
      const ts = deadlineIsoToTs(it.dueIso);
      const key = resolveDeadlineBucket(ts, deadlineConfig?.buckets);
      out[key].push(it);
    }
    return out;
  }, [filteredItems, deadlineConfig]);

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
  }, [kind, filters.phone, filters.assignee, filters.companyId, filters.regionId, search]);

  const safeBucket = buckets.includes(bucketKey) ? bucketKey : (buckets[0] || 'overdue');
  const columnItems = grouped[safeBucket] || [];
  const bucketIdx = Math.max(0, buckets.indexOf(safeBucket));
  const canPrev = bucketIdx > 0;
  const canNext = bucketIdx < buckets.length - 1;
  const accent = DEADLINE_BUCKET_COLOR[safeBucket] || meta.color;
  const columnTitle = deadlineBucketLabel(safeBucket, deadlineConfig?.buckets);
  const columnBadgeCount = bucketCounts[safeBucket] ?? columnItems.length;
  /** Chỉ đánh dấu «+» khi số vẫn là cận dưới (chưa đếm xong / chưa đếm riêng). */
  const columnBadgePending = useScannedCounts
    ? !kindCounts?.complete
    : (loading || draining) && rawState.hasMore;

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

  const canPrevRef = useRef(canPrev);
  const canNextRef = useRef(canNext);
  canPrevRef.current = canPrev;
  canNextRef.current = canNext;

  /** Vuốt ngang trên danh sách → đổi cột (không tranh cuộn dọc FlatList). */
  const columnSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > 22 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          const distance = 48;
          const fling = 0.45;
          if ((g.dx <= -distance || g.vx <= -fling) && canNextRef.current) {
            goNextBucket();
            return;
          }
          if ((g.dx >= distance || g.vx >= fling) && canPrevRef.current) {
            goPrevBucket();
          }
        },
      }),
    [goNextBucket, goPrevBucket],
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
      () => { setSearchDraft(''); setSearch(''); },
      lockScope,
    ),
    [filters, search, companies, regions, employees, lockScope],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !rawState.hasMore) return;
    if (!userId && !viewAll) return;
    if (rawState.items.length >= DEADLINE_MAX_BUFFER) return;
    setLoadingMore(true);
    try {
      const listOpts = buildStageFetchOpts(filtersRef.current, '', userId || '');
      const companiesList = companiesRef.current;
      const pageRes = await fetchDeadlineSectionPage(kind, rawState.nextOffset, DEADLINE_MAX_BUFFER, {
        ...listOpts,
        deadlineConfig: configRef.current,
        dealKhSplitEnabled: dealKhSplitRef.current,
        allowedCompanyIds:
          listOpts.companyId || !companiesList.length
            ? null
            : companiesList.map((c) => c.id).filter(Boolean),
      });
      const seen = new Set(rawState.items.map((i) => i.id));
      const appended = pageRes.items.filter((i) => !seen.has(i.id));
      const merged: SectionState = {
        items: [...rawState.items, ...appended].slice(0, DEADLINE_MAX_BUFFER),
        total: pageRes.total || rawState.total,
        hasMore: pageRes.hasMore && rawState.items.length + appended.length < DEADLINE_MAX_BUFFER,
        nextOffset: pageRes.nextOffset,
      };
      if (kind === 'lead') {
        leadStateRef.current = merged;
        setLeadState(merged);
      } else {
        dealStateRef.current = merged;
        setDealState(merged);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, rawState, kind, userId]);

  const goDetail = useCallback((item: PlannerItem) => {
    navigation.navigate('LeadDealDetail', {
      leadId: item.id,
      kind: item.kind,
      code: item.code,
      title: item.title,
    });
  }, [navigation]);

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

  const moveCardTo = useCallback(
    async (item: PlannerItem, targetStageId: string) => {
      const target = moveStages.find((s) => String(s.id) === String(targetStageId));
      if (!target) {
        showToast('Không tìm thấy cột đích', false);
        return;
      }
      const staysOnDeadline = isOpenPipelineValueStage(target);
      setMovingId(item.id);
      if (!staysOnDeadline) {
        patchDeadlineItem(item.kind, item.id, null, { remove: true });
      } else {
        patchDeadlineItem(item.kind, item.id, {
          stageId: target.id,
          status: target.name,
        });
      }
      try {
        await moveCrmItemStage(item.id, target.id);
        showToast(
          staysOnDeadline
            ? `Đã chuyển ${item.code} → ${target.name}`
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
    [moveStages, patchDeadlineItem, showToast, load],
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
        <View style={styles.header}>
          <Text style={styles.h1}>Deadline</Text>
          <Text style={styles.h1Sub}>
            Giống CRM web · phân cột theo hạn Lead / Deal
          </Text>
        </View>

        <View style={styles.kindTabs}>
          {(['lead', 'deal'] as PlannerKind[]).map((k) => {
            const km = kindMeta(Colors)[k];
            const active = kind === k;
            return (
              <Pressable
                key={k}
                style={[styles.kindTab, active && { backgroundColor: km.color, borderColor: km.color }]}
                onPress={() => setKind(k)}
              >
                <Ionicons name={km.icon} size={16} color={active ? '#fff' : km.color} />
                <Text style={[styles.kindTabTxt, { color: active ? '#fff' : Colors.text }]}>
                  {km.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={Colors.textFaint} />
            <TextInput
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder={searchPlaceholder(filters.searchField, kind)}
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

        <View style={{ paddingHorizontal: 16 }}>
          <CrmSearchFieldBar
            value={filters.searchField}
            onChange={(field: SearchField) => {
              setFilters((p) => ({
                ...p,
                searchField: field,
                ...(field === 'phone' && searchDraft.trim() ? { phone: 'has_phone' as const } : {}),
              }));
            }}
            accent={meta.color}
          />
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaTxt}>
            {filteredItems.length} bản ghi · {buckets.length} cột
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
              onPress={() => {
                setSearchDraft('');
                setSearch('');
                const next = resetDeadlineFilters(user);
                setFilters(next);
                if (next.companyId) void loadOrgMeta(next.companyId);
                else {
                  setRegions([]);
                  setDepartments([]);
                  setEmployees([]);
                }
              }}
            >
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        <View style={styles.colHeaderRow}>
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

        {!showBlockingLoader && draining && rawState.items.length > 0 ? (
          <View style={styles.inlineLoading}>
            <SpinningLoader size={16} color={accent} />
            <Text style={styles.inlineLoadingTxt}>Đang đồng bộ thêm dữ liệu…</Text>
          </View>
        ) : !showBlockingLoader && loading && rawState.items.length > 0 ? (
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
        <FlatList
          style={styles.cardList}
          data={columnItems}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...columnSwipe.panHandlers}
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
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={styles.empty}>
                {filteredItems.length === 0
                  ? `Không có ${kind === 'lead' ? 'lead' : 'deal'} khớp bộ lọc.`
                  : `Cột «${columnTitle}» trống.`}
              </Text>
            </View>
          }
          renderItem={({ item: it }) => {
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
                  canAssign={canAssign}
                  isAssigning={assigningId === it.id}
                  isMoving={movingId === it.id}
                  onPress={() => goDetail(it)}
                  onAssign={() => openAssignForItem(it)}
                  onMove={() => openMoveForItem(it)}
                />
              </View>
            );
          }}
          ListFooterComponent={
            rawState.hasMore && rawState.items.length < DEADLINE_MAX_BUFFER ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Pressable
                  style={[styles.loadMoreBtn, { borderColor: accent }]}
                  onPress={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <SpinningLoader size={18} color={accent} />
                  ) : (
                    <Text style={[styles.loadMoreTxt, { color: accent }]}>Tải thêm</Text>
                  )}
                </Pressable>
              </View>
            ) : null
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            void loadMore();
          }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
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
        lockScope={lockScope}
        showDealOrderSplit={kind === 'deal'}
        dealKhSplitEnabled={dealKhSplitEnabled}
        onDealKhSplitChange={(enabled) => {
          setDealKhSplitEnabled(enabled);
          void storeDealKhSplitPreference(enabled);
        }}
        onApply={(next) => {
          setFilters(next);
          if (next.companyId !== filters.companyId) void loadOrgMeta(next.companyId);
        }}
        onCompanyChange={(companyId) => {
          void loadOrgMeta(companyId);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <MoveStageModal
        visible={!!moveItem}
        stages={moveStages}
        currentStageId={moveItem?.stageId}
        onSelect={(stageId) => {
          if (moveItem) void moveCardTo(moveItem, stageId);
          setMoveItem(null);
        }}
        onClose={() => setMoveItem(null)}
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
    zIndex: 2,
  },
  cardList: { flex: 1 },
  header: { paddingHorizontal: 16, marginBottom: 8 },
  h1: { color: Colors.text, fontSize: 26, fontWeight: '900' },
  h1Sub: { color: Colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600' },
  kindTabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
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
