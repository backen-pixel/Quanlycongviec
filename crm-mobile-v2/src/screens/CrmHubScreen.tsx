import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Keyboard,
  PanResponder,
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
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import Avatar from '../components/Avatar';
import ColumnPickerModal from '../components/ColumnPickerModal';
import CrmFilterSheet from '../components/CrmFilterSheet';
import CrmSearchFieldBar from '../components/CrmSearchFieldBar';
import MoveStageModal from '../components/MoveStageModal';
import PickerSheet from '../components/PickerSheet';
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
  fetchPipelineStages,
  fetchStageCounts,
  invalidateCrmHubCache,
  invalidatePipelineStagesCache,
  KANBAN_PAGE_SIZE,
  moveCrmItemStage,
  updateCrmAssignee,
  peekCrmHubCache,
  peekCrmTotalsCache,
  peekPipelineStagesCached,
  prefetchCrmNeighborStages,
  setCrmHubCache,
  warmCrmHubPipelines,
} from '../api/crm';
import { formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCreateMenu } from '../context/CreateMenuContext';
import { colorFromName, initialsFromName } from '../lib/media';
import { sumCrmDealHubKpiCount, sumCrmCustomerTabDealCount, sumCrmDealMergedHubCount, resolveCrmHubDisplayStages, hasCrmCustomerOrderTab } from '../lib/crmPipelineTabs';
import {
  readDefaultDealKhSplitEnabled,
  readStoredDealKhSplitPreference,
  storeDealKhSplitPreference,
} from '../lib/crmDealKhSplit';
import {
  loadCrmHubFilterSnapshot,
  saveCrmHubFilterSnapshot,
} from '../lib/crmHubFilterStorage';
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
import {
  buildAssignPickerOptions,
  canAssignCrmCard,
  canClearCrmAssignee,
  canViewAllCrm,
  itemHasAssignee,
} from '../lib/crmAssignee';
import { Radii, Spacing, stageColor, useColors, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { CrmHubData, CrmKanbanItem, CrmPipelineStage, CrmStageCache, LeadTemp } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CrmHub'>;
/** Tab UI: Leads | Deals | Đơn hàng (ĐH). */
type Mode = 'leads' | 'deals' | 'orders';
/** Cache/API chỉ lead|deal — tab ĐH dùng chung dữ liệu deal. */
type DataMode = 'leads' | 'deals';

function asDataMode(m: Mode): DataMode {
  return m === 'leads' ? 'leads' : 'deals';
}

function initialModeFromRoute(params?: Props['route']['params']): Mode {
  const m = params?.initialMode;
  if (m === 'deals' || m === 'orders' || m === 'leads') return m;
  return 'leads';
}

const EMPTY_HUB: CrmHubData = { stages: [], stageCounts: {}, listTotal: null, cache: {} };
const EMPTY_STAGE: CrmStageCache = { items: [], hasMore: false, nextOffset: 0, loaded: false };

/** Gắn count=0 cho mọi stage đã biết — RPC thường bỏ cột trống. */
function fillStageCountZeros(
  stages: { id: string }[],
  counts: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const s of stages) next[s.id] = 0;
  for (const [id, n] of Object.entries(counts || {})) {
    next[id] = Number(n) || 0;
  }
  return next;
}

/** Ẩn cột trống: thiếu key sau khi đã có counts = coi như 0 (không hiện lại cột trống). */
function filterStagesHideEmpty(
  stages: CrmPipelineStage[],
  stageCounts: Record<string, number>,
  hideEmpty: boolean,
): CrmPipelineStage[] {
  if (!hideEmpty) return stages;
  const keys = Object.keys(stageCounts);
  if (!keys.length) return stages;
  const filtered = stages.filter((s) => (stageCounts[s.id] ?? 0) > 0);
  return filtered.length > 0 ? filtered : stages.slice(0, 1);
}

/** Giữ cache cột quanh cột đang xem — session dài không tích hàng chục cột × 120 item. */
function pruneStageCacheAround(
  cache: Record<string, CrmStageCache>,
  stageIdsOrdered: string[],
  centerId: string,
  radius = 2,
): Record<string, CrmStageCache> {
  const idx = stageIdsOrdered.findIndex((id) => String(id) === String(centerId));
  const keep = new Set<string>();
  if (idx >= 0) {
    const from = Math.max(0, idx - radius);
    const to = Math.min(stageIdsOrdered.length - 1, idx + radius);
    for (let i = from; i <= to; i++) keep.add(stageIdsOrdered[i]);
  } else if (centerId) {
    keep.add(centerId);
  }
  const next: Record<string, CrmStageCache> = {};
  for (const id of Object.keys(cache)) {
    if (keep.has(id)) next[id] = cache[id];
  }
  return Object.keys(next).length ? next : cache;
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function tempMetaMap(Colors: ThemeColors): Record<LeadTemp, { label: string; color: string }> {
  return {
    hot: { label: 'Hot', color: Colors.red },
    warm: { label: 'Warm', color: Colors.amber },
    cold: { label: 'Cold', color: Colors.cyan },
    new: { label: 'Mới', color: Colors.green },
  };
}

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
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
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
  isAssigning,
  canAssign,
  onPress,
  onMove,
  onAssign,
}: {
  item: CrmKanbanItem;
  accent: string;
  isMoving: boolean;
  isAssigning: boolean;
  canAssign: boolean;
  onPress: () => void;
  onMove: () => void;
  onAssign: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const deadlineStr = item.dueIso ? formatDate(item.dueIso) : '';
  const createdStr = formatDate(item.createdAt);
  const tempMeta = item.temp ? tempMetaMap(Colors)[item.temp] : null;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Pressable
        onPress={onPress}
        disabled={isMoving || isAssigning}
        style={({ pressed }) => [pressed && { opacity: 0.92 }]}
      >
        <View style={styles.cardRow1}>
        <Text style={styles.cardCode}>{item.code}</Text>
        <View style={styles.cardTags}>
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
        </View>
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
      </Pressable>

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
        <View style={styles.cardActions}>
          {canAssign ? (
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={onAssign}
              disabled={isAssigning || isMoving}
              activeOpacity={0.75}
            >
              {isAssigning ? (
                <ActivityIndicator size="small" color={Colors.purple} />
              ) : (
                <Ionicons
                  name={itemHasAssignee(item) ? 'person-outline' : 'person-add-outline'}
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
          >
            {isMoving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="swap-horizontal" size={18} color={Colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

function resetCrmFilters(
  user: { company_id?: string | null; role?: string } | null,
  _companies: { id: string }[],
): CrmHubFilters {
  // Admin hệ thống (không company_id): mặc định "Tất cả công ty" — không auto chọn 1 CT.
  const base: CrmHubFilters = { ...DEFAULT_CRM_FILTERS, companyId: user?.company_id || '' };
  // Nhân viên thường: khóa "Của tôi" + công ty, không cho đổi.
  if (!canViewAllCrm(user)) {
    base.assignee = 'mine';
    base.assigneeUserId = '';
  }
  return base;
}

/** Vai trò xem được toàn bộ CRM — re-export từ lib gán NV. */
function initialFiltersFromRoute(
  params: RootStackParamList['CrmHub'] | undefined,
  user: { role?: string } | null,
): CrmHubFilters {
  const base = { ...DEFAULT_CRM_FILTERS };
  // Nhân viên thường: luôn khóa "Của tôi". Admin/quản lý: xem tất cả (bỏ qua mặc định mine).
  if (!canViewAllCrm(user)) {
    return { ...base, assignee: 'mine' };
  }
  return base;
}

export default function CrmHubScreen({ navigation, route }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { toggle } = useCreateMenu();
  const myId = user?.id || user?.userId || '';

  const [mode, setMode] = useState<Mode>(() => initialModeFromRoute(route.params));
  const dataMode = asDataMode(mode);
  const isLeads = mode === 'leads';
  const isOrders = mode === 'orders';
  const isDeals = mode === 'deals';
  const adminLike = canViewAllCrm(user);
  const [dealKhSplitEnabled, setDealKhSplitEnabled] = useState(() => readDefaultDealKhSplitEnabled(adminLike));
  const dealKhSplitRef = useRef(dealKhSplitEnabled);
  dealKhSplitRef.current = dealKhSplitEnabled;

  const [leadData, setLeadData] = useState<CrmHubData>(EMPTY_HUB);
  const [dealData, setDealData] = useState<CrmHubData>(EMPTY_HUB);
  const [loadingByMode, setLoadingByMode] = useState<{ leads: boolean; deals: boolean }>({
    leads: false,
    deals: false,
  });
  const [stageLoading, setStageLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState<{ leads: boolean; deals: boolean }>({ leads: false, deals: false });

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  // Gán companyId ngay từ đầu để lần load đầu tiên giống hệt khi bấm tab (resetCrmFilters).
  // Nếu để rỗng, load lần đầu chạy với companyId='' → sai filter → màn trống tới khi bấm tab.
  const [leadFilters, setLeadFilters] = useState<CrmHubFilters>(() => ({
    ...initialFiltersFromRoute(route.params, user),
    companyId: initialFiltersFromRoute(route.params, user).companyId || user?.company_id || '',
  }));
  const [dealFilters, setDealFilters] = useState<CrmHubFilters>(() => ({
    ...initialFiltersFromRoute(route.params, user),
    companyId: initialFiltersFromRoute(route.params, user).companyId || user?.company_id || '',
  }));
  /** Chờ khôi phục bộ lọc đã lưu — tránh load lần đầu với mặc định rồi nhảy lại. */
  const [filtersReady, setFiltersReady] = useState(false);
  const filtersReadyRef = useRef(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [companiesReady, setCompaniesReady] = useState(false);
  const [regions, setRegions] = useState<CrmRegion[]>([]);
  const [departments, setDepartments] = useState<CrmDepartment[]>([]);
  const [employees, setEmployees] = useState<CrmEmployee[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [moveItem, setMoveItem] = useState<CrmKanbanItem | null>(null);
  const [assignItem, setAssignItem] = useState<CrmKanbanItem | null>(null);
  const [assignEmployees, setAssignEmployees] = useState<CrmEmployee[]>([]);
  const [assignEmployeesLoading, setAssignEmployeesLoading] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingModeRef = useRef<{ leads: boolean; deals: boolean }>({ leads: false, deals: false });
  const countsInflightRef = useRef<{ leads: string; deals: string }>({ leads: '', deals: '' });
  const tabTotalsKeyRef = useRef<{ leads: string; deals: string }>({ leads: '', deals: '' });
  /** Đếm request tổng theo tab — bỏ response cũ trả về sau (đổi công ty nhanh) để tránh đè số mới bằng số cũ. */
  const totalsReqSeqRef = useRef<{ leads: number; deals: number }>({ leads: 0, deals: 0 });
  const abortByModeRef = useRef<{ leads: AbortController | null; deals: AbortController | null }>({
    leads: null,
    deals: null,
  });
  const leadDataRef = useRef(leadData);
  const dealDataRef = useRef(dealData);
  const filterKeyRef = useRef('');
  const activeIndexRef = useRef(activeIndex);
  const modeRef = useRef(mode);
  const leadFiltersRef = useRef(leadFilters);
  const dealFiltersRef = useRef(dealFilters);
  const searchRef = useRef(search);
  leadDataRef.current = leadData;
  dealDataRef.current = dealData;
  activeIndexRef.current = activeIndex;
  modeRef.current = mode;
  leadFiltersRef.current = leadFilters;
  dealFiltersRef.current = dealFilters;
  searchRef.current = search;

  function stagesForMode(which: Mode): CrmPipelineStage[] {
    const dm = asDataMode(which);
    const f = dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current;
    const hubData = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
    const base = resolveCrmHubDisplayStages(
      which,
      leadDataRef.current.stages,
      dealDataRef.current.stages,
      dealKhSplitRef.current,
    );
    let stages: CrmPipelineStage[] = f.showOrphan ? [...base, orphanVirtualStage()] : base;
    if (f.hideEmptyStages) {
      stages = filterStagesHideEmpty(stages, hubData.stageCounts, true);
    }
    return stages;
  }

  function stageIdAtIndex(which: Mode, index: number): string | undefined {
    return stagesForMode(which)[index]?.id;
  }

  const hub = isLeads ? leadData : dealData;
  const setHub = isLeads ? setLeadData : setDealData;
  const loading = loadingByMode[dataMode];
  const filters = isLeads ? leadFilters : dealFilters;
  /**
   * Bộ lọc dùng chung cho cả 2 tab Lead/Deal — chọn 1 lần (công ty, khu vực, SĐT, NV…)
   * áp dụng luôn cho tab còn lại, không phải chọn lại khi đổi tab.
   */
  const setFilters = useCallback((
    update: CrmHubFilters | ((prev: CrmHubFilters) => CrmHubFilters),
  ) => {
    const apply = typeof update === 'function'
      ? (update as (prev: CrmHubFilters) => CrmHubFilters)
      : () => update;
    setLeadFilters((prev) => apply(prev));
    setDealFilters((prev) => apply(prev));
  }, []);
  // Nhân viên thường bị khóa lọc theo Công ty + Người phụ trách.
  const lockScope = !canViewAllCrm(user);

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

  /** Khôi phục bộ lọc Lead/Deal đã lưu khi quay lại Hub. */
  useEffect(() => {
    let cancelled = false;
    if (!myId) {
      setFiltersReady(true);
      filtersReadyRef.current = true;
      return undefined;
    }
    void (async () => {
      const snap = await loadCrmHubFilterSnapshot(myId);
      if (cancelled) return;
      const adminLikeUser = canViewAllCrm(user);
      if (snap) {
        let next = { ...snap.filters };
        if (!adminLikeUser) {
          // Nhân viên thường: luôn khóa phạm vi của mình + công ty.
          next = {
            ...next,
            assignee: 'mine',
            assigneeUserId: '',
            companyId: user?.company_id || next.companyId || '',
          };
        } else {
          // Admin/quản lý khi vào Hub: tất cả mọi người; admin hệ thống = tất cả công ty.
          // Không giữ «Của tôi» / company hẹp cấu hình sẵn.
          next = {
            ...next,
            assignee: 'all',
            assigneeUserId: '',
            companyId: user?.company_id || '',
          };
        }
        // Chỉ ép «Của tôi» khi NV thường (hoặc deep-link mine) — không áp cho admin.
        if (route.params?.initialAssignee === 'mine' && !adminLikeUser) {
          next = { ...next, assignee: 'mine', assigneeUserId: '' };
        }
        setLeadFilters(next);
        setDealFilters(next);
        if (snap.search) {
          setSearch(snap.search);
          setSearchDraft(snap.search);
        }
      } else if (route.params?.initialAssignee === 'mine' && !adminLikeUser) {
        setLeadFilters((p) => ({ ...p, assignee: 'mine', assigneeUserId: '' }));
        setDealFilters((p) => ({ ...p, assignee: 'mine', assigneeUserId: '' }));
      }
      filtersReadyRef.current = true;
      setFiltersReady(true);
    })();
    return () => { cancelled = true; };
  }, [myId, user, route.params?.initialAssignee]);

  /** Lưu bộ lọc chung (Lead/Deal/ĐH) để giữ khi thoát màn hình. */
  useEffect(() => {
    if (!filtersReady || !myId) return;
    const t = setTimeout(() => {
      void saveCrmHubFilterSnapshot(myId, {
        filters: leadFiltersRef.current,
        search: searchRef.current,
      });
    }, 400);
    return () => {
      clearTimeout(t);
      // Flush ngay khi unmount / đổi lọc — tránh mất bộ lọc khi thoát trang trước khi debounce chạy.
      void saveCrmHubFilterSnapshot(myId, {
        filters: leadFiltersRef.current,
        search: searchRef.current,
      });
    };
  }, [filtersReady, myId, leadFilters, search]);

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
        // Admin hệ thống (không company_id): mặc định xem "Tất cả công ty" —
        // không auto chọn 1 CT. Chỉ gán sẵn companyId cho user đã gắn công ty.
        const cid = user?.company_id || '';
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
    const dm = asDataMode(which);
    const preserveView = opts?.preserveView ?? false;
    const keepIndex = opts?.keepIndex;
    const setter = dm === 'leads' ? setLeadData : setDealData;

    setter((prev) => {
      // Công ty chưa có pipeline / API trả rỗng — xóa hết số cũ (tránh 67 cột + badge Deal stale).
      if (!boot.stages.length) {
        return { stages: [], stageCounts: {}, listTotal: 0, cache: {} };
      }
      const cache: Record<string, CrmStageCache> = preserveView ? { ...prev.cache } : {};
      cache[boot.initialStageId] = {
        items: boot.initialPage.items,
        hasMore: boot.initialPage.hasMore,
        nextOffset: boot.initialPage.nextOffset,
        loaded: true,
      };
      const nextCounts = { ...boot.stageCounts };
      const hasBootCounts = Object.keys(nextCounts).length > 0;
      const samePipeline = prev.stages.some((s) => boot.stages.some((b) => b.id === s.id));
      // Lite/skip_counts chỉ có 1 cột — không fill 0 toàn pipeline (sẽ ẩn nhầm cột).
      const fullishCounts = Object.keys(nextCounts).length > 1;
      const mergedCounts = hasBootCounts
        ? (preserveView ? { ...prev.stageCounts, ...nextCounts } : nextCounts)
        : (samePipeline ? prev.stageCounts : {});
      return {
        stages: boot.stages,
        stageCounts: fullishCounts
          ? fillStageCountZeros(boot.stages, mergedCounts)
          : mergedCounts,
        // skip_counts: stageCounts chỉ 1 cột → listTotal là tổng cột, không phải pipeline.
        listTotal: Object.keys(boot.stageCounts || {}).length > 1
          ? (boot.listTotal ?? (samePipeline ? prev.listTotal : null))
          : (samePipeline ? prev.listTotal : null),
        cache,
      };
    });

    const activeIdx =
      preserveView && asDataMode(modeRef.current) === dm
        ? activeIndexRef.current
        : typeof keepIndex === 'number' && keepIndex < boot.stages.length
          ? keepIndex
          : boot.stages.findIndex((s) => s.id === boot.initialStageId);

    if (asDataMode(modeRef.current) === dm && !preserveView) {
      setActiveIndex(activeIdx >= 0 ? activeIdx : 0);
    }

    return {
      activeIdx: activeIdx >= 0 ? activeIdx : 0,
      activeStageId: boot.initialStageId,
    };
  }, []);

  const applyCachedHub = useCallback((which: Mode, filterKey: string) => {
    if (!myId) return false;
    const dm = asDataMode(which);
    const type = dm === 'leads' ? 'lead' : 'deal';
    const snap = peekCrmHubCache(myId, type, filterKey);
    if (!snap?.data?.stages?.length) return false;
    if (dm === 'leads') setLeadData(snap.data);
    else setDealData(snap.data);
    if (asDataMode(mode) === dm) setActiveIndex(snap.activeIndex);
    setLoaded((p) => ({ ...p, [dm]: true }));
    filterKeyRef.current = filterKey;
    return true;
  }, [myId, mode]);

  const resolveFetchStageId = useCallback((
    which: Mode,
    stageId?: string,
    preserveView?: boolean,
  ): string | undefined => {
    if (stageId) return stageId;
    if (preserveView && asDataMode(which) === asDataMode(modeRef.current)) {
      return stageIdAtIndex(modeRef.current, activeIndexRef.current);
    }
    if (asDataMode(which) === asDataMode(modeRef.current)) {
      return stageIdAtIndex(modeRef.current, activeIndexRef.current);
    }
    return undefined;
  }, []);

  const refreshStageCounts = useCallback(async (which: Mode, stageIds: string[], forceBatch = false) => {
    if (!stageIds.length) return;
    const dm = asDataMode(which);
    const type = dm === 'leads' ? 'lead' : 'deal';
    const setter = dm === 'leads' ? setLeadData : setDealData;
    const hubNow = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
    const missing = stageIds.filter((id) => hubNow.stageCounts[id] === undefined);
    if (!forceBatch && !missing.length) return;
    const fk = serverFilterKey(
      dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
      search,
    );
    if (countsInflightRef.current[dm] === fk) return;
    countsInflightRef.current[dm] = fk;
    try {
      const needAll =
        forceBatch
        || missing.length >= Math.max(3, Math.floor(hubNow.stages.length * 0.6));
      if (needAll) {
        const batch = await fetchCrmStageCountsBatch(type, fetchOptsRef.current());
        setter((prev) => ({
          ...prev,
          stageCounts: fillStageCountZeros(prev.stages, batch.counts),
          listTotal: batch.total,
        }));
        return;
      }
      const counts = await fetchStageCounts(type, missing, fetchOptsRef.current());
      setter((prev) => ({
        ...prev,
        stageCounts: fillStageCountZeros(prev.stages, { ...prev.stageCounts, ...counts }),
      }));
    } catch {
      /* badge cột vẫn dùng total từng trang đã tải */
    } finally {
      if (countsInflightRef.current[dm] === fk) countsInflightRef.current[dm] = '';
    }
  }, [search]);

  const fetchOptsForMode = useCallback((which: Mode): ReturnType<typeof buildStageFetchOpts> => {
    const dm = asDataMode(which);
    const modeFilters = dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current;
    return buildStageFetchOpts(modeFilters, search, myId);
  }, [search, myId]);

  const applyTotalsCache = useCallback((which: Mode) => {
    const dm = asDataMode(which);
    const type = dm === 'leads' ? 'lead' : 'deal';
    const cached = peekCrmTotalsCache(type, fetchOptsForMode(dm));
    if (!cached) return;
    const setter = dm === 'leads' ? setLeadData : setDealData;
    const cachedStages = peekPipelineStagesCached(type, fetchOptsForMode(dm));
    setter((prev) => ({
      ...prev,
      // Cache theo đúng bộ lọc — không để stageCounts cũ đè lên số mới.
      stages: cachedStages?.length ? cachedStages : prev.stages,
      stageCounts: fillStageCountZeros(cachedStages?.length ? cachedStages : prev.stages, cached.counts),
      listTotal: cached.total,
    }));
  }, [fetchOptsForMode]);

  /** Badge Leads/Deals/ĐH — prefetch cả lead+deal mỗi khi bộ lọc đổi. */
  const prefetchTabTotals = useCallback(async (which: Mode) => {
    const dm = asDataMode(which);
    const type = dm === 'leads' ? 'lead' : 'deal';
    const modeFilters = dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current;
    const fk = serverFilterKey(modeFilters, search);
    const opts = buildStageFetchOpts(modeFilters, search, myId);
    const setter = dm === 'leads' ? setLeadData : setDealData;

    applyTotalsCache(dm);

    if (tabTotalsKeyRef.current[dm] === fk) {
      const hubNow = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
      if (hubNow.listTotal != null && hubNow.stages.length) return;
    }
    // Không bỏ prefetch khi bootstrap đang chạy — thoát Hub abort bootstrap làm mất badge.

    if (countsInflightRef.current[dm] === fk) return;
    countsInflightRef.current[dm] = fk;
    const mySeq = ++totalsReqSeqRef.current[dm];
    try {
      const needStages = !(
        (dm === 'leads' ? leadDataRef.current : dealDataRef.current).stages.length
        || peekPipelineStagesCached(type, opts)?.length
      );
      const [batch, fetchedStages] = await Promise.all([
        fetchCrmStageCountsBatch(type, opts),
        needStages
          ? fetchPipelineStages(type, opts).catch(() => [] as CrmPipelineStage[])
          : Promise.resolve(null as CrmPipelineStage[] | null),
      ]);
      // Đổi công ty/lọc khác trong lúc đang chờ → có request mới hơn, bỏ response cũ này (tránh đè số mới bằng số cũ).
      if (totalsReqSeqRef.current[dm] !== mySeq) return;
      const cachedStages = fetchedStages?.length
        ? fetchedStages
        : peekPipelineStagesCached(type, opts);
      setter((prev) => ({
        ...prev,
        stages: cachedStages?.length ? cachedStages : prev.stages,
        // Thay toàn bộ counts theo bộ lọc mới — không merge với counts công ty/lọc cũ.
        stageCounts: fillStageCountZeros(
          cachedStages?.length ? cachedStages : prev.stages,
          batch.counts,
        ),
        listTotal: batch.total,
      }));
      tabTotalsKeyRef.current[dm] = fk;
    } catch {
      /* badge cột vẫn dùng total từng trang đã tải */
    } finally {
      if (countsInflightRef.current[dm] === fk) countsInflightRef.current[dm] = '';
    }
  }, [applyTotalsCache, search, myId]);

  const loadBootstrap = useCallback(async (
    which: Mode,
    isRefresh = false,
    stageId?: string,
    silent = false,
  ) => {
    const dm = asDataMode(which);
    // Chặn load trùng KHI đã có dữ liệu. Nếu CHƯA loaded (load lần đầu) thì cho phép
    // load mới thay thế load đang chạy (vd: companyId vừa được gán) — abort bên dưới lo việc hủy.
    if (loadingModeRef.current[dm] && !isRefresh && !silent && loadedRef.current[dm]) return;

    const type = dm === 'leads' ? 'lead' : 'deal';
    const modeFilters = dm === 'leads' ? leadFilters : dealFilters;
    const fk = serverFilterKey(modeFilters, search);

    if (!silent && !isRefresh && applyCachedHub(dm, fk)) {
      applyTotalsCache(dm);
      void loadBootstrap(dm, false, stageId, true);
      return;
    }

    applyTotalsCache(dm);
    abortByModeRef.current[dm]?.abort();
    const ac = new AbortController();
    abortByModeRef.current[dm] = ac;
    loadingModeRef.current[dm] = true;
    if (isRefresh && !silent) setRefreshing(true);
    else if (!silent) setLoadingByMode((p) => ({ ...p, [dm]: true }));
    if (!silent) setError('');

    if (isRefresh) {
      invalidatePipelineStagesCache(type);
      invalidateCrmHubCache(myId || undefined);
    }

    const viewingSameData = asDataMode(modeRef.current) === dm;
    const preserveView = silent && viewingSameData;
    const isCurrentMode = viewingSameData;
    const keepIndex = preserveView || (isRefresh && isCurrentMode)
      ? activeIndexRef.current
      : undefined;
    const effectiveStageId = resolveFetchStageId(modeRef.current, stageId, preserveView || (isRefresh && isCurrentMode));

    try {
      const fetchOpts = {
        ...fetchOptsRef.current(),
        signal: ac.signal,
        ...(isRefresh ? { skipCounts: false, lite: false } : { skipCounts: true, lite: true }),
      };
      const typeSetter = dm === 'leads' ? setLeadData : setDealData;
      // Gộp với prefetchTabTotals — tránh 2 request stage-counts cùng bộ lọc.
      const totalsFk = serverFilterKey(
        dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
        searchRef.current,
      );
      const hubNowForCounts = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
      const countsAlreadyFresh =
        tabTotalsKeyRef.current[dm] === totalsFk
        && hubNowForCounts.listTotal != null;
      const countsAlreadyInflight = countsInflightRef.current[dm] === totalsFk;
      let countsPromise: Promise<{ counts: Record<string, number>; total: number } | null>;
      if (countsAlreadyFresh || countsAlreadyInflight) {
        countsPromise = Promise.resolve(null);
      } else {
        countsInflightRef.current[dm] = totalsFk;
        countsPromise = fetchCrmStageCountsBatch(type, fetchOpts)
          .catch(() => null)
          .finally(() => {
            if (countsInflightRef.current[dm] === totalsFk) countsInflightRef.current[dm] = '';
          });
      }
      const boot = await fetchCrmBoardInitial(type, effectiveStageId, fetchOpts);
      if (ac.signal.aborted) return;

      void countsPromise.then((batch) => {
        // Vẫn áp dụng totals nếu bộ lọc chưa đổi — kể cả khi unmount/abort bootstrap (thoát tab).
        if (!batch) return;
        const fkNow = serverFilterKey(
          dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
          searchRef.current,
        );
        if (fkNow !== totalsFk) return;
        typeSetter((prev) => ({
          ...prev,
          // Batch theo bộ lọc hiện tại — thay toàn bộ, không giữ counts của công ty/lọc cũ.
          stageCounts: fillStageCountZeros(prev.stages.length ? prev.stages : boot.stages, batch.counts),
          listTotal: batch.total,
        }));
        tabTotalsKeyRef.current[dm] = totalsFk;
      });
      const { activeIdx, activeStageId: activeSid } = applyBootstrap(dm, boot, {
        keepIndex,
        preserveView,
      });

      if (boot.stages.length === 0) {
        // API trả [] hợp lệ (vd. công ty chưa setup pipeline) — không chặn cả Hub bằng màn lỗi.
        setLoaded((p) => ({ ...p, [dm]: true }));
        filterKeyRef.current = serverFilterKey(
          dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
          searchRef.current,
        );
        if (!silent) setError('');
        return;
      }

      setLoaded((p) => ({ ...p, [dm]: true }));
      filterKeyRef.current = serverFilterKey(
        dm === 'leads' ? leadFiltersRef.current : dealFiltersRef.current,
        search,
      );

      if (myId) {
        const prevHub = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
        const fkNow = filterKeyRef.current;
        setCrmHubCache(myId, type, fkNow, {
          data: {
            stages: boot.stages,
            stageCounts: preserveView
              ? { ...prevHub.stageCounts, ...boot.stageCounts }
              : boot.stageCounts,
            listTotal: Object.keys(boot.stageCounts || {}).length > 1
              ? (boot.listTotal ?? prevHub.listTotal)
              : prevHub.listTotal,
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
          activeStageId: preserveView ? (stageIdAtIndex(modeRef.current, activeIndexRef.current) || activeSid) : activeSid,
          activeIndex: preserveView ? activeIndexRef.current : activeIdx,
        });
      }
    } catch (e) {
      if (!ac.signal.aborted && !silent) setError(formatApiError(e));
    } finally {
      if (abortByModeRef.current[dm] === ac) {
        loadingModeRef.current[dm] = false;
        setLoadingByMode((p) => ({ ...p, [dm]: false }));
        setRefreshing(false);
      }
    }
  }, [applyBootstrap, applyCachedHub, applyTotalsCache, search, leadFilters, dealFilters, myId, resolveFetchStageId]);

  const loadStage = useCallback(async (which: Mode, stageId: string, append = false) => {
    const dm = asDataMode(which);
    const type = dm === 'leads' ? 'lead' : 'deal';
    const setter = dm === 'leads' ? setLeadData : setDealData;
    const hubNow = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
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
        // Giới hạn cache mỗi cột — FlatList ảo hóa nhưng mảng JS lớn vẫn tốn RAM/filter.
        const MAX_STAGE_ITEMS = 120;
        let items = append ? [...prevCur.items, ...page.items] : page.items;
        if (items.length > MAX_STAGE_ITEMS) {
          items = items.slice(items.length - MAX_STAGE_ITEMS);
        }
        const stageIds = prev.stages.map((s) => s.id);
        const mergedCache = {
          ...prev.cache,
          [stageId]: {
            items,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            loaded: true,
          },
        };
        return {
          ...prev,
          stageCounts: { ...prev.stageCounts, [stageId]: page.total },
          cache: pruneStageCacheAround(mergedCache, stageIds, stageId, 2),
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

  const canLoadCrm = (Boolean(user?.company_id) || companiesReady) && filtersReady;
  const canLoadCrmRef = useRef(canLoadCrm);
  canLoadCrmRef.current = canLoadCrm;

  const leadServerFilterKey = serverFilterKey(leadFilters, search);
  const dealServerFilterKey = serverFilterKey(dealFilters, search);

  useEffect(() => {
    if (!canLoadCrm) return;
    // Bộ lọc đổi (công ty / SĐT / NV / kỳ…) → làm mới badge cả 2 tab ngay, không chờ chuyển tab.
    tabTotalsKeyRef.current = { leads: '', deals: '' };
    applyTotalsCache('leads');
    applyTotalsCache('deals');
    void prefetchTabTotals('leads');
    void prefetchTabTotals('deals');
  }, [canLoadCrm, leadServerFilterKey, dealServerFilterKey, applyTotalsCache, prefetchTabTotals]);
  const loadBootstrapRef = useRef(loadBootstrap);
  loadBootstrapRef.current = loadBootstrap;
  const loadStageRef = useRef(loadStage);
  loadStageRef.current = loadStage;
  const prefetchTabTotalsRef = useRef(prefetchTabTotals);
  prefetchTabTotalsRef.current = prefetchTabTotals;

  // Deps rỗng: chỉ chạy khi focus/blur, KHÔNG re-subscribe khi loadBootstrap đổi identity
  // (nếu phụ thuộc loadBootstrap, mỗi lần filters/search đổi sẽ hủy request đang chạy → cột trống).
  useFocusEffect(
    useCallback(() => {
      const which = modeRef.current;
      const dm = asDataMode(which);
      if (canLoadCrmRef.current) {
        // Luôn làm mới badge khi quay lại Hub — tránh mất tổng vì abort lúc thoát.
        void prefetchTabTotalsRef.current('leads');
        void prefetchTabTotalsRef.current('deals');
      }
      if (canLoadCrmRef.current && loadedRef.current[dm]) {
        const hubNow = dm === 'leads' ? leadDataRef.current : dealDataRef.current;
        const sid = stageIdAtIndex(which, activeIndexRef.current);
        // Chỉ silent refresh nếu cột đang xem trống / chưa loaded — tránh bootstrap nặng mỗi lần focus.
        if (sid && !hubNow.cache[sid]?.loaded) {
          void loadStageRef.current(which, sid, false);
        } else if (!hubNow.stages.length) {
          void loadBootstrapRef.current(which, false, undefined, true);
        }
      }
      return () => {
        // Chỉ hủy bootstrap/trang cột — totals prefetch dùng seq riêng, không phụ thuộc abort này.
        abortByModeRef.current[dm]?.abort();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      if (!canLoadCrmRef.current) return;
      // Silent + lite (không invalidate) — chỉ mode đang xem.
      void loadBootstrapRef.current(modeRef.current, false, undefined, true);
    }, []),
    canLoadCrm,
  );

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
    if (!enabled && modeRef.current === 'orders') {
      setMode('deals');
      setActiveIndex(0);
      filterKeyRef.current = '';
    }
  }, []);

  const hasCustomerTab = useMemo(
    () => hasCrmCustomerOrderTab(dealData.stages),
    [dealData.stages],
  );
  const showOrdersTab = hasCustomerTab && dealKhSplitEnabled;

  useEffect(() => {
    if (!showOrdersTab && mode === 'orders') {
      setMode('deals');
      setActiveIndex(0);
    }
  }, [showOrdersTab, mode]);

  useEffect(() => {
    if (route.params?.initialMode === 'orders') {
      applyDealKhSplit(true);
    }
  }, [route.params?.initialMode, applyDealKhSplit]);

  const hubStages = useMemo(
    () => resolveCrmHubDisplayStages(mode, leadData.stages, dealData.stages, dealKhSplitEnabled),
    [mode, leadData.stages, dealData.stages, dealKhSplitEnabled],
  );
  const displayStages = useMemo(() => {
    const stages = filters.showOrphan ? [...hubStages, orphanVirtualStage()] : hubStages;
    return filterStagesHideEmpty(stages, hub.stageCounts, filters.hideEmptyStages);
  }, [hubStages, filters.showOrphan, filters.hideEmptyStages, hub.stageCounts]);

  const lastActiveStageIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!displayStages.length) return;
    const want = lastActiveStageIdRef.current;
    const byId = want != null
      ? displayStages.findIndex((s) => String(s.id) === String(want))
      : -1;
    if (byId >= 0) {
      if (byId !== activeIndexRef.current) setActiveIndex(byId);
      return;
    }
    // Cột đang xem bị ẩn (count → 0) hoặc danh sách rút — kẹp index hợp lệ.
    setActiveIndex((i) => Math.max(0, Math.min(i, displayStages.length - 1)));
  }, [displayStages]);

  const filterKey = serverFilterKey(filters, search);
  useEffect(() => {
    if (!canLoadCrm) return;
    if (filterKeyRef.current === filterKey) return;
    // Đổi lọc → xóa totals cũ ngay (tránh badge Deal «Tất cả CT» khi vừa chọn CT chưa có pipeline).
    if (filterKeyRef.current) {
      setLeadData((p) => ({ ...p, listTotal: null, stageCounts: {} }));
      setDealData((p) => ({ ...p, listTotal: null, stageCounts: {} }));
      tabTotalsKeyRef.current = { leads: '', deals: '' };
    }
    const stageId = displayStages[activeIndexRef.current]?.id;
    const dm = asDataMode(mode);
    if (!loaded[dm]) {
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
    if (next === 'orders' && !dealKhSplitRef.current) return;
    setMode(next);
    setSearchDraft('');
    setSearch('');
    // Không reset bộ lọc khi đổi tab — Lead/Deal/ĐH dùng chung 1 bộ lọc.
    setActiveIndex(0);
    filterKeyRef.current = '';
    const dm = asDataMode(next);
    if (!loaded[dm]) void loadBootstrap(next, false);
  };

  const activeStage: CrmPipelineStage | undefined = displayStages[activeIndex];
  const activeStageId = activeStage?.id;

  useEffect(() => {
    if (activeStageId) lastActiveStageIdRef.current = activeStageId;
  }, [activeStageId]);

  useEffect(() => {
    if (!filters.showOrphan && activeStageId === ORPHAN_STAGE_ID) {
      setActiveIndex(0);
    }
  }, [filters.showOrphan, activeStageId]);

  useEffect(() => {
    if (!loaded[dataMode] || !activeStageId) return;
    const cur = hub.cache[activeStageId];
    // Cột đang xem chưa có dữ liệu → nạp lại. Không phụ thuộc cờ `loading` cấp board
    // (tránh kẹt khi cờ này không được reset đúng lúc); loadStage tự chống nạp trùng.
    if (!cur?.loaded && !stageLoading) {
      void loadStage(mode, activeStageId, false);
    }
  }, [loaded, mode, activeStageId, hub.cache, stageLoading, loadStage]);

  /** Prefetch cột trái/phải — vuốt sang không phải chờ mạng. */
  const neighborPrefetchKeyRef = useRef('');
  const activeColumnLoaded = Boolean(activeStageId && hub.cache[activeStageId]?.loaded);
  useEffect(() => {
    if (!loaded[dataMode] || !activeStageId || activeStageId === ORPHAN_STAGE_ID) return;
    if (!activeColumnLoaded) return;
    const key = `${dataMode}|${filterKey}|${activeStageId}`;
    if (neighborPrefetchKeyRef.current === key) return;
    neighborPrefetchKeyRef.current = key;
    const type = dataMode === 'leads' ? 'lead' as const : 'deal' as const;
    const stages = displayStages.filter((s) => s.id !== ORPHAN_STAGE_ID);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        void (async () => {
          try {
            const neighbors = await prefetchCrmNeighborStages(
              type,
              stages,
              activeStageId,
              fetchOptsRef.current(),
            );
            if (cancelled || !Object.keys(neighbors).length) return;
            setHub((prev) => {
              const cache = { ...prev.cache };
              for (const [id, snap] of Object.entries(neighbors)) {
                if (cache[id]?.loaded) continue;
                cache[id] = snap;
              }
              const stageIds = prev.stages.map((s) => s.id);
              return {
                ...prev,
                cache: pruneStageCacheAround(cache, stageIds, activeStageId, 2),
              };
            });
          } catch {
            /* bỏ qua prefetch lỗi */
          }
        })();
      }, 280);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      const cancel = (task as { cancel?: () => void } | undefined)?.cancel;
      if (typeof cancel === 'function') cancel();
    };
  }, [
    loaded,
    dataMode,
    activeStageId,
    activeColumnLoaded,
    filterKey,
    displayStages,
    setHub,
  ]);

  useEffect(() => {
    if (!columnPickerOpen || !loaded[dataMode]) return;
    // Đếm đủ mọi cột pipeline (kể cả 0) để dropdown + ẩn cột trống ổn định.
    const ids = hubStages.map((s) => s.id).filter((id) => id !== ORPHAN_STAGE_ID);
    if (ids.length) void refreshStageCounts(mode, ids, true);
  }, [columnPickerOpen, loaded, mode, hubStages, refreshStageCounts]);

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < displayStages.length - 1;
  const accent = stageColor(activeStage?.color, activeIndex);
  const canPrevRef = useRef(canPrev);
  const canNextRef = useRef(canNext);
  canPrevRef.current = canPrev;
  canNextRef.current = canNext;

  const goPrevColumn = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNextColumn = useCallback(() => {
    setActiveIndex((i) => Math.min(displayStages.length - 1, i + 1));
  }, [displayStages.length]);

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
            goNextColumn();
            return;
          }
          if ((g.dx >= distance || g.vx >= fling) && canPrevRef.current) {
            goPrevColumn();
          }
        },
      }),
    [goNextColumn, goPrevColumn],
  );

  const rawColumnItems = activeStageId
    ? (hub.cache[activeStageId]?.items ?? [])
    : [];
  const columnItems = useMemo(
    () => clientFilterKanbanItems(rawColumnItems, filters, search),
    [rawColumnItems, filters, search],
  );
  const columnHasMore = activeStageId ? (hub.cache[activeStageId]?.hasMore ?? false) : false;
  /**
   * Chỉ chặn infinite-scroll khi lọc CLIENT-SIDE (server chưa áp được).
   * companyId / SĐT / kỳ / assignee / search thường đã gửi API → vẫn phải phân trang
   * (tránh treo ở ~20 bản ghi khi cột có 3000+).
   */
  const clientOnlyFilterActive =
    filters.due !== 'all'
    || filters.regionId === REGION_NONE
    || (!!search.trim() && filters.searchField === 'assignee');
  /** Chỉ lọc CLIENT — companyId/SĐT/assignee đã gửi API → badge cột dùng stageCounts. */
  const filterActive = clientOnlyFilterActive;
  const allowLoadMore = !clientOnlyFilterActive;
  const filterBadge = countActiveFilters(filters, search);

  const leadTabTotal = leadData.listTotal ?? sumCounts(leadData.stageCounts);
  /** Tab Deal tách = pre-Thắng; gộp = mọi cột trừ Thua/Hủy. */
  const dealTabTotal = (() => {
    if (!dealData.stages.length) {
      return dealData.listTotal ?? sumCounts(dealData.stageCounts);
    }
    const countsAligned = dealData.stages.some((s) => dealData.stageCounts[s.id] != null);
    if (!countsAligned && dealData.listTotal != null) return dealData.listTotal;
    if (!dealKhSplitEnabled) {
      return sumCrmDealMergedHubCount(dealData.stages, dealData.stageCounts);
    }
    return sumCrmDealHubKpiCount(dealData.stages, dealData.stageCounts);
  })();
  const ordersTabTotal = sumCrmCustomerTabDealCount(dealData.stages, dealData.stageCounts);
  const leadTabTotalKnown = leadData.listTotal != null || Object.keys(leadData.stageCounts).length > 0;
  const dealTabTotalKnown = dealData.listTotal != null || Object.keys(dealData.stageCounts).length > 0;
  const ordersTabTotalKnown = dealTabTotalKnown && showOrdersTab;
  const totalRecords = isLeads ? leadTabTotal : (isOrders ? ordersTabTotal : dealTabTotal);

  const isInitialLoad = loading && !loaded[dataMode];
  const isColumnLoading = stageLoading && !columnItems.length;
  const waitingForCrm = !canLoadCrm && !loaded[dataMode];
  const showFullScreenLoad = waitingForCrm || (isInitialLoad && !hubStages.length);
  const totalsPending =
    (isInitialLoad || loading || Boolean(countsInflightRef.current[dataMode]))
    && hub.listTotal == null
    && Object.keys(hub.stageCounts).length === 0;
  const totalRecordsLabel = totalsPending ? '…' : String(totalRecords);
  const stagesCountLabel = hubStages.length ? String(displayStages.length) : (showFullScreenLoad || isInitialLoad ? '…' : '0');

  // Chỉ coi là "tải lâu" khi đã chờ quá ngưỡng — load nhanh không hiện banner để tránh nhấp nháy.
  const inlineLoadingActive = isColumnLoading || (isInitialLoad && hubStages.length > 0);
  const inlineLoadingSlow = useDelayedFlag(inlineLoadingActive, SLOW_LOAD_BANNER_MS);
  const fullScreenSlow = useDelayedFlag(showFullScreenLoad, SLOW_LOAD_HINT_MS);
  const showInlineLoadNotice = inlineLoadingActive && inlineLoadingSlow;

  const hubTitle = isLeads ? 'Quản lý Leads' : (isOrders ? 'Quản lý Đơn hàng' : 'Quản lý Deals');
  const hubKindLabel = isLeads ? 'Leads' : (isOrders ? 'Đơn hàng' : 'Deals');

  const inlineLoadTitle = isColumnLoading
    ? `Đang tải cột «${activeStage?.name ?? '…'}»…`
    : `Đang tải ${hubKindLabel}…`;
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
      lockScope,
    );
  }, [filters, search, setFilters, companies, regions, employees, lockScope]);

  const countByStageId = hub.stageCounts;

  const compactStats = useMemo(() => {
    const colTotal = activeStageId ? (hub.stageCounts[activeStageId] ?? 0) : 0;
    const shown = filterActive ? columnItems.length : colTotal;
    return {
      total: totalsPending ? '…' : String(totalRecords),
      column: (isColumnLoading && !filterActive) ? '…' : String(shown),
      stages: hubStages.length ? String(displayStages.length) : (isInitialLoad ? '…' : '0'),
    };
  }, [
    hub.stageCounts,
    hubStages.length,
    activeStageId,
    totalRecords,
    totalsPending,
    filterActive,
    columnItems.length,
    displayStages.length,
    isColumnLoading,
    isInitialLoad,
  ]);

  const goToStage = useCallback((stageId: string) => {
    const idx = displayStages.findIndex((s) => String(s.id) === String(stageId));
    if (idx >= 0) setActiveIndex(idx);
  }, [displayStages]);

  const moveCardTo = useCallback(
    async (item: CrmKanbanItem, targetStageId: string) => {
      // Dùng đủ pipeline (hubStages), không dùng displayStages — khi ẩn cột trống
      // vẫn chuyển được sang cột đang bị ẩn (count = 0).
      const target = hubStages.find((s) => String(s.id) === String(targetStageId));
      if (!target) {
        showToast('Không tìm thấy cột đích', false);
        return;
      }
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
        const nextCounts = fillStageCountZeros(prev.stages, prev.stageCounts);
        if (fromStageId) {
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
    [hubStages, setHub, showToast, loadBootstrap, mode, activeStageId],
  );

  const patchItemInHub = useCallback(
    (itemId: string, patch: Partial<CrmKanbanItem>, opts?: { remove?: boolean }) => {
      setHub((prev) => {
        const nextCache = { ...prev.cache };
        for (const sid of Object.keys(nextCache)) {
          const col = nextCache[sid];
          if (!col?.items?.some((it) => it.id === itemId)) continue;
          if (opts?.remove) {
            nextCache[sid] = {
              ...col,
              items: col.items.filter((it) => it.id !== itemId),
            };
          } else {
            nextCache[sid] = {
              ...col,
              items: col.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
            };
          }
          break;
        }
        return { ...prev, cache: nextCache };
      });
    },
    [setHub],
  );

  const shouldRemoveAfterAssign = useCallback(
    (assignedToId: string | null) => {
      if (filters.assignee === 'mine' && assignedToId && String(assignedToId) !== String(myId)) {
        return true;
      }
      if (
        filters.assignee === 'user' &&
        filters.assigneeUserId &&
        String(assignedToId || '') !== String(filters.assigneeUserId)
      ) {
        return true;
      }
      if (filters.assignee === 'mine' && !assignedToId) return true;
      return false;
    },
    [filters.assignee, filters.assigneeUserId, myId],
  );

  const openAssignForItem = useCallback(
    (item: CrmKanbanItem) => {
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
    async (item: CrmKanbanItem, userId: string | null) => {
      const pick = assignEmployees.find((u) => String(u.id) === String(userId || ''));
      const ownerName = userId
        ? (pick?.full_name || pick?.email || '—').trim()
        : 'Chưa gán';
      const ownerId = userId || 'unassigned';
      const patch: Partial<CrmKanbanItem> = {
        assignedToId: userId || '',
        leadOwnerId: userId || '',
        ownerId,
        ownerName,
        ownerInitials: initialsFromName(ownerName),
        ownerColor: colorFromName(ownerName),
      };
      const remove = shouldRemoveAfterAssign(userId);
      setAssigningId(item.id);
      if (!remove) patchItemInHub(item.id, patch);
      else patchItemInHub(item.id, patch, { remove: true });
      try {
        const res = await updateCrmAssignee(item.id, userId);
        const finalName = res.ownerName || ownerName;
        if (!remove) {
          patchItemInHub(item.id, {
            assignedToId: res.assignedToId,
            leadOwnerId: res.assignedToId,
            ownerId: res.assignedToId || 'unassigned',
            ownerName: finalName,
            ownerInitials: initialsFromName(finalName),
            ownerColor: colorFromName(finalName),
          });
        }
        showToast(
          userId
            ? `Đã gán ${item.code} → ${finalName}`
            : `Đã bỏ gán phụ trách ${item.code}`,
          true,
        );
      } catch (e) {
        void loadBootstrap(mode, true, activeStageId);
        showToast(formatApiError(e), false);
      } finally {
        setAssigningId(null);
      }
    },
    [
      assignEmployees,
      patchItemInHub,
      shouldRemoveAfterAssign,
      showToast,
      loadBootstrap,
      mode,
      activeStageId,
    ],
  );

  const assignPickerOptions = useMemo(
    () => buildAssignPickerOptions(assignEmployees, user, myId),
    [assignEmployees, user, myId],
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
              : `Đang tải ${hubKindLabel}…`
          }
          hint={fullScreenHint}
        />
      </View>
    );
  }

  if (error && !hubStages.length) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Pressable
          style={[styles.backBtn, { position: 'absolute', top: insets.top + 8, left: Spacing.md }]}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Ionicons name="cloud-offline-outline" size={44} color={Colors.textFaint} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void loadBootstrap(mode, true)}>
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
            <Text style={styles.h1}>{hubTitle}</Text>
            <View style={styles.syncRow}>
              <View style={styles.syncDot} />
              <Text style={styles.syncTxt}>{totalRecordsLabel} bản ghi · {stagesCountLabel} cột</Text>
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
            {leadTabTotalKnown && (
              <View style={styles.segCount}>
                <Text style={styles.segCountTxt}>{leadTabTotal}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.segItem, isDeals && { backgroundColor: Colors.orange }]}
            onPress={() => switchMode('deals')}
          >
            <Ionicons name="pricetags" size={15} color={isDeals ? '#fff' : Colors.textMuted} />
            <Text style={[styles.segTxt, isDeals && { color: '#fff' }]}>Deals</Text>
            {dealTabTotalKnown && (
              <View style={styles.segCount}>
                <Text style={styles.segCountTxt}>{dealTabTotal}</Text>
              </View>
            )}
          </Pressable>
          {showOrdersTab ? (
            <Pressable
              style={[styles.segItem, isOrders && { backgroundColor: Colors.purple }]}
              onPress={() => switchMode('orders')}
            >
              <Ionicons name="cart" size={15} color={isOrders ? '#fff' : Colors.textMuted} />
              <Text style={[styles.segTxt, isOrders && { color: '#fff' }]}>ĐH</Text>
              {ordersTabTotalKnown && (
                <View style={styles.segCount}>
                  <Text style={styles.segCountTxt}>{ordersTabTotal}</Text>
                </View>
              )}
            </Pressable>
          ) : null}
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
            onPress={goPrevColumn}
            disabled={!canPrev}
            hitSlop={10}
            style={[styles.colNavArrow, !canPrev && styles.colNavArrowHidden]}
          >
            <Ionicons name="chevron-back" size={20} color={canPrev ? Colors.text : Colors.textFaint} />
          </Pressable>

          <Pressable
            style={styles.colHeaderCenter}
            onPress={() => {
              // Refresh đủ pipeline (kể cả cột 0) — không làm mất ẩn cột trống.
              void refreshStageCounts(mode, hubStages.map((s) => s.id), true);
              setColumnPickerOpen(true);
            }}
            hitSlop={6}
          >
            <Text style={styles.colIcon}>{activeStage?.icon || (isLeads ? '📋' : isOrders ? '🛒' : '💼')}</Text>
            <Text style={styles.colName} numberOfLines={1}>{activeStage?.name || '—'}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            <View style={[styles.colBadge, { backgroundColor: accent }]}>
              <Text style={styles.colBadgeText}>
                {filterActive ? columnItems.length : (activeStageId ? (hub.stageCounts[activeStageId] ?? columnItems.length) : 0)}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={goNextColumn}
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
        <Text style={styles.swipeHint}>Vuốt ngang để chuyển cột</Text>
      </View>

      {showInlineLoadNotice ? (
        <LoadingNotice variant="banner" title={inlineLoadTitle} hint={inlineLoadHint} />
      ) : null}

      <View style={styles.listFlex} {...columnSwipe.panHandlers}>
      <FlatList
        style={styles.listFill}
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
                {hubStages.length === 0
                  ? (filters.companyId
                    ? 'Công ty này chưa cấu hình pipeline CRM. Chọn công ty khác hoặc «Tất cả công ty».'
                    : `Không có cột ${isLeads ? 'Lead' : isOrders ? 'Đơn hàng' : 'Deal'}`)
                  : filterActive
                    ? `Không tìm thấy ${isLeads ? 'lead' : isOrders ? 'đơn hàng' : 'deal'} phù hợp`
                    : 'Cột này chưa có bản ghi'}
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
          ) : columnHasMore && allowLoadMore ? (
            <Pressable
              style={styles.loadMoreBtn}
              onPress={() => activeStageId && void loadStage(mode, activeStageId, true)}
            >
              <Text style={styles.loadMoreTxt}>Tải thêm</Text>
            </Pressable>
          ) : null
        }
        onEndReached={() => {
          if (activeStageId && columnHasMore && !moreLoading && allowLoadMore) {
            void loadStage(mode, activeStageId, true);
          }
        }}
        onEndReachedThreshold={0.35}
        removeClippedSubviews
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        initialNumToRender={8}
        renderItem={({ item }) => {
          const cardCompanyId = item.companyId || filters.companyId || user?.company_id || '';
          const canAssign = canAssignCrmCard(user, item, myId, cardCompanyId);
          return (
            <KanbanCard
              item={item}
              accent={accent}
              isMoving={movingId === item.id}
              isAssigning={assigningId === item.id}
              canAssign={canAssign}
              onPress={() =>
                navigation.navigate('LeadDealDetail', {
                  leadId: item.id,
                  kind: item.kind,
                  code: item.code,
                  title: item.title,
                })
              }
              onMove={() => setMoveItem(item)}
              onAssign={() => openAssignForItem(item)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
      </View>

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
        mode={mode === 'orders' ? 'orders' : mode}
        filters={filters}
        search={search}
        companies={companies}
        regions={regions}
        departments={departments}
        employees={employees}
        metaLoading={metaLoading}
        lockScope={lockScope}
        showDealOrderSplit={hasCustomerTab}
        dealKhSplitEnabled={dealKhSplitEnabled}
        onDealKhSplitChange={applyDealKhSplit}
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
        <View style={[styles.toast, { bottom: 80 + insets.bottom, backgroundColor: toast.ok ? Colors.green : Colors.red }]}>
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
  dotsScroll: { maxHeight: 16, marginBottom: 4 },
  dotsRow: { alignItems: 'center', paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotGap: { marginLeft: 6 },
  swipeHint: {
    color: Colors.textFaint,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  listFlex: { flex: 1 },
  listFill: { flex: 1 },
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
  cardTags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' },
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
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
