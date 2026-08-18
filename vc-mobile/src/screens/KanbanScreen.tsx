import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import CreateDealModal from '../components/CreateDealModal';
import CreateProjectFab from '../components/CreateProjectFab';
import TapHighlight from '../components/TapHighlight';
import FilterPickerModal from '../components/FilterPickerModal';
import ProductionFilterSheet, { type PhoneFilterId } from '../components/ProductionFilterSheet';
import MoveColumnModal from '../components/MoveColumnModal';
import PersonRoleChip from '../components/PersonRoleChip';
import ProjectCommentModal from '../components/ProjectCommentModal';
import VcListCard from '../components/VcListCard';
import Toast, { type ToastKind, type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import type { MainTabParamList } from '../navigation/MainTabs';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  fetchCompanies,
  fetchClientCompanies,
  fetchWorkshopOptionsForDeal,
  fetchProductionBoard,
  fetchProductionProject,
  fetchCommentsIndexForProjects,
  fetchWorkshopTypes,
  fetchCompanyRegions,
  moveProjectToStage,
  resolveProjectDealId,
  vcListStageLabel,
  type BoardFilters,
  type CommentIndexEntry,
  type CompanyOption,
  type RegionOption,
  type WorkshopTypeOption,
} from '../lib/logisticsApi';
import {
  getCachedBoard,
  isCachedBoardFresh,
  patchCachedProjectById,
  setCachedBoard,
} from '../lib/logisticsBoardCache';
import {
  isMetallaOrHucabiCompanyId,
  isInstallVcStage,
  isCompanyScopedAdmin,
  isSystemAdmin,
  productionCreateCompanyOptions,
  projectHasCustomerPhone,
  projectMatchesDealCompanyExternalFilter,
  projectMatchesPerson,
  resolveDealCompanyExternalFilter,
  resolveDealCompanyParam,
  workshopCompaniesForCrossViewer,
  type ClientCompanyOption,
} from '../lib/productionFilters';
import { loadKanbanFilters, saveKanbanFilters, subscribeSharedFilters } from '../lib/kanbanFilterStorage';
import { loadCommentSeenMap, markProjectCommentsSeen } from '../lib/notificationApi';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import { useTheme } from '../context/ThemeContext';
import {
  computeVcBoardKpis,
  findStageIndexForKpiFocus,
  projectIsDeadlineOverdue,
  type VcKpiFocusKey,
} from '../lib/vcBoardKpis';
import { type AppColors, colorWithAlpha, HIT_TARGET, Radii, Spacing, stageColor } from '../theme';
import type { KanbanStage, ProductionBoard, ProductionProject } from '../types';

type QuickFilter = 'all' | 'mine' | 'overdue' | 'today';
type FilterSheetTab = 'scope' | 'pipeline';
type ViewMode = 'kanban' | 'list';

const VIEW_MODE_KEY = 'vc_kanban_view_mode_v1';
const LIST_PAGE_SIZE = 20;
const INTAKE_BUCKET = 'delivery_pending';

/** Cập nhật status/slug theo cột đích — để KPI + badge đổi ngay khi chuyển cột. */
function projectPatchForStage(target: KanbanStage, opts?: { jumpedToInstall?: boolean }): Partial<ProductionProject> {
  const isIntake = target.bucket_slug === INTAKE_BUCKET
    || String(target.id || '').startsWith('__vc_intake');
  const slug = String(
    target.bucket_slug || target.slug || target.workflow_stage?.slug || '',
  ).trim() || null;
  const name = String(target.name || '').toLowerCase();
  let status: string = 'shipping';
  if (opts?.jumpedToInstall || isInstallVcStage(target)) status = 'installing';
  else if (
    slug === 'customer-care'
    || slug?.includes('warranty')
    || slug?.includes('issue')
    || slug?.includes('phat_sinh')
    || slug?.includes('phatsinh')
    || name.includes('bảo hành')
    || name.includes('có vấn đề')
    || name.includes('vấn đề')
    || name.includes('phát sinh')
    || name.includes('phat sinh')
  ) status = 'warranty';
  else if (slug === 'completed' || name.includes('hoàn thành') || name.includes('hoàn tất')) {
    status = 'completed';
  } else if (isIntake) {
    status = 'shipping';
  }
  return {
    vc_kanban_column_id: target.id,
    resolved_column_id: target.id,
    vc_intake: isIntake,
    stage_slug: slug,
    status,
  };
}

function shortFilterLabel(label: string | undefined, fallback: string, max = 15): string {
  const t = (label || fallback).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Số card render ban đầu + mỗi lần tải thêm khi cuộn — giúp cột nhiều dự án mở nhanh. */
const CARD_PAGE_SIZE = 10;

const REGION_NONE = '__none__';

/** Khớp web `projectMatchesStaffRegion` — ưu tiên region trên deal CRM. */
function projectMatchesRegion(project: ProductionProject, filterRegion: string): boolean {
  if (!filterRegion) return true;
  const ids = new Set<string>();
  if (project.region_id) ids.add(String(project.region_id));
  for (const d of project.crm_deals || []) {
    if (d?.region_id) ids.add(String(d.region_id));
  }
  if (filterRegion === REGION_NONE) return ids.size === 0;
  return ids.has(String(filterRegion));
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

/** Tuổi thẻ theo ngày tạo — giống LogisticsDashboard web. */
function calculateDays(createdAt?: string | null): string {
  if (!createdAt) return '';
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days === 0) return 'Hôm nay';
  if (days === 1) return '1 ngày';
  if (days < 7) return `${days} ngày`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? '1 tuần' : `${weeks} tuần`;
}

function isNewProject(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < 86400000;
}

function cardTitleOf(p: ProductionProject): string {
  const deals = Array.isArray(p.crm_deals) ? p.crm_deals : [];
  const primary = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  const title = (primary?.title || '').trim();
  return title || p.name || p.code || '';
}

function crmPersonName(p: ProductionProject): string | null {
  const deals = Array.isArray(p.crm_deals) ? p.crm_deals : [];
  const primary = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  const fromDeal = primary?.assignee?.full_name || primary?.lead_owner?.full_name;
  return (fromDeal || p.sales_person_name || '').trim() || null;
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
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createKanbanStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refreshUnread, commentToast, dismissCommentToast, projectMetaRef, subscribeComment, subscribeSync, joinLeadRooms } = useNotifications();
  const { openProjectDetail } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Kanban'>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Kanban'>>();
  const myId = user?.id || user?.userId || null;

  const [board, setBoard] = useState<ProductionBoard>({ stages: [], projects: [], kpis: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  /** Lọc cột khi xem List — '' = tất cả cột. */
  const [listStageId, setListStageId] = useState('');
  const [listVisibleCount, setListVisibleCount] = useState(LIST_PAGE_SIZE);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDealCompany, setFilterDealCompany] = useState('');
  const [filterWorkTypeId, setFilterWorkTypeId] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPersonId, setFilterPersonId] = useState('');
  const [filterPhone, setFilterPhone] = useState<PhoneFilterId>('');
  const [filterPriority, setFilterPriority] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [clientCompaniesForDeal, setClientCompaniesForDeal] = useState<ClientCompanyOption[]>([]);
  const [workshopOptionsForDeal, setWorkshopOptionsForDeal] = useState<CompanyOption[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkshopTypeOption[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  /** Công ty mà `workTypes` hiện tại thuộc về — tránh auto-chọn nhầm loại công ty cũ. */
  const [workTypesCompanyId, setWorkTypesCompanyId] = useState('');
  const [regionsCompanyId, setRegionsCompanyId] = useState('');
  // Ref cache danh sách công ty — không bao giờ bị xóa khi board reload theo filter.
  const allCompaniesRef = useRef<CompanyOption[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterSheetTab, setFilterSheetTab] = useState<FilterSheetTab>('scope');
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [moveModalProject, setMoveModalProject] = useState<ProductionProject | null>(null);
  const [commentProject, setCommentProject] = useState<ProductionProject | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commentIndex, setCommentIndex] = useState<Record<string, CommentIndexEntry>>({});
  /** projectId → ISO đã xem bình luận (local) — badge ẩn sau khi mở. */
  const [commentSeen, setCommentSeen] = useState<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs để load() luôn dùng giá trị filter mới nhất mà không cần thêm vào deps array.
  const filterCompanyRef = useRef('');
  const filterDealCompanyRef = useRef('');
  const filterWorkTypeIdRef = useRef('');
  const filterRegionRef = useRef('');
  const filterPersonIdRef = useRef('');
  const filterPhoneRef = useRef<PhoneFilterId>('');
  const filterPriorityRef = useRef('');
  const loadSeqRef = useRef(0);
  /** Auto-pick loại SX → persist im lặng, không đánh thức Overview. */
  const quietFilterPersistRef = useRef(false);

  const isAdmin = user?.role === 'admin';
  const isSysAdmin = isSystemAdmin(user);
  // Bộ lọc «Công ty đặt hàng» tạm ẩn — API fetchClientCompanies/fetchWorkshopOptionsForDeal
  // chưa có cho VC (luôn trả rỗng), hiện UI sẽ không có lựa chọn nào để chọn.
  const showDealCompanyFilter = false;
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
    // Khớp LogisticsDashboard.jsx — không trả «tất cả công ty» cho admin công ty.
    if (isSystemAdmin(user)) return companies;
    if (isCompanyScopedAdmin(user) && user?.company_id) {
      const cid = String(user.company_id);
      const own = companies.find((c) => String(c.id) === cid);
      return own ? [own] : [{ id: cid, name: cid }];
    }
    if (workshopOptionsForDeal.length) {
      const ids = new Set(workshopOptionsForDeal.map((w) => String(w.id)));
      const fromApi = companies.filter((c) => ids.has(String(c.id)));
      return fromApi.length ? fromApi : workshopOptionsForDeal;
    }
    if (user?.company_id) return workshopCompaniesForCrossViewer(companies, user);
    return companies;
  }, [companies, user, workshopOptionsForDeal]);

  const showWorkshopPicker = isSystemAdmin(user) || workshopCompanyPickerList.length > 1;
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

  useEffect(() => {
    void loadCommentSeenMap().then(setCommentSeen).catch(() => {});
  }, []);

  const markCommentsSeen = useCallback(async (projectId: string, at?: string) => {
    const pid = String(projectId || '').trim();
    if (!pid) return;
    const stamp = at || new Date().toISOString();
    setCommentSeen((prev) => ({ ...prev, [pid]: stamp }));
    try {
      await markProjectCommentsSeen(pid, stamp);
    } catch {
      /* local badge vẫn ẩn */
    }
  }, []);

  const openCommentsForProject = useCallback((project: ProductionProject) => {
    setCommentProject(project);
    const entry = commentIndex[project.id];
    void markCommentsSeen(project.id, entry?.last_at || new Date().toISOString());
  }, [commentIndex, markCommentsSeen]);

  const openCommentForProjectId = useCallback(
    async (projectId: string) => {
      const local = board.projects.find((p) => String(p.id) === String(projectId));
      if (local) {
        openCommentsForProject(local);
        return;
      }
      try {
        const proj = await fetchProductionProject(projectId);
        openCommentsForProject(proj);
      } catch (e) {
        showToast(formatApiError(e), 'error');
      }
    },
    [board.projects, openCommentsForProject, showToast],
  );

  useEffect(() => {
    for (const p of board.projects) {
      projectMetaRef.current.set(String(p.id), {
        code: p.code,
        name: p.name,
        deal_id: resolveProjectDealId(p),
      });
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
    // NV/admin công ty: cần companyId. Sysadmin: '' = Tất cả công ty.
    if (!filterCompanyRef.current && !isSysAdmin) {
      if (mode === 'init') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      return;
    }
    const filters: BoardFilters = {
      companyId: filterCompanyRef.current || undefined,
      dealCompanyId: filterDealCompanyRef.current || undefined,
      workshopTypeId: filterWorkTypeIdRef.current || undefined,
    };
    const seq = ++loadSeqRef.current;
    const cached = getCachedBoard(filters);
    if (mode !== 'refresh' && cached) {
      setBoard(cached);
      if (mode === 'init') setLoading(false);
    }
    // Silent + init: cache còn tươi → khỏi network (Overview vừa fill).
    if ((mode === 'silent' || mode === 'init') && isCachedBoardFresh(filters) && cached) return;

    if (mode === 'init' && !cached) setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);
    try {
      const data = await fetchProductionBoard(mode === 'refresh', filters);
      if (seq !== loadSeqRef.current) return;
      setCachedBoard(filters, data);
      setBoard(data);
      setActiveIndex((prev) => Math.min(prev, Math.max(0, data.stages.length - 1)));
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isSysAdmin]);

  // Đồng bộ refs với state để load() luôn dùng filter mới nhất.
  useEffect(() => { filterCompanyRef.current = filterCompany; }, [filterCompany]);
  useEffect(() => { filterDealCompanyRef.current = dealCompanyParam || ''; }, [dealCompanyParam]);
  useEffect(() => { filterWorkTypeIdRef.current = filterWorkTypeId; }, [filterWorkTypeId]);
  useEffect(() => { filterRegionRef.current = filterRegion; }, [filterRegion]);
  useEffect(() => { filterPersonIdRef.current = filterPersonId; }, [filterPersonId]);
  useEffect(() => { filterPhoneRef.current = filterPhone; }, [filterPhone]);
  useEffect(() => { filterPriorityRef.current = filterPriority; }, [filterPriority]);

  // Sysadmin: '' = Tất cả — vẫn tải. NV: chờ companyId.
  // Có công ty → đợi work-types hydrate + auto-pick xong rồi mới fetch (tránh double board).
  useEffect(() => {
    if (!filterCompany && !isSysAdmin) return;
    const hasCompanyContext = !!filterCompany || (!isSysAdmin && !!user?.company_id);
    if (hasCompanyContext) {
      if (workTypesCompanyId !== String(companyForTypes || '')) return;
      if (workTypes.length > 0 && !filterWorkTypeId) return;
    }
    setActiveIndex(0);
    void load('init');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filterCompany,
    filterDealCompany,
    dealCompanyParam,
    filterWorkTypeId,
    isSysAdmin,
    workTypes,
    workTypesCompanyId,
    companyForTypes,
    user?.company_id,
  ]);

  useProductionRealtime({
    onRefresh: (info) => {
      const filters: BoardFilters = {
        companyId: filterCompanyRef.current || undefined,
        dealCompanyId: filterDealCompanyRef.current || undefined,
        workshopTypeId: filterWorkTypeIdRef.current || undefined,
      };
      if (info?.patched) {
        const next = getCachedBoard(filters);
        if (next) setBoard(next);
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
  });

  useEffect(() => {
    board.projects.forEach((p) => {
      if (p.id) {
        projectMetaRef.current.set(p.id, {
          code: p.code,
          name: p.name,
          deal_id: resolveProjectDealId(p),
        });
      }
    });
  }, [board.projects, projectMetaRef]);

  useEffect(() => {
    return subscribeSync((evt) => {
      if (evt.type !== 'project:comment_changed') return;
      const pid = evt.payload.project_id ? String(evt.payload.project_id) : '';
      const lid = evt.payload.lead_id != null ? String(evt.payload.lead_id) : '';
      const project = pid
        ? board.projects.find((p) => String(p.id) === pid)
        : lid
          ? board.projects.find((p) => resolveProjectDealId(p) === lid)
          : null;
      if (!project?.id) return;
      void fetchCommentsIndexForProjects([project])
        .then((idx) => {
          const entry = idx[project.id];
          if (entry) {
            setCommentIndex((prev) => ({ ...prev, [project.id]: entry }));
          }
        })
        .catch(() => {});
    });
  }, [subscribeSync, board.projects]);

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
    void AsyncStorage.getItem(VIEW_MODE_KEY).then((raw) => {
      if (raw === 'list' || raw === 'kanban') setViewMode(raw);
    }).catch(() => {});
  }, []);

  const switchViewMode = useCallback((next: ViewMode) => {
    setViewMode(next);
    void AsyncStorage.setItem(VIEW_MODE_KEY, next).catch(() => {});
    if (next === 'list') setListVisibleCount(LIST_PAGE_SIZE);
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

  useEffect(() => {
    if (!companyForTypes) {
      setRegions([]);
      setRegionsCompanyId('');
      return;
    }
    let cancel = false;
    void fetchCompanyRegions(companyForTypes, { forModule: 'logistics' })
      .then((list) => {
        if (cancel) return;
        setRegions(list);
        setRegionsCompanyId(companyForTypes);
      })
      .catch(() => {
        if (cancel) return;
        setRegions([]);
        setRegionsCompanyId(companyForTypes);
      });
    return () => { cancel = true; };
  }, [companyForTypes]);

  // Đổi công ty → bỏ khu vực không còn thuộc danh sách mới (giống web).
  useEffect(() => {
    if (!filterRegion || filterRegion === REGION_NONE) return;
    if (regionsCompanyId !== companyForTypes) return;
    const ok = regions.some((r) => String(r.id) === String(filterRegion));
    if (!ok) setFilterRegion('');
  }, [regions, regionsCompanyId, companyForTypes, filterRegion]);

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
      quietFilterPersistRef.current = true;
      setFilterWorkTypeId(String(workTypes[0].id));
      return;
    }
    if (filterWorkTypeId === 'none') return;

    const stillExists = workTypes.some((w) => String(w.id) === String(filterWorkTypeId));
    if (!stillExists) {
      quietFilterPersistRef.current = true;
      setFilterWorkTypeId(String(workTypes[0].id));
    }
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
      // Không phình danh sách bằng mọi company từ board khi đang khóa 1 công ty (khớp web).
      if (showWorkshopPicker && isSystemAdmin(user)) {
        fromApi = Array.from(map.values());
      }
    }
    if (fromApi.length && showWorkshopPicker) {
      if (!allCompaniesRef.current.length || fromApi.length > allCompaniesRef.current.length) {
        allCompaniesRef.current = fromApi;
      }
    }
    // Sysadmin: thêm «Tất cả công ty».
    if (showWorkshopPicker && isSystemAdmin(user)) {
      return [{ id: '', label: 'Tất cả công ty' }, ...fromApi.map((c) => ({ id: c.id, label: c.name }))];
    }
    return fromApi.map((c) => ({ id: c.id, label: c.name }));
  }, [companies, board.projects, workshopCompanyPickerList, showWorkshopPicker, user]);

  /** Sysadmin: '' = Tất cả (hợp lệ). NV: bắt buộc 1 công ty. */
  useEffect(() => {
    if (!workshopCompanyPickerList.length) return;
    if (isSysAdmin) {
      if (!filterCompany) return;
      const valid = workshopCompanyPickerList.some((c) => String(c.id) === String(filterCompany));
      if (valid) return;
      setFilterCompany('');
      setFilterWorkTypeId('');
      setFilterRegion('');
      return;
    }
    const valid = filterCompany
      && workshopCompanyPickerList.some((c) => String(c.id) === String(filterCompany));
    if (valid) return;
    let cancelled = false;
    void loadKanbanFilters()
      .then((snap) => {
        if (cancelled) return;
        const saved = String(snap?.filterCompany || '').trim();
        const fromSaved = saved
          ? workshopCompanyPickerList.find((c) => String(c.id) === saved)
          : null;
        const pick = fromSaved || workshopCompanyPickerList[0];
        if (pick?.id) {
          setFilterCompany(String(pick.id));
          setFilterWorkTypeId('');
          setFilterRegion('');
        }
      })
      .catch(() => {
        if (cancelled) return;
        const pick = workshopCompanyPickerList[0];
        if (pick?.id) {
          setFilterCompany(String(pick.id));
          setFilterWorkTypeId('');
          setFilterRegion('');
        }
      });
    return () => { cancelled = true; };
  }, [workshopCompanyPickerList, filterCompany, isSysAdmin]);

  useEffect(() => {
    const quiet = quietFilterPersistRef.current;
    if (quiet) quietFilterPersistRef.current = false;
    void saveKanbanFilters(
      {
        filterCompany,
        filterDealCompany,
        filterWorkTypeId,
        filterRegion,
        filterPersonId,
        filterPhone,
        filterPriority,
      },
      quiet ? { emit: false } : undefined,
    ).catch(() => {});
  }, [filterCompany, filterDealCompany, filterWorkTypeId, filterRegion, filterPersonId, filterPhone, filterPriority]);

  // Đồng bộ từ Overview/Planner khi đổi công ty.
  useEffect(() => {
    const unsub = subscribeSharedFilters((snap) => {
      const nextCo = String(snap.filterCompany || '');
      const nextDeal = String(snap.filterDealCompany || '');
      const nextWork = String(snap.filterWorkTypeId || '');
      const nextRegion = String(snap.filterRegion || '');
      const nextPerson = String(snap.filterPersonId || '');
      const nextPhone = (snap.filterPhone || '') as PhoneFilterId;
      const nextPriority = String(snap.filterPriority || '');
      const same =
        nextCo === String(filterCompanyRef.current || '')
        && nextDeal === String(filterDealCompanyRef.current || '')
        && nextWork === String(filterWorkTypeIdRef.current || '')
        && nextRegion === String(filterRegionRef.current || '')
        && nextPerson === String(filterPersonIdRef.current || '')
        && nextPhone === String(filterPhoneRef.current || '')
        && nextPriority === String(filterPriorityRef.current || '');
      if (same) return;
      setFilterCompany(nextCo);
      if (nextDeal !== undefined) setFilterDealCompany(nextDeal);
      setFilterWorkTypeId(nextWork);
      setFilterRegion(nextRegion);
      setFilterPersonId(nextPerson);
      setFilterPhone(nextPhone === 'has' || nextPhone === 'no' ? nextPhone : '');
      setFilterPriority(nextPriority);
    });
    return unsub;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadKanbanFilters().then((snap) => {
        if (!alive || !snap) return;
        const nextCo = String(snap.filterCompany || '');
        if (nextCo !== String(filterCompanyRef.current || '')) {
          setFilterCompany(nextCo);
        }
        const nextWork = String(snap.filterWorkTypeId || '');
        if (nextWork !== String(filterWorkTypeIdRef.current || '')) {
          setFilterWorkTypeId(nextWork);
        }
        const nextRegion = String(snap.filterRegion || '');
        if (nextRegion !== String(filterRegionRef.current || '')) setFilterRegion(nextRegion);
        const nextPerson = String(snap.filterPersonId || '');
        if (nextPerson !== String(filterPersonIdRef.current || '')) setFilterPersonId(nextPerson);
        const nextPhone = (snap.filterPhone || '') as PhoneFilterId;
        if (nextPhone !== filterPhoneRef.current) {
          setFilterPhone(nextPhone === 'has' || nextPhone === 'no' ? nextPhone : '');
        }
        const nextPriority = String(snap.filterPriority || '');
        if (nextPriority !== String(filterPriorityRef.current || '')) setFilterPriority(nextPriority);
      });
      return () => { alive = false; };
    }, []),
  );

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
    // Công ty bắt buộc luôn có — chỉ đếm khi admin được chọn giữa nhiều công ty.
    if (filterCompany && showWorkshopPicker) n += 1;
    if (filterDealCompany && canPickDealCompany) n += 1;
    if (filterRegion) n += 1;
    if (filterPersonId) n += 1;
    if (filterPhone) n += 1;
    if (filterPriority) n += 1;
    return n;
  }, [filterCompany, filterDealCompany, filterWorkTypeId, filterRegion, filterPersonId, filterPhone, filterPriority, canPickDealCompany, showWorkshopPicker]);

  const selectedWorkshopLabel = companyOptions.find((o) => o.id === filterCompany)?.label;
  const workTypeOptions = useMemo(
    () => [
      { id: '', label: 'Tất cả phân loại' },
      ...workTypes.map((t) => ({ id: t.id, label: t.name })),
    ],
    [workTypes],
  );
  const selectedWorkTypeLabel = workTypeOptions.find((o) => o.id === filterWorkTypeId)?.label || 'Phân loại';

  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    regions.forEach((r) => {
      if (r.id) map.set(String(r.id), r.divisionName ? `${r.name} · ${r.divisionName}` : r.name);
    });
    board.projects.forEach((p) => {
      if (p.region_id && p.region_name && !map.has(String(p.region_id))) {
        map.set(String(p.region_id), p.region_name);
      }
    });
    const opts = [
      { id: '', label: 'Tất cả khu vực' },
      { id: REGION_NONE, label: 'Chưa gắn khu vực' },
      ...Array.from(map.entries()).map(([id, label]) => ({ id, label })),
    ];
    return opts;
  }, [regions, board.projects]);

  const selectedRegionLabel = regionOptions.find((o) => o.id === filterRegion)?.label || 'Khu vực';

  const personFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    const add = (id?: string | null, name?: string | null) => {
      const pid = String(id || '').trim();
      if (!pid || map.has(pid)) return;
      map.set(pid, (name || '').trim() || 'Không tên');
    };
    for (const p of board.projects) {
      add(p.logistics_person_id, p.logistics_person_name);
      add(p.installer_person_id, p.installer_person_name);
      add(p.production_person_id, p.production_person_name);
      add(p.sales_person_id, p.sales_person_name);
      const deals = p.crm_deals || [];
      const primary = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
      add(primary?.assignee?.id, primary?.assignee?.full_name);
      add(primary?.lead_owner?.id, primary?.lead_owner?.full_name);
    }
    return [
      { id: '', label: 'Tất cả NV' },
      ...[...map.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    ];
  }, [board.projects]);

  useEffect(() => {
    if (!filterPersonId) return;
    const ok = personFilterOptions.some((o) => o.id && o.id === filterPersonId);
    if (!ok) setFilterPersonId('');
  }, [filterPersonId, personFilterOptions]);

  const activeFilterCount = useMemo(() => {
    let n = scopeFilterCount;
    if (quickFilter !== 'all') n += 1;
    return n;
  }, [scopeFilterCount, quickFilter]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (quickFilter === 'mine') parts.push('Của tôi');
    else if (quickFilter === 'overdue') parts.push('Quá hạn');
    else if (quickFilter === 'today') parts.push('Hôm nay');
    if (filterCompany && selectedWorkshopLabel) {
      parts.push(shortFilterLabel(selectedWorkshopLabel, 'Công ty', 12));
    }
    if (filterDealCompany && canPickDealCompany) {
      parts.push(shortFilterLabel(selectedDealCompanyLabel, 'Đặt hàng', 12));
    }
    if (filterRegion) {
      parts.push(shortFilterLabel(selectedRegionLabel, 'Khu vực', 12));
    }
    if (filterWorkTypeId) {
      parts.push(shortFilterLabel(selectedWorkTypeLabel, 'Phân loại', 12));
    }
    if (filterPersonId) {
      const pname = personFilterOptions.find((o) => o.id === filterPersonId)?.label;
      parts.push(shortFilterLabel(pname, 'NV', 12));
    }
    if (filterPhone === 'has') parts.push('Có SĐT');
    else if (filterPhone === 'no') parts.push('Chưa SĐT');
    if (filterPriority) {
      const pl = filterPriority === 'urgent' ? 'Gấp'
        : filterPriority === 'high' ? 'Cao'
          : filterPriority === 'medium' ? 'TB' : 'Thấp';
      parts.push(pl);
    }
    return parts.join(' · ');
  }, [
    quickFilter,
    filterCompany,
    selectedWorkshopLabel,
    filterDealCompany,
    canPickDealCompany,
    selectedDealCompanyLabel,
    filterRegion,
    selectedRegionLabel,
    filterWorkTypeId,
    selectedWorkTypeLabel,
    filterPersonId,
    personFilterOptions,
    filterPhone,
    filterPriority,
  ]);

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
        if (!projectMatchesPerson(p, myId)) return false;
      }
      if (quickFilter === 'overdue' && !(p.is_overdue || projectIsDeadlineOverdue(p))) return false;
      if (quickFilter === 'today' && !isToday(p.deadline)) return false;
      if (filterPhone === 'has' && !projectHasCustomerPhone(p)) return false;
      if (filterPhone === 'no' && projectHasCustomerPhone(p)) return false;
      if (filterPersonId && !projectMatchesPerson(p, filterPersonId)) return false;
      if (filterPriority && String(p.priority || '') !== String(filterPriority)) return false;
      // filterCompany: server-side. filterWorkTypeId: client-side, lọc theo loại đã chọn.
      if (filterWorkTypeId && String(p.workshop_type_id || '') !== String(filterWorkTypeId)) return false;
      if (filterRegion && !projectMatchesRegion(p, filterRegion)) return false;
      if (dealCompanyExternalFilter && !projectMatchesDealCompanyExternalFilter(p, dealCompanyExternalFilter)) {
        return false;
      }
      return true;
    });
  }, [board.projects, search, quickFilter, myId, filterWorkTypeId, filterRegion, dealCompanyExternalFilter, filterPhone, filterPersonId, filterPriority]);

  /** Một pipeline như web LogisticsDashboard — không tách tab Vận chuyển / Lắp đặt. */
  const displayStages = stages;

  /** Deep-link từ card Tổng quan: Kanban → cột; List → chip cột; Quá hạn → quickFilter. */
  useEffect(() => {
    const key = route.params?.focusKpi;
    if (!key) return;

    if (key === 'overdue') {
      setQuickFilter('overdue');
      setListStageId('');
      tabNav.setParams({ focusKpi: undefined });
      return;
    }

    if (!displayStages.length) return;

    const idx = findStageIndexForKpiFocus(displayStages, key);
    if (idx >= 0) {
      setQuickFilter('all');
      setActiveIndex(idx);
      setListStageId(String(displayStages[idx].id));
    }
    tabNav.setParams({ focusKpi: undefined });
  }, [route.params?.focusKpi, displayStages, tabNav]);

  const activeStage: KanbanStage | undefined = displayStages[activeIndex];
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
   * Vuốt ngang đổi cột — gắn lên View bọc FlatList + header cột (giống SX/CRM),
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
          if (!claimed) return;
          trySwipeColumn(g.dx, g.vx);
        },
      }),
    [trySwipeColumn],
  );

  const accent = stageColor(activeStage?.color, activeIndex);

  const projectsByStage = useMemo(() => {
    const map = new Map<string, ProductionProject[]>();
    displayStages.forEach((s) => map.set(s.id, []));
    const intakeId = displayStages.find((s) => s.bucket_slug === 'delivery_pending')?.id
      || displayStages[0]?.id
      || '';
    filteredProjects.forEach((p) => {
      const key = p.resolved_column_id ? String(p.resolved_column_id) : '';
      if (key && map.has(key)) {
        map.get(key)!.push(p);
        return;
      }
      // Orphan (cột SX / cột công ty khác) → cột tiếp nhận.
      if (intakeId && map.has(String(intakeId))) map.get(String(intakeId))!.push(p);
    });
    return map;
  }, [displayStages, filteredProjects]);

  const columnProjects = activeStage ? (projectsByStage.get(activeStage.id) || []) : [];

  const stageMetaById = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; index: number }>();
    displayStages.forEach((s, i) => {
      map.set(String(s.id), { name: s.name, color: s.color ?? null, index: i });
    });
    return map;
  }, [displayStages]);

  const listProjects = useMemo(() => {
    if (!listStageId) return filteredProjects;
    return filteredProjects.filter((p) => String(p.resolved_column_id || '') === String(listStageId));
  }, [filteredProjects, listStageId]);

  const pagedListProjects = useMemo(
    () => listProjects.slice(0, listVisibleCount),
    [listProjects, listVisibleCount],
  );
  const hasMoreListCards = listVisibleCount < listProjects.length;

  useEffect(() => {
    setListVisibleCount(LIST_PAGE_SIZE);
  }, [listStageId, search, quickFilter, filterWorkTypeId, filterCompany, filterRegion]);

  const loadMoreListCards = useCallback(() => {
    setListVisibleCount((prev) => (prev < listProjects.length ? prev + LIST_PAGE_SIZE : prev));
  }, [listProjects.length]);

  // Phân trang phía client: chỉ render `visibleCount` card đầu, tải thêm khi cuộn tới cuối.
  const pagedProjects = useMemo(
    () => columnProjects.slice(0, visibleCount),
    [columnProjects, visibleCount],
  );
  const hasMoreCards = visibleCount < columnProjects.length;

  useEffect(() => {
    const rows = viewMode === 'list' ? pagedListProjects : pagedProjects;
    const leadIds = rows
      .map((p) => resolveProjectDealId(p))
      .filter((id): id is string => Boolean(id));
    if (leadIds.length) joinLeadRooms(leadIds);
  }, [viewMode, pagedProjects, pagedListProjects, joinLeadRooms]);

  // Reset về trang đầu khi đổi cột hoặc đổi bộ lọc.
  useEffect(() => {
    setVisibleCount(CARD_PAGE_SIZE);
  }, [activeStage?.id, search, quickFilter, filterWorkTypeId, filterCompany, filterRegion]);

  const loadMoreCards = useCallback(() => {
    setVisibleCount((prev) => (prev < columnProjects.length ? prev + CARD_PAGE_SIZE : prev));
  }, [columnProjects.length]);

  // Chỉ tải comment-index cho các card ĐANG hiển thị (cột active + phân trang),
  // không tải cho toàn bộ vài nghìn dự án — tránh URL khổng lồ và query nặng.
  // Merge vào map cũ để badge các cột đã xem trước đó không mất.
  useEffect(() => {
    const rows = viewMode === 'list' ? pagedListProjects : pagedProjects;
    if (!rows.length) return;
    void fetchCommentsIndexForProjects(rows)
      .then((idx) => setCommentIndex((prev) => ({ ...prev, ...idx })))
      .catch(() => {});
  }, [viewMode, pagedProjects, pagedListProjects]);

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
    || !!filterDealCompany || !!filterWorkTypeId || !!filterRegion
    || !!filterPersonId || !!filterPhone || !!filterPriority
    || (showWorkshopPicker && !!filterCompany);

  const resetFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setQuickFilter('all');
    // Sysadmin: về «Tất cả công ty»; NV: giữ công ty đang chọn / đầu list.
    const first = isSysAdmin
      ? ''
      : (workshopCompanyPickerList[0]?.id ? String(workshopCompanyPickerList[0].id) : '');
    setFilterCompany(first);
    setFilterDealCompany('');
    setFilterWorkTypeId('');
    setFilterRegion('');
    setFilterPersonId('');
    setFilterPhone('');
    setFilterPriority('');
  }, [workshopCompanyPickerList, isSysAdmin]);

  const performMove = useCallback(
    async (project: ProductionProject, target: KanbanStage) => {
      const fromColId = project.resolved_column_id ?? project.vc_kanban_column_id ?? null;
      const fromPatch: Partial<ProductionProject> = {
        vc_kanban_column_id: fromColId,
        resolved_column_id: fromColId,
        vc_intake: project.vc_intake,
        stage_slug: project.stage_slug,
        status: project.status,
      };
      const optimistic = projectPatchForStage(target);
      setMovingId(project.id);
      setBoard((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === project.id ? { ...p, ...optimistic } : p,
        ),
      }));
      patchCachedProjectById(project.id, optimistic);
      try {
        const result = await moveProjectToStage(project.id, target.id, {
          currentStageId: fromColId,
          isIntake: Boolean(optimistic.vc_intake),
          companyId: project.company_id ?? user?.company_id ?? null,
          workflowStageId: target.workflow_stage_id ?? null,
        });
        const newColId = result.vc_kanban_column_id ?? target.id;
        const landed = result.jumped_to_install && result.install_stage_id
          ? (stages.find((s) => String(s.id) === String(result.install_stage_id)) || target)
          : (stages.find((s) => String(s.id) === String(newColId)) || target);
        const confirmed = {
          ...projectPatchForStage(landed, { jumpedToInstall: !!result.jumped_to_install }),
          vc_kanban_column_id: newColId,
          resolved_column_id: newColId,
          current_stage_id: result.current_stage_id ?? project.current_stage_id,
        };
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id ? { ...p, ...confirmed } : p,
          ),
        }));
        patchCachedProjectById(project.id, confirmed);
        if (result.jumped_to_install) {
          const installId = result.install_stage_id ? String(result.install_stage_id) : '';
          if (installId) {
            const idx = stages.findIndex((s) => String(s.id) === installId);
            if (idx >= 0) setActiveIndex(idx);
          }
          showToast(
            `Đã chuyển ${project.code} sang Lắp đặt${result.install_stage_name ? ` · ${result.install_stage_name}` : ''}`,
            'success',
          );
        } else {
          showToast(`Đã chuyển ${project.code} → ${target.name}`, 'success');
        }
      } catch (e) {
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id ? { ...p, ...fromPatch } : p,
          ),
        }));
        patchCachedProjectById(project.id, fromPatch);
        showToast(formatApiError(e), 'error');
      } finally {
        setMovingId(null);
      }
    },
    [showToast, user?.company_id, stages],
  );

  /** Chuyển cột — nếu cột đích gắn cờ «Chuyển LĐ» (nhảy sang Lắp đặt), xác nhận trước khi gọi API. */
  const moveCardTo = useCallback(
    (project: ProductionProject, targetStageId: string) => {
      const target = stages.find((s) => String(s.id) === String(targetStageId));
      if (!target) return;
      const willJumpToInstall = !!target.is_handover_to_install && !isInstallVcStage(target);
      if (willJumpToInstall) {
        Alert.alert(
          'Chuyển sang Lắp đặt',
          `Chuyển «${project.name || project.code}» từ Vận chuyển sang Lắp đặt?`,
          [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Chuyển', onPress: () => void performMove(project, target) },
          ],
        );
        return;
      }
      void performMove(project, target);
    },
    [stages, performMove],
  );

  /**
   * KPI theo cột đang hiện trên board — cập nhật ngay khi chuyển thẻ
   * (không phụ thuộc status/slug cũ còn stale sau drag).
   */
  const boardProjects = useMemo(
    () => displayStages.flatMap((s) => projectsByStage.get(s.id) || []),
    [displayStages, projectsByStage],
  );

  const statPills = useMemo(() => {
    const k = computeVcBoardKpis(boardProjects, displayStages);
    return [
      { label: 'Tổng', value: k.total, color: colors.text },
      { label: 'Đang VC', value: k.shipping, color: colors.primary },
      { label: 'Đang LĐ', value: k.installing, color: '#F59E0B' },
      { label: 'Phát sinh', value: k.warranty, color: '#38BDF8' },
      { label: 'Hoàn thành', value: k.completed, color: colors.success },
      ...(k.overdue > 0 ? [{ label: 'Quá hạn', value: k.overdue, color: colors.danger }] : []),
    ];
  }, [boardProjects, displayStages, colors]);

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

      {/* ── HEADER + nút lọc góc phải ── */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
          <Text style={styles.appTitle} numberOfLines={1}>Lắp đặt</Text>
          <Text style={styles.appSub} numberOfLines={1}>
            {boardProjects.length > 0
              ? `${boardProjects.length.toLocaleString('vi-VN')} thẻ`
              : 'Bảng điều hành vận chuyển lắp đặt'}
            {filterSummary ? ` · ${filterSummary}` : ''}
          </Text>
        </View>
        <View style={styles.headerBtns}>
          <View style={styles.viewModeBlock} accessibilityLabel="Chế độ xem">
            <Text style={styles.viewModeLabel}>Chế độ xem</Text>
            <View style={styles.viewModeWrap}>
              <TapHighlight
                style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnOn]}
                onPress={() => switchViewMode('list')}
                accessibilityLabel="Chế độ xem danh sách"
                accessibilityState={{ selected: viewMode === 'list' }}
              >
                <Ionicons
                  name="list"
                  size={16}
                  color={viewMode === 'list' ? colors.primary : colors.textMuted}
                />
              </TapHighlight>
              <TapHighlight
                style={[styles.viewModeBtn, viewMode === 'kanban' && styles.viewModeBtnOn]}
                onPress={() => switchViewMode('kanban')}
                accessibilityLabel="Chế độ xem Kanban"
                accessibilityState={{ selected: viewMode === 'kanban' }}
              >
                <Ionicons
                  name="grid-outline"
                  size={16}
                  color={viewMode === 'kanban' ? colors.primary : colors.textMuted}
                />
              </TapHighlight>
            </View>
          </View>
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

      {/* ── SEARCH + bộ lọc trong thanh tìm kiếm ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.textFaint} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Tìm dự án VC/LĐ, KH, SĐT, mã…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchInput ? (
            <Pressable onPress={() => { setSearchInput(''); setSearch(''); }} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
          <TapHighlight
            style={[styles.searchFilterBtn, activeFilterCount > 0 && styles.searchFilterBtnOn]}
            onPress={() => {
              setFilterSheetTab(
                showWorkshopPicker || regionOptions.length > 0 ? 'scope' : 'pipeline',
              );
              setFilterSheetOpen(true);
            }}
            accessibilityLabel="Bộ lọc"
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={activeFilterCount > 0 ? colors.primary : colors.textMuted}
            />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {activeFilterCount > 9 ? '9+' : activeFilterCount}
                </Text>
              </View>
            ) : null}
          </TapHighlight>
        </View>
        {filterActive ? (
          <Pressable onPress={resetFilters} style={styles.searchClearFilters} hitSlop={6}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

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

      {/* ── COLUMN NAV (Kanban) hoặc STAGE CHIPS (List) ── */}
      {viewMode === 'kanban' ? (
        <>
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
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.listStageScroll}
          contentContainerStyle={styles.listStageContent}
          nestedScrollEnabled
        >
          <TapHighlight
            style={[styles.listStageChip, !listStageId && styles.listStageChipOn]}
            onPress={() => setListStageId('')}
          >
            <Text style={[styles.listStageChipTxt, !listStageId && styles.listStageChipTxtOn]}>
              Tất cả
            </Text>
            <View style={styles.listStageCountBadge}>
              <Text style={styles.listStageCountTxt}>
                {filteredProjects.length > 99 ? '99+' : filteredProjects.length}
              </Text>
            </View>
          </TapHighlight>
          {displayStages.map((s, i) => {
            const count = projectsByStage.get(s.id)?.length ?? 0;
            const on = String(listStageId) === String(s.id);
            const chipColor = stageColor(s.color, i);
            return (
              <TapHighlight
                key={s.id}
                style={[
                  styles.listStageChip,
                  on && styles.listStageChipOn,
                  on && { borderColor: chipColor, backgroundColor: `${chipColor}22` },
                ]}
                onPress={() => setListStageId(String(s.id))}
              >
                <Text
                  style={[
                    styles.listStageChipTxt,
                    on && styles.listStageChipTxtOn,
                    on && { color: chipColor },
                  ]}
                  numberOfLines={1}
                >
                  {s.name}
                </Text>
                <View style={styles.listStageCountBadge}>
                  <Text style={styles.listStageCountTxt}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              </TapHighlight>
            );
          })}
        </ScrollView>
      )}

      </View>{/* end fixedTop */}

      {viewMode === 'list' ? (
        <FlatList
          style={styles.listFlex}
          data={pagedListProjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 88 + insets.bottom }]}
          initialNumToRender={LIST_PAGE_SIZE}
          maxToRenderPerBatch={LIST_PAGE_SIZE}
          windowSize={7}
          removeClippedSubviews
          onEndReachedThreshold={0.4}
          onEndReached={loadMoreListCards}
          ListFooterComponent={
            hasMoreListCards ? (
              <View style={styles.listFooter}>
                <ActivityIndicator color={colors.primary} size="small" />
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
                {filterActive ? 'Không tìm thấy dự án phù hợp bộ lọc' : 'Chưa có dự án'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const sid = item.resolved_column_id ? String(item.resolved_column_id) : '';
            const meta = sid ? stageMetaById.get(sid) : undefined;
            const commentEntry = commentIndex[item.id];
            const commentCount = commentEntry?.count ?? 0;
            const seenAt = commentSeen[item.id];
            const lastIsMine = Boolean(
              myId && commentEntry?.last_user_id && String(commentEntry.last_user_id) === String(myId),
            );
            const hasUnreadComments = commentCount > 0
              && !lastIsMine
              && (!seenAt || (commentEntry?.last_at ? String(commentEntry.last_at) > String(seenAt) : true));

            return (
              <VcListCard
                item={item}
                title={cardTitleOf(item)}
                stageName={vcListStageLabel(item, displayStages, meta?.name)}
                stageColorHex={meta?.color}
                stageIndex={meta?.index ?? 0}
                ageLabel={calculateDays(item.created_at)}
                crmName={crmPersonName(item)}
                sxName={item.production_person_name}
                vcName={item.logistics_person_name}
                ldName={item.installer_person_name}
                moving={movingId === item.id}
                onPress={() => openProjectDetail(item.id)}
                onMove={() => setMoveModalProject(item)}
                onComment={() => openCommentsForProject(item)}
                hasUnreadComments={hasUnreadComments}
                commentCount={commentCount}
              />
            );
          }}
        />
      ) : (
      /* ── CARD LIST (Kanban 1 cột, vuốt ngang đổi cột) ── */
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
          const isInstallCol = isInstallVcStage(activeStage);
          const doneTasks = isInstallCol
            ? (item.done_tasks_install ?? 0)
            : (item.done_tasks_vc ?? item.done_tasks ?? 0);
          const totalTasks = isInstallCol
            ? (item.task_total_install ?? 0)
            : (item.task_total_vc ?? item.task_total ?? 0);
          const taskLabel = isInstallCol ? 'Nhiệm vụ Lắp đặt' : 'Nhiệm vụ Vận chuyển';
          const isMoving = movingId === item.id;
          const workTypeName = item.workshop_type_name;
          const deadlineStr = formatDate(item.deadline);
          const ageLabel = calculateDays(item.created_at);
          const title = cardTitleOf(item);
          const crmName = crmPersonName(item);
          const sxName = item.production_person_name?.trim() || null;
          const vcName = item.logistics_person_name?.trim() || null;
          const ldName = item.installer_person_name?.trim() || null;
          const hasPeople = !!(crmName || sxName || vcName || ldName);
          const showHandover =
            !!activeStage?.is_handover_to_install && !isInstallVcStage(activeStage);
          const deadlineOverdue = !!(
            item.deadline && new Date(item.deadline) < new Date() && item.status !== 'completed'
          );
          const deadlineSoon = !!(
            item.deadline
            && !deadlineOverdue
            && new Date(item.deadline) < new Date(Date.now() + 3 * 86400000)
          );
          const commentEntry = commentIndex[item.id];
          const commentCount = commentEntry?.count ?? 0;
          const seenAt = commentSeen[item.id];
          const lastIsMine = Boolean(
            myId && commentEntry?.last_user_id && String(commentEntry.last_user_id) === String(myId),
          );
          const hasUnreadComments = commentCount > 0
            && !lastIsMine
            && (!seenAt || (commentEntry?.last_at ? String(commentEntry.last_at) > String(seenAt) : true));

          return (
            <View style={[styles.card, { borderLeftColor: accent }]}>
              <Pressable onPress={() => openProjectDetail(item.id)}>
                <View style={styles.cardRow1}>
                  <Text style={styles.cardCode}>{item.code}</Text>
                  {isNewProject(item.created_at) ? (
                    <View style={styles.tagNew}>
                      <Text style={styles.tagNewText}>Mới</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardName} numberOfLines={2}>{title}</Text>
                </View>

                {workTypeName ? (
                  <Text style={styles.workTypeLine} numberOfLines={1}>
                    <Text style={styles.workTypeMuted}>Loại: </Text>
                    {workTypeName}
                  </Text>
                ) : null}

                {(item.customer_name || item.customer_phone) ? (
                  <View style={styles.customerBlock}>
                    {item.customer_name ? (
                      <Text style={styles.customerName} numberOfLines={1}>
                        {item.customer_name}
                      </Text>
                    ) : null}
                    {item.customer_phone ? (
                      <Text style={styles.customerPhoneLine} numberOfLines={1}>
                        {item.customer_phone}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {hasPeople ? (
                  <View style={styles.personChipsWrap}>
                    <PersonRoleChip label="CRM" name={crmName} isDark={isDark} />
                    <PersonRoleChip label="SX" name={sxName} isDark={isDark} />
                    <PersonRoleChip label="VC" name={vcName} isDark={isDark} />
                    <PersonRoleChip label="LĐ" name={ldName} isDark={isDark} />
                  </View>
                ) : (
                  <Text style={styles.personEmpty}>Phụ trách: —</Text>
                )}

                <View style={styles.ageRow}>
                  {ageLabel ? (
                    <View style={styles.agePill}>
                      <Text style={styles.agePillText}>{ageLabel}</Text>
                    </View>
                  ) : null}
                </View>

                {deadlineStr ? (
                  <View
                    style={[
                      styles.deadlineBanner,
                      deadlineOverdue
                        ? styles.deadlineBannerOverdue
                        : deadlineSoon
                          ? styles.deadlineBannerSoon
                          : styles.deadlineBannerOk,
                    ]}
                  >
                    <Text
                      style={[
                        styles.deadlineBannerText,
                        deadlineOverdue
                          ? styles.deadlineBannerTextOverdue
                          : deadlineSoon
                            ? styles.deadlineBannerTextSoon
                            : styles.deadlineBannerTextOk,
                      ]}
                    >
                      Deadline: {deadlineStr}{deadlineOverdue ? ' ⚠' : ''}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              {showHandover ? (
                <TapHighlight
                  style={styles.handoverBtn}
                  onPress={() => {
                    if (activeStage) void moveCardTo(item, String(activeStage.id));
                  }}
                  disabled={isMoving}
                >
                  <Ionicons name="construct-outline" size={14} color="#0F766E" />
                  <Text style={styles.handoverBtnText}>Chuyển LĐ</Text>
                </TapHighlight>
              ) : null}

              <View style={styles.cardBottom}>
                <View style={styles.cardBottomLeft}>
                  <Text style={styles.taskFooter} numberOfLines={1}>
                    {totalTasks > 0 ? `✅ ${doneTasks}/${totalTasks} · ${taskLabel}` : '—'}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TapHighlight
                    style={styles.cardActionBtn}
                    onPress={() => openCommentsForProject(item)}
                    accessibilityLabel="Bình luận"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                    {hasUnreadComments ? (
                      <View style={styles.actionBadge}>
                        <Text style={styles.actionBadgeText}>
                          {commentCount > 99 ? '99+' : commentCount}
                        </Text>
                      </View>
                    ) : null}
                  </TapHighlight>
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
                </View>
              </View>
            </View>
          );
        }}
      />
      </View>
      )}

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

      <ProjectCommentModal
        visible={!!commentProject}
        project={commentProject}
        onClose={() => {
          if (commentProject) {
            const entry = commentIndex[commentProject.id];
            void markCommentsSeen(
              commentProject.id,
              entry?.last_at || new Date().toISOString(),
            );
          }
          setCommentProject(null);
        }}
        onPosted={(count) => {
          if (!commentProject) return;
          const at = new Date().toISOString();
          setCommentIndex((prev) => ({
            ...prev,
            [commentProject.id]: {
              count,
              last_at: at,
              last_user_id: myId,
            },
          }));
          void markCommentsSeen(commentProject.id, at);
        }}
      />

      <CommentNotificationsModal
        visible={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          void refreshUnread();
        }}
        onOpenProject={(projectId) => openProjectDetail(projectId)}
        onOpenNotification={(n) => {
          const pid = String(n.metadata?.project_id || (n.entity_type === 'project' ? n.entity_id : '') || '');
          if (String(n.type || '') === 'comment_added') {
            if (pid) void openCommentForProjectId(pid);
            return;
          }
          const focus = n.metadata?.focus_kpi;
          if (focus && typeof focus === 'string') {
            tabNav.setParams({ focusKpi: focus as VcKpiFocusKey });
          } else if (n.metadata?.intake || n.metadata?.vc_intake || n.type === 'workshop_new_deal') {
            tabNav.setParams({ focusKpi: 'intake' });
          }
          if (pid) openProjectDetail(pid);
        }}
      />

      <ProductionFilterSheet
        visible={filterSheetOpen}
        initialTab={filterSheetTab}
        onClose={() => setFilterSheetOpen(false)}
        onReset={() => {
          resetFilters();
          setFilterSheetOpen(false);
        }}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        showWorkshopPicker={showWorkshopPicker}
        workshopOptions={companyOptions}
        filterCompany={filterCompany}
        onWorkshopChange={(id) => {
          setFilterCompany(id);
          setFilterWorkTypeId('');
          setFilterRegion('');
          setFilterPersonId('');
        }}
        showDealCompanyPicker={showDealCompanyFilter}
        dealCompanyOptions={dealCompanyPickerOptions}
        filterDealCompany={filterDealCompany}
        onDealCompanyChange={(id) => {
          setFilterDealCompany(id);
          setFilterWorkTypeId('');
        }}
        dealCompanyReadOnlyLabel={!canPickDealCompany ? selectedDealCompanyLabel : undefined}
        regionOptions={regionOptions}
        filterRegion={filterRegion}
        onRegionChange={setFilterRegion}
        personOptions={personFilterOptions}
        filterPersonId={filterPersonId}
        onPersonChange={setFilterPersonId}
        filterPhone={filterPhone}
        onPhoneChange={setFilterPhone}
        filterPriority={filterPriority}
        onPriorityChange={setFilterPriority}
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

      <CreateProjectFab onPress={() => setCreateDealOpen(true)} />

      <CreateDealModal
        visible={createDealOpen}
        user={user}
        onClose={() => setCreateDealOpen(false)}
        onCreated={(msg) => {
          showToast(msg, 'success');
          void load('silent');
        }}
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
  appTitle: { color: c.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  appSub: { color: c.textMuted, fontSize: 12, marginTop: 1 },
  headerBtns: { flexDirection: 'row', gap: 8, flexShrink: 0, alignItems: 'center' },
  viewModeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewModeLabel: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  viewModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radii.md,
    padding: 2,
  },
  viewModeBtn: {
    width: 34,
    height: 34,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeBtnOn: {
    backgroundColor: c.primarySoft,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: Radii.md,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: {
    borderColor: colorWithAlpha(c.primary, 0.5),
    backgroundColor: c.primarySoft,
  },
  filterBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16,
    borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: c.bg,
  },
  filterBadgeText: { color: c.white, fontSize: 9, fontWeight: '800' },
  listStageScroll: { height: 40, flexShrink: 0, flexGrow: 0, marginBottom: 4 },
  listStageContent: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 6,
    height: 40,
  },
  listStageChip: {
    height: 32,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: 200,
  },
  listStageChipOn: {
    borderColor: colorWithAlpha(c.primary, 0.5),
    backgroundColor: c.primarySoft,
  },
  listStageChipTxt: { color: c.textMuted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  listStageChipTxtOn: { color: c.primary },
  listStageCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listStageCountTxt: {
    color: c.white,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
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
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingBottom: 8, flexShrink: 0,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: Radii.md, paddingLeft: 12, paddingRight: 6, height: 42,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 14, paddingVertical: 0 },
  searchFilterBtn: {
    width: 34, height: 34, borderRadius: Radii.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  searchFilterBtnOn: {
    backgroundColor: c.primarySoft,
  },
  searchClearFilters: {
    width: 36, height: 36, borderRadius: Radii.md,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
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
  card: {
    backgroundColor: c.card, borderRadius: Radii.lg,
    borderWidth: 1, borderColor: c.border,
    borderLeftWidth: 4, padding: 12, marginBottom: 10,
  },

  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardCode: { color: '#EA580C', fontSize: 12, fontWeight: '700', flexShrink: 0 },
  tagNew: {
    backgroundColor: '#F43F5E', borderRadius: Radii.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  tagNewText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  cardTitleRow: { marginBottom: 6 },
  cardName: { color: c.text, fontSize: 15, fontWeight: '700' },
  workTypeLine: { color: c.text, fontSize: 11, marginBottom: 6 },
  workTypeMuted: { color: c.textMuted, fontWeight: '600' },
  customerBlock: { marginBottom: 6, gap: 2 },
  customerName: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  customerPhoneLine: { color: '#16A34A', fontSize: 12, fontWeight: '600' },

  personChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  personEmpty: { color: c.textFaint, fontSize: 10, marginBottom: 4 },

  ageRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  agePill: {
    backgroundColor: c.cardAlt, borderRadius: Radii.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  agePillText: { color: c.textMuted, fontSize: 11, fontWeight: '600' },

  deadlineBanner: {
    borderRadius: Radii.md, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 4,
  },
  deadlineBannerOk: { backgroundColor: '#FFEDD5' },
  deadlineBannerSoon: { backgroundColor: '#FEF3C7' },
  deadlineBannerOverdue: { backgroundColor: '#FEE2E2' },
  deadlineBannerText: { fontSize: 10, fontWeight: '700' },
  deadlineBannerTextOk: { color: '#EA580C' },
  deadlineBannerTextSoon: { color: '#D97706' },
  deadlineBannerTextOverdue: { color: '#DC2626' },

  handoverBtn: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: Radii.md,
    backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4',
  },
  handoverBtnText: { color: '#0F766E', fontSize: 12, fontWeight: '700' },
  taskFooter: { color: c.textFaint, fontSize: 11, fontWeight: '600' },

  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border,
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

  emptyBox: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  listFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  listFooterText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  });
}
