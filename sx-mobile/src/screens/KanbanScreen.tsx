import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
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
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import TapHighlight from '../components/TapHighlight';
import FilterPickerModal from '../components/FilterPickerModal';
import ProductionFilterSheet, {
  type PhoneFilterId,
} from '../components/ProductionFilterSheet';
import MoveColumnModal from '../components/MoveColumnModal';
import ProjectCommentModal from '../components/ProjectCommentModal';
import KanbanDealTimeline from '../components/KanbanDealTimeline';
import SxListCard from '../components/SxListCard';
import Toast, { type ToastKind, type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  fetchCompanies,
  fetchClientCompanies,
  fetchWorkshopOptionsForDeal,
  assignProjectWorkshopType,
  fetchProductionBoard,
  fetchProductionBoardSummary,
  fetchProductionProject,
  fetchProjectCommentIndex,
  fetchWorkshopTypes,
  isAbortError,
  moveProjectToStage,
  type BoardFilters,
  type CommentIndexEntry,
  type CompanyOption,
  type ProductionBoardSummary,
  type WorkshopTypeOption,
  resolveColumnId,
} from '../lib/productionApi';
import { getCachedBoard, isCachedBoardFresh } from '../lib/productionBoardCache';
import { loadKanbanFilters, saveKanbanFilters } from '../lib/kanbanFilterStorage';
import {
  computeSxBoardKpis,
  countsAsCompletedRevenue,
  projectIsAwaitingDelivery,
  projectIsShipped,
} from '../lib/sxBoardKpis';
import {
  isMetallaOrHucabiCompanyId,
  isSystemAdmin,
  productionCreateCompanyOptions,
  projectMatchesDealCompanyExternalFilter,
  resolveDealCompanyExternalFilter,
  resolveDealCompanyParam,
  shouldShowDealCompanyFilter,
  workshopCompaniesForCrossViewer,
  type ClientCompanyOption,
} from '../lib/productionFilters';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import { useTheme } from '../context/ThemeContext';
import { type AppColors, colorWithAlpha, HIT_TARGET, Radii, Spacing, stageColor } from '../theme';
import type { KanbanStage, ProductionBoard, ProductionProject } from '../types';

import SpinningLoader from '../components/SpinningLoader';
type QuickFilter = 'all' | 'mine' | 'overdue' | 'today';
type ViewMode = 'list' | 'kanban';

const VIEW_MODE_KEY = 'sx_kanban_view_mode';

/** Số card render ban đầu + mỗi lần tải thêm khi cuộn — giúp cột nhiều dự án mở nhanh. */
const CARD_PAGE_SIZE = 10;

const INTAKE_BUCKET = 'won_pending';
const ORPHAN_COL_ID = '__orphan_no_type__';
/** Cột ảo gom project chưa có workshop_type_id — giống web. */
const ORPHAN_STAGE: KanbanStage = {
  id: ORPHAN_COL_ID,
  name: 'Chưa phân loại',
  icon: '📦',
  color: '#94A3B8',
  order_index: -1,
  bucket_slug: 'orphan',
  workflow_stage_id: null,
  is_handover_to_logistics: false,
};

function formatDateTime(value?: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

type VcTag = { label: 'Chờ VC' | 'Đang VC'; bg: string; border: string; color: string };

function getVcTag(p: ProductionProject, stages: KanbanStage[]): VcTag | null {
  if (projectIsAwaitingDelivery(p, stages)) {
    return { label: 'Chờ VC', bg: '#33415533', border: '#94A3B8', color: '#CBD5E1' };
  }
  const status = String(p.status || '');
  if (['shipping', 'installing', 'warranty'].includes(status)) {
    return { label: 'Đang VC', bg: '#0EA5E933', border: '#38BDF8', color: '#7DD3FC' };
  }
  return null;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const TYPE_PALETTE = [
  '#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EC4899', '#10B981', '#F97316', '#06B6D4',
];
function typeColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return TYPE_PALETTE[Math.abs(h) % TYPE_PALETTE.length];
}

const AVATAR_COLORS = ['#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#F97316'];
function avatarColor(name?: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Cột hiển thị Kanban — resolve live giống web colIdFor (không dùng resolved stale). */
function displayColumnId(p: ProductionProject, stages: KanbanStage[]): string | null {
  return resolveColumnId(p, stages);
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  try {
    const d = new Date(value);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  } catch {
    return false;
  }
}

export default function KanbanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createKanbanStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount, refreshUnread, commentToast, dismissCommentToast, projectMetaRef, subscribeComment, subscribeSync } = useNotifications();
  const { openProjectDetail } = useRootNavigation();
  const myId = user?.id || user?.userId || null;

  const [board, setBoard] = useState<ProductionBoard>(
    () => ({ stages: [], projects: [], kpis: null }),
  );
  /** KPI giai đoạn từ summary=1 (toàn filter server) — tránh lệch khi board chưa load hết. */
  const [summaryKpis, setSummaryKpis] = useState<ProductionBoardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
  const movingIdRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const boardAbortRef = useRef<AbortController | null>(null);
  const lastSilentAtRef = useRef(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDealCompany, setFilterDealCompany] = useState('');
  const [filterWorkTypeId, setFilterWorkTypeId] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [clientCompaniesForDeal, setClientCompaniesForDeal] = useState<ClientCompanyOption[]>([]);
  const [workshopOptionsForDeal, setWorkshopOptionsForDeal] = useState<CompanyOption[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkshopTypeOption[]>([]);
  /** Công ty mà `workTypes` hiện tại thuộc về — tránh auto-chọn nhầm loại công ty cũ. */
  const [workTypesCompanyId, setWorkTypesCompanyId] = useState('');
  // Ref cache danh sách công ty — không bao giờ bị xóa khi board reload theo filter.
  const allCompaniesRef = useRef<CompanyOption[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterPhone, setFilterPhone] = useState<PhoneFilterId>('');
  const [filterPersonId, setFilterPersonId] = useState('');
  const [colPickerOpen, setColPickerOpen] = useState(false);
  /** Dropdown nhanh ngoài sheet: person | workshop | deal | workType */
  const [quickPicker, setQuickPicker] = useState<'person' | 'workshop' | 'deal' | 'workType' | null>(null);
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [moveModalProject, setMoveModalProject] = useState<ProductionProject | null>(null);
  const [classifyModalProject, setClassifyModalProject] = useState<ProductionProject | null>(null);
  const [commentProject, setCommentProject] = useState<ProductionProject | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commentIndex, setCommentIndex] = useState<Record<string, CommentIndexEntry>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [viewModeReady, setViewModeReady] = useState(false);
  const [listStageId, setListStageId] = useState<string>('all');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw === 'list' || raw === 'kanban') setViewMode(raw);
      })
      .finally(() => {
        if (!cancelled) setViewModeReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const switchViewMode = useCallback((next: ViewMode) => {
    setViewMode(next);
    void AsyncStorage.setItem(VIEW_MODE_KEY, next).catch(() => {});
  }, []);

  // Refs để load() luôn dùng giá trị filter mới nhất mà không cần thêm vào deps array.
  const filterCompanyRef = useRef('');
  const filterDealCompanyRef = useRef('');
  const filterWorkTypeIdRef = useRef('');
  const isFirstMount = useRef(true);

  const isAdmin = user?.role === 'admin';
  const isSysAdmin = isSystemAdmin(user);
  const showDealCompanyFilter = useMemo(
    () => shouldShowDealCompanyFilter(user, companies),
    [user, companies],
  );
  const canPickDealCompany = isSysAdmin && showDealCompanyFilter;

  const dealCompanyParam = useMemo(
    () => resolveDealCompanyParam({
      filterDealCompany,
      dealCompanyOptions: clientCompaniesForDeal,
      showDealCompanyFilter,
      user,
      isAdmin: !!isAdmin,
    }),
    [filterDealCompany, clientCompaniesForDeal, showDealCompanyFilter, user, isAdmin],
  );

  const dealCompanyExternalFilter = useMemo(
    () => resolveDealCompanyExternalFilter(filterDealCompany, clientCompaniesForDeal),
    [filterDealCompany, clientCompaniesForDeal],
  );

  const clientCompaniesWorkshopId = useMemo(() => {
    if (filterCompany && isMetallaOrHucabiCompanyId(filterCompany, companies)) {
      return filterCompany;
    }
    const opts = productionCreateCompanyOptions(companies);
    return opts[0]?.id ? String(opts[0].id) : '';
  }, [filterCompany, companies]);

  const workshopCompanyPickerList = useMemo(() => {
    if (isAdmin && !dealCompanyParam) return companies;
    if (workshopOptionsForDeal.length) {
      const ids = new Set(workshopOptionsForDeal.map((w) => String(w.id)));
      const fromApi = companies.filter((c) => ids.has(String(c.id)));
      return fromApi.length ? fromApi : workshopOptionsForDeal;
    }
    if (user?.company_id && isMetallaOrHucabiCompanyId(user.company_id, companies)) {
      return companies.filter((c) => String(c.id) === String(user.company_id));
    }
    return workshopCompaniesForCrossViewer(companies, user);
  }, [companies, user, workshopOptionsForDeal, dealCompanyParam, isAdmin]);

  const showWorkshopPicker = isSysAdmin || workshopCompanyPickerList.length > 1;
  // Phân loại chỉ theo xưởng đang chọn — «Tất cả» không gắn company của admin (tránh lọc sai / kẹt sẵn sàng).
  const companyForTypes = filterCompany || null;

  // Debounce ô tìm kiếm: gõ phím cập nhật `searchInput` ngay, nhưng việc lọc nặng
  // (chạy trên toàn bộ vài nghìn dự án) chỉ chạy sau 250ms ngừng gõ → không lag khi nhập.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const showToast = useCallback((message: string, kind: ToastKind) => {
    setToast({ message, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const openCommentForProjectId = useCallback(
    async (projectId: string) => {
      const local = board.projects.find((p) => String(p.id) === String(projectId));
      if (local) {
        setCommentProject(local);
        return;
      }
      try {
        const proj = await fetchProductionProject(projectId);
        setCommentProject(proj);
      } catch (e) {
        showToast(formatApiError(e), 'error');
      }
    },
    [board.projects, showToast],
  );

  const openNotifications = useCallback(async () => {
    void ensureNotificationPermission();
    setNotificationsOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    for (const p of board.projects) {
      projectMetaRef.current.set(String(p.id), { code: p.code, name: p.name });
    }
  }, [board.projects, projectMetaRef]);

  useEffect(() => {
    if (!commentToast) return undefined;
    const t = setTimeout(() => dismissCommentToast(), 4500);
    return () => clearTimeout(t);
  }, [commentToast, dismissCommentToast]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const currentBoardFilters = useCallback((): BoardFilters => {
    const companyId = filterCompanyRef.current || undefined;
    // Chỉ lọc phân loại khi đã chọn 1 xưởng — «Tất cả xưởng» khớp Overview (không gửi workshop_type_id).
    const workshopTypeId = companyId
      ? (filterWorkTypeIdRef.current && filterWorkTypeIdRef.current !== 'none'
        ? filterWorkTypeIdRef.current
        : undefined)
      : undefined;
    return {
      companyId,
      dealCompanyId: filterDealCompanyRef.current || undefined,
      workshopTypeId,
    };
  }, []);

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    const filters = currentBoardFilters();
    const cachedHit = getCachedBoard(filters);
    // Cache tươi: hydrate UI ngay; vẫn gọi summary để KPI khớp server (toàn filter).
    if (mode === 'silent' && isCachedBoardFresh(filters) && cachedHit) {
      setBoard(cachedHit);
      setActiveIndex((prev) => Math.min(prev, Math.max(0, cachedHit.stages.length - 1)));
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      lastSilentAtRef.current = Date.now();
      const seq = ++loadSeqRef.current;
      void fetchProductionBoardSummary(filters, false, undefined)
        .then((summary) => {
          if (seq !== loadSeqRef.current) return;
          setSummaryKpis(summary);
        })
        .catch(() => {});
      return;
    }
    boardAbortRef.current?.abort();
    const ac = new AbortController();
    boardAbortRef.current = ac;
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    setLoadingMore(false);
    if (mode !== 'silent') setSummaryKpis(null);
    try {
      const cached = cachedHit;
      if (cached && mode !== 'refresh') {
        setBoard(cached);
        setActiveIndex((prev) => Math.min(prev, Math.max(0, cached.stages.length - 1)));
        // Luôn tắt spinner khi đã có cache (kể cả silent) — UI hiện ngay.
        setLoading(false);
      }
      let firstPaint = Boolean(cached && mode !== 'refresh');
      const [data, summary] = await Promise.all([
        fetchProductionBoard(mode === 'refresh', filters, {
          signal: ac.signal,
          onPartial: (partial) => {
            if (seq !== loadSeqRef.current) return;
            setBoard(partial);
            setActiveIndex((prev) => Math.min(prev, Math.max(0, partial.stages.length - 1)));
            if (!firstPaint) {
              firstPaint = true;
              setLoading(false);
              setRefreshing(false);
              setLoadingMore(partial.projects.length >= 500);
            } else {
              setLoadingMore(partial.projects.length >= 500 && mode !== 'silent');
            }
          },
        }),
        fetchProductionBoardSummary(filters, mode === 'refresh', ac.signal).catch((e) => {
          if (isAbortError(e)) throw e;
          return null;
        }),
      ]);
      if (seq !== loadSeqRef.current) return;
      setBoard(data);
      setSummaryKpis(summary);
      setActiveIndex((prev) => Math.min(prev, Math.max(0, data.stages.length - 1)));
      setLoadingMore(false);
      lastSilentAtRef.current = Date.now();
    } catch (e) {
      if (seq !== loadSeqRef.current || isAbortError(e)) return;
      if (mode !== 'silent') setError(formatApiError(e));
      setLoadingMore(false);
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentBoardFilters]);

  useEffect(() => () => {
    boardAbortRef.current?.abort();
  }, []);

  // Khôi phục bộ lọc lần trước — load board không phải chờ fetch workshop types.
  useEffect(() => {
    let cancel = false;
    void loadKanbanFilters().then((snap) => {
      if (cancel) return;
      if (snap?.filterCompany) setFilterCompany(String(snap.filterCompany));
      if (snap?.filterDealCompany) setFilterDealCompany(String(snap.filterDealCompany));
      if (snap?.filterWorkTypeId) setFilterWorkTypeId(String(snap.filterWorkTypeId));
      setFiltersHydrated(true);
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    void saveKanbanFilters({
      filterCompany,
      filterDealCompany,
      filterWorkTypeId,
    });
  }, [filtersHydrated, filterCompany, filterDealCompany, filterWorkTypeId]);

  // Đồng bộ refs với state để load() luôn dùng filter mới nhất.
  useEffect(() => { filterCompanyRef.current = filterCompany; }, [filterCompany]);
  useEffect(() => { filterDealCompanyRef.current = dealCompanyParam || ''; }, [dealCompanyParam]);
  useEffect(() => { filterWorkTypeIdRef.current = filterWorkTypeId; }, [filterWorkTypeId]);

  // Chờ phân loại sẵn sàng trước khi load board — chỉ khi đã chọn 1 xưởng.
  // filterWorkTypeId rỗng = «Tất cả» (hợp lệ), không cần chờ auto-chọn loại.
  const boardFiltersReady = useMemo(() => {
    if (!filtersHydrated) return false;
    if (!filterCompany) return true;
    if (workTypesCompanyId !== filterCompany) return false;
    return true;
  }, [
    filtersHydrated,
    filterCompany,
    workTypesCompanyId,
  ]);

  useEffect(() => {
    if (!boardFiltersReady) return;
    const filters = currentBoardFilters();
    const cached = getCachedBoard(filters);
    // Hydrate UI ngay từ cache đúng key (tránh màn hình trống / spinner vô hạn).
    if (cached) {
      setBoard(cached);
      setLoading(false);
    }
    void load(cached && isCachedBoardFresh(filters) ? 'silent' : 'init');
  }, [load, boardFiltersReady, currentBoardFilters]);

  // Re-fetch board khi company hoặc phân loại đổi (bỏ qua lần mount đầu tiên).
  useEffect(() => {
    if (!boardFiltersReady) return;
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    setActiveIndex(0);
    void load('init');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompany, filterDealCompany, dealCompanyParam, filterWorkTypeId, boardFiltersReady]);

  useEffect(() => { movingIdRef.current = movingId; }, [movingId]);

  useProductionRealtime({
    onRefresh: (info) => {
      if (movingIdRef.current) return;
      if (info?.patched) {
        const cached = getCachedBoard(currentBoardFilters());
        if (cached) setBoard(cached);
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || movingIdRef.current) return;
      const now = Date.now();
      // Tránh reload full board mỗi lần chạm app (rất chậm).
      if (now - lastSilentAtRef.current < 60_000) return;
      lastSilentAtRef.current = now;
      void load('silent');
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    board.projects.forEach((p) => {
      if (p.id) projectMetaRef.current.set(p.id, { code: p.code, name: p.name });
    });
  }, [board.projects, projectMetaRef]);

  useEffect(() => {
    return subscribeSync((evt) => {
      if (evt.type !== 'project:comment_changed') return;
      const pid = evt.payload.project_id ? String(evt.payload.project_id) : '';
      if (!pid) return;
      void fetchProjectCommentIndex([pid])
        .then((idx) => {
          const entry = idx[pid];
          if (entry) {
            setCommentIndex((prev) => ({ ...prev, [pid]: entry }));
          }
        })
        .catch(() => {});
    });
  }, [subscribeSync]);

  useEffect(() => {
    return subscribeComment((n) => {
      const pid = n.metadata?.project_id ? String(n.metadata.project_id) : n.entity_id ? String(n.entity_id) : '';
      if (!pid) return;
      setCommentIndex((prev) => ({
        ...prev,
        [pid]: {
          count: (prev[pid]?.count ?? 0) + 1,
          last_at: n.created_at,
          last_user_id: prev[pid]?.last_user_id ?? null,
        },
      }));
    });
  }, [subscribeComment]);


  useEffect(() => {
    void fetchCompanies()
      .then((list) => {
        setCompanies(list);
        if (list.length > 0) allCompaniesRef.current = list;
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!dealCompanyParam) {
      setWorkshopOptionsForDeal([]);
      return;
    }
    let cancel = false;
    void fetchWorkshopOptionsForDeal(dealCompanyParam)
      .then((list) => { if (!cancel) setWorkshopOptionsForDeal(list); })
      .catch(() => { if (!cancel) setWorkshopOptionsForDeal([]); });
    return () => { cancel = true; };
  }, [dealCompanyParam]);

  useEffect(() => {
    const cid = String(clientCompaniesWorkshopId || '').trim();
    if (!cid) {
      setClientCompaniesForDeal([]);
      return;
    }
    let cancel = false;
    void fetchClientCompanies(cid)
      .then((list) => { if (!cancel) setClientCompaniesForDeal(list); })
      .catch(() => { if (!cancel) setClientCompaniesForDeal([]); });
    return () => { cancel = true; };
  }, [clientCompaniesWorkshopId]);

  useEffect(() => {
    if (!showDealCompanyFilter || filterDealCompany || isAdmin) return;
    if (user?.company_id) setFilterDealCompany(String(user.company_id));
  }, [showDealCompanyFilter, filterDealCompany, user?.company_id, isAdmin]);

  useEffect(() => {
    if (!companyForTypes) {
      setWorkTypes([]);
      setWorkTypesCompanyId('');
      return;
    }
    void fetchWorkshopTypes(companyForTypes, dealCompanyParam || null)
      .then((list) => {
        setWorkTypes(list);
        setWorkTypesCompanyId(companyForTypes);
      })
      .catch(() => {
        setWorkTypes([]);
        setWorkTypesCompanyId(companyForTypes);
      });
  }, [companyForTypes, dealCompanyParam]);

  /**
   * Đồng bộ phân loại với xưởng đang chọn (khớp web):
   * - Đổi xưởng / mất danh sách → xóa lọc phân loại không còn hợp lệ
   * - Không tự ép chọn loại đầu (để «Tất cả» / Xóa chip hoạt động)
   */
  useEffect(() => {
    if (workTypesCompanyId !== companyForTypes) return;

    if (!companyForTypes) {
      if (filterWorkTypeId) setFilterWorkTypeId('');
      return;
    }

    if (!workTypes.length) {
      if (filterWorkTypeId && filterWorkTypeId !== 'none') setFilterWorkTypeId('');
      return;
    }

    if (!filterWorkTypeId || filterWorkTypeId === 'none') return;

    const stillExists = workTypes.some((w) => String(w.id) === String(filterWorkTypeId));
    if (!stillExists) setFilterWorkTypeId('');
  }, [
    workTypes,
    workTypesCompanyId,
    companyForTypes,
    filterWorkTypeId,
  ]);

  const companyOptions = useMemo(() => {
    let fromApi = workshopCompanyPickerList.length
      ? [...workshopCompanyPickerList]
      : allCompaniesRef.current.length
        ? [...allCompaniesRef.current]
        : [...companies];
    if (board.projects.length) {
      const map = new Map(fromApi.map((c) => [String(c.id), c]));
      board.projects.forEach((p) => {
        if (p.company_id && p.company_name && !map.has(String(p.company_id))) {
          map.set(String(p.company_id), { id: String(p.company_id), name: p.company_name });
        }
      });
      fromApi = Array.from(map.values());
    }
    if (fromApi.length && showWorkshopPicker) {
      if (!allCompaniesRef.current.length || fromApi.length > allCompaniesRef.current.length) {
        allCompaniesRef.current = fromApi;
      }
    }
    const base = showWorkshopPicker
      ? [{ id: '', label: 'Tất cả xưởng' }, ...fromApi.map((c) => ({ id: c.id, label: c.name }))]
      : fromApi.map((c) => ({ id: c.id, label: c.name }));
    return base;
  }, [companies, board.projects, workshopCompanyPickerList, showWorkshopPicker]);

  const dealCompanyPickerOptions = useMemo(() => {
    if (!showDealCompanyFilter) return [];
    const crm = clientCompaniesForDeal.filter((c) => c.client_company_id);
    const ext = clientCompaniesForDeal.filter((c) => !c.client_company_id);
    const opts: { id: string; label: string }[] = [];
    if (canPickDealCompany) {
      opts.push({ id: '', label: 'Tất cả công ty đặt hàng' });
    }
    crm.forEach((c) => {
      opts.push({
        id: c.id,
        label: `${c.short_name || c.name}${c.source === 'workshop' ? ' · đã liên kết' : ''}`,
      });
    });
    ext.forEach((c) => {
      opts.push({ id: c.id, label: c.short_name || c.name });
    });
    return opts;
  }, [showDealCompanyFilter, clientCompaniesForDeal, canPickDealCompany]);

  const selectedDealCompanyLabel = useMemo(() => {
    if (!filterDealCompany) {
      if (canPickDealCompany) return 'Tất cả công ty đặt hàng';
      if (showDealCompanyFilter && user?.company_id) {
        const c = clientCompaniesForDeal.find(
          (x) => String(x.id) === String(user.company_id)
            || String(x.client_company_id) === String(user.company_id),
        ) || companies.find((x) => String(x.id) === String(user.company_id));
        return c?.name || '—';
      }
      return '';
    }
    return dealCompanyPickerOptions.find((o) => o.id === filterDealCompany)?.label || '—';
  }, [
    filterDealCompany,
    dealCompanyPickerOptions,
    canPickDealCompany,
    showDealCompanyFilter,
    user?.company_id,
    clientCompaniesForDeal,
    companies,
  ]);

  const scopeFilterCount = useMemo(() => {
    let n = 0;
    if (filterCompany) n += 1;
    if (filterDealCompany && canPickDealCompany) n += 1;
    if (filterWorkTypeId) n += 1;
    return n;
  }, [filterCompany, filterDealCompany, filterWorkTypeId, canPickDealCompany]);

  const selectedWorkshopLabel = companyOptions.find((o) => o.id === filterCompany)?.label;

  const workTypeOptions = useMemo(
    () => [
      { id: '', label: 'Tất cả' },
      { id: 'none', label: 'Chưa phân loại' },
      ...workTypes.map((t) => ({ id: t.id, label: t.name })),
    ],
    [workTypes],
  );

  const classifyWorkTypeOptions = useMemo(
    () => workTypes.map((t) => ({ id: t.id, label: t.name })),
    [workTypes],
  );

  // Callback ổn định cho card → React.memo bỏ qua render lại các thẻ không đổi.
  const classifyOptionsRef = useRef(classifyWorkTypeOptions);
  classifyOptionsRef.current = classifyWorkTypeOptions;
  const handleCardOpen = useCallback((id: string) => openProjectDetail(id), [openProjectDetail]);
  const handleCardComment = useCallback((p: ProductionProject) => setCommentProject(p), []);
  const handleCardMove = useCallback((p: ProductionProject) => setMoveModalProject(p), []);
  const handleCardClassify = useCallback((p: ProductionProject) => {
    if (!classifyOptionsRef.current.length) {
      showToast('Chưa cấu hình phân loại cho công ty này', 'error');
      return;
    }
    setClassifyModalProject(p);
  }, [showToast]);

  // selectedCompanyLabel — không cần vì công ty hiện dạng chips ngang
  const selectedWorkTypeLabel = workTypeOptions.find((o) => o.id === filterWorkTypeId)?.label || 'Phân loại';

  /** Stages thực từ API — dùng cho move modal và logic stageById. */
  const stages = board.stages;

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return board.projects.filter((p) => {
      if (needle) {
        const hay = `${p.code} ${p.name} ${p.customer_name || ''} ${p.customer_phone || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (quickFilter === 'mine' && String(p.production_person_id || '') !== String(myId || '')) return false;
      if (quickFilter === 'overdue' && !p.is_overdue) return false;
      if (quickFilter === 'today' && !isToday(p.production_deadline || p.deadline)) return false;
      if (filterPhone === 'has' && !String(p.customer_phone || '').trim()) return false;
      if (filterPhone === 'no' && String(p.customer_phone || '').trim()) return false;
      if (filterPersonId && String(p.production_person_id || '') !== String(filterPersonId)) return false;
      // filterCompany: server-side.
      // filterWorkTypeId: client-side.
      //   - 'none' → chỉ project chưa phân loại (hiện cột ảo)
      //   - uuid  → chỉ project có đúng loại đó
      if (filterWorkTypeId === 'none') {
        if (p.workshop_type_id) return false;
      } else if (filterWorkTypeId) {
        if (String(p.workshop_type_id || '') !== String(filterWorkTypeId)) return false;
      }
      if (dealCompanyExternalFilter && !projectMatchesDealCompanyExternalFilter(p, dealCompanyExternalFilter)) {
        return false;
      }
      return true;
    });
  }, [
    board.projects,
    search,
    quickFilter,
    myId,
    filterWorkTypeId,
    dealCompanyExternalFilter,
    filterPhone,
    filterPersonId,
  ]);

  const personFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of board.projects) {
      const id = p.production_person_id ? String(p.production_person_id) : '';
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, p.production_person_name?.trim() || 'Không tên');
      }
    }
    return [
      { id: '', label: 'Tất cả' },
      ...[...map.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    ];
  }, [board.projects]);

  /** Badge bộ lọc (List + Kanban) — giống CRM. */
  const filterBadge = useMemo(() => {
    let n = scopeFilterCount;
    if (quickFilter !== 'all') n += 1;
    if (filterPhone) n += 1;
    if (filterPersonId) n += 1;
    if (search.trim()) n += 1;
    return n;
  }, [scopeFilterCount, quickFilter, filterPhone, filterPersonId, search]);

  type ActiveChip = { key: string; label: string; onClear: () => void };
  /** ≥ số lựa chọn thực (bỏ «Tất cả») → chip ngoài dùng dropdown. */
  const DROPDOWN_MIN_CHOICES = 2;
  const realChoiceCount = (opts: { id: string }[]) => opts.filter((o) => o.id !== '').length;

  const usePersonDropdown = realChoiceCount(personFilterOptions) >= DROPDOWN_MIN_CHOICES;
  const useWorkshopDropdown = showWorkshopPicker && realChoiceCount(companyOptions) >= DROPDOWN_MIN_CHOICES;
  const useDealDropdown = canPickDealCompany && realChoiceCount(dealCompanyPickerOptions) >= DROPDOWN_MIN_CHOICES;
  // Phân loại: luôn dropdown khi đã có ≥2 mục (vd. «Chưa phân loại» + 1 loại, hoặc 2 loại).
  const useWorkTypeDropdown = realChoiceCount(workTypeOptions) >= DROPDOWN_MIN_CHOICES;

  const applyWorkshopFilter = useCallback((id: string) => {
    setFilterCompany(id);
    setFilterWorkTypeId('');
    setFilterPersonId('');
  }, []);

  // Phụ trách lấy từ board theo xưởng — nếu đổi xưởng mà người cũ không còn thì clear.
  useEffect(() => {
    if (!filterPersonId) return;
    const stillValid = personFilterOptions.some((o) => o.id && o.id === filterPersonId);
    if (!stillValid) setFilterPersonId('');
  }, [filterPersonId, personFilterOptions]);

  const activeFilterChips = useMemo((): ActiveChip[] => {
    const chips: ActiveChip[] = [];
    const q = search.trim();
    if (q) {
      chips.push({
        key: 'search',
        label: `Tìm: ${q.length > 14 ? `${q.slice(0, 14)}…` : q}`,
        onClear: () => { setSearchInput(''); setSearch(''); },
      });
    }
    if (quickFilter === 'mine') {
      chips.push({ key: 'quick', label: 'Của tôi', onClear: () => setQuickFilter('all') });
    } else if (quickFilter === 'overdue') {
      chips.push({ key: 'quick', label: 'Quá hạn', onClear: () => setQuickFilter('all') });
    } else if (quickFilter === 'today') {
      chips.push({ key: 'quick', label: 'Hôm nay', onClear: () => setQuickFilter('all') });
    }
    if (filterPhone === 'has') {
      chips.push({ key: 'phone', label: 'Có SĐT', onClear: () => setFilterPhone('') });
    } else if (filterPhone === 'no') {
      chips.push({ key: 'phone', label: 'Không SĐT', onClear: () => setFilterPhone('') });
    }
    // Các mục nhiều option → dropdown chip riêng (không lặp clear-chip)
    // Thứ tự clear-chip: Xưởng → Đặt hàng → Phụ trách → Phân loại
    if (!useWorkshopDropdown && filterCompany) {
      chips.push({
        key: 'ws',
        label: selectedWorkshopLabel || 'Xưởng',
        onClear: () => applyWorkshopFilter(''),
      });
    }
    if (!useDealDropdown && filterDealCompany && canPickDealCompany) {
      chips.push({
        key: 'deal',
        label: selectedDealCompanyLabel || 'Đặt hàng',
        onClear: () => { setFilterDealCompany(''); setFilterWorkTypeId(''); },
      });
    }
    if (!usePersonDropdown && filterPersonId) {
      const name = personFilterOptions.find((o) => o.id === filterPersonId)?.label || 'Phụ trách';
      chips.push({ key: 'person', label: name, onClear: () => setFilterPersonId('') });
    }
    if (!useWorkTypeDropdown && filterWorkTypeId) {
      chips.push({
        key: 'wt',
        label: selectedWorkTypeLabel || 'Phân loại',
        onClear: () => setFilterWorkTypeId(''),
      });
    }
    return chips;
  }, [
    search,
    quickFilter,
    filterPhone,
    filterPersonId,
    personFilterOptions,
    filterCompany,
    selectedWorkshopLabel,
    filterDealCompany,
    canPickDealCompany,
    selectedDealCompanyLabel,
    filterWorkTypeId,
    selectedWorkTypeLabel,
    usePersonDropdown,
    useWorkshopDropdown,
    useDealDropdown,
    useWorkTypeDropdown,
    applyWorkshopFilter,
  ]);

  type DropdownChip = {
    key: string;
    prefix: string;
    label: string;
    active: boolean;
    onOpen: () => void;
    onClear?: () => void;
  };

  const filterDropdownChips = useMemo((): DropdownChip[] => {
    const chips: DropdownChip[] = [];
    // Thứ tự: Xưởng → Đặt hàng → Phụ trách → Phân loại
    if (useWorkshopDropdown) {
      chips.push({
        key: 'dd-ws',
        prefix: 'Xưởng',
        label: filterCompany ? (selectedWorkshopLabel || 'Xưởng') : 'Tất cả',
        active: !!filterCompany,
        onOpen: () => setQuickPicker('workshop'),
        onClear: filterCompany ? () => applyWorkshopFilter('') : undefined,
      });
    }
    if (useDealDropdown) {
      chips.push({
        key: 'dd-deal',
        prefix: 'Đặt hàng',
        label: filterDealCompany ? (selectedDealCompanyLabel || 'Đặt hàng') : 'Tất cả',
        active: !!filterDealCompany,
        onOpen: () => setQuickPicker('deal'),
        onClear: filterDealCompany
          ? () => { setFilterDealCompany(''); setFilterWorkTypeId(''); }
          : undefined,
      });
    }
    if (usePersonDropdown) {
      const label = filterPersonId
        ? (personFilterOptions.find((o) => o.id === filterPersonId)?.label || 'Phụ trách')
        : 'Tất cả';
      chips.push({
        key: 'dd-person',
        prefix: 'Phụ trách',
        label,
        active: !!filterPersonId,
        onOpen: () => setQuickPicker('person'),
        onClear: filterPersonId ? () => setFilterPersonId('') : undefined,
      });
    }
    if (useWorkTypeDropdown) {
      chips.push({
        key: 'dd-wt',
        prefix: 'Phân loại',
        label: filterWorkTypeId ? (selectedWorkTypeLabel || 'Phân loại') : 'Tất cả',
        active: !!filterWorkTypeId,
        onOpen: () => setQuickPicker('workType'),
        onClear: filterWorkTypeId ? () => setFilterWorkTypeId('') : undefined,
      });
    }
    return chips;
  }, [
    usePersonDropdown,
    useWorkshopDropdown,
    useDealDropdown,
    useWorkTypeDropdown,
    filterPersonId,
    personFilterOptions,
    filterCompany,
    selectedWorkshopLabel,
    filterDealCompany,
    selectedDealCompanyLabel,
    filterWorkTypeId,
    selectedWorkTypeLabel,
    applyWorkshopFilter,
  ]);

  const showFilterChipRow = activeFilterChips.length > 0 || filterDropdownChips.length > 0;

  /** Cột ảo «Chưa phân loại» — chỉ hiện khi bộ lọc phân loại chọn «Chưa phân loại». */
  const showOrphanCol = filterWorkTypeId === 'none';

  /**
   * Stages để hiển thị (navigation, dots, cột active).
   * Khi lọc «Chưa phân loại» chỉ hiện cột ảo; các bộ lọc khác dùng stages từ API.
   */
  const displayStages = useMemo<KanbanStage[]>(
    () => (showOrphanCol ? [ORPHAN_STAGE] : stages),
    [stages, showOrphanCol],
  );

  const activeStage: KanbanStage | undefined = displayStages[activeIndex];
  const isOrphanColumn = activeStage?.id === ORPHAN_COL_ID;
  const canPrev = activeIndex > 0;
  const canNext = activeIndex < displayStages.length - 1;
  const canPrevRef = useRef(canPrev);
  const canNextRef = useRef(canNext);
  const stageCountRef = useRef(displayStages.length);
  canPrevRef.current = canPrev;
  canNextRef.current = canNext;
  stageCountRef.current = displayStages.length;
  /** Đã nhận diện vuốt ngang — không nhường FlatList (tránh lúc được lúc không). */
  const swipeClaimedRef = useRef(false);

  const trySwipeColumn = useCallback((dx: number, vx: number) => {
    const distance = 40;
    const fling = 0.35;
    if ((dx <= -distance || vx <= -fling) && canNextRef.current) {
      setActiveIndex((i) => Math.min(stageCountRef.current - 1, i + 1));
      return;
    }
    if ((dx >= distance || vx >= fling) && canPrevRef.current) {
      setActiveIndex((i) => Math.max(0, i - 1));
    }
  }, []);

  /**
   * Vuốt ngang đổi cột — gắn lên View bọc FlatList + header cột (giống CRM Deadline),
   * không gắn thẳng lên FlatList (ScrollView hay cướp gesture → lúc được lúc không).
   */
  const columnSwipe = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => {
          const ok = Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2;
          if (ok) swipeClaimedRef.current = true;
          return ok;
        },
        onMoveShouldSetPanResponderCapture: (_e, g) => {
          const ok = Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35;
          if (ok) swipeClaimedRef.current = true;
          return ok;
        },
        onPanResponderTerminationRequest: () => !swipeClaimedRef.current,
        onPanResponderRelease: (_e, g) => {
          const claimed = swipeClaimedRef.current;
          swipeClaimedRef.current = false;
          if (!claimed) return;
          trySwipeColumn(g.dx, g.vx);
        },
        onPanResponderTerminate: (_e, g) => {
          const claimed = swipeClaimedRef.current;
          swipeClaimedRef.current = false;
          // FlatList / RefreshControl xen ngang — vẫn đổi cột nếu đã vuốt đủ.
          if (!claimed) return;
          trySwipeColumn(g.dx, g.vx);
        },
      }),
    [trySwipeColumn],
  );

  const accent = stageColor(activeStage?.color, activeIndex);

  const activeStageName = activeStage?.name;
  const renderCard = useCallback(
    ({ item }: { item: ProductionProject }) => (
      <KanbanCard
        item={item}
        styles={styles}
        colors={colors}
        stages={stages}
        accent={accent}
        activeStageName={activeStageName}
        commentCount={commentIndex[item.id]?.count ?? 0}
        isMoving={movingId === item.id}
        isOrphanColumn={isOrphanColumn}
        onOpen={handleCardOpen}
        onComment={handleCardComment}
        onMove={handleCardMove}
        onClassify={handleCardClassify}
      />
    ),
    [
      styles,
      colors,
      stages,
      accent,
      activeStageName,
      commentIndex,
      movingId,
      isOrphanColumn,
      handleCardOpen,
      handleCardComment,
      handleCardMove,
      handleCardClassify,
    ],
  );

  const projectsByStage = useMemo(() => {
    const map = new Map<string, ProductionProject[]>();
    displayStages.forEach((s) => map.set(s.id, []));
    filteredProjects.forEach((p) => {
      // Orphan project → vào cột ảo (nếu có)
      if (!p.workshop_type_id && map.has(ORPHAN_COL_ID)) {
        map.get(ORPHAN_COL_ID)!.push(p);
        return;
      }
      const key = displayColumnId(p, stages);
      if (key && map.has(key)) map.get(key)!.push(p);
    });
    return map;
  }, [displayStages, filteredProjects, stages]);

  const stageById = useMemo(() => {
    const m = new Map<string, KanbanStage>();
    displayStages.forEach((s) => m.set(String(s.id), s));
    stages.forEach((s) => {
      if (!m.has(String(s.id))) m.set(String(s.id), s);
    });
    return m;
  }, [displayStages, stages]);

  /** List mode: phẳng + lọc chip stage, sort updated/created desc. */
  const listProjects = useMemo(() => {
    let rows = filteredProjects;
    if (listStageId !== 'all') {
      if (listStageId === ORPHAN_COL_ID) {
        rows = rows.filter((p) => !p.workshop_type_id);
      } else {
        rows = rows.filter((p) => displayColumnId(p, stages) === listStageId);
      }
    }
    return [...rows].sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return tb - ta;
    });
  }, [filteredProjects, listStageId, stages]);

  const pagedListProjects = useMemo(
    () => listProjects.slice(0, visibleCount),
    [listProjects, visibleCount],
  );
  const hasMoreListCards = visibleCount < listProjects.length;

  const columnProjects = activeStage ? (projectsByStage.get(activeStage.id) || []) : [];

  // Phân trang phía client: chỉ render `visibleCount` card đầu, tải thêm khi cuộn tới cuối.
  const pagedProjects = useMemo(
    () => columnProjects.slice(0, visibleCount),
    [columnProjects, visibleCount],
  );
  const hasMoreCards = visibleCount < columnProjects.length;

  // Reset về trang đầu khi đổi cột hoặc đổi bộ lọc.
  useEffect(() => {
    setVisibleCount(CARD_PAGE_SIZE);
  }, [activeStage?.id, search, quickFilter, filterWorkTypeId, filterCompany, listStageId, viewMode]);

  const loadMoreCards = useCallback(() => {
    const total = viewMode === 'list' ? listProjects.length : columnProjects.length;
    setVisibleCount((prev) => (prev < total ? prev + CARD_PAGE_SIZE : prev));
  }, [viewMode, listProjects.length, columnProjects.length]);

  // List mode: comment-index theo trang đang hiện.
  useEffect(() => {
    if (viewMode !== 'list') return;
    const ids = pagedListProjects.map((p) => p.id).filter(Boolean);
    if (!ids.length) return;
    void fetchProjectCommentIndex(ids)
      .then((idx) => setCommentIndex((prev) => ({ ...prev, ...idx })))
      .catch(() => {});
  }, [viewMode, pagedListProjects]);

  const renderListCard = useCallback(
    ({ item }: { item: ProductionProject }) => {
      const resolved = displayColumnId(item, stages);
      const colId = resolved
        || (!item.workshop_type_id ? ORPHAN_COL_ID : null);
      const stage = colId ? stageById.get(String(colId)) : undefined;
      return (
        <SxListCard
          item={item}
          stage={stage}
          stages={stages}
          moving={movingId === item.id}
          onPress={() => handleCardOpen(item.id)}
          onMove={() => handleCardMove(item)}
          onClassify={() => handleCardClassify(item)}
        />
      );
    },
    [
      stages,
      stageById,
      movingId,
      handleCardOpen,
      handleCardMove,
      handleCardClassify,
    ],
  );

  // Chip stage List: bỏ chọn nếu cột không còn trong displayStages.
  useEffect(() => {
    if (listStageId === 'all') return;
    if (!displayStages.some((s) => s.id === listStageId)) setListStageId('all');
  }, [displayStages, listStageId]);

  // Chỉ tải comment-index cho các card ĐANG hiển thị (cột active + phân trang),
  // không tải cho toàn bộ vài nghìn dự án — tránh URL khổng lồ và query nặng.
  // Merge vào map cũ để badge các cột đã xem trước đó không mất.
  useEffect(() => {
    if (viewMode === 'list') return;
    const ids = pagedProjects.map((p) => p.id).filter(Boolean);
    if (!ids.length) return;
    void fetchProjectCommentIndex(ids)
      .then((idx) => setCommentIndex((prev) => ({ ...prev, ...idx })))
      .catch(() => {});
  }, [viewMode, pagedProjects]);

  const columnPickerOptions = useMemo(
    () =>
      displayStages.map((s) => {
        const count = projectsByStage.get(s.id)?.length ?? 0;
        const icon = s.icon ? `${s.icon} ` : '';
        return { id: s.id, label: `${icon}${s.name} (${count})` };
      }),
    [displayStages, projectsByStage],
  );
  const filterActive = search.trim().length > 0 || quickFilter !== 'all'
    || !!filterCompany || !!filterDealCompany || !!filterWorkTypeId
    || !!filterPhone || !!filterPersonId;

  const resetFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setQuickFilter('all');
    setFilterCompany('');
    setFilterDealCompany('');
    setFilterWorkTypeId('');
    setFilterPhone('');
    setFilterPersonId('');
  }, []);

  const moveCardTo = useCallback(
    async (project: ProductionProject, targetStageId: string) => {
      const target = stages.find((s) => String(s.id) === String(targetStageId));
      if (!target) return;
      const fromColId = project.resolved_column_id ?? project.sx_kanban_column_id ?? null;
      const isIntake = target.bucket_slug === INTAKE_BUCKET;
      setMovingId(project.id);
      setBoard((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === project.id
            ? { ...p, sx_kanban_column_id: target.id, resolved_column_id: target.id, sx_intake: isIntake }
            : p,
        ),
      }));
      try {
        const result = await moveProjectToStage(project.id, target.id, {
          currentStageId: fromColId,
          isIntake,
          companyId: project.company_id ?? user?.company_id ?? null,
        });
        const newColId = result.sx_kanban_column_id ?? target.id;
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  sx_kanban_column_id: newColId,
                  resolved_column_id: newColId,
                  sx_intake: isIntake,
                  current_stage_id: result.current_stage_id ?? p.current_stage_id,
                }
              : p,
          ),
        }));
        showToast(`Đã chuyển ${project.code} → ${target.name}`, 'success');
      } catch (e) {
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  sx_kanban_column_id: fromColId,
                  resolved_column_id: fromColId,
                  sx_intake: project.sx_intake,
                }
              : p,
          ),
        }));
        showToast(formatApiError(e), 'error');
      } finally {
        setMovingId(null);
      }
    },
    [stages, showToast, user?.company_id],
  );

  const assignWorkType = useCallback(
    async (project: ProductionProject, typeId: string) => {
      const type = workTypes.find((w) => String(w.id) === String(typeId));
      if (!type) return;
      setMovingId(project.id);
      try {
        await assignProjectWorkshopType(project.id, typeId);
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id
              ? { ...p, workshop_type_id: typeId, workshop_type_name: type.name }
              : p,
          ),
        }));
        showToast(`Đã gắn phân loại «${type.name}» cho ${project.code}`, 'success');
      } catch (e) {
        showToast(formatApiError(e), 'error');
      } finally {
        setMovingId(null);
      }
    },
    [workTypes, showToast],
  );

  const statPills = useMemo(() => {
    const client = computeSxBoardKpis(filteredProjects, stages);
    // Chỉ dùng summary server khi không còn lọc client-only (search / mine / overdue…).
    const clientOnlyFilter = Boolean(
      search.trim()
      || quickFilter !== 'all'
      || dealCompanyExternalFilter,
    );
    const useServer = !clientOnlyFilter && summaryKpis;
    const kpi = useServer
      ? {
          total: summaryKpis.total,
          producing: summaryKpis.producing,
          awaitingDelivery: summaryKpis.awaitingDelivery,
          shipped: summaryKpis.shipped,
          completed: client.completed,
          overdue: summaryKpis.overdue,
        }
      : client;
    return [
      { label: 'Tổng', value: kpi.total, color: colors.text },
      { label: 'Đang SX', value: kpi.producing, color: colors.primary },
      { label: 'Chờ vận chuyển', value: kpi.awaitingDelivery, color: '#94A3B8' },
      { label: 'Đã vận chuyển', value: kpi.shipped, color: '#38BDF8' },
      { label: 'Hoàn tất', value: kpi.completed, color: colors.success },
      ...(kpi.overdue > 0 ? [{ label: 'Quá hạn', value: kpi.overdue, color: colors.danger }] : []),
    ];
  }, [
    filteredProjects,
    stages,
    colors,
    summaryKpis,
    search,
    quickFilter,
    dealCompanyExternalFilter,
  ]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <SpinningLoader color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  if (error && !stages.length) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Ionicons name="cloud-offline-outline" size={44} color={colors.textFaint} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load('init')}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Khối cố định — không bị FlatList co lại trên Android */}
      <View style={styles.fixedTop}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>Quản lý sản xuất</Text>
          <Text style={styles.appSub}>
            {loadingMore
              ? 'Đang tải thêm dự án…'
              : viewMode === 'list'
                ? `Danh sách · ${listProjects.length} dự án`
                : 'Bảng điều hành sản xuất'}
          </Text>
        </View>
        <View style={styles.headerBtns}>
          {viewModeReady ? (
            <View style={styles.viewModeWrap}>
              <Text style={styles.viewModeLbl}>Chế độ xem:</Text>
              <View style={styles.viewModeBtns}>
                <Pressable
                  style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnOn]}
                  onPress={() => switchViewMode('list')}
                  hitSlop={6}
                  accessibilityLabel="Xem dạng list"
                >
                  <Ionicons
                    name="list"
                    size={15}
                    color={viewMode === 'list' ? colors.primary : colors.textMuted}
                  />
                </Pressable>
                <Pressable
                  style={[styles.viewModeBtn, viewMode === 'kanban' && styles.viewModeBtnOn]}
                  onPress={() => switchViewMode('kanban')}
                  hitSlop={6}
                  accessibilityLabel="Xem dạng kanban"
                >
                  <Ionicons
                    name="grid-outline"
                    size={15}
                    color={viewMode === 'kanban' ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>
          ) : null}
          <TapHighlight style={styles.iconBtn} onPress={() => void openNotifications()} hitSlop={8}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </TapHighlight>
          <TapHighlight style={styles.iconBtn} onPress={() => load('refresh')} hitSlop={8}>
            <Ionicons name="refresh-outline" size={20} color={colors.text} />
          </TapHighlight>
        </View>
      </View>

      {commentToast && !notificationsOpen ? (
        <TapHighlight
          style={styles.commentToast}
          onPress={() => {
            const pid = commentToast.notification.metadata?.project_id || commentToast.notification.entity_id;
            dismissCommentToast();
            if (pid) void openCommentForProjectId(String(pid));
          }}
        >
          <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.commentToastTitle} numberOfLines={1}>
              {commentToast.notification.title}
            </Text>
            {commentToast.notification.metadata?.comment_preview ? (
              <Text style={styles.commentToastBody} numberOfLines={2}>
                "{commentToast.notification.metadata.comment_preview}"
              </Text>
            ) : (
              <Text style={styles.commentToastBody} numberOfLines={2}>
                {commentToast.notification.message}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </TapHighlight>
      ) : null}

      {board.truncated ? (
        <View style={styles.truncatedBanner}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.truncatedBannerTxt}>
            Đã tải tối đa ~6.000 dự án. Thu hẹp Xưởng / Đặt hàng / Phân loại để xem đủ.
          </Text>
        </View>
      ) : null}

      {/* ── SEARCH + Bộ lọc (List & Kanban, giống CRM) ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.textFaint} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Tên mã, tên khách, SĐT..."
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchInput ? (
            <Pressable onPress={() => { setSearchInput(''); setSearch(''); }} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.filterBtn, filterBadge > 0 && styles.filterBtnActive]}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityLabel="Bộ lọc"
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={filterBadge > 0 ? colors.white : colors.text}
          />
          <Text style={[styles.filterBtnTxt, filterBadge > 0 && styles.filterBtnTxtActive]}>
            Bộ lọc
          </Text>
          {filterBadge > 0 ? (
            <View style={styles.filterBtnBadge}>
              <Text style={styles.filterBtnBadgeTxt}>
                {filterBadge > 9 ? '9+' : filterBadge}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {showFilterChipRow ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeChipScroll}
          contentContainerStyle={styles.activeChipContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {filterDropdownChips.map((chip) => (
            <View
              key={chip.key}
              style={[styles.dropdownChip, chip.active && styles.dropdownChipActive]}
            >
              <Pressable
                style={styles.dropdownChipMain}
                onPress={chip.onOpen}
                accessibilityLabel={`${chip.prefix}: ${chip.label}`}
              >
                <Text style={styles.dropdownChipPrefix} numberOfLines={1}>{chip.prefix}</Text>
                <Text
                  style={[styles.dropdownChipTxt, chip.active && styles.dropdownChipTxtActive]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={chip.active ? colors.primary : colors.textMuted}
                />
              </Pressable>
              {chip.onClear ? (
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    chip.onClear?.();
                  }}
                  hitSlop={10}
                  style={styles.dropdownChipClear}
                  accessibilityLabel={`Xóa ${chip.prefix}`}
                >
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {activeFilterChips.map((chip) => (
            <Pressable key={chip.key} style={styles.activeChip} onPress={chip.onClear}>
              <Text style={styles.activeChipTxt} numberOfLines={1}>{chip.label}</Text>
              <Ionicons name="close" size={13} color={colors.textMuted} />
            </Pressable>
          ))}
          {(activeFilterChips.length > 0
            || filterDropdownChips.some((c) => c.active)
            || filterBadge > 0) ? (
            <Pressable style={styles.activeChipClear} onPress={resetFilters}>
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      {viewMode === 'kanban' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
          nestedScrollEnabled
        >
          {statPills.map((s, idx) => (
            <View key={s.label} style={[styles.statPill, idx > 0 && styles.statPillGap]}>
              <View style={styles.statValueBox}>
                <Text style={[styles.statValue, { color: s.color }]} numberOfLines={1}>
                  {String(s.value)}
                </Text>
              </View>
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {viewMode === 'list' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <TapHighlight
            onPress={() => setListStageId('all')}
            style={[styles.chip, listStageId === 'all' && styles.chipActive, styles.chipGap]}
          >
            <Text style={[styles.chipText, listStageId === 'all' && styles.chipTextActive]} numberOfLines={1}>
              Tất cả ({filteredProjects.length})
            </Text>
          </TapHighlight>
          {displayStages.map((s) => {
            const count = projectsByStage.get(s.id)?.length ?? 0;
            const active = listStageId === s.id;
            return (
              <TapHighlight
                key={s.id}
                onPress={() => setListStageId(s.id)}
                style={[styles.chip, active && styles.chipActive, styles.chipGap]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {s.name} ({count})
                </Text>
              </TapHighlight>
            );
          })}
        </ScrollView>
      ) : (
        <>
          {/* ── COLUMN HEADER + DOT NAV ── */}
          <View style={styles.colHeaderRow} {...columnSwipe.panHandlers}>
            <Pressable
              onPress={() => setActiveIndex((i) => Math.max(0, i - 1))}
              disabled={!canPrev}
              hitSlop={10}
              style={[styles.colNavArrow, !canPrev && styles.colNavArrowHidden]}
            >
              <Ionicons name="chevron-back" size={20} color={canPrev ? colors.text : colors.textFaint} />
            </Pressable>

            <Pressable
              style={styles.colHeaderCenter}
              onPress={() => setColPickerOpen(true)}
              disabled={displayStages.length === 0}
              hitSlop={6}
            >
              <Text style={styles.colIcon}>{activeStage?.icon || '📋'}</Text>
              <Text style={styles.colName} numberOfLines={1}>{activeStage?.name || '—'}</Text>
              <View style={[styles.colBadge, { backgroundColor: accent }]}>
                <Text style={styles.colBadgeText}>{columnProjects.length}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => setActiveIndex((i) => Math.min(displayStages.length - 1, i + 1))}
              disabled={!canNext}
              hitSlop={10}
              style={[styles.colNavArrow, !canNext && styles.colNavArrowHidden]}
            >
              <Ionicons name="chevron-forward" size={20} color={canNext ? colors.text : colors.textFaint} />
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
          {displayStages.length > 1 ? (
            <Text style={styles.swipeHint}>
              Vuốt ngang để chuyển cột · {activeIndex + 1}/{displayStages.length}
            </Text>
          ) : null}
        </>
      )}

      </View>{/* end fixedTop */}

      {viewMode === 'list' ? (
        <FlatList
          style={styles.listFlex}
          data={pagedListProjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listModeContent, { paddingBottom: 88 + insets.bottom }]}
          initialNumToRender={CARD_PAGE_SIZE}
          maxToRenderPerBatch={CARD_PAGE_SIZE}
          windowSize={7}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.4}
          onEndReached={loadMoreCards}
          ListFooterComponent={
            hasMoreListCards ? (
              <View style={styles.listFooter}>
                <SpinningLoader color={colors.primary} size="small" />
                <Text style={styles.listFooterText}>
                  Đang tải thêm ({pagedListProjects.length}/{listProjects.length})
                </Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={38} color={colors.textFaint} />
              <Text style={styles.emptyText}>
                {filterActive || listStageId !== 'all'
                  ? 'Không tìm thấy dự án phù hợp bộ lọc'
                  : 'Chưa có dự án'}
              </Text>
            </View>
          }
          renderItem={renderListCard}
        />
      ) : (
        <View style={styles.listFlex} {...columnSwipe.panHandlers}>
          <FlatList
            style={styles.listFlex}
            data={pagedProjects}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 88 + insets.bottom }]}
            initialNumToRender={CARD_PAGE_SIZE}
            maxToRenderPerBatch={CARD_PAGE_SIZE}
            windowSize={7}
            removeClippedSubviews
            onEndReachedThreshold={0.4}
            onEndReached={loadMoreCards}
            ListFooterComponent={
              hasMoreCards ? (
                <View style={styles.listFooter}>
                  <SpinningLoader color={colors.primary} size="small" />
                  <Text style={styles.listFooterText}>
                    Đang tải thêm ({pagedProjects.length}/{columnProjects.length})
                  </Text>
                </View>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load('refresh')}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="file-tray-outline" size={38} color={colors.textFaint} />
                <Text style={styles.emptyText}>
                  {filterActive ? 'Không tìm thấy dự án phù hợp bộ lọc' : 'Cột này chưa có dự án'}
                </Text>
              </View>
            }
            renderItem={renderCard}
          />
        </View>
      )}

      <MoveColumnModal
        visible={!!moveModalProject}
        stages={stages}
        currentStageId={moveModalProject?.resolved_column_id ?? moveModalProject?.sx_kanban_column_id}
        onSelect={(stageId) => {
          if (moveModalProject) void moveCardTo(moveModalProject, stageId);
          setMoveModalProject(null);
        }}
        onClose={() => setMoveModalProject(null)}
      />

      <FilterPickerModal
        visible={!!classifyModalProject}
        title="Gắn phân loại"
        options={classifyWorkTypeOptions}
        selectedId={classifyModalProject?.workshop_type_id || ''}
        onSelect={(id) => {
          if (classifyModalProject && id) void assignWorkType(classifyModalProject, id);
          setClassifyModalProject(null);
        }}
        onClose={() => setClassifyModalProject(null)}
      />

      <ProjectCommentModal
        visible={!!commentProject}
        project={commentProject}
        onClose={() => setCommentProject(null)}
        onPosted={(count) => {
          if (!commentProject) return;
          setCommentIndex((prev) => ({
            ...prev,
            [commentProject.id]: {
              count,
              last_at: new Date().toISOString(),
              last_user_id: myId,
            },
          }));
        }}
      />

      <CommentNotificationsModal
        visible={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          void refreshUnread();
        }}
        onOpenProject={(projectId) => void openCommentForProjectId(projectId)}
      />

      <ProductionFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        onReset={() => {
          resetFilters();
          setFilterSheetOpen(false);
        }}
        search={search}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        filterPhone={filterPhone}
        onPhoneChange={setFilterPhone}
        personOptions={personFilterOptions}
        filterPersonId={filterPersonId}
        onPersonChange={setFilterPersonId}
        showWorkshopPicker={showWorkshopPicker}
        workshopOptions={companyOptions}
        filterCompany={filterCompany}
        onWorkshopChange={applyWorkshopFilter}
        showDealCompanyPicker={showDealCompanyFilter}
        dealCompanyOptions={dealCompanyPickerOptions}
        filterDealCompany={filterDealCompany}
        onDealCompanyChange={(id) => {
          setFilterDealCompany(id);
          setFilterWorkTypeId('');
        }}
        dealCompanyReadOnlyLabel={!canPickDealCompany ? selectedDealCompanyLabel : undefined}
        workTypeOptions={workTypeOptions}
        filterWorkTypeId={filterWorkTypeId}
        onWorkTypeChange={setFilterWorkTypeId}
      />

      <FilterPickerModal
        visible={colPickerOpen}
        title="Chọn cột"
        options={columnPickerOptions}
        selectedId={activeStage?.id || ''}
        onSelect={(id) => {
          const idx = displayStages.findIndex((s) => String(s.id) === String(id));
          if (idx >= 0) setActiveIndex(idx);
        }}
        onClose={() => setColPickerOpen(false)}
      />

      <FilterPickerModal
        visible={quickPicker === 'person'}
        title="Người phụ trách SX"
        options={personFilterOptions}
        selectedId={filterPersonId}
        onSelect={setFilterPersonId}
        onClose={() => setQuickPicker(null)}
      />
      <FilterPickerModal
        visible={quickPicker === 'workshop'}
        title="Công ty sản xuất (xưởng)"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={applyWorkshopFilter}
        onClose={() => setQuickPicker(null)}
      />
      <FilterPickerModal
        visible={quickPicker === 'deal'}
        title="Công ty đặt hàng"
        options={dealCompanyPickerOptions}
        selectedId={filterDealCompany}
        onSelect={(id) => {
          setFilterDealCompany(id);
          setFilterWorkTypeId('');
        }}
        onClose={() => setQuickPicker(null)}
      />
      <FilterPickerModal
        visible={quickPicker === 'workType'}
        title="Phân loại pipeline"
        options={workTypeOptions}
        selectedId={filterWorkTypeId}
        onSelect={setFilterWorkTypeId}
        onClose={() => setQuickPicker(null)}
      />

      <Toast state={toast} />
    </View>
  );
}

type KanbanCardProps = {
  item: ProductionProject;
  styles: ReturnType<typeof createKanbanStyles>;
  colors: AppColors;
  stages: KanbanStage[];
  accent: string;
  activeStageName?: string;
  commentCount: number;
  isMoving: boolean;
  isOrphanColumn: boolean;
  onOpen: (id: string) => void;
  onComment: (p: ProductionProject) => void;
  onMove: (p: ProductionProject) => void;
  onClassify: (p: ProductionProject) => void;
};

const KanbanCard = memo(function KanbanCard({
  item,
  styles,
  colors,
  stages,
  accent,
  activeStageName,
  commentCount,
  isMoving,
  isOrphanColumn,
  onOpen,
  onComment,
  onMove,
  onClassify,
}: KanbanCardProps) {
  const workTypeName = item.workshop_type_name;
  const workTypeColor = workTypeName ? typeColor(workTypeName) : null;
  const stageName = item.stage_name;
  const avatarBg = avatarColor(item.customer_name);
  const avatarLetters = initials(item.customer_name);
  const vcTag = getVcTag(item, stages);
  const personName = item.production_person_name?.trim() || null;
  const delivered = projectIsShipped(item) || countsAsCompletedRevenue(item, stages);
  const updatedStr = formatDateTime(item.updated_at || item.created_at);

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Pressable onPress={() => onOpen(item.id)}>
      {/* Row 1: code + tags */}
      <View style={styles.cardRow1}>
        <Text style={styles.cardCode}>{item.code}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardTagsScroll}
          contentContainerStyle={styles.cardTags}
        >
          {workTypeName ? (
            <View style={[styles.tag, styles.tagGap, { backgroundColor: `${workTypeColor}22`, borderColor: workTypeColor! }]}>
              <Text style={[styles.tagText, { color: workTypeColor! }]} numberOfLines={1}>{workTypeName}</Text>
            </View>
          ) : null}
          {stageName && stageName !== activeStageName ? (
            <View style={[styles.tagStage, styles.tagGap]}>
              <Text style={styles.tagStageText} numberOfLines={1}>{stageName}</Text>
            </View>
          ) : null}
          {vcTag ? (
            <View style={[styles.tag, styles.tagGap, { backgroundColor: vcTag.bg, borderColor: vcTag.border }]}>
              <Text style={[styles.tagText, { color: vcTag.color }]}>{vcTag.label}</Text>
            </View>
          ) : null}
          {item.is_overdue && !delivered ? (
            <View style={[styles.tagOverdue, styles.tagGap]}>
              <Text style={styles.tagOverdueText}>Quá hạn</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>

      <View style={styles.customerRow}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.avatarText}>{avatarLetters}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.customer_name || '—'}
            {item.customer_phone ? (
              <Text style={styles.customerPhone}> · {item.customer_phone}</Text>
            ) : null}
          </Text>
          {item.company_name ? (
            <Text style={styles.companyName} numberOfLines={1}>{item.company_name}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.personRow}>
        <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} />
        <Text style={styles.personLabel}>Phụ trách:</Text>
        <Text style={styles.personName} numberOfLines={1}>
          {personName || 'Chưa gán'}
        </Text>
      </View>

      {!item.stage_name ? (
        <Text style={styles.stageHint}>Chưa phân giao đoạn</Text>
      ) : null}

      <KanbanDealTimeline project={item} isDelivered={delivered} />
      </Pressable>

      <View style={styles.cardBottom}>
        <TapHighlight
          style={styles.cardActionBtn}
          onPress={() => onComment(item)}
          accessibilityLabel="Bình luận"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
          {commentCount > 0 ? (
            <View style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>
                {commentCount > 99 ? '99+' : commentCount}
              </Text>
            </View>
          ) : null}
        </TapHighlight>

        <Text style={styles.cardUpdated} numberOfLines={1}>
          {updatedStr ? `Cập nhật lần cuối ${updatedStr}` : ' '}
        </Text>

        {isOrphanColumn ? (
          <TapHighlight
            style={[styles.cardActionBtn, styles.cardActionBtnClassify]}
            onPress={() => onClassify(item)}
            disabled={isMoving}
            accessibilityLabel="Phân loại"
          >
            {isMoving ? (
              <SpinningLoader size="small" color={colors.white} />
            ) : (
              <Ionicons name="layers-outline" size={18} color={colors.white} />
            )}
          </TapHighlight>
        ) : (
          <TapHighlight
            style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
            onPress={() => onMove(item)}
            disabled={isMoving}
            accessibilityLabel="Chuyển cột"
          >
            {isMoving ? (
              <SpinningLoader size="small" color={colors.white} />
            ) : (
              <Ionicons name="swap-horizontal" size={18} color={colors.white} />
            )}
          </TapHighlight>
        )}
      </View>
    </View>
  );
});

function createKanbanStyles(c: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  fixedTop: { flexShrink: 0 },
  listFlex: { flex: 1 },
  center: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: c.textMuted, fontSize: 13 },
  errorText: { color: c.textMuted, textAlign: 'center', fontSize: 13 },
  retryBtn: {
    backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: Radii.md, minHeight: HIT_TARGET, justifyContent: 'center',
  },
  retryText: { color: c.white, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 0,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 6,
  },
  appTitle: { color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  appSub: { color: c.textMuted, fontSize: 12, marginTop: 1 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 2,
  },
  viewModeLbl: {
    color: c.textFaint,
    fontSize: 10,
    fontWeight: '700',
  },
  viewModeBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: c.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    padding: 3,
  },
  viewModeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeBtnOn: { backgroundColor: c.primarySoft },
  iconBtn: {
    width: 38, height: 38, borderRadius: Radii.md,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18,
    borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: c.bg,
  },
  notifBadgeText: { color: c.white, fontSize: 10, fontWeight: '800' },
  commentToast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: Spacing.lg, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: Radii.lg, borderWidth: 1,
    borderColor: c.primary + '55', backgroundColor: c.primarySoft,
  },
  commentToastTitle: { color: c.text, fontSize: 13, fontWeight: '800' },
  commentToastBody: { color: c.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  truncatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: c.warning + '66',
    backgroundColor: c.warning + '18',
  },
  truncatedBannerTxt: { flex: 1, color: c.warning, fontSize: 12, fontWeight: '700', lineHeight: 16 },

  // Search
  searchRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 8,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: Radii.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 14 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radii.md,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterBtnActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  filterBtnTxt: { color: c.text, fontSize: 13, fontWeight: '800' },
  filterBtnTxtActive: { color: c.white },
  filterBtnBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBtnBadgeTxt: { color: c.white, fontSize: 10, fontWeight: '800' },
  activeChipScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 6,
    minHeight: 34,
  },
  activeChipContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 2,
    alignItems: 'center',
    gap: 6,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: Radii.full,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    maxWidth: 180,
  },
  activeChipTxt: { color: c.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  dropdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    borderRadius: Radii.full,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    maxWidth: 210,
    overflow: 'hidden',
  },
  dropdownChipActive: {
    borderColor: colorWithAlpha(c.primary, 0.45),
    backgroundColor: c.primarySoft,
  },
  dropdownChipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 6,
    height: 30,
    flexShrink: 1,
    maxWidth: 180,
  },
  dropdownChipPrefix: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  dropdownChipTxt: {
    color: c.text,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  dropdownChipTxtActive: { color: c.primary },
  dropdownChipClear: {
    width: 32,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: c.border,
  },
  activeChipClear: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: colorWithAlpha(c.primary, 0.35),
  },
  activeChipClearTxt: { color: c.primary, fontSize: 12, fontWeight: '800' },

  // Chips — chiều cao cố định, tránh bị FlatList co
  chipScroll: { height: 36, flexShrink: 0, flexGrow: 0 },
  chipContent: { paddingHorizontal: Spacing.lg, alignItems: 'center', height: 36 },
  chipGap: { marginRight: 6 },
  chip: {
    paddingHorizontal: 14, height: 32, borderRadius: Radii.full,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.textMuted, fontSize: 13, fontWeight: '700', lineHeight: 16 },
  chipTextActive: { color: c.white },
  chipClear: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Compact filter bar — 1 hàng pill
  compactFilterScroll: { height: 34, flexShrink: 0, flexGrow: 0, marginBottom: 4 },
  compactFilterContent: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    height: 34,
    gap: 6,
  },
  compactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: Radii.full,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    maxWidth: 148,
  },
  compactPillActive: {
    borderColor: colorWithAlpha(c.primary, 0.45),
    backgroundColor: c.primarySoft,
  },
  compactPillText: { color: c.textMuted, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  compactPillTextActive: { color: c.primary },
  compactClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },

  // KPI — chiều cao cố định từng ô, tránh chữ chồng
  statsScroll: { height: 58, flexShrink: 0, flexGrow: 0, marginBottom: 2 },
  statsContent: { paddingHorizontal: Spacing.lg, alignItems: 'center', height: 58 },
  statPillGap: { marginLeft: 8 },
  statPill: {
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 72, height: 52,
  },
  statValueBox: { height: 22, justifyContent: 'center', alignItems: 'center', width: '100%' },
  statValue: { fontSize: 17, fontWeight: '800', lineHeight: 20, textAlign: 'center', includeFontPadding: false },
  statLabel: { color: c.textMuted, fontSize: 10, lineHeight: 12, textAlign: 'center', marginTop: 2, includeFontPadding: false },

  // Column header
  colHeaderRow: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 0,
    paddingHorizontal: Spacing.sm, paddingTop: 4, gap: 4,
  },
  colNavArrow: {
    width: 36, height: 36, borderRadius: Radii.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  colNavArrowHidden: { opacity: 0.25 },
  colHeaderCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 4,
  },
  colIcon: { fontSize: 16 },
  colName: { color: c.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  colBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.full,
    minWidth: 26, alignItems: 'center',
  },
  colBadgeText: { color: c.white, fontSize: 12, fontWeight: '800' },

  // Dots
  dotsScroll: { height: 24, flexShrink: 0, flexGrow: 0 },
  dotsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: Spacing.lg, height: 24,
  },
  dotGap: { marginLeft: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
  swipeHint: {
    textAlign: 'center',
    color: c.textFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 2,
  },

  // Cards
  listContent: { paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 24 },
  listModeContent: { paddingTop: 4, paddingBottom: 24 },
  card: {
    backgroundColor: c.card, borderRadius: Radii.lg,
    borderWidth: 1, borderColor: c.border,
    borderLeftWidth: 4, padding: 12, marginBottom: 10,
  },

  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardCode: { color: c.textFaint, fontSize: 11, fontWeight: '700', flexShrink: 0 },
  cardTagsScroll: { flex: 1, maxHeight: 24 },
  cardTags: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  tagGap: { marginRight: 4 },
  tag: {
    borderRadius: Radii.full, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagText: { fontSize: 10, fontWeight: '700' },
  tagStage: {
    backgroundColor: `${c.warning}22`, borderRadius: Radii.full,
    borderWidth: 1, borderColor: c.warning,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagStageText: { color: c.warning, fontSize: 10, fontWeight: '700' },
  tagOverdue: {
    backgroundColor: c.dangerSoft, borderRadius: Radii.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagOverdueText: { color: c.danger, fontSize: 10, fontWeight: '700' },

  cardName: { color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },

  customerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.white, fontSize: 12, fontWeight: '800' },
  customerName: { color: c.text, fontSize: 13, fontWeight: '600' },
  customerPhone: { color: c.textMuted, fontWeight: '400' },
  companyName: { color: c.textFaint, fontSize: 11, marginTop: 1 },

  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, marginBottom: 2,
    backgroundColor: c.cardAlt, borderRadius: Radii.sm,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: c.border,
  },
  personLabel: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
  personName: { flex: 1, color: c.text, fontSize: 12, fontWeight: '700' },

  stageHint: { color: c.textFaint, fontSize: 11, marginBottom: 4, fontStyle: 'italic' },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  cardUpdated: {
    flex: 1,
    minWidth: 0,
    color: c.textFaint,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardActionBtn: {
    width: 38, height: 38, borderRadius: Radii.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border,
  },
  cardActionBtnPrimary: {
    backgroundColor: c.primary, borderColor: c.primaryDark,
  },
  cardActionBtnClassify: {
    backgroundColor: '#0D9488', borderColor: '#0F766E',
  },
  actionBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: c.danger, borderWidth: 1.5, borderColor: c.card,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBadgeText: { color: c.white, fontSize: 9, fontWeight: '800', lineHeight: 11 },

  emptyBox: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  listFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  listFooterText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  });
}
