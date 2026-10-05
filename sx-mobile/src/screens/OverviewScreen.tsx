/**
 * Tổng quan SX — bố cục giống CRM mobile (hero + banner + KPI + danh sách + lối tắt).
 * Không còn section «Thông báo mới» (chuông header mở modal).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GlowSpot,
  KpiCard,
  SectionHeader,
  ShortcutTile,
  type KpiStat,
  type ShortcutAction,
} from '../components/dashboard/DashboardParts';
import StaffOverviewBody, {
  type StaffProjectRow,
  type StaffTaskGroup,
} from '../components/overview/StaffOverviewBody';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import Avatar from '../components/Avatar';
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import FilterPickerModal from '../components/FilterPickerModal';
import SpinningLoader from '../components/SpinningLoader';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useMyProjectScope } from '../hooks/useMyProjectScope';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { boardFiltersFromSharedSnap, loadKanbanFilters, saveKanbanFilters, subscribeSharedFilters } from '../lib/kanbanFilterStorage';
import {
  externalDealFilterFromSnap,
  isSystemAdmin,
  projectMatchesDealCompanyExternalFilter,
  workshopCompaniesForCrossViewer,
} from '../lib/productionFilters';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import {
  fetchCompanies,
  fetchProductionBoard,
  fetchProductionBoardSummary,
  fetchWorkshopTypes,
  isAbortError,
  type CompanyOption,
  type WorkshopTypeOption,
} from '../lib/productionApi';
import { getCachedBoard, isCachedBoardFresh } from '../lib/productionBoardCache';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import {
  computeSxBoardKpis,
  formatVnWeekdayDate,
  initialsFrom,
  pickOverdueProjects,
  pickPriorityProjects,
  projectIsDeadlineOverdue,
  shortDateLabel,
  sxProjectDeadlineRaw,
  type SxBoardKpis,
} from '../lib/sxBoardKpis';
import {
  canViewTeamWork,
  fetchMyParticipationTasks,
  fetchProductionWorkTasks,
  formatTaskDeadline,
  groupTasksByDeal,
  summarizeTaskGroup,
  isTaskDone,
  isTaskDueOnDay,
  isTaskInProgress,
  isTaskOverdue,
  statusPillLabel,
  taskDueIso,
  workTaskFocusCrmId,
  WORK_TASKS_PAGE_SIZE,
  type WorkTask,
} from '../lib/workTasksApi';
import type { MainTabParamList } from '../navigation/MainTabs';
import { useRootNavigation } from '../navigation/useRootNavigation';
import type { KanbanStage, ProductionProject } from '../types';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';

/** Khoá ngày theo giờ VN (UTC+7) — để so "hôm nay" không lệch múi giờ máy. */
function vnDayKey(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "2026-09-14" → "14/09". Rỗng nếu không parse được. */
function shortDay(iso?: string | null): string {
  const key = vnDayKey(iso);
  if (!key) return '';
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Hai sắc spec chỉ định riêng cho KPI, không nằm trong bảng theme. */
const KPI_CYAN = '#11C5FF';
const KPI_PURPLE = '#A66CFF';

const PAGE_HPAD = 14;
/** Số nhóm deal trên mỗi trang preview Tổng quan (không phải số task). */
const TASK_PAGE_SIZE = 4;
const DEAL_PAGE_SIZE = 4;
const PRIORITY_FETCH_LIMIT = 80;
/** Số dòng xem trước mỗi mục ở bố cục nhân viên — phần còn lại qua «Xem tất cả».
 *  Liệt kê dài làm mục «Dự án sản xuất» bị đẩy khuất khỏi màn hình. */
const STAFF_PREVIEW_LIMIT = 4;

const EMPTY_KPI: SxBoardKpis = {
  total: 0,
  intake: 0,
  producing: 0,
  awaitingDelivery: 0,
  shipped: 0,
  completed: 0,
  overdue: 0,
};

function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || full || 'bạn';
}

function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function totalPagesOf(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, count) / pageSize));
}

/** NV thường: chỉ deal mình phụ trách SX. */
function scopeProjectsForUser(
  projects: ProductionProject[],
  opts: { userId: string; ownOnly: boolean },
): ProductionProject[] {
  if (!opts.ownOnly || !opts.userId) return projects;
  return projects.filter((p) => String(p.production_person_id || '') === String(opts.userId));
}


export default function OverviewScreen() {
  const { colors, isDark } = useTheme();
  /** Chiều cao hero đo lúc layout — dùng để đốm sáng không tràn ra ngoài. */
  const [heroH, setHeroH] = useState(0);
  const heroGlowSize = Math.max(240, heroH * 2.4);
  /** Giao diện sáng: header xanh đậm, chữ trắng (theo thiết kế). Giao diện tối giữ nguyên. */
  const lightHero = !isDark;
  const isFocused = useIsFocused();
  const heroTextStyle = { color: '#FFFFFF' };
  const heroSubTextStyle = { color: 'rgba(255,255,255,0.82)' };
  const heroIconBtnStyle = {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.32)',
  };
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount, refreshUnread } = useNotifications();
  const { unreadTotal: messageUnread } = useMessenger();
  const { openProjectDetail, openOverdueProjects, openProjectOnBoard, navigation: rootNav } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const userName = user?.full_name || user?.fullName || user?.email || 'Bạn';
  const nick = firstName(userName);
  const userId = user?.id || user?.userId || '';
  const helloLine = `Xin chào, ${nick}!`;
  const dateLabel = formatVnWeekdayDate();
  /** Ngày hôm nay theo giờ VN — mốc so sánh mức khẩn của từng nhóm việc. */
  const todayKey = vnDayKey(new Date().toISOString());
  const wishLine = 'Chúc bạn một ngày làm việc hiệu quả!';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<SxBoardKpis>(EMPTY_KPI);
  const [overdueDeals, setOverdueDeals] = useState<ProductionProject[]>([]);
  const [boardTruncated, setBoardTruncated] = useState(false);
  /** Cột board — cần để resolve hạn hiệu lực của thẻ quá hạn (hạn thẻ ưu tiên). */
  const [boardStages, setBoardStages] = useState<KanbanStage[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  /** Lần tải việc của nhân viên gần nhất bị lỗi — phân biệt «lỗi» với «không có việc nào». */
  const [tasksFailed, setTasksFailed] = useState(false);
  /** Đã nạp xong việc của nhân viên ít nhất một lần thành công — mốc để biết «không có dự án» là thật, không phải chưa về. */
  const [tasksLoaded, setTasksLoaded] = useState(false);
  /**
   * Toàn bộ dự án của bảng (đã lọc công ty, CHƯA lọc theo người) — giữ ở ref để
   * không gây render thừa; `projectsVersion` báo hiệu đã có dữ liệu mới.
   * Bố cục nhân viên cần danh sách này để tìm dự án họ THAM GIA, chứ không chỉ
   * dự án họ đứng tên phụ trách.
   */
  const allProjectsRef = useRef<ProductionProject[]>([]);
  const [projectsVersion, setProjectsVersion] = useState(0);
  const skipNextFocusRefreshRef = useRef(true);
  const lastSilentAtRef = useRef(0);
  const [taskPage, setTaskPage] = useState(1);
  /** Deal section đóng mặc định — chạm header để mở (giống VC / Công việc). */
  const [expandedTaskLeads, setExpandedTaskLeads] = useState<Record<string, boolean>>({});
  const [dealPage, setDealPage] = useState(1);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  /** true = loại hiện tại do app tự chọn, được phép nhảy tiếp nếu rỗng. */
  const autoPickedTypeRef = useRef(false);
  /** Lần mở app đầu tiên: cho phép tự nhảy khỏi phân loại ĐÃ LƯU nếu nó rỗng (xem effect bên dưới). */
  const loginTypeCheckDoneRef = useRef(false);
  /** Các loại đã thử trong công ty này — chặn nhảy vòng tròn. */
  const triedTypeIdsRef = useRef<Set<string>>(new Set());
  const [workTypes, setWorkTypes] = useState<WorkshopTypeOption[]>([]);
  const [filterWorkTypeId, setFilterWorkTypeId] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardFiltersRef = useRef<ReturnType<typeof boardFiltersFromSharedSnap>>({});
  const externalDealFilterRef = useRef<ReturnType<typeof externalDealFilterFromSnap>>(null);
  const loadSeqRef = useRef(0);
  const boardAbortRef = useRef<AbortController | null>(null);
  const companiesRef = useRef<CompanyOption[]>([]);
  companiesRef.current = companies;
  const summaryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryReqSeqRef = useRef(0);

  /** Admin hệ thống (admin không gắn company) — thấy / chọn mọi công ty. */
  const sysAdmin = isSystemAdmin(user);
  /** Admin/manager công ty — thấy cả đội trong công ty; NV thường chỉ việc/deal của mình. */
  const teamView = canViewTeamWork(user);
  const ownOnly = !teamView;
  const canPickCompany = sysAdmin;
  const lockedCompanyId = !sysAdmin && user?.company_id ? String(user.company_id) : '';

  const companyOptions = useMemo(() => {
    if (sysAdmin) {
      // Không có «tất cả công ty»: mỗi công ty một pipeline riêng, gộp lại thì
      // số liệu theo giai đoạn không còn nghĩa.
      return companies.map((c) => ({ id: String(c.id), label: c.name }));
    }
    const ownId = lockedCompanyId
      || (user?.company_id ? String(user.company_id) : '');
    if (ownId) {
      const own = companies.find((c) => String(c.id) === ownId);
      return [{ id: ownId, label: own?.name || 'Công ty của bạn' }];
    }
    return workshopCompaniesForCrossViewer(companies, user).map((c) => ({
      id: String(c.id),
      label: c.name,
    }));
  }, [sysAdmin, companies, user, lockedCompanyId]);

  const workshopLabel = useMemo(() => {
    if (!filterCompany) {
      return companyOptions[0]?.label || 'Công ty';
    }
    return companyOptions.find((o) => o.id === filterCompany)?.label
      || companies.find((c) => String(c.id) === String(filterCompany))?.name
      || 'Công ty';
  }, [filterCompany, companyOptions, companies]);

  const persistCompanyFilter = useCallback(async (companyId: string) => {
    const snap = (await loadKanbanFilters().catch(() => null)) || {};
    const prev = String(snap?.filterCompany || '');
    const next = String(companyId || '');
    // Chỉ xóa phân loại khi ĐỔI từ một công ty đã chọn → công ty khác.
    // Khóa JWT lần đầu ('' → companyId) không được coi là đổi — giữ work type.
    const companyChanged = Boolean(prev) && prev !== next;
    await saveKanbanFilters({
      filterCompany: companyId,
      ...(companyChanged ? { filterWorkTypeId: '' } : {}),
    });
  }, []);

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    boardAbortRef.current?.abort();
    const ac = new AbortController();
    boardAbortRef.current = ac;
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const snap = await loadKanbanFilters().catch(() => null);
      let companyId = snap?.filterCompany || '';
      setFilterWorkTypeId(String(snap?.filterWorkTypeId || ''));

      let companyList = companiesRef.current;
      if (mode !== 'silent' || !companyList.length) {
        companyList = await fetchCompanies().catch(() => [] as CompanyOption[]);
        if (seq !== loadSeqRef.current) return;
        setCompanies(companyList);
      }

      if (!sysAdmin) {
        // Admin công ty / NV: khóa phạm vi công ty JWT.
        const ownId = lockedCompanyId
          || (user?.company_id ? String(user.company_id) : '');
        if (ownId) companyId = ownId;
        else if (!companyId && companyList[0]?.id) companyId = String(companyList[0].id);
        if (companyId && companyId !== (snap?.filterCompany || '')) {
          await persistCompanyFilter(companyId);
        }
      } else if (companyList.length) {
        // Admin hệ thống: luôn neo vào một công ty cụ thể (mặc định công ty đầu
        // danh sách) — bỏ «tất cả công ty» vì pipeline mỗi công ty một khác.
        // Danh sách rỗng = fetchCompanies lỗi: giữ nguyên lựa chọn đã lưu, vì
        // để companyId rỗng sẽ khiến API gộp dữ liệu mọi công ty.
        const exists = Boolean(companyId)
          && companyList.some((c) => String(c.id) === String(companyId));
        if (!exists) companyId = String(companyList[0].id);
        if (companyId !== (snap?.filterCompany || '')) {
          await persistCompanyFilter(companyId);
        }
      }

      if (seq !== loadSeqRef.current) return;
      setFilterCompany(companyId);

      const boardFilters = boardFiltersFromSharedSnap(
        { ...snap, filterCompany: companyId },
      );
      boardFiltersRef.current = boardFilters;
      externalDealFilterRef.current = externalDealFilterFromSnap(snap?.filterDealCompany);

      const skipBoard = mode === 'silent' && isCachedBoardFresh(boardFilters) && !!getCachedBoard(boardFilters);
      const cachedBoard = getCachedBoard(boardFilters);

      const applyScopedBoard = (projects: ProductionProject[], stages: KanbanStage[] = [], truncated?: boolean) => {
        const ext = externalDealFilterRef.current;
        const dealScoped = ext
          ? projects.filter((p) => projectMatchesDealCompanyExternalFilter(p, ext))
          : projects;
        const scoped = scopeProjectsForUser(dealScoped, { userId, ownOnly });
        setOverdueDeals(pickOverdueProjects(scoped, PRIORITY_FETCH_LIMIT, stages));
        allProjectsRef.current = dealScoped;
        setProjectsVersion((v) => v + 1);
        setBoardStages(stages);
        if (truncated != null) setBoardTruncated(Boolean(truncated));
        return scoped;
      };

      if (mode === 'init' || mode === 'refresh') setKpis(EMPTY_KPI);
      if (cachedBoard && mode !== 'refresh') {
        const scoped = applyScopedBoard(cachedBoard.projects, cachedBoard.stages, cachedBoard.truncated);
        if (ownOnly) setKpis(computeSxBoardKpis(scoped, cachedBoard.stages));
        if (mode === 'init') setLoading(false);
      }

      // Admin hệ thống / admin công ty: giao việc đội (theo company). NV: chỉ của mình.
      const tasksPromise = !userId
        ? Promise.resolve([] as WorkTask[])
        : ownOnly
          // null = tải LỖI (khác với «không có việc»): không được giả vờ danh sách rỗng.
          ? fetchMyParticipationTasks(userId, { signal: ac.signal, force: mode === 'refresh' })
            .catch((e): WorkTask[] | null => {
              if (isAbortError(e)) throw e;
              console.warn('[overview] tải công việc của tôi lỗi:', formatApiError(e));
              return null;
            })
          : fetchProductionWorkTasks({
              companyId: companyId || null,
              limit: WORK_TASKS_PAGE_SIZE,
              offset: 0,
              signal: ac.signal,
              force: mode === 'refresh',
            }).catch(() => [] as WorkTask[]);

      const [board, summary, myTasks] = await Promise.all([
        skipBoard
          ? Promise.resolve(cachedBoard!)
          : fetchProductionBoard(mode === 'refresh', boardFilters, {
              signal: ac.signal,
              // Overview chỉ cần preview overdue + KPI summary — không hydrate 6k deal.
              // Kanban/Planner vẫn full; cache đầy đủ từ tab khác được ưu tiên ở trên.
              loadRemaining: false,
              onPartial: (partial) => {
                if (seq !== loadSeqRef.current) return;
                const scoped = applyScopedBoard(partial.projects, partial.stages, partial.truncated);
                if (ownOnly) setKpis(computeSxBoardKpis(scoped, partial.stages));
                if (mode === 'init') setLoading(false);
              },
            }),
        // Summary toàn công ty — NV không dùng (tính từ deal mình phụ trách trên board/cache).
        ownOnly
          ? Promise.resolve(null)
          : fetchProductionBoardSummary(boardFilters, mode === 'refresh', ac.signal).catch((e) => {
              if (isAbortError(e)) throw e;
              return null;
            }),
        tasksPromise,
      ]);

      if (seq !== loadSeqRef.current) return;
      // Ưu tiên board vừa fetch khi refresh; còn lại ưu tiên cache dài hơn (Kanban full).
      const bestBoard = (() => {
        const cachedNow = getCachedBoard(boardFilters);
        if (mode === 'refresh') return board || cachedNow || null;
        if (
          cachedNow
          && board
          && (cachedNow.projects.length || 0) > (board.projects.length || 0)
        ) {
          return cachedNow;
        }
        return board || cachedNow || null;
      })();
      if (bestBoard) {
        const scoped = applyScopedBoard(bestBoard.projects, bestBoard.stages, bestBoard.truncated);
        if (ownOnly) {
          setKpis(computeSxBoardKpis(scoped, bestBoard.stages));
        } else if (summary) {
          const client = computeSxBoardKpis(bestBoard.projects, bestBoard.stages);
          setKpis({
            ...EMPTY_KPI,
            total: summary.total,
            producing: summary.producing,
            awaitingDelivery: summary.awaitingDelivery,
            shipped: summary.shipped,
            completed: client.completed,
            overdue: summary.overdue,
          });
        } else {
          setKpis(computeSxBoardKpis(bestBoard.projects, bestBoard.stages));
        }
      } else if (summary && !ownOnly) {
        setKpis({
          ...EMPTY_KPI,
          total: summary.total,
          producing: summary.producing,
          awaitingDelivery: summary.awaitingDelivery,
          shipped: summary.shipped,
          overdue: summary.overdue,
        });
      }
      if (myTasks) {
        setTasks(myTasks);
        setTasksFailed(false);
        setTasksLoaded(true);
      } else {
        // Lỗi tải: giữ danh sách cũ (nếu có) thay vì xoá trắng, và báo cho người dùng biết.
        setTasksFailed(true);
        if (mode !== 'silent') setError('Không tải được công việc của bạn');
      }
      setTaskPage(1);
      setDealPage(1);
      lastSilentAtRef.current = Date.now();
    } catch (e) {
      if (seq !== loadSeqRef.current || isAbortError(e)) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, user?.company_id, sysAdmin, lockedCompanyId, ownOnly, persistCompanyFilter]);

  useEffect(() => () => {
    boardAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    void loadKanbanFilters().then((snap) => {
      const filters = boardFiltersFromSharedSnap(snap);
      void load(getCachedBoard(filters) ? 'silent' : 'init');
    });
  }, [load]);

  // Đồng bộ khi Kanban/Work đổi filter (cùng snapshot → cùng cache key).
  useEffect(() => {
    const unsub = subscribeSharedFilters((snap) => {
      const nextFilters = boardFiltersFromSharedSnap(snap);
      const prev = boardFiltersRef.current;
      const nextExt = externalDealFilterFromSnap(snap.filterDealCompany);
      const prevExt = externalDealFilterRef.current;
      const same =
        String(prev.companyId || '') === String(nextFilters.companyId || '')
        && String(prev.dealCompanyId || '') === String(nextFilters.dealCompanyId || '')
        && String(prev.workshopTypeId || '') === String(nextFilters.workshopTypeId || '')
        && String(prevExt?.catalogId || '') === String(nextExt?.catalogId || '');
      if (same) return;
      externalDealFilterRef.current = nextExt;
      const nextCo = String(snap.filterCompany || '');
      if (nextCo) setFilterCompany(nextCo);
      void load(getCachedBoard(nextFilters) ? 'silent' : 'init');
    });
    return unsub;
  }, [load]);

  /**
   * Nhân viên: dự án CỦA MÌNH = đứng tên phụ trách HOẶC được giao việc. Lọc riêng theo
   * `production_person_id` là sai vì nhân viên xưởng hiếm khi đứng tên mà chủ yếu nhận việc
   * (cùng định nghĩa với tab Dự án và danh sách «Dự án sản xuất»). KPI, số quá hạn và danh
   * sách đều dựa trên tập này để khớp nhau. Chỉ gồm dự án có trên bảng đang lọc.
   */
  // Dùng chung hook với tab Dự án và Planner; truyền `tasks` đã nạp ở đây để cả ba màn cùng một
  // định nghĩa «dự án của tôi» và kéo làm mới cập nhật đồng thời.
  const { allows: allowsProject } = useMyProjectScope(user, { tasks });
  const staffScopedProjects = useMemo<ProductionProject[]>(() => {
    void projectsVersion; // dữ liệu nằm ở ref — phụ thuộc có chủ ý
    if (!ownOnly) return [];
    return allProjectsRef.current.filter(allowsProject);
  }, [projectsVersion, ownOnly, allowsProject]);
  const staffKpis = useMemo(
    () => computeSxBoardKpis(staffScopedProjects, boardStages),
    [staffScopedProjects, boardStages],
  );
  const staffOverdueDeals = useMemo(
    () => pickOverdueProjects(staffScopedProjects, PRIORITY_FETCH_LIMIT, boardStages),
    [staffScopedProjects, boardStages],
  );

  /** Danh sách loại xưởng của công ty đang chọn — không có «Tất cả», khớp web. */
  const workTypeOptions = useMemo(
    () => [
      { id: 'none', label: 'Chưa phân loại' },
      ...workTypes.map((t) => ({ id: t.id, label: t.name })),
    ],
    [workTypes],
  );

  const workTypeLabel = useMemo(
    () => workTypeOptions.find((o) => o.id === filterWorkTypeId)?.label || 'Phân loại',
    [workTypeOptions, filterWorkTypeId],
  );

  useEffect(() => {
    // Đổi công ty → quên các loại đã thử của công ty cũ.
    triedTypeIdsRef.current = new Set();
    autoPickedTypeRef.current = false;
    if (!filterCompany) {
      setWorkTypes([]);
      return;
    }
    let cancelled = false;
    void fetchWorkshopTypes(filterCompany, null)
      .then((list) => {
        if (cancelled) return;
        setWorkTypes(list);
        // Mở app (đăng nhập) mà phân loại đã lưu rỗng → bảng trắng. Coi như lựa chọn tự động một lần
        // để effect «tự nhảy» tìm loại có dữ liệu; người dùng tự chọn sau đó thì được tôn trọng.
        if (!loginTypeCheckDoneRef.current) {
          loginTypeCheckDoneRef.current = true;
          autoPickedTypeRef.current = true;
        }
      })
      .catch(() => { if (!cancelled) setWorkTypes([]); });
    return () => { cancelled = true; };
  }, [filterCompany]);

  /**
   * Đặt phân loại: lưu vào bộ lọc dùng chung RỒI tải lại.
   * Chỉ setState là chip đổi mà dữ liệu giữ nguyên — khi đó số Tổng quan vẫn
   * của «mọi phân loại» trong khi chip đã ghi tên một loại, tức hiển thị sai.
   */
  const applyWorkType = useCallback(async (id: string) => {
    setFilterWorkTypeId(id);
    await saveKanbanFilters({ filterWorkTypeId: id }).catch(() => {});
    void load('refresh');
  }, [load]);

  // Không có «Tất cả»: rỗng hoặc loại không thuộc công ty hiện hành → loại đầu tiên.
  // «Chưa phân loại» giữ nguyên. Chưa tải được danh sách thì không đụng lọc đã lưu.
  useEffect(() => {
    if (!filterCompany || !workTypes.length) return;
    if (filterWorkTypeId === 'none') return;
    if (workTypes.some((w) => String(w.id) === String(filterWorkTypeId))) return;
    autoPickedTypeRef.current = true;
    void applyWorkType(String(workTypes[0].id));
  }, [workTypes, filterCompany, filterWorkTypeId, applyWorkType]);

  /**
   * Loại ĐẦU TIÊN chưa chắc có dữ liệu — Metalla có 84 dự án nhưng tất cả nằm ở
   * «Data đầu ra», còn «Data đầu vào» rỗng, nên tự chọn loại đầu sẽ ra bảng trắng.
   * API loại xưởng không trả số lượng nên không biết trước; tải xong mà rỗng thì
   * nhảy sang loại kế tiếp. Chỉ áp dụng cho lựa chọn TỰ ĐỘNG — người dùng tự chọn
   * một loại rỗng thì tôn trọng, không nhảy lung tung dưới tay họ.
   */
  useEffect(() => {
    if (!autoPickedTypeRef.current) return;
    // Nhân viên: «có dự án hay không» phụ thuộc việc được giao (tải sau bảng). Chỉ nhảy khi việc đã về
    // thành công — chưa về mà nhảy thì sẽ nhảy nhầm sang loại rỗng và còn bị lưu lại. Không có việc nào
    // thì không có gì để tìm, dừng; có việc mà loại hiện tại không có dự án nào của họ thì thử loại kế tiếp.
    if (ownOnly) {
      if (!tasksLoaded || tasksFailed) return;
      if (tasks.length === 0) {
        autoPickedTypeRef.current = false;
        return;
      }
    }
    if (loading || !filterCompany || workTypes.length < 2) return;
    if (!filterWorkTypeId || filterWorkTypeId === 'none') return;
    if ((ownOnly ? staffScopedProjects.length : kpis.total) > 0) {
      autoPickedTypeRef.current = false;
      return;
    }
    triedTypeIdsRef.current.add(String(filterWorkTypeId));
    const next = workTypes.find((w) => !triedTypeIdsRef.current.has(String(w.id)));
    if (!next) {
      autoPickedTypeRef.current = false;
      return;
    }
    void applyWorkType(String(next.id));
  }, [
    loading,
    kpis.total,
    ownOnly,
    tasksLoaded,
    tasksFailed,
    tasks.length,
    staffScopedProjects.length,
    filterWorkTypeId,
    workTypes,
    filterCompany,
    applyWorkType,
  ]);

  const onSelectWorkType = useCallback(async (id: string) => {
    setTypePickerOpen(false);
    if (!id || id === filterWorkTypeId) return;
    // Người dùng tự chọn — kể cả loại rỗng cũng giữ nguyên, không tự nhảy.
    autoPickedTypeRef.current = false;
    await applyWorkType(id);
  }, [filterWorkTypeId, applyWorkType]);

  const onSelectCompany = useCallback(async (id: string) => {
    setCompanyPickerOpen(false);
    // Công ty là phạm vi bắt buộc — rỗng sẽ khiến API gộp mọi công ty.
    if (!id) return;
    if (!sysAdmin) return;
    setFilterCompany(id);
    await persistCompanyFilter(id);
    void load('refresh');
  }, [sysAdmin, persistCompanyFilter, load]);

  useProductionRealtime({
    onRefresh: (info) => {
        if (info?.patched) {
        const cached = getCachedBoard(boardFiltersRef.current);
        if (cached) {
          const ext = externalDealFilterRef.current;
          const dealScoped = ext
            ? cached.projects.filter((p) => projectMatchesDealCompanyExternalFilter(p, ext))
            : cached.projects;
          setBoardTruncated(Boolean(cached.truncated));
          if (ownOnly) {
            // Nhân viên: KPI/quá hạn suy ra từ `staffScopedProjects` (cần cả việc được giao),
            // nên chỉ cần nạp lại dữ liệu bảng rồi để memo tự tính.
            allProjectsRef.current = dealScoped;
            setBoardStages(cached.stages);
            setProjectsVersion((v) => v + 1);
            return;
          }
          const scoped = scopeProjectsForUser(dealScoped, { userId, ownOnly });
          setOverdueDeals(pickOverdueProjects(scoped, PRIORITY_FETCH_LIMIT, cached.stages));
        }
        // Coalesce summary khi soft-ingest dày (tránh bão GET /summary).
        if (summaryDebounceRef.current) clearTimeout(summaryDebounceRef.current);
        summaryDebounceRef.current = setTimeout(() => {
          summaryDebounceRef.current = null;
          const seq = ++summaryReqSeqRef.current;
          const filters = boardFiltersRef.current;
          void fetchProductionBoardSummary(filters).then((summary) => {
            if (!summary || seq !== summaryReqSeqRef.current) return;
            const cachedBoard = getCachedBoard(filters);
            const client = cachedBoard
              ? computeSxBoardKpis(cachedBoard.projects, cachedBoard.stages)
              : null;
            setKpis((prev) => ({
              ...EMPTY_KPI,
              total: summary.total,
              producing: summary.producing,
              awaitingDelivery: summary.awaitingDelivery,
              shipped: summary.shipped,
              completed: client?.completed ?? prev.completed,
              overdue: summary.overdue,
            }));
          });
        }, 800);
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  useEffect(() => () => {
    if (summaryDebounceRef.current) clearTimeout(summaryDebounceRef.current);
  }, []);

  // Quay lại tab Tổng quan → catch-up nhẹ (realtime onlyWhenFocused bỏ qua khi ở tab khác).
  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefreshRef.current) {
        skipNextFocusRefreshRef.current = false;
        return undefined;
      }
      const now = Date.now();
      if (now - lastSilentAtRef.current < 12_000) return undefined;
      lastSilentAtRef.current = now;
      void load('silent');
      return undefined;
    }, [load]),
  );

  const overdueTasksAll = useMemo(() => tasks.filter((t) => isTaskOverdue(t)), [tasks]);
  const overdueTaskCount = overdueTasksAll.length;

  /** Chỉ việc QUÁ HẠN — hạn cũ nhất lên trước. */
  const overdueTasks = useMemo(() => (
    overdueTasksAll.slice().sort((a, b) => {
      const ad = taskDueIso(a) || '';
      const bd = taskDueIso(b) || '';
      return ad.localeCompare(bd);
    })
  ), [overdueTasksAll]);

  const openTaskSections = useMemo(() => groupTasksByDeal(overdueTasks), [overdueTasks]);

  const taskPages = totalPagesOf(openTaskSections.length, TASK_PAGE_SIZE);
  const dealPages = totalPagesOf(overdueDeals.length, DEAL_PAGE_SIZE);
  const safeTaskPage = Math.min(taskPage, taskPages);
  const safeDealPage = Math.min(dealPage, dealPages);
  const previewTaskSections = pageSlice(openTaskSections, safeTaskPage, TASK_PAGE_SIZE);
  const previewDeals = pageSlice(overdueDeals, safeDealPage, DEAL_PAGE_SIZE);

  useEffect(() => {
    if (taskPage > taskPages) setTaskPage(taskPages);
  }, [taskPage, taskPages]);
  useEffect(() => {
    if (dealPage > dealPages) setDealPage(dealPages);
  }, [dealPage, dealPages]);

  const toggleOverviewTaskSection = useCallback((leadId: string) => {
    setExpandedTaskLeads((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
  }, []);

  const openNotifs = useCallback(async () => {
    void ensureNotificationPermission();
    setNotifOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  const goKanban = useCallback(() => tabNav.navigate('Kanban'), [tabNav]);
  const goWork = useCallback(
    (status: 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue' = 'all') => {
      tabNav.navigate('Work', {
        scope: teamView ? 'team' : 'mine',
        status,
      });
    },
    [tabNav, teamView],
  );

  // ── Dữ liệu cho bố cục NHÂN VIÊN ────────────────────────────────────────
  /** 4 ô: Tổng dự án · Đang sản xuất · Hoàn tất · Quá hạn. */
  const staffKpiStats = useMemo<KpiStat[]>(() => [
    { key: 'total', label: 'Tổng dự án', value: staffKpis.total, color: colors.primary, icon: 'cube-outline', onPress: goKanban },
    { key: 'producing', label: 'Đang sản xuất', value: staffKpis.producing, color: KPI_CYAN, icon: 'play-outline', onPress: goKanban },
    { key: 'completed', label: 'Hoàn tất', value: staffKpis.completed, color: colors.success, icon: 'checkmark-done-outline', onPress: goKanban },
    { key: 'overdue', label: 'Dự án quá hạn', value: staffKpis.overdue, color: colors.danger, icon: 'alert-circle-outline', onPress: () => openOverdueProjects() },
  ], [staffKpis, colors, goKanban, openOverdueProjects]);

  /**
   * «Cần xử lý hôm nay» = việc chưa xong mà đã quá hạn hoặc đến hạn hôm nay (giờ VN). Việc hạn xa /
   * chưa có hạn không tính, nếu không con số trùng tổng việc tồn và sai nghĩa «hôm nay».
   * Đếm hết `tasks`, không đếm theo số dòng xem trước.
   */
  /** Huy hiệu «Công việc dự án»: mọi việc chưa xong (chưa làm + đang làm + quá hạn), không tính việc đã hoàn thành. */
  const staffUndoneTaskCount = useMemo(
    () => tasks.filter((t) => !isTaskDone(String(t.status))).length,
    [tasks],
  );

  const { staffOpenTaskCount, staffOverdueTaskCount } = useMemo(() => {
    let due = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (isTaskDone(String(t.status))) continue;
      if (isTaskOverdue(t)) {
        due += 1;
        overdue += 1;
      } else if (isTaskDueOnDay(t)) {
        due += 1;
      }
    }
    return { staffOpenTaskCount: due, staffOverdueTaskCount: overdue };
  }, [tasks]);

  /**
   * Việc của tôi GOM THEO DỰ ÁN (giống tab Công việc) — gọn hơn liệt kê từng việc, và nhãn trạng
   * thái nhóm tính chung với tab đó. Nhóm cần chú ý nhất lên trước: Quá hạn (nhiều việc trễ hơn
   * lên trên) → Đang làm → Chưa làm → Hoàn thành.
   */
  const staffTaskGroupsAll = useMemo<StaffTaskGroup[]>(() => {
    const rank: Record<string, number> = { overdue: 0, doing: 1, todo: 2, done: 3 };
    const sections = groupTasksByDeal(tasks);
    const dueTodayById = new Map(
      sections.map((sec) => [
        sec.leadId,
        sec.tasks.some((t) => !isTaskDone(String(t.status)) && isTaskDueOnDay(t)),
      ]),
    );
    return sections
      .map((sec) => {
        const sum = summarizeTaskGroup(sec.tasks);
        return {
          id: sec.leadId,
          projectId: sec.projectId ? String(sec.projectId) : null,
          title: `${sec.code ? `${sec.code} · ` : ''}${sec.title || 'Dự án'}`,
          // Việc bên trong (hiện khi xổ nhóm): việc chưa xong trước, quá hạn lên đầu, xong xếp cuối.
          tasks: sec.tasks
            .slice()
            .sort((a, b) => {
              const ad = isTaskDone(String(a.status)) ? 1 : 0;
              const bd = isTaskDone(String(b.status)) ? 1 : 0;
              if (ad !== bd) return ad - bd;
              const ao = isTaskOverdue(a) ? 0 : 1;
              const bo = isTaskOverdue(b) ? 0 : 1;
              if (ao !== bo) return ao - bo;
              return (taskDueIso(a) || '').localeCompare(taskDueIso(b) || '');
            })
            .map((t) => ({
              id: String(t.id),
              title: String(t.title || 'Công việc'),
              done: isTaskDone(String(t.status)),
              inProgress: isTaskInProgress(String(t.status)),
              overdue: isTaskOverdue(t),
              dueToday: !isTaskDone(String(t.status)) && isTaskDueOnDay(t),
              dueLabel: shortDateLabel(taskDueIso(t)) === '—' ? null : shortDateLabel(taskDueIso(t)),
            })),
          done: sum.done,
          open: sum.open,
          total: sum.total,
          overdueCount: sum.overdueCount,
          dueTodayCount: sec.tasks.filter((t) => !isTaskDone(String(t.status)) && isTaskDueOnDay(t)).length,
          tone: sum.tone,
        };
      })
      .sort((a, b) => {
        // Nhóm có việc quá hạn lên đầu, kế đó nhóm có việc đến hạn hôm nay (chưa xong).
        const ua = a.overdueCount > 0 ? 0 : dueTodayById.get(a.id) ? 1 : 2;
        const ub = b.overdueCount > 0 ? 0 : dueTodayById.get(b.id) ? 1 : 2;
        if (ua !== ub) return ua - ub;
        const ra = a.tone ? rank[a.tone] : 4;
        const rb = b.tone ? rank[b.tone] : 4;
        if (ra !== rb) return ra - rb;
        return b.overdueCount - a.overdueCount;
      });
  }, [tasks]);
  const staffTaskGroups = useMemo(
    () => staffTaskGroupsAll.slice(0, STAFF_PREVIEW_LIMIT),
    [staffTaskGroupsAll],
  );

  /**
   * «Đang tham gia» = có việc được giao trong dự án đó, HOẶC đứng tên phụ trách.
   * Lọc theo mỗi `production_person_id` là sai: nhân viên xưởng được GIAO việc
   * chứ hiếm khi được đặt làm người phụ trách, nên danh sách luôn rỗng.
   */
  const staffProjectAll = useMemo<StaffProjectRow[]>(() => {
    void projectsVersion; // phụ thuộc có chủ ý: dữ liệu nằm ở ref
    const stageById = new Map(boardStages.map((s) => [String(s.id), s]));
    const projectById = new Map(allProjectsRef.current.map((p) => [String(p.id), p]));

    // Nguồn chính là CHÍNH VIỆC ĐƯỢC GIAO: việc của nhân viên có thể nằm ở dự án
    // ngoài bộ lọc công ty/phân loại đang chọn, nên dò theo bảng sẽ sót.
    const rows: StaffProjectRow[] = [];
    const seen = new Set<string>();
    const push = (id: string, fallbackName: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const p = projectById.get(id);
      const stage = p
        ? stageById.get(String(p.sx_kanban_column_id || p.resolved_column_id || ''))
        : undefined;
      rows.push({
        id,
        name: String(p?.name || fallbackName || '—'),
        // Dự án thường không tự có %; lấy theo % tiến độ gắn với cột đang đứng.
        percent: Number(p?.sx_pipeline_percent ?? p?.progress ?? stage?.progress_percent ?? 0),
        stageName: String(stage?.name || p?.stage_name || 'Chưa vào cột'),
        stageColor: stage?.color || null,
        orderLabel: p?.order_date ? shortDateLabel(p.order_date) : null,
        deliveryLabel: p?.delivery_date ? shortDateLabel(p.delivery_date) : null,
        deadlineLabel: p ? (shortDateLabel(sxProjectDeadlineRaw(p, boardStages)) === '—' ? null : shortDateLabel(sxProjectDeadlineRaw(p, boardStages))) : null,
        overdue: Boolean(p?.is_overdue || p?.is_delivery_overdue),
      });
    };

    for (const t of tasks) {
      const pid = t.lead?.project_id;
      if (pid) push(String(pid), String(t.lead?.title || ''));
    }
    // Thêm dự án họ đứng tên phụ trách (nếu có) mà chưa xuất hiện qua việc.
    if (userId) {
      for (const p of allProjectsRef.current) {
        if (String(p.production_person_id || '') === String(userId)) {
          push(String(p.id), String(p.name || ''));
        }
      }
    }
    // Dự án quá hạn lên đầu, kế đó dự án có hạn / ngày giao là hôm nay; còn lại giữ thứ tự cũ.
    const todayKey = vnDayKey(new Date().toISOString());
    const urgency = (id: string): number => {
      const p = projectById.get(id);
      if (!p) return 2;
      if (p.is_overdue || p.is_delivery_overdue || projectIsDeadlineOverdue(p, boardStages)) return 0;
      const dl = vnDayKey(sxProjectDeadlineRaw(p, boardStages));
      const dv = vnDayKey(p.delivery_date);
      return dl === todayKey || dv === todayKey ? 1 : 2;
    };
    return rows
      .map((row, i) => ({ row, i, u: urgency(row.id) }))
      .sort((a, b) => a.u - b.u || a.i - b.i)
      .map((x) => x.row);
  }, [projectsVersion, tasks, userId, boardStages]);
  /** Chỉ phần xem trước; tổng thật là `staffProjectAll.length` (hiện ở huy hiệu). */
  const staffProjectRows = useMemo(
    () => staffProjectAll.slice(0, STAFF_PREVIEW_LIMIT),
    [staffProjectAll],
  );

  const kpiItems: KpiStat[] = [
    { key: 'total', label: 'Tổng dự án', value: kpis.total, color: colors.primary, icon: 'cube-outline', onPress: goKanban },
    { key: 'producing', label: 'Đang sản xuất', value: kpis.producing, color: KPI_CYAN, icon: 'play-outline', onPress: goKanban },
    {
      key: 'await',
      label: 'Chờ vận chuyển',
      value: kpis.awaitingDelivery,
      color: KPI_PURPLE,
      icon: 'pause-outline',
      onPress: goKanban,
    },
    {
      key: 'shipped',
      label: 'Đã vận chuyển',
      value: kpis.shipped,
      color: colors.success,
      icon: 'checkmark-outline',
      onPress: goKanban,
    },
    {
      key: 'done',
      label: 'Hoàn tất',
      value: kpis.completed,
      color: colors.warning,
      icon: 'flag-outline',
      onPress: goKanban,
    },
    {
      key: 'overdue',
      label: 'Quá hạn dự án',
      value: kpis.overdue,
      color: colors.danger,
      icon: 'alert-circle-outline',
      onPress: () => { if (kpis.overdue > 0) openOverdueProjects(); else goKanban(); },
    },
  ];

  /**
   * Chỉ giữ nơi KHÔNG có lối vào nào khác trên màn này.
   * Đã bỏ: Dự án / Công việc / Tin nhắn (trùng hệt thanh tab dưới), Quá hạn (đã có
   * thẻ đỏ đầu trang và mục riêng, còn khi không quá hạn thì vào từ Menu), và
   * Đăng xuất (thao tác hiếm, đã có trong Menu, đặt cạnh ô hay bấm dễ chạm nhầm).
   */
  const quickActions: ShortcutAction[] = [
    {
      key: 'planner',
      label: 'Planner',
      icon: 'calendar-outline',
      color: colors.success,
      onPress: () => tabNav.navigate('Planner'),
    },
    {
      key: 'leaves',
      label: 'Lịch nghỉ',
      icon: 'airplane-outline',
      color: '#F97316',
      onPress: () => rootNav.navigate('Leaves'),
    },
    {
      key: 'profile',
      label: 'Hồ sơ',
      icon: 'person-outline',
      color: '#38BDF8',
      onPress: () => tabNav.navigate('Profile'),
    },
    {
      key: 'company',
      label: 'Công ty',
      icon: 'business-outline',
      color: '#8B5CF6',
      onPress: () => {
        if (canPickCompany) setCompanyPickerOpen(true);
        else tabNav.navigate('Profile');
      },
    },
  ];

  const overdueDealCount = ownOnly ? staffOverdueDeals.length : kpis.overdue;
  const overdueTotal = overdueTaskCount + overdueDealCount;
  /** Lẫn cả hai loại thì mới cần tách nút; một loại thì tiêu đề đã nói đủ. */
  const bothOverdueKinds = overdueTaskCount > 0 && overdueDealCount > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {lightHero ? (
        <>
          {/* Chữ status bar trắng khi màn đang hiển thị; hết focus thì App tự trả về kiểu của nó. */}
          {isFocused ? <StatusBar style="light" /> : null}
          {/* Dải xanh đậm phủ cả vùng status bar + hero, kéo thêm 24px xuống dưới để
              hai góc bo của khung trắng lộ ra nền xanh (đúng thiết kế). */}
          <LinearGradient
            colors={['#2F6FE4', '#1E4FC4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + heroH + 24 }}
          />
        </>
      ) : null}
      {/* Không phủ chuyển sắc kín bề ngang hero: nó làm cả khối sáng đều lên và
          tạo ranh giới với nền phía dưới, đọc thành một mảng riêng. Chỉ dùng đốm
          sáng tròn, và đặt nó nằm TRỌN trong hero (tính theo chiều cao đo được)
          để không bị overflow cắt ngang. */}
      <View
        style={[styles.hero, lightHero && { backgroundColor: 'transparent' }]}
        onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>
        {heroH > 0 ? (
          <GlowSpot
            size={heroGlowSize}
            color={colors.primary}
            intensity={isDark ? 0.018 : 0.008}
            style={{ position: 'absolute', top: heroH - heroGlowSize - 4, right: -heroGlowSize * 0.22 }}
          />
        ) : null}
        <View style={styles.heroTop}>
          <View style={styles.heroIdentity}>
            <Avatar name={userName} avatarUrl={user?.avatar} size={52} color={lightHero ? '#FFFFFF' : colors.primary} />
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={[styles.helloLine, lightHero && heroTextStyle]} numberOfLines={1}>{helloLine}</Text>
              {/* Nhân viên quan tâm «hôm nay phải làm gì» hơn là thứ mấy. */}
              {teamView ? (
                <Text style={[styles.dateLine, lightHero && heroSubTextStyle]}>{dateLabel}</Text>
              ) : tasksFailed && tasks.length === 0 ? (
                // Lỗi tải ≠ «không có việc»: đừng báo nhân viên rảnh khi thực ra chưa lấy được dữ liệu.
                <Text style={[styles.dateLine, lightHero && heroSubTextStyle]}>Chưa tải được công việc của bạn</Text>
              ) : (
                // Nhãn nổi: đây là thông tin nhân viên cần thấy đầu tiên, chữ phụ mờ 13px là quá nhẹ.
                <View style={[styles.todayChip, lightHero ? styles.todayChipLight : styles.todayChipDark]}>
                  <Ionicons
                    name={staffOpenTaskCount > 0 ? 'flash' : 'checkmark-circle'}
                    size={15}
                    color={staffOpenTaskCount > 0 ? '#FDE047' : lightHero ? '#FFFFFF' : colors.success}
                  />
                  <Text style={[styles.todayChipTxt, lightHero && heroTextStyle]} numberOfLines={2}>
                    {staffOpenTaskCount > 0 ? (
                      <>
                        Hôm nay bạn có{' '}
                        <Text style={[styles.todayChipNum, lightHero && { color: '#FDE047' }]}>
                          {staffOpenTaskCount}
                        </Text>
                        {' '}công việc cần xử lý
                      </>
                    ) : 'Hôm nay bạn không có công việc nào cần xử lý'}
                  </Text>
                  {staffOpenTaskCount > 0 && staffOverdueTaskCount > 0 ? (
                    <View style={styles.todayOverduePill}>
                      <Ionicons name="alert-circle" size={12} color="#FFFFFF" />
                      <Text style={styles.todayOverdueTxt}>{staffOverdueTaskCount} quá hạn</Text>
                    </View>
                  ) : null}
                </View>
              )}
              {/* Nhân viên: header chỉ một dòng — khớp thiết kế, bớt chữ thừa. */}
              {teamView ? (
                <Text style={[styles.wishLine, lightHero && heroSubTextStyle]} numberOfLines={2}>{wishLine}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.headerBtns}>
            <Pressable
              style={[styles.iconBtn, lightHero && heroIconBtnStyle]}
              onPress={() => tabNav.navigate('Profile')}
              accessibilityLabel="Menu"
              hitSlop={6}
            >
              <Ionicons name="menu-outline" size={20} color={lightHero ? '#FFFFFF' : colors.text} />
              {messageUnread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={[styles.iconBtn, lightHero && heroIconBtnStyle]}
              onPress={() => void openNotifs()}
              accessibilityLabel="Thông báo"
              hitSlop={6}
            >
              <Ionicons name="notifications-outline" size={20} color={lightHero ? '#FFFFFF' : colors.text} />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={
          teamView
            ? [styles.content, { paddingBottom: insets.bottom + 110 }]
            // Nhân viên: khung Tổng quan tự lo đệm đáy và kéo dài hết màn hình.
            : [styles.content, { flexGrow: 1, paddingBottom: 0 }]
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <Pressable style={styles.errorBanner} onPress={() => void load('init')}>
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={styles.errorTxt} numberOfLines={2}>
              {error} · Chạm để thử lại
            </Text>
          </Pressable>
        ) : null}

        {boardTruncated ? (
          <View style={styles.truncatedBanner}>
            <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.truncatedBannerTxt}>
              Đã tải tối đa ~6.000 dự án. Vào tab Dự án và thu hẹp bộ lọc để xem đủ.
            </Text>
          </View>
        ) : null}

        {/* Chip lọc công ty / phân loại: chỉ quản lý cần. Nhân viên bị khóa
            theo công ty của mình nên hai chip này không đổi được gì. */}
        {teamView ? (
        <View style={styles.scopeRow}>
          <Pressable
            style={styles.scopeChip}
            onPress={() => { if (canPickCompany) setCompanyPickerOpen(true); }}
            disabled={!canPickCompany}
            accessibilityRole="button"
            accessibilityLabel={`Lọc công ty: ${workshopLabel}`}
          >
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text style={styles.scopeChipTxt} numberOfLines={1}>{workshopLabel}</Text>
            {canPickCompany ? (
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            ) : null}
          </Pressable>

          {workTypeOptions.length > 1 ? (
            <Pressable
              style={styles.scopeChip}
              onPress={() => setTypePickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Lọc phân loại: ${workTypeLabel}`}
            >
              <Ionicons name="layers-outline" size={14} color={colors.primary} />
              <Text style={styles.scopeChipTxt} numberOfLines={1}>{workTypeLabel}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        ) : null}

        {loading && !refreshing && kpis.total === 0 && overdueTotal === 0 ? (
          <View style={styles.inlineLoad}>
            <SpinningLoader size="large" color={colors.primary} />
            <Text style={styles.muted}>Đang tải tổng quan…</Text>
          </View>
        ) : teamView && overdueTotal > 0 ? (
          // Công việc và dự án quá hạn là HAI MÀN khác nhau. Khi có cả hai loại thì
          // phải giữ hai nút riêng, gộp một nút sẽ làm loại còn lại không tới được.
          <Pressable
            onPress={bothOverdueKinds
              ? undefined
              : overdueTaskCount > 0
                ? () => goWork('overdue')
                : openOverdueProjects}
            disabled={bothOverdueKinds}
            accessibilityRole={bothOverdueKinds ? undefined : 'button'}
          >
          <LinearGradient
            colors={[
              colorWithAlpha(colors.danger, isDark ? 0.42 : 0.20),
              colorWithAlpha(colors.danger, isDark ? 0.14 : 0.06),
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.alertBanner}
          >
            <View style={styles.alertIcon}>
              <Ionicons name="alert-circle" size={22} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              {/* Gọi đúng thứ đang có: chỉ dùng từ chung "hạng mục" khi thực sự
                  lẫn cả hai loại, nếu không thì nói thẳng là công việc hay dự án. */}
              <Text style={styles.alertTitle}>
                {overdueTaskCount > 0 && overdueDealCount > 0
                  ? `${overdueTotal} hạng mục quá hạn`
                  : overdueTaskCount > 0
                    ? `${overdueTaskCount} công việc quá hạn`
                    : `${overdueDealCount} dự án quá hạn`}
              </Text>
              {/* Chỉ tách chip khi lẫn CẢ HAI loại — mỗi loại mở một màn khác nhau
                  nên phải có nút riêng. Một loại thì tiêu đề đã nói hết, chip chỉ
                  lặp lại; khi đó cho cả thẻ bấm được. */}
              {bothOverdueKinds ? (
                <View style={styles.alertActions}>
                  <Pressable style={styles.alertChip} hitSlop={6} onPress={() => goWork('overdue')}>
                    <Text style={styles.alertChipTxt}>{overdueTaskCount} công việc</Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.danger} />
                  </Pressable>
                  <Pressable style={styles.alertChip} hitSlop={6} onPress={openOverdueProjects}>
                    <Text style={styles.alertChipTxt}>{overdueDealCount} dự án</Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.danger} />
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.alertSub}>{workshopLabel}</Text>
            </View>
            {bothOverdueKinds ? null : (
              <Ionicons name="chevron-forward" size={20} color={colors.danger} />
            )}
          </LinearGradient>
          </Pressable>
        ) : (
          // Nhân viên: bỏ dải «không có quá hạn» — thiết kế không có, và KPI
          // «Quá hạn» ngay dưới đã nói đúng con số đó rồi.
          teamView ? (
            <View style={styles.okBanner}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.okTxt}>Không có công việc / dự án quá hạn</Text>
            </View>
          ) : null
        )}

        {!teamView ? (
          <StaffOverviewBody
            kpiStats={staffKpiStats}
            taskGroups={staffTaskGroups}
            projectRows={staffProjectRows}
            taskTotal={staffUndoneTaskCount}
            taskGroupTotal={staffTaskGroupsAll.length}
            loadFailed={tasksFailed}
            projectTotal={staffProjectAll.length}
            onOpenProject={openProjectDetail}
            onSeeAllTasks={() => goWork('all')}
            onSeeAllProjects={goKanban}
          />
        ) : (
        <>
        <SectionHeader icon="bar-chart-outline" title="Tổng quan sản xuất" />
        {/* Lưới 2 cột thay cho cuộn ngang: có 6 ô mà cuộn ngang chỉ lọt ~4, hai ô
            cuối nằm ngoài rìa phải nên người dùng phải biết là có mới vuốt tới. */}
        <View style={styles.kpiGrid}>
          {kpiItems.map((k) => (
            <View key={k.key} style={styles.kpiCell}>
              <KpiCard stat={k} />
            </View>
          ))}
        </View>

        <SectionHeader
          icon="alarm-outline"
          iconColor={colors.danger}
          title="Công việc quá hạn"
          actionLabel={overdueTaskCount > 0 ? `Tất cả (${overdueTaskCount})` : 'Xem công việc'}
          onAction={() => goWork(overdueTaskCount > 0 ? 'overdue' : 'all')}
        />
        <View style={styles.card}>
          {previewTaskSections.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkbox-outline" size={20} color={colors.textFaint} />
              <Text style={styles.emptyTxt}>Không có công việc quá hạn</Text>
            </View>
          ) : (
            <>
              {previewTaskSections.map((section, sIdx) => {
                const expanded = !!expandedTaskLeads[section.leadId];
                const openCount = section.tasks.filter((t) => !isTaskDone(String(t.status))).length;
                // Chấm mã hoá MỨC KHẨN theo hạn — thứ chưa có ở dòng chữ bên cạnh.
                // (Mã hoá tiến độ thì trùng với "x/y xong" đã ghi rõ bằng số.)
                const hasOverdue = section.tasks.some((t) => isTaskOverdue(t));
                const dueKeys = section.tasks
                  .map((t) => vnDayKey(taskDueIso(t)))
                  .filter(Boolean)
                  .sort();
                const nearestDue = dueKeys[0] || '';
                const dueToday = !hasOverdue && nearestDue === todayKey;
                const dotColor = hasOverdue
                  ? colors.danger
                  : dueToday
                    ? colors.warning
                    : nearestDue
                      ? colors.primary
                      : colors.textFaint;
                return (
                  <View key={section.leadId} style={sIdx > 0 ? styles.dealGroupGap : undefined}>
                    <Pressable
                      style={styles.dealGroupHead}
                      onPress={() => toggleOverviewTaskSection(section.leadId)}
                    >
                      <Ionicons
                        name={expanded ? 'chevron-down' : 'chevron-forward'}
                        size={16}
                        color={colors.textMuted}
                      />
                      <View
                        style={[
                          styles.taskDot,
                          { backgroundColor: dotColor },
                        ]}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.dealGroupTitle} numberOfLines={1}>
                          {section.code ? `${section.code} · ` : ''}{section.title || 'Deal'}
                        </Text>
                        <Text style={styles.dealGroupMeta} numberOfLines={1}>
                          {section.tasks.length - openCount}/{section.tasks.length} xong
                          {openCount > 0 ? ` · ${openCount} còn lại` : ''}
                          {nearestDue ? ' · ' : ''}
                          {nearestDue ? (
                            <Text style={{ color: hasOverdue ? colors.danger : dueToday ? colors.warning : colors.textMuted }}>
                              {hasOverdue ? 'Quá hạn ' : dueToday ? 'Hôm nay' : 'Hạn '}
                              {dueToday ? '' : shortDay(nearestDue)}
                            </Text>
                          ) : null}
                          {section.customerName ? ` · ${section.customerName}` : ''}
                        </Text>
                      </View>
                      {section.projectId ? (
                        <Pressable
                          style={({ pressed }) => [styles.viewBtn, pressed && styles.pressed]}
                          hitSlop={6}
                          onPress={() => openProjectDetail(String(section.projectId))}
                          accessibilityLabel={`Xem dự án ${section.code}`}
                        >
                          <Text style={styles.viewBtnTxt}>Xem</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                    {expanded
                      ? section.tasks.map((t, idx) => {
                          const overdue = isTaskOverdue(t);
                          const due = formatTaskDeadline(taskDueIso(t));
                          const people =
                            t.assignees && t.assignees.length
                              ? t.assignees
                              : t.assignee
                                ? [t.assignee]
                                : [];
                          const assigneeName =
                            people.map((p) => p.full_name?.trim()).filter(Boolean).join(', ')
                            || 'Chưa gán';
                          return (
                            <Pressable
                              key={t.id}
                              style={[styles.rowItem, styles.dealTaskRow, idx > 0 && styles.rowBorder]}
                              onPress={() => {
                                const pid = t.lead?.project_id || section.projectId;
                                if (pid) openProjectDetail(String(pid), { focusTaskId: workTaskFocusCrmId(t) });
                                else goWork(overdue ? 'overdue' : 'all');
                              }}
                            >
                              <View
                                style={[
                                  styles.rowIcon,
                                  {
                                    backgroundColor: overdue
                                      ? colors.dangerSoft
                                      : isTaskInProgress(t.status)
                                        ? colors.primarySoft
                                        : colorWithAlpha(colors.warning, 0.16),
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={
                                    overdue
                                      ? 'alert-circle'
                                      : isTaskInProgress(t.status)
                                        ? 'time'
                                        : 'ellipse-outline'
                                  }
                                  size={18}
                                  color={
                                    overdue
                                      ? colors.danger
                                      : isTaskInProgress(t.status)
                                        ? colors.primary
                                        : colors.warning
                                  }
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{t.title || 'Nhiệm vụ'}</Text>
                                <Text style={styles.rowSub} numberOfLines={1}>
                                  Phụ trách: {assigneeName}
                                </Text>
                                <Text style={styles.rowSub} numberOfLines={1}>
                                  {statusPillLabel(t.status)}
                                  {overdue ? ' · Quá hạn' : ''}
                                  {` · ${due}`}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                            </Pressable>
                          );
                        })
                      : null}
                  </View>
                );
              })}
              {openTaskSections.length > TASK_PAGE_SIZE ? (
                <View style={styles.pager}>
                  <Pressable
                    style={[styles.pageBtn, safeTaskPage <= 1 && styles.pageBtnDisabled]}
                    disabled={safeTaskPage <= 1}
                    onPress={() => setTaskPage((p) => Math.max(1, p - 1))}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={safeTaskPage <= 1 ? colors.textFaint : colors.text}
                    />
                  </Pressable>
                  <Text style={styles.pageLabel}>
                    Trang {safeTaskPage}/{taskPages}
                  </Text>
                  <Pressable
                    style={[styles.pageBtn, safeTaskPage >= taskPages && styles.pageBtnDisabled]}
                    disabled={safeTaskPage >= taskPages}
                    onPress={() => setTaskPage((p) => Math.min(taskPages, p + 1))}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={safeTaskPage >= taskPages ? colors.textFaint : colors.text}
                    />
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </View>

        <SectionHeader
          icon="alarm-outline"
          iconColor={colors.danger}
          title="Dự án quá hạn"
          actionLabel={
            (ownOnly ? overdueDeals.length : kpis.overdue) > 0
              ? `Tất cả (${ownOnly ? overdueDeals.length : kpis.overdue})`
              : 'Mở danh sách'
          }
          onAction={openOverdueProjects}
        />
        <View style={styles.card}>
          {previewDeals.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="briefcase-outline" size={20} color={colors.textFaint} />
              <Text style={styles.emptyTxt}>
                {!ownOnly && kpis.overdue > overdueDeals.length
                  ? `Có ${kpis.overdue} dự án quá hạn — mở danh sách đầy đủ`
                  : 'Không có dự án quá hạn'}
              </Text>
            </View>
          ) : (
            <>
              {previewDeals.map((p, idx) => (
                <Pressable
                  key={p.id}
                  style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                  onPress={() => openProjectOnBoard(p.id, { quickFilter: 'overdue', viewMode: 'list' })}
                >
                  <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
                    <Text style={[styles.avatarTxt, { color: colors.danger }]}>
                      {initialsFrom(p.customer_name || p.name || p.code)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{p.name || p.code}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {p.production_person_name
                        ? `Phụ trách: ${p.production_person_name}`
                        : (p.customer_name || p.code)}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.danger }]} numberOfLines={1}>
                      Hạn {shortDateLabel(sxProjectDeadlineRaw(p, boardStages))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              ))}
              {overdueDeals.length > DEAL_PAGE_SIZE ? (
                <View style={styles.pager}>
                  <Pressable
                    style={[styles.pageBtn, safeDealPage <= 1 && styles.pageBtnDisabled]}
                    disabled={safeDealPage <= 1}
                    onPress={() => setDealPage((p) => Math.max(1, p - 1))}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={safeDealPage <= 1 ? colors.textFaint : colors.text}
                    />
                  </Pressable>
                  <Text style={styles.pageLabel}>
                    Trang {safeDealPage}/{dealPages}
                  </Text>
                  <Pressable
                    style={[styles.pageBtn, safeDealPage >= dealPages && styles.pageBtnDisabled]}
                    disabled={safeDealPage >= dealPages}
                    onPress={() => setDealPage((p) => Math.min(dealPages, p + 1))}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={safeDealPage >= dealPages ? colors.textFaint : colors.text}
                    />
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </View>

        <SectionHeader icon="flash-outline" title="Lối tắt" />
        <View style={styles.quickGrid}>
          {quickActions.map((a) => (
            <View key={a.key} style={styles.quickCell}>
              <ShortcutTile action={a} />
            </View>
          ))}
        </View>
        </>
        )}
      </ScrollView>

      <CommentNotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenProject={(pid) => {
          setNotifOpen(false);
          openProjectDetail(pid);
        }}
      />

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Chọn công ty"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={(id) => { void onSelectCompany(id); }}
        onClose={() => setCompanyPickerOpen(false)}
      />

      <FilterPickerModal
        visible={typePickerOpen}
        title="Chọn phân loại"
        options={workTypeOptions}
        selectedId={filterWorkTypeId}
        onSelect={(id) => { void onSelectWorkType(id); }}
        onClose={() => setTypePickerOpen(false)}
      />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    hero: {
      paddingHorizontal: PAGE_HPAD,
      paddingTop: 12,
      paddingBottom: 14,
      backgroundColor: colors.bg,
      // Cắt đốm sáng theo khung hero để nó không tràn xuống vùng cuộn.
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    heroIdentity: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    helloLine: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    dateLine: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    todayChip: {
      marginTop: 6,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    todayChipLight: {
      backgroundColor: 'rgba(255,255,255,0.20)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    todayChipDark: {
      backgroundColor: colorWithAlpha(colors.primary, 0.18),
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.primary, 0.4),
    },
    todayChipTxt: {
      flexShrink: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    todayChipNum: {
      fontSize: 16,
      fontWeight: '900',
    },
    /** Nhãn đỏ đặc để việc quá hạn nổi bật trên cả nền header xanh lẫn nền tối. */
    todayOverduePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: '#DC2626',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    todayOverdueTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
    wishLine: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 13.5,
      fontWeight: '600',
      lineHeight: 18,
    },
    headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
    content: { paddingHorizontal: PAGE_HPAD, paddingTop: 8 },
    scopeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    scopeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      flexShrink: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.full,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: '100%',
    },
    scopeChipTxt: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      flexShrink: 1,
    },
    inlineLoad: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 14,
      borderRadius: Radii.lg,
      backgroundColor: colors.cardAlt,
    },
    muted: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.35),
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    errorTxt: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '700' },
    truncatedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colorWithAlpha(colors.warning, 0.14),
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.warning, 0.35),
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    truncatedBannerTxt: { flex: 1, color: colors.warning, fontSize: 12, fontWeight: '700', lineHeight: 16 },
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.4),
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 14,
      overflow: 'hidden',
    },
    alertIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertTitle: { color: colors.danger, fontSize: 14.5, fontWeight: '800' },
    alertSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    alertActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    alertChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.35),
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    alertChipTxt: { color: colors.danger, fontSize: 12.5, fontWeight: '700' },
    okBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colorWithAlpha(colors.success, 0.12),
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.success, 0.28),
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 14,
    },
    okTxt: { color: colors.success, fontSize: 13.5, fontWeight: '700', flex: 1 },
    // flexWrap thay cho lưới CSS; gap lo khoảng cách nên không cần margin lẻ.
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCell: { width: '47.5%', flexGrow: 1 },
    taskDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    viewBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radii.md,
      backgroundColor: colorWithAlpha(colors.primary, 0.14),
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.primary, 0.35),
    },
    viewBtnTxt: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    card: {
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    emptyTxt: { flex: 1, color: colors.textFaint, fontSize: 13, fontWeight: '600' },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dealGroupGap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dealGroupHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    dealGroupTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
    dealGroupMeta: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    dealTaskRow: {
      paddingLeft: 18,
      backgroundColor: colorWithAlpha(colors.bgElevated, 0.55),
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarTxt: { fontSize: 12, fontWeight: '800' },
    rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    rowSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.cardAlt,
    },
    pageBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageBtnDisabled: { opacity: 0.45 },
    pageLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', minWidth: 72, textAlign: 'center' },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: Spacing.lg,
    },
    // flexWrap thay cho lưới CSS: mỗi ô chiếm 1/4 bề ngang, tự xuống hàng.
    quickCell: { width: '22%', flexGrow: 1 },
    pressed: { opacity: 0.82 },
  });
}
