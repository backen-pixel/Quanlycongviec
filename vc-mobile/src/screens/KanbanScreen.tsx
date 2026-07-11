import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import ProductionFilterSheet from '../components/ProductionFilterSheet';
import MoveColumnModal from '../components/MoveColumnModal';
import ProjectCommentModal from '../components/ProjectCommentModal';
import Toast, { type ToastKind, type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNotifications } from '../context/NotificationContext';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  fetchCompanies,
  fetchClientCompanies,
  fetchWorkshopOptionsForDeal,
  assignProjectWorkshopType,
  fetchProductionBoard,
  fetchProductionProject,
  fetchProjectCommentIndex,
  fetchWorkshopTypes,
  moveProjectToStage,
  type BoardFilters,
  type CommentIndexEntry,
  type CompanyOption,
  type WorkshopTypeOption,
} from '../lib/logisticsApi';
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
import { useTheme } from '../context/ThemeContext';
import { type AppColors, colorWithAlpha, getTaskProgressColor, HIT_TARGET, Radii, Spacing, stageColor } from '../theme';
import type { KanbanStage, ProductionBoard, ProductionProject } from '../types';

type QuickFilter = 'all' | 'mine' | 'overdue' | 'today';
type FilterSheetTab = 'scope' | 'pipeline';

function shortFilterLabel(label: string | undefined, fallback: string, max = 15): string {
  const t = (label || fallback).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Số card render ban đầu + mỗi lần tải thêm khi cuộn — giúp cột nhiều dự án mở nhanh. */
const CARD_PAGE_SIZE = 10;

const INTAKE_BUCKET = 'delivery_pending';
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

type VcTag = { label: 'Chờ VC' | 'Đang VC' | 'Lắp đặt' | 'Bảo hành'; bg: string; border: string; color: string };

function getVcTag(p: ProductionProject): VcTag | null {
  const status = String(p.status || '');
  if (p.vc_intake || status === 'shipping') {
    return { label: 'Chờ VC', bg: '#33415533', border: '#94A3B8', color: '#CBD5E1' };
  }
  if (status === 'installing') {
    return { label: 'Lắp đặt', bg: '#F59E0B33', border: '#F59E0B', color: '#FCD34D' };
  }
  if (status === 'warranty') {
    return { label: 'Bảo hành', bg: '#0EA5E933', border: '#38BDF8', color: '#7DD3FC' };
  }
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
  const { openProjectDetail, openMessages } = useRootNavigation();
  const myId = user?.id || user?.userId || null;
  const { unreadTotal: messageUnread } = useMessenger();

  const [board, setBoard] = useState<ProductionBoard>({ stages: [], projects: [], kpis: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
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
  const [workTypePickerOpen, setWorkTypePickerOpen] = useState(false);
  const [workshopPickerOpen, setWorkshopPickerOpen] = useState(false);
  const [dealCompanyPickerOpen, setDealCompanyPickerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterSheetTab, setFilterSheetTab] = useState<FilterSheetTab>('scope');
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [moveModalProject, setMoveModalProject] = useState<ProductionProject | null>(null);
  const [classifyModalProject, setClassifyModalProject] = useState<ProductionProject | null>(null);
  const [commentProject, setCommentProject] = useState<ProductionProject | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commentIndex, setCommentIndex] = useState<Record<string, CommentIndexEntry>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const companyForTypes = filterCompany || user?.company_id || null;

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

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const filters: BoardFilters = {
        companyId: filterCompanyRef.current || undefined,
        dealCompanyId: filterDealCompanyRef.current || undefined,
        workshopTypeId: filterWorkTypeIdRef.current || undefined,
      };
      const data = await fetchProductionBoard(mode === 'silent', filters);
      setBoard(data);
      setActiveIndex((prev) => Math.min(prev, Math.max(0, data.stages.length - 1)));
    } catch (e) {
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Đồng bộ refs với state để load() luôn dùng filter mới nhất.
  useEffect(() => { filterCompanyRef.current = filterCompany; }, [filterCompany]);
  useEffect(() => { filterDealCompanyRef.current = dealCompanyParam || ''; }, [dealCompanyParam]);
  useEffect(() => { filterWorkTypeIdRef.current = filterWorkTypeId; }, [filterWorkTypeId]);

  useEffect(() => { void load('init'); }, [load]);

  // Re-fetch board khi company hoặc phân loại đổi (bỏ qua lần mount đầu tiên).
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    setActiveIndex(0);
    void load('init');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompany, filterDealCompany, dealCompanyParam, filterWorkTypeId]);

  useProductionRealtime({
    onRefresh: () => load('silent'),
    modes: ['board', 'task'],
  });

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
   * Khi đã chọn công ty (hoặc user thuộc 1 công ty) mà chưa chọn phân loại → tự chọn loại đầu tiên.
   * Không ghi đè khi user chủ động chọn «Chưa phân loại» (none).
   */
  useEffect(() => {
    if (workTypesCompanyId !== companyForTypes) return;

    const hasCompanyContext = !!filterCompany || (!isSysAdmin && !!user?.company_id);
    if (!hasCompanyContext) {
      if (!companyForTypes && filterWorkTypeId && filterWorkTypeId !== 'none') {
        setFilterWorkTypeId('');
      }
      return;
    }

    if (!workTypes.length) {
      if (filterWorkTypeId && filterWorkTypeId !== 'none') setFilterWorkTypeId('');
      return;
    }

    if (!filterWorkTypeId) {
      setFilterWorkTypeId(String(workTypes[0].id));
      return;
    }
    if (filterWorkTypeId === 'none') return;

    const stillExists = workTypes.some((w) => String(w.id) === String(filterWorkTypeId));
    if (!stillExists) setFilterWorkTypeId(String(workTypes[0].id));
  }, [
    workTypes,
    workTypesCompanyId,
    companyForTypes,
    filterWorkTypeId,
    filterCompany,
    isSysAdmin,
    user?.company_id,
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
  const showCompactFilters = showWorkshopPicker || showDealCompanyFilter || workTypes.length > 0;

  const workTypeOptions = useMemo(
    () => [
      { id: '', label: 'Tất cả phân loại' },
      { id: 'none', label: 'Chưa phân loại' },
      ...workTypes.map((t) => ({ id: t.id, label: t.name })),
    ],
    [workTypes],
  );

  const classifyWorkTypeOptions = useMemo(
    () => workTypes.map((t) => ({ id: t.id, label: t.name })),
    [workTypes],
  );

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
      if (quickFilter === 'mine') {
        const mine = String(myId || '');
        const isMine =
          String(p.logistics_person_id || '') === mine
          || String(p.installer_person_id || '') === mine;
        if (!isMine) return false;
      }
      if (quickFilter === 'overdue' && !p.is_overdue) return false;
      if (quickFilter === 'today' && !isToday(p.production_deadline || p.deadline)) return false;
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
  }, [board.projects, search, quickFilter, myId, filterWorkTypeId, dealCompanyExternalFilter]);

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
  const accent = stageColor(activeStage?.color, activeIndex);

  const projectsByStage = useMemo(() => {
    const map = new Map<string, ProductionProject[]>();
    displayStages.forEach((s) => map.set(s.id, []));
    filteredProjects.forEach((p) => {
      // Orphan project → vào cột ảo (nếu có)
      if (!p.workshop_type_id && map.has(ORPHAN_COL_ID)) {
        map.get(ORPHAN_COL_ID)!.push(p);
        return;
      }
      const key = p.resolved_column_id;
      if (key && map.has(key)) map.get(key)!.push(p);
    });
    return map;
  }, [displayStages, filteredProjects]);

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
  }, [activeStage?.id, search, quickFilter, filterWorkTypeId, filterCompany]);

  const loadMoreCards = useCallback(() => {
    setVisibleCount((prev) => (prev < columnProjects.length ? prev + CARD_PAGE_SIZE : prev));
  }, [columnProjects.length]);

  // Chỉ tải comment-index cho các card ĐANG hiển thị (cột active + phân trang),
  // không tải cho toàn bộ vài nghìn dự án — tránh URL khổng lồ và query nặng.
  // Merge vào map cũ để badge các cột đã xem trước đó không mất.
  useEffect(() => {
    const ids = pagedProjects.map((p) => p.id).filter(Boolean);
    if (!ids.length) return;
    void fetchProjectCommentIndex(ids)
      .then((idx) => setCommentIndex((prev) => ({ ...prev, ...idx })))
      .catch(() => {});
  }, [pagedProjects]);

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
    || !!filterCompany || !!filterDealCompany || !!filterWorkTypeId;

  const resetFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setQuickFilter('all');
    setFilterCompany('');
    setFilterDealCompany('');
    setFilterWorkTypeId('');
  }, []);

  const moveCardTo = useCallback(
    async (project: ProductionProject, targetStageId: string) => {
      const target = stages.find((s) => String(s.id) === String(targetStageId));
      if (!target) return;
      const fromColId = project.resolved_column_id ?? project.vc_kanban_column_id ?? null;
      const isIntake = target.bucket_slug === INTAKE_BUCKET;
      setMovingId(project.id);
      setBoard((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === project.id
            ? { ...p, vc_kanban_column_id: target.id, resolved_column_id: target.id, vc_intake: isIntake }
            : p,
        ),
      }));
      try {
        const result = await moveProjectToStage(project.id, target.id, {
          currentStageId: fromColId,
          isIntake,
          companyId: project.company_id ?? user?.company_id ?? null,
        });
        const newColId = result.vc_kanban_column_id ?? target.id;
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  vc_kanban_column_id: newColId,
                  resolved_column_id: newColId,
                  vc_intake: isIntake,
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
              ? { ...p, vc_kanban_column_id: fromColId, resolved_column_id: fromColId }
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
    const list = filteredProjects;
    const intakeStage = stages.find((s) => s.bucket_slug === INTAKE_BUCKET);
    const shipping = list.filter((p) => p.status === 'shipping' || p.stage_slug === 'delivery').length;
    const installing = list.filter((p) => p.status === 'installing' || p.stage_slug === 'installation').length;
    const warranty = list.filter((p) => p.status === 'warranty' || p.stage_slug === 'customer-care').length;
    const completed = list.filter((p) => p.status === 'completed').length;
    const intake = list.filter((p) => p.resolved_column_id === intakeStage?.id || p.vc_intake).length;
    const overdue = list.filter((p) => p.is_overdue).length;
    return [
      { label: 'Tổng', value: list.length, color: colors.text },
      { label: 'Chờ VC', value: intake, color: '#94A3B8' },
      { label: 'Vận chuyển', value: shipping, color: colors.primary },
      { label: 'Lắp đặt', value: installing, color: '#F59E0B' },
      { label: 'Bảo hành', value: warranty, color: '#38BDF8' },
      { label: 'Hoàn tất', value: completed, color: colors.success },
      ...(overdue > 0 ? [{ label: 'Quá hạn', value: overdue, color: colors.danger }] : []),
    ];
  }, [filteredProjects, stages, colors]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
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
          <Text style={styles.appTitle}>Vận chuyển lắp đặt</Text>
          <Text style={styles.appSub}>Bảng điều hành vận chuyển lắp đặt</Text>
        </View>
        <View style={styles.headerBtns}>
          <TapHighlight style={styles.iconBtn} onPress={() => openMessages('chats')} hitSlop={8}>
            <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
            {messageUnread > 0 ? (
              <View style={[styles.notifBadge, styles.msgBadge]}>
                <Text style={styles.notifBadgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
              </View>
            ) : null}
          </TapHighlight>
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

      {/* ── SEARCH ── */}
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
      </View>

      {/* ── QUICK FILTER CHIPS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
        nestedScrollEnabled
      >
        {([
          { id: 'all', label: 'Tất cả' },
          { id: 'mine', label: 'Của tôi' },
          { id: 'overdue', label: 'Quá hạn' },
          { id: 'today', label: 'Hôm nay' },
        ] as const).map((c, idx, arr) => {
          const active = quickFilter === c.id;
          return (
            <TapHighlight
              key={c.id}
              onPress={() => setQuickFilter(c.id)}
              style={[styles.chip, active && styles.chipActive, idx < arr.length - 1 && styles.chipGap]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {c.label}
              </Text>
            </TapHighlight>
          );
        })}
        {filterActive ? (
          <Pressable
            onPress={resetFilters}
            style={[styles.chipClear, styles.chipGap]}
          >
            <Ionicons name="close" size={13} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>

      {/* ── COMPACT FILTER BAR — 1 hàng, đủ chức năng ── */}
      {showCompactFilters ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.compactFilterScroll}
          contentContainerStyle={styles.compactFilterContent}
          nestedScrollEnabled
        >
          {showWorkshopPicker ? (
            <Pressable
              style={[styles.compactPill, filterCompany ? styles.compactPillActive : null]}
              onPress={() => setWorkshopPickerOpen(true)}
            >
              <Ionicons
                name="business-outline"
                size={13}
                color={filterCompany ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.compactPillText, filterCompany ? styles.compactPillTextActive : null]}
                numberOfLines={1}
              >
                {shortFilterLabel(selectedWorkshopLabel, 'Xưởng')}
              </Text>
              <Ionicons name="chevron-down" size={11} color={colors.textFaint} />
            </Pressable>
          ) : null}
          {showDealCompanyFilter ? (
            <Pressable
              style={[styles.compactPill, filterDealCompany ? styles.compactPillActive : null]}
              onPress={() => {
                if (canPickDealCompany) setDealCompanyPickerOpen(true);
                else {
                  setFilterSheetTab('scope');
                  setFilterSheetOpen(true);
                }
              }}
            >
              <Ionicons
                name="storefront-outline"
                size={13}
                color={filterDealCompany ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.compactPillText, filterDealCompany ? styles.compactPillTextActive : null]}
                numberOfLines={1}
              >
                {shortFilterLabel(selectedDealCompanyLabel, 'Đặt hàng')}
              </Text>
              <Ionicons name="chevron-down" size={11} color={colors.textFaint} />
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.compactPill, filterWorkTypeId ? styles.compactPillActive : null]}
            onPress={() => setWorkTypePickerOpen(true)}
          >
            <Ionicons
              name="layers-outline"
              size={13}
              color={filterWorkTypeId ? colors.primary : colors.textMuted}
            />
            <Text
              style={[styles.compactPillText, filterWorkTypeId ? styles.compactPillTextActive : null]}
              numberOfLines={1}
            >
              {shortFilterLabel(filterWorkTypeId ? selectedWorkTypeLabel : undefined, 'Phân loại')}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.textFaint} />
          </Pressable>
          {scopeFilterCount > 0 ? (
            <Pressable style={styles.compactClear} onPress={resetFilters} hitSlop={6}>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      {/* ── KPI PILLS ── */}
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

      {/* ── COLUMN HEADER + DOT NAV ── */}
      <View style={styles.colHeaderRow}>
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

      {/* Dot indicator */}
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

      </View>{/* end fixedTop */}

      {/* ── CARD LIST ── */}
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
              <ActivityIndicator color={colors.primary} size="small" />
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
        renderItem={({ item }) => {
          const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
          const progressColor = getTaskProgressColor(progress, colors);
          const isMoving = movingId === item.id;
          const workTypeName = item.workshop_type_name;
          const workTypeColor = workTypeName ? typeColor(workTypeName) : null;
          const stageName = item.stage_name;
          const avatarBg = avatarColor(item.customer_name);
          const avatarLetters = initials(item.customer_name);
          const deadlineStr = formatDate(item.production_deadline || item.deadline);
          const createdStr = formatDate(item.created_at);
          const vcTag = getVcTag(item);
          const personName =
            item.logistics_person_name?.trim()
            || item.installer_person_name?.trim()
            || null;
          const commentCount = commentIndex[item.id]?.count ?? 0;

          return (
            <View style={[styles.card, { borderLeftColor: accent }]}>
              <Pressable onPress={() => openProjectDetail(item.id)}>
              {/* Row 1: code + tags + date */}
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
                  {stageName && stageName !== activeStage?.name ? (
                    <View style={[styles.tagStage, styles.tagGap]}>
                      <Text style={styles.tagStageText} numberOfLines={1}>{stageName}</Text>
                    </View>
                  ) : null}
                  {vcTag ? (
                    <View style={[styles.tag, styles.tagGap, { backgroundColor: vcTag.bg, borderColor: vcTag.border }]}>
                      <Text style={[styles.tagText, { color: vcTag.color }]}>{vcTag.label}</Text>
                    </View>
                  ) : null}
                  {item.is_overdue ? (
                    <View style={[styles.tagOverdue, styles.tagGap]}>
                      <Text style={styles.tagOverdueText}>Quá hạn</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>

              {/* Card name */}
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>

              {/* Row 2: avatar + customer */}
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

              {/* Người phụ trách */}
              <View style={styles.personRow}>
                <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} />
                <Text style={styles.personLabel}>VC/LĐ:</Text>
                <Text style={styles.personName} numberOfLines={1}>
                  {personName || 'Chưa gán'}
                </Text>
              </View>

              {/* Stage info if in intake/unassigned */}
              {!item.stage_name ? (
                <Text style={styles.stageHint}>Chưa phân giao đoạn</Text>
              ) : null}

              {/* Tasks + progress */}
              {(item.task_total || 0) > 0 ? (
                <View style={styles.progressSection}>
                  <View style={styles.taskCountRow}>
                    <Ionicons name="checkbox-outline" size={13} color={progressColor} />
                    <Text style={styles.taskCount}>
                      <Text style={{ color: progressColor, fontWeight: '800' }}>{item.done_tasks || 0}</Text>
                      <Text style={{ color: colors.textMuted }}>/{item.task_total} nhiệm vụ</Text>
                    </Text>
                  </View>
                  <View style={styles.progressRow}>
                    <View style={[styles.progressTrack, { backgroundColor: colorWithAlpha(progressColor, 0.18) }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress}%`, backgroundColor: progressColor },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressPct, { color: progressColor }]}>{progress}%</Text>
                  </View>
                </View>
              ) : null}

              </Pressable>
              {/* Bottom: deadline + created + icon actions */}
              <View style={styles.cardBottom}>
                <View style={styles.cardBottomLeft}>
                  <View style={styles.dateMetaBox}>
                    <View style={styles.dateMetaItem}>
                      <Ionicons
                        name="calendar-outline"
                        size={14}
                        color={item.is_overdue ? colors.danger : colors.primary}
                      />
                      <View style={styles.dateMetaTextWrap}>
                        <Text style={styles.dateMetaLabel}>Deadline</Text>
                        <Text
                          style={[
                            styles.dateMetaValue,
                            item.is_overdue && styles.dateMetaValueOverdue,
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
                      <Ionicons name="time-outline" size={14} color={colors.textMuted} />
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
                  <TapHighlight
                    style={styles.cardActionBtn}
                    onPress={() => setCommentProject(item)}
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
                  {isOrphanColumn ? (
                    <TapHighlight
                      style={[styles.cardActionBtn, styles.cardActionBtnClassify]}
                      onPress={() => {
                        if (!classifyWorkTypeOptions.length) {
                          showToast('Chưa cấu hình phân loại cho công ty này', 'error');
                          return;
                        }
                        setClassifyModalProject(item);
                      }}
                      disabled={isMoving}
                      accessibilityLabel="Phân loại"
                    >
                      {isMoving ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Ionicons name="layers-outline" size={18} color={colors.white} />
                      )}
                    </TapHighlight>
                  ) : (
                    <TapHighlight
                      style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
                      onPress={() => setMoveModalProject(item)}
                      disabled={isMoving}
                      accessibilityLabel="Chuyển cột"
                    >
                      {isMoving ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Ionicons name="swap-horizontal" size={18} color={colors.white} />
                      )}
                    </TapHighlight>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      <MoveColumnModal
        visible={!!moveModalProject}
        stages={stages}
        currentStageId={moveModalProject?.resolved_column_id ?? moveModalProject?.vc_kanban_column_id}
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
        initialTab={filterSheetTab}
        onClose={() => setFilterSheetOpen(false)}
        onReset={() => {
          resetFilters();
          setFilterSheetOpen(false);
        }}
        showWorkshopPicker={showWorkshopPicker}
        workshopOptions={companyOptions}
        filterCompany={filterCompany}
        onWorkshopChange={(id) => {
          setFilterCompany(id);
          setFilterWorkTypeId('');
        }}
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
        visible={workshopPickerOpen}
        title="Công ty vận chuyển"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={(id) => {
          setFilterCompany(id);
          setFilterWorkTypeId('');
        }}
        onClose={() => setWorkshopPickerOpen(false)}
      />

      <FilterPickerModal
        visible={dealCompanyPickerOpen}
        title="Công ty đặt hàng"
        options={dealCompanyPickerOptions}
        selectedId={filterDealCompany}
        onSelect={(id) => {
          setFilterDealCompany(id);
          setFilterWorkTypeId('');
        }}
        onClose={() => setDealCompanyPickerOpen(false)}
      />

      <FilterPickerModal
        visible={workTypePickerOpen}
        title="Phân loại pipeline"
        options={workTypeOptions}
        selectedId={filterWorkTypeId}
        onSelect={setFilterWorkTypeId}
        onClose={() => setWorkTypePickerOpen(false)}
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

      <Toast state={toast} />
    </View>
  );
}

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
  headerBtns: { flexDirection: 'row', gap: 8 },
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
  msgBadge: { backgroundColor: '#6C5CE7' },
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

  // Search
  searchRow: { paddingHorizontal: Spacing.lg, paddingBottom: 8, flexShrink: 0 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: Radii.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 14 },

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

  // Cards
  listContent: { paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 24 },
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

  progressSection: { marginTop: 6 },
  taskCountRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  taskCount: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: {
    flex: 1, height: 8, borderRadius: Radii.full,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: Radii.full },
  progressPct: { fontSize: 11, fontWeight: '800', width: 34, textAlign: 'right' },

  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, gap: 8,
  },
  cardBottomLeft: { flex: 1, minWidth: 0 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
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
  dateMetaBox: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: c.cardAlt,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
  },
  dateMetaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  dateMetaTextWrap: { flex: 1, minWidth: 0 },
  dateMetaLabel: { color: c.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  dateMetaValue: { color: c.text, fontSize: 12, fontWeight: '800', marginTop: 1 },
  dateMetaValueOverdue: { color: c.danger },
  dateMetaValueEmpty: { color: c.textMuted, fontWeight: '600' },
  dateMetaDivider: { width: 1, backgroundColor: c.border, marginVertical: 2 },

  emptyBox: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  listFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  listFooterText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  });
}
