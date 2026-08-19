import SpinningLoader from '../components/SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchEventsRange, type AppEvent } from '../api/events';
import { formatApiError } from '../api/client';
import Avatar from '../components/Avatar';
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import FilterPickerModal from '../components/FilterPickerModal';
import ProjectCommentModal from '../components/ProjectCommentModal';
import TapHighlight from '../components/TapHighlight';
import { ymd } from '../components/calendar/CalendarChrome';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import type { MainTabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  fetchCommentNotifications,
  isWorkshopDealNotification,
  isVcRelevantNotification,
  notificationCategoryLabel,
  notificationFocusKpi,
  notificationIconName,
  notificationListSubtitle,
  notificationListTitle,
  notificationOpensComments,
  notificationProjectId,
  type SxCommentNotification,
} from '../lib/notificationApi';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import {
  fetchCompanies,
  fetchProductionBoard,
  fetchProductionProject,
  type CompanyOption,
} from '../lib/logisticsApi';
import { getCachedBoard, isCachedBoardFresh, setCachedBoard } from '../lib/logisticsBoardCache';
import { boardFiltersFromSharedSnap, loadKanbanFilters, saveKanbanFilters, subscribeSharedFilters } from '../lib/kanbanFilterStorage';
import { REALTIME_BOARD_TASK_EVENT } from '../lib/realtimeModes';
import {
  isSystemAdmin,
  isCompanyScopedAdmin,
  workshopCompaniesForCrossViewer,
} from '../lib/productionFilters';
import {
  computeVcBoardKpis,
  formatVnWeekdayDate,
  type VcBoardKpis,
  type VcKpiFocusKey,
} from '../lib/vcBoardKpis';
import {
  assignmentDealCardLabel,
  canViewTeamWork,
  fetchLogisticsWorkTasks,
  formatTaskDeadline,
  isTaskDone,
  isTaskInProgress,
  isTaskPending,
  statusPillLabel,
  taskDueIso,
  workTaskFocusCrmId,
  type WorkTask,
} from '../lib/workTasksApi';
import {
  assignmentDealLabel,
  fetchLogisticsAssignments,
  fetchPrivateDealInbox,
  type CrmAssignment,
  type SharedInboxGroup,
  type SharedInboxTask,
} from '../lib/sharedWorkspaceApi';
import {
  WORK_INBOX_FETCH_LIMIT,
  getCachedWorkInbox,
  invalidateWorkInboxCache,
  isCachedWorkInboxFresh,
  setCachedWorkInbox,
  workInboxCacheKey,
} from '../lib/workInboxCache';
import { filterVcAreaTabTasks, filterVcLogisticsUiTasks } from '../lib/projectDetailApi';
import type { ProductionProject } from '../types';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';

const PREVIEW_NOTIFS = 5;
const KPI_CARD_W = 132;
const KPI_CARD_GAP = 10;
/** Số deal / trang trong «Nhiệm vụ cần làm». */
const TODO_DEAL_PAGE_SIZE = 4;

type OverviewTodoSource = 'task' | 'assignment' | 'shared';
type WorkTabKey = 'tasks' | 'assignments' | 'shared';

type OverviewTodo = {
  key: string;
  source: OverviewTodoSource;
  title: string;
  status: string;
  deadline?: string | null;
  dealLabel: string;
  leadId: string;
  projectId?: string | null;
  focusId: string;
  focusLeadId?: string | null;
  badge: string;
  badgeTone: 'task' | 'assign' | 'shared';
};

type OverviewTodoDealGroup = {
  key: string;
  dealLabel: string;
  projectId?: string | null;
  leadId: string;
  items: OverviewTodo[];
};

function isOpenStatus(status: string): boolean {
  return isTaskPending(status) || isTaskInProgress(status);
}

function isDeadlineOverdue(deadline?: string | null, status?: string | null): boolean {
  if (!deadline || isTaskDone(String(status || 'pending'))) return false;
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

function todoOverdue(t: OverviewTodo): boolean {
  return isDeadlineOverdue(t.deadline, t.status);
}

function workTabForSource(source: OverviewTodoSource): WorkTabKey {
  if (source === 'assignment') return 'assignments';
  if (source === 'shared') return 'shared';
  return 'tasks';
}

/** Chọn tab Công việc có quá hạn (ưu tiên tab duy nhất, không thì tab nhiều nhất). */
function pickWorkTabForOverdue(todos: OverviewTodo[]): WorkTabKey {
  const counts: Record<WorkTabKey, number> = {
    tasks: 0,
    assignments: 0,
    shared: 0,
  };
  for (const t of todos) {
    if (!todoOverdue(t)) continue;
    counts[workTabForSource(t.source)] += 1;
  }
  const ranked: WorkTabKey[] = ['tasks', 'assignments', 'shared'];
  const withHits = ranked.filter((k) => counts[k] > 0);
  if (!withHits.length) return 'tasks';
  if (withHits.length === 1) return withHits[0];
  return withHits.slice().sort((a, b) => counts[b] - counts[a])[0];
}

function overdueWorkTabHint(todos: OverviewTodo[]): string {
  const counts: Record<WorkTabKey, number> = {
    tasks: 0,
    assignments: 0,
    shared: 0,
  };
  for (const t of todos) {
    if (!todoOverdue(t)) continue;
    counts[workTabForSource(t.source)] += 1;
  }
  const parts: string[] = [];
  if (counts.tasks) parts.push(`${counts.tasks} nhiệm vụ`);
  if (counts.assignments) parts.push(`${counts.assignments} giao việc`);
  if (counts.shared) parts.push(`${counts.shared} KG chung`);
  return parts.join(' · ');
}

function mapWorkTaskTodo(t: WorkTask): OverviewTodo {
  const leadId = String(t.lead_id || t.lead?.id || '');
  return {
    key: `task-${t.id}`,
    source: 'task',
    title: t.title || 'Nhiệm vụ',
    status: String(t.status || 'pending'),
    deadline: taskDueIso(t),
    dealLabel: assignmentDealCardLabel(t.lead),
    leadId,
    projectId: t.lead?.project_id ? String(t.lead.project_id) : null,
    focusId: workTaskFocusCrmId(t) || String(t.id),
    focusLeadId: leadId || null,
    badge: 'NV',
    badgeTone: 'task',
  };
}

function mapAssignmentTodo(a: CrmAssignment): OverviewTodo {
  const leadId = String(a.lead_id || a.lead?.id || '');
  return {
    key: `asg-${a.id}`,
    source: 'assignment',
    title: a.title || 'Giao việc',
    status: String(a.status || 'pending'),
    deadline: a.deadline || null,
    dealLabel: assignmentDealLabel(a.lead),
    leadId,
    projectId: a.lead?.project_id ? String(a.lead.project_id) : null,
    focusId: String(a.id),
    focusLeadId: leadId || null,
    badge: 'GV',
    badgeTone: 'assign',
  };
}

function mapSharedTodo(t: SharedInboxTask): OverviewTodo {
  const asgId = t.crm_assignment_id != null ? String(t.crm_assignment_id) : '';
  const leadId = String(t.lead_id || t.lead?.id || '');
  return {
    key: asgId ? `asg-${asgId}` : `shared-${t.id}`,
    source: 'shared',
    title: t.title || 'KG chung',
    status: String(t.status || 'pending'),
    deadline: t.deadline || null,
    dealLabel: assignmentDealLabel(t.lead)
      || [t.lead?.project_code, t.lead?.project_name].filter(Boolean).join(' · '),
    leadId,
    projectId: t.lead?.project_id ? String(t.lead.project_id) : null,
    focusId: asgId || String(t.id),
    focusLeadId: leadId || null,
    badge: 'KG',
    badgeTone: 'shared',
  };
}

function groupTodosByDeal(todos: OverviewTodo[]): OverviewTodoDealGroup[] {
  const map = new Map<string, OverviewTodoDealGroup>();
  for (const t of todos) {
    const gKey = t.leadId
      || (t.projectId ? `p-${t.projectId}` : '')
      || (t.dealLabel ? `d-${t.dealLabel}` : t.key);
    let g = map.get(gKey);
    if (!g) {
      g = {
        key: gKey,
        dealLabel: t.dealLabel || 'Không gắn deal',
        projectId: t.projectId || null,
        leadId: t.leadId || '',
        items: [],
      };
      map.set(gKey, g);
    }
    if (!g.dealLabel && t.dealLabel) g.dealLabel = t.dealLabel;
    if (!g.projectId && t.projectId) g.projectId = t.projectId;
    g.items.push(t);
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => {
      const ao = todoOverdue(a) ? 0 : 1;
      const bo = todoOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));
    });
  }
  groups.sort((a, b) => {
    const ao = a.items.some(todoOverdue) ? 0 : 1;
    const bo = b.items.some(todoOverdue) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.items[0]?.deadline || '9999';
    const bd = b.items[0]?.deadline || '9999';
    return String(ad).localeCompare(String(bd));
  });
  return groups;
}

function flattenSharedInboxTasks(inbox: {
  tasks?: SharedInboxTask[];
  groups?: { tasks?: SharedInboxTask[] }[];
}): SharedInboxTask[] {
  const fromTasks = Array.isArray(inbox.tasks) ? inbox.tasks : [];
  const fromGroups = (inbox.groups || []).flatMap((g) => g.tasks || []);
  const merged = [...fromTasks, ...fromGroups];
  const seen = new Set<string>();
  return merged.filter((t) => {
    const id = String(t.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildOverviewTodos(opts: {
  workTasks: WorkTask[];
  assignments: CrmAssignment[];
  sharedTasks: SharedInboxTask[];
  companyId?: string;
}): OverviewTodo[] {
  const companyId = String(opts.companyId || '');
  // Khớp tab Nhiệm vụ: chỉ vc vận chuyển.
  const logistics = filterVcLogisticsUiTasks(opts.workTasks) as WorkTask[];
  const shipping = filterVcAreaTabTasks(logistics, 'shipping', []) as WorkTask[];
  const openWork = shipping.filter((t) => isOpenStatus(String(t.status || 'pending')));
  const openAsg = opts.assignments.filter((a) => isOpenStatus(String(a.status || 'pending')));
  const asgIds = new Set(openAsg.map((a) => String(a.id)));

  const openShared = opts.sharedTasks.filter((t) => {
    if (!isOpenStatus(String(t.status || 'pending'))) return false;
    if (companyId) {
      const co = String(t.executor_company_id || t.owner_company_id || '');
      if (co && co !== companyId) return false;
    }
    const asgId = t.crm_assignment_id != null ? String(t.crm_assignment_id) : '';
    if (asgId && asgIds.has(asgId)) return false;
    return true;
  });

  const merged = [
    ...openWork.map(mapWorkTaskTodo),
    ...openAsg.map(mapAssignmentTodo),
    ...openShared.map(mapSharedTodo),
  ];

  const seen = new Set<string>();
  const unique = merged.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });

  return unique.sort((a, b) => {
    const ao = todoOverdue(a) ? 0 : 1;
    const bo = todoOverdue(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.deadline || '9999';
    const bd = b.deadline || '9999';
    return String(ad).localeCompare(String(bd));
  });
}

const EMPTY_KPI: VcBoardKpis = {
  total: 0,
  totalShipping: 0,
  totalInstall: 0,
  intake: 0,
  shipping: 0,
  delivered: 0,
  installing: 0,
  warranty: 0,
  acceptance: 0,
  inProgress: 0,
  completed: 0,
  overdue: 0,
};

type KpiTone = 'slate' | 'orange' | 'teal' | 'amber' | 'sky' | 'violet' | 'green' | 'red';

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || full || 'bạn';
}

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function notifTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startThat) / 86400000);
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return hm;
  if (diffDays === 1) return `Hôm qua ${hm}`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${dd}/${mm} ${hm}`;
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function OverviewScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount, refreshUnread } = useNotifications();
  const { openProjectDetail, openOverdueProjects } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const userName = user?.full_name || user?.fullName || user?.email || 'Bạn';
  const greetName = firstName(userName);
  const userId = user?.id || user?.userId || '';
  const helloLine = `Xin chào, ${greetName}!`;
  const dateLabel = formatVnWeekdayDate();
  const wishLine = 'Chúc bạn một ngày vận chuyển & lắp đặt suôn sẻ!';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<VcBoardKpis>(EMPTY_KPI);
  const [todos, setTodos] = useState<OverviewTodo[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [todoPage, setTodoPage] = useState(0);
  /** Deal mở rộng trong «Nhiệm vụ cần làm» — mặc định thu gọn. */
  const [expandedDealKeys, setExpandedDealKeys] = useState<Record<string, boolean>>({});
  const [notifs, setNotifs] = useState<SxCommentNotification[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [commentProject, setCommentProject] = useState<ProductionProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardFiltersRef = useRef<{ companyId?: string; workshopTypeId?: string }>({});
  const loadSeqRef = useRef(0);
  const companiesRef = useRef<CompanyOption[]>([]);
  companiesRef.current = companies;
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  /** Filter đổi lúc Tổng quan không focus → reload khi quay lại. */
  const pendingFilterReloadRef = useRef(false);

  const isAdminLike = isSystemAdmin(user) || isCompanyScopedAdmin(user);
  const canPickCompany = isSystemAdmin(user);

  const companyOptions = useMemo(() => {
    if (isSystemAdmin(user)) {
      return [
        { id: '', label: 'Tất cả công ty' },
        ...companies.map((c) => ({ id: c.id, label: c.name })),
      ];
    }
    if (isCompanyScopedAdmin(user) && user?.company_id) {
      const ownId = String(user.company_id);
      const own = companies.find((c) => String(c.id) === ownId);
      return [{ id: ownId, label: own?.name || 'Công ty của tôi' }];
    }
    const ownId = user?.company_id ? String(user.company_id) : '';
    if (ownId) {
      const own = companies.find((c) => String(c.id) === ownId);
      return [{ id: ownId, label: own?.name || 'Công ty của tôi' }];
    }
    return workshopCompaniesForCrossViewer(companies, user).map((c) => ({
      id: c.id,
      label: c.name,
    }));
  }, [companies, user]);

  const workshopLabel = useMemo(() => {
    if (!filterCompany) {
      return canPickCompany ? 'Tất cả công ty' : (companyOptions[0]?.label || 'Công ty');
    }
    return companyOptions.find((o) => o.id === filterCompany)?.label
      || companies.find((c) => String(c.id) === String(filterCompany))?.name
      || 'Công ty';
  }, [filterCompany, canPickCompany, companyOptions, companies]);

  const persistCompanyFilter = useCallback(async (companyId: string) => {
    const snap = (await loadKanbanFilters().catch(() => null)) || {};
    const prev = String(snap?.filterCompany || '');
    const next = String(companyId || '');
    const companyChanged = Boolean(prev) && prev !== next;
    await saveKanbanFilters({
      filterCompany: companyId,
      ...(companyChanged ? { filterWorkTypeId: '' } : {}),
    });
  }, []);

  const load = useCallback(async (
    mode: 'init' | 'refresh' | 'silent' = 'init',
    scopes: Array<'all' | 'board' | 'todos' | 'events' | 'notifs'> = ['all'],
  ) => {
    const seq = ++loadSeqRef.current;
    const wantAll = scopes.includes('all');
    const wantBoard = wantAll || scopes.includes('board');
    const wantTodos = wantAll || scopes.includes('todos');
    const wantEvents = wantAll || scopes.includes('events');
    const wantNotifs = wantAll || scopes.includes('notifs');

    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const snap = await loadKanbanFilters().catch(() => null);
      let companyId = snap?.filterCompany || '';

      let companyList = companiesRef.current;
      if ((mode !== 'silent' || !companyList.length) && (wantAll || wantBoard || wantTodos)) {
        companyList = await fetchCompanies().catch(() => [] as CompanyOption[]);
        if (seq !== loadSeqRef.current) return;
        setCompanies(companyList);
      }

      if (!canPickCompany) {
        const ownId = user?.company_id ? String(user.company_id) : '';
        if (ownId) companyId = ownId;
        else if (!companyId && companyList[0]?.id) companyId = String(companyList[0].id);
        if (companyId && companyId !== (snap?.filterCompany || '')) {
          await persistCompanyFilter(companyId);
        }
      } else if (companyId) {
        // Sysadmin: '' = Tất cả công ty; chỉ clear nếu id đã chọn không còn trong list.
        const exists = companyList.some((c) => String(c.id) === String(companyId));
        if (!exists) {
          companyId = '';
          if ((snap?.filterCompany || '') !== '') await persistCompanyFilter('');
        }
      }

      if (seq !== loadSeqRef.current) return;
      setFilterCompany(companyId);

      const boardFilters = boardFiltersFromSharedSnap(snap, { companyIdOverride: companyId });
      boardFiltersRef.current = boardFilters;

      const skipBoard = mode === 'silent' && isCachedBoardFresh(boardFilters) && !!getCachedBoard(boardFilters);
      const cachedBoard = getCachedBoard(boardFilters);

      if (wantBoard && cachedBoard && mode !== 'refresh') {
        setKpis(computeVcBoardKpis(cachedBoard.projects, cachedBoard.stages));
        if (mode === 'init') setLoading(false);
      }

      const today = ymd(new Date());
      const companyParam = companyId || undefined;
      // Khớp Công việc: admin/team xem toàn bộ NV trong phạm vi công ty; NV thường = việc của mình.
      const teamScope = canViewTeamWork(user);
      const assigneeParam = teamScope ? undefined : (userId || undefined);
      const workKey = workInboxCacheKey({ companyId: companyParam, assigneeId: assigneeParam });
      const cachedWork = getCachedWorkInbox(workKey);
      if (mode === 'refresh' && wantTodos) invalidateWorkInboxCache(workKey);
      const skipWorkFetch = mode !== 'refresh'
        && isCachedWorkInboxFresh(workKey)
        && !!getCachedWorkInbox(workKey);

      const tasksPromise = !wantTodos || !userId
        ? Promise.resolve([] as WorkTask[])
        : skipWorkFetch
          ? Promise.resolve(getCachedWorkInbox(workKey)!.workTasks)
          : fetchLogisticsWorkTasks({
            assigneeId: assigneeParam || null,
            companyId: companyParam,
            limit: WORK_INBOX_FETCH_LIMIT,
          }).catch(() => [] as WorkTask[]);
      const assignmentsPromise = !wantTodos || !userId
        ? Promise.resolve([] as CrmAssignment[])
        : skipWorkFetch
          ? Promise.resolve(getCachedWorkInbox(workKey)!.assignments)
          : fetchLogisticsAssignments({
            companyId: companyParam,
            assigneeId: assigneeParam,
            limit: WORK_INBOX_FETCH_LIMIT,
          }).catch(() => [] as CrmAssignment[]);
      const sharedPromise = !wantTodos || !userId
        ? Promise.resolve({ tasks: [] as SharedInboxTask[], groups: [] as SharedInboxGroup[] })
        : skipWorkFetch
          ? Promise.resolve({
            tasks: getCachedWorkInbox(workKey)!.sharedTasks,
            groups: getCachedWorkInbox(workKey)!.sharedGroups,
          })
          : fetchPrivateDealInbox('logistics').catch(() => ({
            tasks: [] as SharedInboxTask[],
            groups: [] as SharedInboxGroup[],
          }));
      const eventsPromise = !wantEvents
        ? Promise.resolve([] as AppEvent[])
        : fetchEventsRange({
          dateFrom: today,
          dateTo: today,
          companyId: companyParam,
          module: 'logistics',
          userId: userId || undefined,
        }).catch(() => [] as AppEvent[]);

      // Soft-fail board: NV thiếu projects:view không làm đỏ cả Tổng quan (tasks/events vẫn hiện).
      const boardPromise = !wantBoard || skipBoard
        ? Promise.resolve(wantBoard ? (cachedBoard || null) : null)
        : fetchProductionBoard(mode === 'refresh', boardFilters).catch(() => null);

      const notifsPromise = !wantNotifs
        ? Promise.resolve({ notifications: [] as SxCommentNotification[], unread_count: 0 })
        : fetchCommentNotifications(false).catch(() => ({
          notifications: [] as SxCommentNotification[],
          unread_count: 0,
        }));

      const [board, workTasks, assignments, sharedInbox, todayEvents, notifList] = await Promise.all([
        boardPromise,
        tasksPromise,
        assignmentsPromise,
        sharedPromise,
        eventsPromise,
        notifsPromise,
      ]);

      if (seq !== loadSeqRef.current) return;
      if (wantBoard) {
        if (board) {
          if (!skipBoard) setCachedBoard(boardFilters, board);
          setKpis(computeVcBoardKpis(board.projects, board.stages));
        } else if (!cachedBoard) {
          setKpis(EMPTY_KPI);
        }
      }
      if (wantTodos) {
        const flatShared = flattenSharedInboxTasks(sharedInbox);
        if (!skipWorkFetch && userId) {
          setCachedWorkInbox(workKey, {
            assignments,
            sharedGroups: (Array.isArray(sharedInbox.groups)
              ? sharedInbox.groups
              : []) as SharedInboxGroup[],
            sharedTasks: flatShared,
            workTasks,
          });
        }
        setTodos(buildOverviewTodos({
          workTasks,
          assignments,
          sharedTasks: flatShared,
          companyId,
        }));
        setTodoPage(0);
      }
      if (wantEvents) setEvents(todayEvents);
      if (wantNotifs) {
        setNotifs(
          (notifList.notifications || [])
            .filter(isVcRelevantNotification)
            .slice()
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
            .slice(0, PREVIEW_NOTIFS),
        );
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, user, user?.company_id, canPickCompany, persistCompanyFilter]);

  useEffect(() => {
    void loadKanbanFilters().then((snap) => {
      const filters = boardFiltersFromSharedSnap(snap);
      void load(getCachedBoard(filters) ? 'silent' : 'init');
    });
  }, [load]);

  // Đồng bộ khi Kanban/Planner đổi filter — chỉ full reload khi Tổng quan đang focus.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeSharedFilters((snap) => {
      const nextFilters = boardFiltersFromSharedSnap(snap);
      const prev = boardFiltersRef.current;
      const same =
        String(prev.companyId || '') === String(nextFilters.companyId || '')
        && String(prev.workshopTypeId || '') === String(nextFilters.workshopTypeId || '');
      if (same) return;
      setFilterCompany(String(snap.filterCompany || ''));
      boardFiltersRef.current = nextFilters;
      const cached = getCachedBoard(nextFilters);
      if (cached) setKpis(computeVcBoardKpis(cached.projects, cached.stages));
      if (!isFocusedRef.current) {
        pendingFilterReloadRef.current = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void load(getCachedBoard(nextFilters) ? 'silent' : 'init');
      }, 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [load]);

  /** Quay lại Tổng quan → đọc cache (Kanban đã patch) rồi refresh nền nếu stale. */
  useFocusEffect(
    useCallback(() => {
      const filters = boardFiltersRef.current;
      const cached = getCachedBoard(filters);
      if (cached) {
        setKpis(computeVcBoardKpis(cached.projects, cached.stages));
      }
      if (pendingFilterReloadRef.current) {
        pendingFilterReloadRef.current = false;
        void load(cached ? 'silent' : 'init');
        return;
      }
      if (!isCachedBoardFresh(filters)) {
        void load('silent');
      }
    }, [load]),
  );

  const onSelectCompany = useCallback(async (id: string) => {
    setCompanyPickerOpen(false);
    if (!canPickCompany && user?.company_id && id !== String(user.company_id)) return;
    setFilterCompany(id);
    await persistCompanyFilter(id);
    void load('refresh');
  }, [canPickCompany, user?.company_id, persistCompanyFilter, load]);

  useProductionRealtime({
    onRefresh: (info) => {
      if (info?.patched) {
        const cached = getCachedBoard(boardFiltersRef.current);
        if (cached) {
          setKpis(computeVcBoardKpis(cached.projects, cached.stages));
        }
        return;
      }
      const t = info?.evt?.type;
      if (t === 'calendar:event_changed') {
        void load('silent', ['events']);
        return;
      }
      if (t === 'crm:task_changed') {
        void load('silent', ['todos']);
        return;
      }
      if (t === 'project:comment_changed' || t === 'lead:comment_changed') {
        void load('silent', ['notifs']);
        return;
      }
      void load('silent', ['board']);
    },
    modes: REALTIME_BOARD_TASK_EVENT,
    debounceMs: 1500,
  });

  const todoGroups = useMemo(() => groupTodosByDeal(todos), [todos]);
  const todoPageCount = Math.max(1, Math.ceil(todoGroups.length / TODO_DEAL_PAGE_SIZE) || 1);
  const safeTodoPage = Math.min(todoPage, todoPageCount - 1);
  const pageTodoGroups = todoGroups.slice(
    safeTodoPage * TODO_DEAL_PAGE_SIZE,
    safeTodoPage * TODO_DEAL_PAGE_SIZE + TODO_DEAL_PAGE_SIZE,
  );
  const openTaskCount = todos.length;
  const overdueTaskCount = useMemo(() => todos.filter((t) => todoOverdue(t)).length, [todos]);

  useEffect(() => {
    if (todoPage > todoPageCount - 1) setTodoPage(Math.max(0, todoPageCount - 1));
  }, [todoPage, todoPageCount]);

  const openNotifs = useCallback(async () => {
    void ensureNotificationPermission();
    setNotifOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  const openCommentForProjectId = useCallback(async (projectId: string) => {
    const pid = String(projectId || '').trim();
    if (!pid) return;
    // Mở sheet ngay với stub — tránh khoảng trống «treo» trong lúc fetch chi tiết.
    setCommentProject({
      id: pid,
      code: '',
      name: '',
    } as ProductionProject);
    try {
      const proj = await fetchProductionProject(pid);
      setCommentProject((cur) => (cur && String(cur.id) === pid ? proj : cur));
    } catch {
      setCommentProject((cur) => (
        cur && String(cur.id) === pid
          ? ({ id: pid, code: '', name: 'Dự án' } as ProductionProject)
          : cur
      ));
    }
  }, []);

  const goKanban = useCallback(() => tabNav.navigate('Kanban'), [tabNav]);
  const goKanbanFocus = useCallback(
    (focusKpi: VcKpiFocusKey) => tabNav.navigate('Kanban', { focusKpi }),
    [tabNav],
  );
  const goWork = useCallback((
    tab: WorkTabKey = 'tasks',
    opts?: {
      focusId?: string;
      focusLeadId?: string;
      statusFilter?: 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';
    },
  ) => {
    tabNav.navigate('Work', {
      tab,
      ...(opts?.focusId ? { focusId: opts.focusId } : {}),
      ...(opts?.focusLeadId ? { focusLeadId: opts.focusLeadId } : {}),
      ...(opts?.statusFilter ? { statusFilter: opts.statusFilter } : {}),
    });
  }, [tabNav]);

  /** Banner công việc quá hạn → đúng tab (Nhiệm vụ / Giao việc / KG) + lọc Quá hạn. */
  const goWorkOverdueSmart = useCallback(() => {
    const tab = pickWorkTabForOverdue(todos);
    goWork(tab, { statusFilter: 'overdue' });
  }, [goWork, todos]);

  const openNotification = useCallback((n: SxCommentNotification) => {
    const type = String(n.type || '');
    const pid = notificationProjectId(n);
    const focusRaw = notificationFocusKpi(n);
    const focusKeys: VcKpiFocusKey[] = [
      'intake', 'shipping', 'delivered', 'installing',
      'warranty', 'acceptance', 'completed', 'overdue',
    ];
    const focus = focusRaw && focusKeys.includes(focusRaw as VcKpiFocusKey)
      ? (focusRaw as VcKpiFocusKey)
      : null;

    if (notificationOpensComments(n)) {
      if (pid) void openCommentForProjectId(pid);
      else void openNotifs();
      return;
    }

    // Công việc VC quá hạn / sắp hạn → đúng tab Công việc + lọc Quá hạn.
    if (
      type === 'logistics_task_deadline_overdue'
      || type === 'logistics_task_deadline_warning'
    ) {
      goWorkOverdueSmart();
      return;
    }

    // Dự án quá hạn → màn chuyên dụng (không lọc Kanban).
    if (focus === 'overdue' || (type.includes('project') && type.includes('overdue'))) {
      openOverdueProjects();
      return;
    }

    if (focus) goKanbanFocus(focus);
    if (pid) openProjectDetail(pid);
    else if (!focus) void openNotifs();
  }, [
    goKanbanFocus,
    goWork,
    goWorkOverdueSmart,
    openCommentForProjectId,
    openNotifs,
    openOverdueProjects,
    openProjectDetail,
  ]);

  const openOverviewTodo = useCallback((t: OverviewTodo) => {
    goWork(workTabForSource(t.source), {
      focusId: t.focusId,
      focusLeadId: t.focusLeadId || t.leadId || undefined,
    });
  }, [goWork]);

  const goMessages = useCallback(() => tabNav.navigate('Messages'), [tabNav]);
  const goMenu = useCallback(() => tabNav.navigate('Menu'), [tabNav]);
  const goPlanner = useCallback(() => tabNav.navigate('Planner'), [tabNav]);

  const totalOverdueItems = overdueTaskCount + kpis.overdue;

  const kpiItems: {
    key: VcKpiFocusKey;
    label: string;
    value: number | string;
    tone: KpiTone;
    onPress: () => void;
  }[] = [
    {
      key: 'intake',
      label: 'Chờ vận chuyển',
      value: kpis.intake,
      tone: 'slate',
      onPress: () => goKanbanFocus('intake'),
    },
    {
      key: 'shipping',
      label: 'Dự án sắp tới',
      value: kpis.shipping,
      tone: 'orange',
      onPress: () => goKanbanFocus('shipping'),
    },
    {
      key: 'delivered',
      label: 'Đã giao',
      value: kpis.delivered,
      tone: 'teal',
      onPress: () => goKanbanFocus('delivered'),
    },
    {
      key: 'installing',
      label: 'Đang lắp đặt',
      value: kpis.installing,
      tone: 'amber',
      onPress: () => goKanbanFocus('installing'),
    },
    {
      key: 'warranty',
      label: 'Phát sinh',
      value: kpis.warranty,
      tone: 'sky',
      onPress: () => goKanbanFocus('warranty'),
    },
    {
      key: 'acceptance',
      label: 'Nghiệm thu-bàn giao',
      value: kpis.acceptance,
      tone: 'violet',
      onPress: () => goKanbanFocus('acceptance'),
    },
    {
      key: 'completed',
      label: 'Hoàn thiện',
      value: kpis.completed,
      tone: 'green',
      onPress: () => goKanbanFocus('completed'),
    },
    {
      key: 'overdue',
      label: 'Dự án quá hạn',
      value: kpis.overdue,
      tone: 'red',
      onPress: openOverdueProjects,
    },
  ];

  const toneMap: Record<KpiTone, { fg: string; bg: string }> = {
    slate: { fg: colors.textMuted, bg: colorWithAlpha(colors.textMuted, 0.14) },
    orange: { fg: colors.primary, bg: colors.primarySoft },
    teal: { fg: '#14B8A6', bg: colorWithAlpha('#14B8A6', 0.16) },
    amber: { fg: colors.warning, bg: colorWithAlpha(colors.warning, 0.16) },
    sky: { fg: '#38BDF8', bg: colorWithAlpha('#38BDF8', 0.16) },
    violet: { fg: '#A78BFA', bg: colorWithAlpha('#A78BFA', 0.16) },
    green: { fg: '#22C55E', bg: colorWithAlpha('#22C55E', 0.16) },
    red: { fg: colors.danger, bg: colors.dangerSoft },
  };

  const quickActions: QuickAction[] = [
    {
      key: 'kanban',
      label: 'Dự án',
      icon: 'grid-outline',
      color: colors.primary,
      onPress: goKanban,
    },
    {
      key: 'work',
      label: 'Công việc',
      icon: 'checkbox-outline',
      color: '#22C55E',
      onPress: () => goWork('tasks'),
    },
    {
      key: 'overdue',
      label: 'Quá hạn',
      icon: 'alarm-outline',
      color: colors.danger,
      onPress: openOverdueProjects,
    },
    {
      key: 'events',
      label: 'Sự kiện',
      icon: 'calendar-outline',
      color: '#06B6D4',
      onPress: () => rootNav.navigate('Events'),
    },
    {
      key: 'messages',
      label: 'Tin nhắn',
      icon: 'chatbubble-outline',
      color: '#8B5CF6',
      onPress: goMessages,
    },
    {
      key: 'planner',
      label: 'Planner',
      icon: 'map-outline',
      color: '#0EA5E9',
      onPress: goPlanner,
    },
    {
      key: 'leaves',
      label: 'Lịch nghỉ',
      icon: 'airplane-outline',
      color: '#A855F7',
      onPress: () => rootNav.navigate('Leaves'),
    },
    {
      key: 'menu',
      label: 'Menu',
      icon: 'menu-outline',
      color: '#64748B',
      onPress: goMenu,
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIdentity}>
            <Avatar name={userName} avatarUrl={user?.avatar} size={52} color={colors.primary} />
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={styles.helloLine} numberOfLines={1}>{helloLine}</Text>
              <Text style={styles.dateLine}>{dateLabel}</Text>
              <Text style={styles.wishLine} numberOfLines={2}>{wishLine}</Text>
            </View>
          </View>
          <TapHighlight style={styles.iconBtn} onPress={() => void openNotifs()} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </TapHighlight>
        </View>

        <Pressable
          style={styles.companyChip}
          onPress={() => {
            if (canPickCompany) setCompanyPickerOpen(true);
          }}
          disabled={!canPickCompany}
        >
          <Ionicons name="business-outline" size={14} color={colors.primary} />
          <Text style={styles.companyChipTxt} numberOfLines={1}>{workshopLabel}</Text>
          {canPickCompany ? (
            <Ionicons name="chevron-down" size={14} color={colors.textFaint} />
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <SpinningLoader color={colors.primary} size="large" />
            <Text style={styles.muted}>Đang tải tổng quan…</Text>
          </View>
        ) : (
          <>
            {error ? (
              <Pressable style={styles.errorBanner} onPress={() => void load('init')}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} />
                <Text style={styles.errorTxt} numberOfLines={2}>
                  {error} · Chạm để thử lại
                </Text>
              </Pressable>
            ) : null}

            {totalOverdueItems > 0 ? (
              <Pressable
                style={styles.alertBanner}
                onPress={() => {
                  if (kpis.overdue > 0) openOverdueProjects();
                  else goWorkOverdueSmart();
                }}
              >
                <View style={styles.alertIcon}>
                  <Ionicons name="alert-circle" size={22} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>
                    {totalOverdueItems} hạng mục quá hạn
                  </Text>
                  <Text style={styles.alertSub}>
                    {[
                      overdueTaskCount > 0
                        ? (overdueWorkTabHint(todos) || `${overdueTaskCount} công việc`)
                        : null,
                      kpis.overdue > 0 ? `${kpis.overdue} dự án VC/LĐ` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {' — xử lý sớm'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.danger} />
              </Pressable>
            ) : (
              <View style={styles.okBanner}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.okTxt}>Không có dự án / công việc quá hạn</Text>
              </View>
            )}

            <Text style={styles.secTitle}>Trạng thái vận hành</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={KPI_CARD_W + KPI_CARD_GAP}
              snapToAlignment="start"
              contentContainerStyle={styles.kpiSlide}
              style={styles.kpiSlideWrap}
            >
              {kpiItems.map((k) => {
                const tone = toneMap[k.tone];
                return (
                  <Pressable
                    key={k.key}
                    style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
                    onPress={k.onPress}
                  >
                    <View style={[styles.kpiDot, { backgroundColor: tone.bg }]}>
                      <View style={[styles.kpiDotInner, { backgroundColor: tone.fg }]} />
                    </View>
                    <Text style={[styles.kpiValue, { color: tone.fg }]}>{k.value}</Text>
                    <Text style={styles.kpiLabel} numberOfLines={2}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.secHead}>
              <Text style={styles.secTitleInline}>Sự kiện hôm nay</Text>
              <Pressable onPress={() => rootNav.navigate('Events')} hitSlop={8}>
                <Text style={styles.link}>
                  {events.length > 0 ? `Tất cả (${events.length})` : 'Mở lịch'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {events.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="calendar-outline" size={20} color={colors.textFaint} />
                  <Text style={styles.emptyTxt}>Không có sự kiện VC hôm nay</Text>
                </View>
              ) : (
                events.slice(0, 5).map((e, idx) => {
                  const timeStr = e.allDay
                    ? 'Cả ngày'
                    : e.endTime
                      ? `${timeOf(e.startTime)} – ${timeOf(e.endTime)}`
                      : timeOf(e.startTime);
                  return (
                    <Pressable
                      key={e.id}
                      style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                      onPress={() => rootNav.navigate('Events')}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: (e.typeColor || '#06B6D4') + '22' }]}>
                        <Text style={{ fontSize: 14 }}>{e.typeIcon || '🚚'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {timeStr}
                          {e.customerName || e.leadTitle
                            ? ` · ${e.customerName || e.leadTitle}`
                            : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                    </Pressable>
                  );
                })
              )}
            </View>

            <View style={styles.secHead}>
              <Text style={styles.secTitleInline}>Nhiệm vụ cần làm</Text>
              <Pressable onPress={() => goWork('tasks')} hitSlop={8}>
                <Text style={styles.link}>
                  {openTaskCount > 0 ? `Tất cả (${openTaskCount})` : 'Xem công việc'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {pageTodoGroups.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="checkbox-outline" size={20} color={colors.textFaint} />
                  <Text style={styles.emptyTxt}>Không có nhiệm vụ / giao việc / KG chung cần làm</Text>
                </View>
              ) : (
                <>
                  {pageTodoGroups.map((g, gIdx) => {
                    const expanded = !!expandedDealKeys[g.key];
                    return (
                    <View
                      key={g.key}
                      style={[styles.dealGroup, gIdx > 0 && styles.dealGroupBorder]}
                    >
                      <Pressable
                        style={styles.dealGroupHead}
                        onPress={() =>
                          setExpandedDealKeys((prev) => ({
                            ...prev,
                            [g.key]: !prev[g.key],
                          }))
                        }
                      >
                        <Ionicons
                          name={expanded ? 'chevron-down' : 'chevron-forward'}
                          size={16}
                          color={colors.textMuted}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.dealGroupTitle} numberOfLines={1}>
                            {g.dealLabel || 'Không gắn deal'}
                          </Text>
                          <Text style={styles.dealGroupMeta}>
                            {g.items.length} việc
                            {g.items.some(todoOverdue) ? ' · có quá hạn' : ''}
                            {!expanded ? ' · chạm để mở' : ''}
                          </Text>
                        </View>
                      </Pressable>
                      {expanded
                        ? g.items.map((t) => {
                        const overdue = todoOverdue(t);
                        const statusKey = String(t.status || 'pending');
                        const statusLbl = statusPillLabel(statusKey);
                        const due = formatTaskDeadline(t.deadline);
                        const badgeBg =
                          t.badgeTone === 'assign'
                            ? colorWithAlpha('#8B5CF6', 0.18)
                            : t.badgeTone === 'shared'
                              ? colorWithAlpha('#14B8A6', 0.18)
                              : colors.primarySoft;
                        const badgeFg =
                          t.badgeTone === 'assign'
                            ? '#8B5CF6'
                            : t.badgeTone === 'shared'
                              ? '#14B8A6'
                              : colors.primary;
                        return (
                          <Pressable
                            key={t.key}
                            style={styles.todoRow}
                            onPress={() => openOverviewTodo(t)}
                          >
                            <View style={[styles.entityBadge, { backgroundColor: badgeBg }]}>
                              <Text style={[styles.entityBadgeTxt, { color: badgeFg }]}>{t.badge}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.todoTitle} numberOfLines={1}>
                                {t.title || 'Nhiệm vụ'}
                              </Text>
                              <Text
                                style={[styles.todoSub, overdue && { color: colors.danger }]}
                                numberOfLines={1}
                              >
                                {statusLbl}
                                {overdue ? ' · Quá hạn' : ''}
                                {due ? ` · ${due}` : ''}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
                          </Pressable>
                        );
                      })
                        : null}
                    </View>
                    );
                  })}
                  {todoGroups.length > TODO_DEAL_PAGE_SIZE ? (
                    <View style={styles.pagerRow}>
                      <Pressable
                        style={[styles.pagerBtn, safeTodoPage <= 0 && styles.pagerBtnDisabled]}
                        disabled={safeTodoPage <= 0}
                        onPress={() => setTodoPage((p) => Math.max(0, p - 1))}
                      >
                        <Ionicons
                          name="chevron-back"
                          size={16}
                          color={safeTodoPage <= 0 ? colors.textFaint : colors.primary}
                        />
                        <Text
                          style={[
                            styles.pagerBtnTxt,
                            safeTodoPage <= 0 && { color: colors.textFaint },
                          ]}
                        >
                          Trước
                        </Text>
                      </Pressable>
                      <Text style={styles.pagerLabel}>
                        {safeTodoPage + 1}/{todoPageCount}
                      </Text>
                      <Pressable
                        style={[
                          styles.pagerBtn,
                          safeTodoPage >= todoPageCount - 1 && styles.pagerBtnDisabled,
                        ]}
                        disabled={safeTodoPage >= todoPageCount - 1}
                        onPress={() =>
                          setTodoPage((p) => Math.min(todoPageCount - 1, p + 1))
                        }
                      >
                        <Text
                          style={[
                            styles.pagerBtnTxt,
                            safeTodoPage >= todoPageCount - 1 && { color: colors.textFaint },
                          ]}
                        >
                          Sau
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={
                            safeTodoPage >= todoPageCount - 1
                              ? colors.textFaint
                              : colors.primary
                          }
                        />
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.secHead}>
              <Text style={styles.secTitleInline}>Thông báo mới</Text>
              <Pressable onPress={() => void openNotifs()} hitSlop={8}>
                <Text style={styles.link}>Xem tất cả</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {notifs.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="notifications-outline" size={20} color={colors.textFaint} />
                  <Text style={styles.emptyTxt}>Chưa có thông báo mới</Text>
                </View>
              ) : (
                notifs.map((n, idx) => {
                  const subtitle = notificationListSubtitle(n);
                  const cat = notificationCategoryLabel(n);
                  const isDeal = isWorkshopDealNotification(n);
                  return (
                    <Pressable
                      key={n.id}
                      style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                      onPress={() => openNotification(n)}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: isDeal ? colorWithAlpha('#0EA5E9', 0.16) : colors.primarySoft }]}>
                        <Ionicons
                          name={notificationIconName(n)}
                          size={18}
                          color={isDeal ? '#0EA5E9' : colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notifCat} numberOfLines={1}>{cat}</Text>
                        <Text style={styles.rowTitle} numberOfLines={1}>{notificationListTitle(n)}</Text>
                        {subtitle ? (
                          <Text style={styles.rowSub} numberOfLines={2}>{subtitle}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.notifTime}>{notifTime(n.created_at)}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            <Text style={[styles.secTitle, { marginTop: 16 }]}>Lối tắt</Text>
            <View style={styles.quickGrid}>
              {quickActions.map((a) => (
                <Pressable
                  key={a.key}
                  style={({ pressed }) => [styles.quickTile, pressed && styles.pressed]}
                  onPress={a.onPress}
                >
                  <View style={[styles.quickIcon, { backgroundColor: a.color + '22' }]}>
                    <Ionicons name={a.icon} size={20} color={a.color} />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={1}>{a.label}</Text>
                </Pressable>
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
        onOpenNotification={(n) => {
          setNotifOpen(false);
          openNotification(n);
        }}
      />

      <ProjectCommentModal
        visible={!!commentProject}
        project={commentProject}
        onClose={() => {
          setCommentProject(null);
        }}
        onPosted={() => {}}
      />

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Chọn công ty"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={(id) => { void onSelectCompany(id); }}
        onClose={() => setCompanyPickerOpen(false)}
      />
    </View>
  );
}

function createStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    hero: {
      paddingHorizontal: Spacing.lg,
      paddingTop: 12,
      paddingBottom: 10,
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
    wishLine: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 13.5,
      fontWeight: '600',
      lineHeight: 18,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    companyChip: {
      marginTop: 12,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.full,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    companyChipTxt: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      maxWidth: 220,
    },
    content: { paddingHorizontal: Spacing.lg, paddingTop: 8 },
    centerBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      gap: 12,
    },
    muted: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    pressed: { opacity: 0.88 },
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
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#2A1518' : '#FEF2F2',
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: isDark ? '#7F1D1D' : '#FECACA',
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 14,
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
    okBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? '#14532D33' : '#ECFDF5',
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.success, 0.28),
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 14,
    },
    okTxt: { color: colors.success, fontSize: 13.5, fontWeight: '700' },
    secTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
      marginTop: 4,
    },
    secHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      marginBottom: 10,
    },
    secTitleInline: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    link: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    kpiSlideWrap: {
      marginHorizontal: -Spacing.lg,
      marginBottom: 4,
    },
    kpiSlide: {
      paddingHorizontal: Spacing.lg,
      gap: KPI_CARD_GAP,
      paddingBottom: 2,
    },
    kpiCard: {
      width: KPI_CARD_W,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 96,
    },
    kpiDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    kpiDotInner: { width: 8, height: 8, borderRadius: 4 },
    kpiValue: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
    kpiLabel: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.textMuted },
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
    emptyTxt: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    rowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    rowSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    entityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    entityBadge: {
      borderRadius: Radii.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    entityBadgeTxt: { fontSize: 10, fontWeight: '800' },
    entityName: {
      flex: 1,
      color: colors.text,
      fontSize: 12.5,
      fontWeight: '700',
    },
    dealGroup: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 4,
    },
    dealGroupBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dealGroupHead: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      gap: 8,
      paddingVertical: 2,
    },
    dealGroupTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    dealGroupMeta: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    todoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingLeft: 2,
    },
    todoTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    todoSub: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    pagerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    pagerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    pagerBtnDisabled: { opacity: 0.55 },
    pagerBtnTxt: { color: colors.primary, fontSize: 13, fontWeight: '800' },
    pagerLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.cardAlt,
    },
    moreBtnTxt: { color: colors.primary, fontSize: 13, fontWeight: '800' },
    notifCat: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 2,
    },
    notifTime: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: Spacing.lg,
    },
    quickTile: {
      width: '22%',
      flexGrow: 1,
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    quickIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
