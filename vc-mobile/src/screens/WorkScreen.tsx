import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import AssignWorkModal from '../components/AssignWorkModal';
import AssignmentDetailModal from '../components/AssignmentDetailModal';
import SpinningLoader from '../components/SpinningLoader';
import TapHighlight from '../components/TapHighlight';
import WorkFilterSheet, { type WorkListStatus } from '../components/WorkFilterSheet';
import WorkProjectTasksPanel from '../components/WorkProjectTasksPanel';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { REALTIME_TASK } from '../lib/realtimeModes';
import type { MainTabParamList } from '../navigation/MainTabs';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { fetchCompanies, type CompanyOption } from '../lib/logisticsApi';
import {
  PRIORITY_LABEL,
  STATUS_STAGE_LABEL,
  assignmentDealLabel,
  companyShortLabel,
  fetchLogisticsAssignments,
  fetchPrivateDealInbox,
  updateCrmAssignment,
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
import {
  canViewTeamWork,
  isTaskDone,
  isTaskInProgress,
  isTaskPending,
  statusPillLabel,
} from '../lib/workTasksApi';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';

/** Khớp web CRMAssignmentsPage: admin | manager | sales_admin */
function isAssignmentsAdmin(role?: string | null): boolean {
  return ['admin', 'manager', 'sales_admin'].includes(String(role || '').toLowerCase());
}

const LS_COMPANY = 'vc_work_filter_company_id';
/** v2: admin/team mặc định «Tất cả NV» (khớp web); v1 từng mặc định «Của tôi» → list trống. */
const LS_ASSIGNEE = 'vc_work_filter_assignee_id_v2';

type PageTab = 'tasks' | 'assignments' | 'shared';

const PAGE_TABS: { key: PageTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tasks', label: 'Nhiệm vụ', icon: 'checkbox-outline' },
  { key: 'assignments', label: 'Giao việc', icon: 'clipboard-outline' },
  { key: 'shared', label: 'KG chung', icon: 'people-outline' },
];

function pageTabTitle(tab: PageTab): string {
  if (tab === 'tasks') return 'Nhiệm vụ';
  if (tab === 'shared') return 'KG chung';
  return 'Giao việc';
}

function matchInboxTaskScope(
  t: SharedInboxTask,
  filterCompanyId: string,
  filterAssigneeId: string,
): boolean {
  if (filterCompanyId) {
    const co = String(t.executor_company_id || t.owner_company_id || '');
    if (co && co !== String(filterCompanyId)) return false;
  }
  if (filterAssigneeId) {
    const aid = String(t.assignee?.id || '');
    if (aid !== String(filterAssigneeId)) return false;
  }
  return true;
}

function priorityTone(priority: string | null | undefined, colors: AppColors): string {
  const p = String(priority || '').toLowerCase();
  if (p === 'urgent' || p === 'high') return colors.danger;
  if (p === 'medium') return colors.warning;
  return colors.textMuted;
}

function isOverdue(deadline?: string | null, status?: string | null): boolean {
  if (!deadline || isTaskDone(String(status || ''))) return false;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export default function WorkScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openProjectDetail } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Work'>>();
  const userId = user?.id || user?.userId || '';
  const ownCompanyId = user?.company_id ? String(user.company_id) : '';
  const assignAdmin = isAssignmentsAdmin(user?.role);
  const canTeam = canViewTeamWork(user);
  /** Chọn công ty / NV — admin hoặc quyền xem team. */
  const canPickScope = assignAdmin || canTeam;

  const [pageTab, setPageTab] = useState<PageTab>('tasks');
  const pendingFocusIdRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  /** '' = tất cả công ty (admin). NV: luôn công ty mình. */
  const [filterCompanyId, setFilterCompanyId] = useState('');
  /**
   * Assignee: admin/team mặc định '' (Tất cả NV — khớp web Giao việc Lắp đặt);
   * NV thường = chính mình. Tránh list trống khi admin giao việc cho người khác.
   */
  const [filterAssigneeId, setFilterAssigneeId] = useState(() => (
    canPickScope ? '' : userId
  ));
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
  const [listStatusFilter, setListStatusFilter] = useState<WorkListStatus>('all');
  const [filterPriority, setFilterPriority] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);
  const [assignments, setAssignments] = useState<CrmAssignment[]>([]);
  const [sharedGroups, setSharedGroups] = useState<SharedInboxGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignShared, setAssignShared] = useState(false);
  const hasWorkDataRef = useRef(false);

  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchCompanies().catch(() => [] as CompanyOption[]);
        if (cancelled) return;
        setCompanies(list);
        if (canPickScope) {
          const [savedCo, savedAsg] = await Promise.all([
            AsyncStorage.getItem(LS_COMPANY),
            AsyncStorage.getItem(LS_ASSIGNEE),
          ]);
          if (cancelled) return;
          const co = String(savedCo || '').trim();
          if (co && list.some((c) => String(c.id) === co)) setFilterCompanyId(co);
          else setFilterCompanyId('');
          const asg = String(savedAsg || '').trim();
          // Admin/team: mặc định Tất cả NV (khớp web). NV: luôn chính mình.
          if (asg === '__all__' || asg === '') setFilterAssigneeId('');
          else if (asg) setFilterAssigneeId(asg);
          else setFilterAssigneeId('');
        } else {
          setFilterCompanyId(ownCompanyId);
          setFilterAssigneeId(userId);
        }
      } finally {
        if (!cancelled) setFiltersReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canPickScope, ownCompanyId, userId]);

  useEffect(() => {
    if (!canPickScope || !filtersReady) return;
    void AsyncStorage.setItem(LS_COMPANY, filterCompanyId || '');
  }, [canPickScope, filterCompanyId, filtersReady]);

  useEffect(() => {
    if (!canPickScope || !filtersReady) return;
    void AsyncStorage.setItem(LS_ASSIGNEE, filterAssigneeId || '__all__');
  }, [canPickScope, filterAssigneeId, filtersReady]);

  /** Khớp web load(): company_id chỉ khi admin chọn; assignee_id bắt buộc với NV. */
  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!userId || !filtersReady) {
      if (!userId) {
        setAssignments([]);
        setSharedGroups([]);
        setLoading(false);
      }
      return;
    }
    const seq = ++loadSeqRef.current;
    setError(null);
    try {
      const companyParam = canPickScope
        ? (filterCompanyId || undefined)
        : undefined;
      const assigneeParam = filterAssigneeId || (!canPickScope ? userId : undefined);
      const cacheKey = workInboxCacheKey({
        companyId: companyParam,
        assigneeId: assigneeParam,
        limit: WORK_INBOX_FETCH_LIMIT,
      });
      const force = Boolean(opts?.force);
      const cached = getCachedWorkInbox(cacheKey);
      if (!force && cached && isCachedWorkInboxFresh(cacheKey)) {
        if (seq !== loadSeqRef.current) return;
        setAssignments(cached.assignments);
        setSharedGroups(cached.sharedGroups);
        return;
      }

      const [list, inbox] = await Promise.all([
        fetchLogisticsAssignments({
          companyId: companyParam,
          assigneeId: assigneeParam || undefined,
          limit: WORK_INBOX_FETCH_LIMIT,
        }),
        fetchPrivateDealInbox('logistics'),
      ]);
      if (seq !== loadSeqRef.current) return;
      setAssignments(list);
      setSharedGroups(inbox.groups);
      setCachedWorkInbox(cacheKey, {
        assignments: list,
        sharedGroups: inbox.groups || [],
        sharedTasks: inbox.tasks || [],
        // Đọc lại tại thời điểm ghi: Tổng quan có thể vừa nạp workTasks trong lúc
        // chờ request này — ghi mảng rỗng lên sẽ làm Tổng quan trống nhiệm vụ.
        workTasks: getCachedWorkInbox(cacheKey)?.workTasks || cached?.workTasks || [],
      });
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(formatApiError(e));
      setAssignments([]);
      setSharedGroups([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [
    userId,
    filtersReady,
    canPickScope,
    filterCompanyId,
    filterAssigneeId,
  ]);

  useEffect(() => {
    hasWorkDataRef.current = assignments.length > 0 || sharedGroups.length > 0;
  }, [assignments.length, sharedGroups.length]);

  /** Giao việc + KG dùng chung 1 lần tải — đổi tab không reload cả trang. */
  const onWorkListTab = pageTab !== 'tasks';
  useEffect(() => {
    if (!filtersReady || !onWorkListTab) return;
    if (!hasWorkDataRef.current) setLoading(true);
    void load();
  }, [load, filtersReady, onWorkListTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const companyParam = canPickScope ? (filterCompanyId || undefined) : undefined;
      const assigneeParam = filterAssigneeId || (!canPickScope ? userId : undefined);
      invalidateWorkInboxCache(workInboxCacheKey({
        companyId: companyParam,
        assigneeId: assigneeParam,
        limit: WORK_INBOX_FETCH_LIMIT,
      }));
      await load({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [load, canPickScope, filterCompanyId, filterAssigneeId, userId]);

  /** Chỉ Giao việc / KG chung — tab Nhiệm vụ do WorkProjectTasksPanel subscribe (tránh tải đôi). */
  useProductionRealtime({
    onRefresh: () => {
      const companyParam = canPickScope ? (filterCompanyId || undefined) : undefined;
      const assigneeParam = filterAssigneeId || (!canPickScope ? userId : undefined);
      invalidateWorkInboxCache(workInboxCacheKey({
        companyId: companyParam,
        assigneeId: assigneeParam,
        limit: WORK_INBOX_FETCH_LIMIT,
      }));
      void load({ force: true });
    },
    enabled: Boolean(userId) && filtersReady && pageTab !== 'tasks',
    modes: REALTIME_TASK,
  });

  const companyOptions = useMemo(
    () => [
      { id: '', label: 'Tất cả công ty' },
      ...companies.map((c) => ({ id: String(c.id), label: c.name || String(c.id) })),
    ],
    [companies],
  );

  const ownCompanyLabel = companies.find((c) => String(c.id) === ownCompanyId)?.name || 'Công ty tôi';

  /** Badge filter: khác mặc định (admin = tất cả NV; NV = của tôi). */
  const defaultAssigneeId = canPickScope ? '' : userId;
  const scopeFilterCount =
    (filterCompanyId ? 1 : 0)
    + (String(filterAssigneeId || '') !== String(defaultAssigneeId || '') ? 1 : 0)
    + (listStatusFilter !== 'all' ? 1 : 0)
    + (filterPriority ? 1 : 0);

  /** companyId khi tạo giao việc — ưu tiên filter đang chọn. */
  const createCompanyId = filterCompanyId || ownCompanyId || null;

  /** Scope truyền sang tab Nhiệm vụ (overview logistics). */
  const tasksCompanyId = canPickScope ? (filterCompanyId || null) : (ownCompanyId || null);
  const tasksAssigneeId = filterAssigneeId || (!canPickScope ? userId : null);

  const visibleAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (filterPriority && String(a.priority || '') !== filterPriority) return false;
      if (listStatusFilter === 'overdue') return isOverdue(a.deadline, a.status);
      if (listStatusFilter !== 'all' && String(a.status || 'pending') !== listStatusFilter) return false;
      return true;
    });
  }, [assignments, listStatusFilter, filterPriority]);

  const visibleSharedGroups = useMemo(() => {
    return sharedGroups
      .map((g) => {
        const tasks = (g.tasks || []).filter((t) =>
          matchInboxTaskScope(t, filterCompanyId, filterAssigneeId),
        ).filter((t) => {
          if (filterPriority && String(t.priority || '') !== filterPriority) return false;
          if (listStatusFilter === 'overdue') return isOverdue(t.deadline, t.status);
          if (listStatusFilter !== 'all' && String(t.status || 'pending') !== listStatusFilter) return false;
          return true;
        });
        if (!tasks.length) return null;
        return { ...g, tasks };
      })
      .filter(Boolean) as SharedInboxGroup[];
  }, [sharedGroups, filterCompanyId, filterAssigneeId, listStatusFilter, filterPriority]);

  const flatShared = useMemo(
    () => visibleSharedGroups.flatMap((g) => g.tasks || []),
    [visibleSharedGroups],
  );

  const stats = useMemo(() => {
    const rows =
      pageTab === 'shared'
        ? flatShared.map((t) => ({
          status: String(t.status || 'pending'),
          deadline: t.deadline,
        }))
        : visibleAssignments.map((a) => ({
          status: String(a.status || 'pending'),
          deadline: a.deadline,
        }));
    return {
      pending: rows.filter((r) => isTaskPending(r.status)).length,
      inProgress: rows.filter((r) => isTaskInProgress(r.status)).length,
      done: rows.filter((r) => isTaskDone(r.status)).length,
      overdue: rows.filter((r) => isOverdue(r.deadline, r.status)).length,
    };
  }, [pageTab, visibleAssignments, flatShared]);

  const [detailItem, setDetailItem] = useState<CrmAssignment | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const openAssignmentDetail = (a: CrmAssignment) => {
    setDetailItem(a);
    setDetailId(String(a.id));
  };

  const [focusTaskLeadId, setFocusTaskLeadId] = useState<string | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [tasksStatusFilter, setTasksStatusFilter] = useState<
    'all' | 'pending' | 'in_progress' | 'completed' | 'overdue' | null
  >(null);

  /** Deep-link từ Tổng quan → đúng tab Công việc (+ lọc quá hạn nếu có). */
  useEffect(() => {
    const tab = route.params?.tab;
    const focusId = route.params?.focusId ? String(route.params.focusId) : '';
    const focusLeadId = route.params?.focusLeadId ? String(route.params.focusLeadId) : '';
    const statusFilter = route.params?.statusFilter;
    if (!tab && !focusId && !focusLeadId && !statusFilter) return;

    if (tab === 'tasks' || tab === 'assignments' || tab === 'shared') {
      setPageTab(tab);
    }
    if (statusFilter === 'overdue' || statusFilter === 'pending'
      || statusFilter === 'in_progress' || statusFilter === 'completed') {
      setListStatusFilter(statusFilter);
      setTasksStatusFilter(statusFilter);
    } else if (statusFilter) {
      setListStatusFilter('all');
      setTasksStatusFilter(statusFilter);
    }
    if (tab === 'tasks' || (!tab && (focusId || focusLeadId))) {
      if (focusLeadId) setFocusTaskLeadId(focusLeadId);
      if (focusId) setFocusTaskId(focusId);
    }
    if (focusId && (tab === 'assignments' || tab === 'shared')) {
      pendingFocusIdRef.current = focusId;
    }
    tabNav.setParams({
      tab: undefined,
      focusId: undefined,
      focusLeadId: undefined,
      statusFilter: undefined,
    });
  }, [
    route.params?.tab,
    route.params?.focusId,
    route.params?.focusLeadId,
    route.params?.statusFilter,
    tabNav,
  ]);

  useEffect(() => {
    if (pageTab !== 'assignments' && pageTab !== 'shared') return;
    const focusId = pendingFocusIdRef.current;
    if (!focusId || !assignments.length) return;
    const hit = assignments.find((a) => String(a.id) === focusId);
    if (!hit) return;
    pendingFocusIdRef.current = null;
    openAssignmentDetail(hit);
  }, [pageTab, assignments]);

  const applyStatus = async (a: CrmAssignment, next: string) => {
    const id = String(a.id);
    if (updatingId || String(a.status || 'pending') === next) return;
    setUpdatingId(id);
    try {
      const updated = await updateCrmAssignment(id, { status: next });
      setAssignments((prev) =>
        prev.map((row) => (String(row.id) === id ? { ...row, ...updated, status: updated.status || next } : row)),
      );
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setUpdatingId(null);
    }
  };

  const quickStatusActions = (a: CrmAssignment) => {
    const st = String(a.status || 'pending');
    if (isTaskDone(st)) {
      return [{ key: 'pending', label: 'Mở lại' }];
    }
    if (isTaskInProgress(st)) {
      return [
        { key: 'completed', label: 'Hoàn thành' },
        { key: 'pending', label: 'Mở lại' },
      ];
    }
    return [
      { key: 'in_progress', label: 'Đang làm' },
      { key: 'completed', label: 'Hoàn thành' },
    ];
  };

  const openInboxDetail = (t: SharedInboxTask) => {
    const asgId = t.crm_assignment_id != null
      ? String(t.crm_assignment_id)
      : (String(t.id).startsWith('asg_') ? String(t.id).slice(4) : '');
    if (asgId && String(t.task_source_type || '') === 'crm_assignment') {
      setDetailItem({
        id: asgId,
        title: t.title,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline,
        lead_id: t.lead_id,
        lead: t.lead,
        assignee: t.assignee,
        company: t.owner_company_name
          ? { id: String(t.owner_company_id || ''), name: t.owner_company_name }
          : null,
        executor_company: t.executor_company_name
          ? { id: String(t.executor_company_id || ''), name: t.executor_company_name }
          : null,
        assignment_module: t.assignment_module,
        task_source_type: t.task_source_type,
      });
      setDetailId(asgId);
      return;
    }
    const projectId = t.lead?.project_id ? String(t.lead.project_id) : '';
    if (projectId) openProjectDetail(projectId, { initialTab: 'shared-workspace' });
  };

  const sharedCount = sharedGroups.reduce((n, g) => n + (g.tasks?.length || 0), 0);

  const renderAssignment = ({ item: a }: { item: CrmAssignment }) => {
    const st = String(a.status || 'pending');
    const done = isTaskDone(st);
    const overdue = isOverdue(a.deadline, st);
    const assigneeName =
      a.assignees?.map((u) => u.full_name).filter(Boolean).join(', ')
      || a.assignee?.full_name
      || '';
    const dealLabel = assignmentDealLabel(a.lead);
    const ownerCo = companyShortLabel(a.company);
    const execCo = companyShortLabel(a.executor_company);
    const crossCo = execCo && ownerCo && execCo !== ownerCo
      ? `${ownerCo} → ${execCo}`
      : execCo && execCo !== ownerCo
        ? `Từ ${execCo}`
        : ownerCo;
    const pri = String(a.priority || 'medium');

    return (
      <View style={[styles.card, overdue && styles.cardOverdue]}>
        <TapHighlight onPress={() => openAssignmentDetail(a)}>
          <View style={styles.cardTop}>
            <View style={[styles.statusDot, {
              backgroundColor: done ? colors.success : isTaskInProgress(st) ? colors.primary : colors.warning,
            }]}
            />
            <Text style={[styles.cardTitle, done && styles.doneTxt]} numberOfLines={2}>
              {a.title || 'Giao việc'}
            </Text>
            {overdue ? (
              <View style={styles.overduePill}>
                <Text style={styles.overduePillTxt}>Quá hạn</Text>
              </View>
            ) : (
              <View style={[styles.priPill, { borderColor: priorityTone(pri, colors) }]}>
                <Text style={[styles.priTxt, { color: priorityTone(pri, colors) }]}>
                  {PRIORITY_LABEL[pri] || pri}
                </Text>
              </View>
            )}
          </View>

          {dealLabel ? (
            <Text style={styles.dealLine} numberOfLines={1}>{dealLabel}</Text>
          ) : null}
          {a.description ? (
            <Text style={styles.desc} numberOfLines={2}>{a.description}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillTxt}>{STATUS_STAGE_LABEL[st] || statusPillLabel(st)}</Text>
            </View>
            {a.deadline ? (
              <Text style={[styles.metaTxt, overdue && { color: colors.danger }]} numberOfLines={1}>
                Hạn {new Date(a.deadline).toLocaleString('vi-VN')}
              </Text>
            ) : null}
          </View>

          {assigneeName ? (
            <Text style={styles.metaTxt} numberOfLines={1}>Người nhận: {assigneeName}</Text>
          ) : null}
          {a.created_by?.full_name ? (
            <Text style={styles.metaTxt} numberOfLines={1}>Người giao: {a.created_by.full_name}</Text>
          ) : null}
          {crossCo ? (
            <View style={styles.companyRow}>
              <Ionicons name="business-outline" size={12} color={colors.primary} />
              <Text style={styles.companyLine} numberOfLines={1}>{crossCo}</Text>
            </View>
          ) : null}
          <Text style={[styles.tapHint, { marginLeft: 0, marginTop: 4 }]}>Nhấn để xem chi tiết</Text>
        </TapHighlight>

        <View style={styles.quickRow}>
          {quickStatusActions(a).map((act) => (
            <Pressable
              key={act.key}
              style={styles.quickBtn}
              onPress={() => void applyStatus(a, act.key)}
              disabled={updatingId === String(a.id)}
            >
              {updatingId === String(a.id) ? (
                <SpinningLoader color={colors.primary} size="small" />
              ) : (
                <Text style={styles.quickBtnTxt}>{act.label}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TapHighlight style={styles.backBtn} onPress={() => tabNav.navigate('Overview')}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TapHighlight>
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle} numberOfLines={1}>{pageTabTitle(pageTab)}</Text>
              <Text style={styles.greetSubCompact} numberOfLines={2}>
                Khớp web Lắp đặt — lọc công ty, NV, trạng thái, ưu tiên
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TapHighlight style={styles.iconBtn} onPress={() => setScopeSheetOpen(true)} hitSlop={8}>
              <Ionicons name="filter-outline" size={20} color={colors.text} />
              {scopeFilterCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{scopeFilterCount}</Text>
                </View>
              ) : null}
            </TapHighlight>
          </View>
        </View>
      </View>

      <View style={styles.modeRow}>
        {PAGE_TABS.map((m) => {
          const active = pageTab === m.key;
          return (
            <TapHighlight
              key={m.key}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => setPageTab(m.key)}
            >
              <Ionicons name={m.icon} size={15} color={active ? colors.primary : colors.textMuted} />
              <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]} numberOfLines={1}>
                {m.label}
              </Text>
              {m.key === 'shared' && sharedCount > 0 ? (
                <View style={styles.modeBadge}>
                  <Text style={styles.modeBadgeText}>{sharedCount > 99 ? '99+' : sharedCount}</Text>
                </View>
              ) : null}
            </TapHighlight>
          );
        })}
      </View>

      {pageTab === 'shared' ? (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Việc deal / công ty khác giao cho bạn. Dùng nút «Giao việc KG chung» để tạo việc gắn deal.
          </Text>
        </View>
      ) : null}

      {pageTab !== 'tasks' ? (
        <View style={styles.statsRow}>
          <TapHighlight
            style={styles.statCard}
            onPress={() => setListStatusFilter((v) => (v === 'pending' ? 'all' : 'pending'))}
          >
            <Text style={[styles.statValue, { color: colors.danger }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Cần xử lý</Text>
          </TapHighlight>
          <TapHighlight
            style={styles.statCard}
            onPress={() => setListStatusFilter((v) => (v === 'in_progress' ? 'all' : 'in_progress'))}
          >
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>Đang làm</Text>
          </TapHighlight>
          <TapHighlight
            style={styles.statCard}
            onPress={() => setListStatusFilter((v) => (v === 'completed' ? 'all' : 'completed'))}
          >
            <Text style={[styles.statValue, { color: colors.success }]}>{stats.done}</Text>
            <Text style={styles.statLabel}>Hoàn thành</Text>
          </TapHighlight>
          <TapHighlight
            style={styles.statCard}
            onPress={() => setListStatusFilter((v) => (v === 'overdue' ? 'all' : 'overdue'))}
          >
            <Text style={[styles.statValue, { color: colors.danger }]}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>Quá hạn</Text>
          </TapHighlight>
        </View>
      ) : null}

      {error && pageTab !== 'tasks' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  const tasksListHeader = (
    <View>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TapHighlight style={styles.backBtn} onPress={() => tabNav.navigate('Overview')}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TapHighlight>
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle} numberOfLines={1}>Nhiệm vụ</Text>
              <Text style={styles.greetSubCompact} numberOfLines={2}>
                Nhiệm vụ vận chuyển theo dự án — chạm để mở chi tiết
              </Text>
            </View>
          </View>
          <TapHighlight style={styles.iconBtn} onPress={() => setScopeSheetOpen(true)} hitSlop={8}>
            <Ionicons name="filter-outline" size={20} color={colors.text} />
            {scopeFilterCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{scopeFilterCount}</Text>
              </View>
            ) : null}
          </TapHighlight>
        </View>
      </View>

      <View style={styles.modeRow}>
        {PAGE_TABS.map((m) => {
          const active = pageTab === m.key;
          return (
            <TapHighlight
              key={m.key}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => setPageTab(m.key)}
            >
              <Ionicons name={m.icon} size={15} color={active ? colors.primary : colors.textMuted} />
              <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]} numberOfLines={1}>
                {m.label}
              </Text>
              {m.key === 'shared' && sharedCount > 0 ? (
                <View style={styles.modeBadge}>
                  <Text style={styles.modeBadgeText}>{sharedCount > 99 ? '99+' : sharedCount}</Text>
                </View>
              ) : null}
            </TapHighlight>
          );
        })}
      </View>
    </View>
  );

  const listBodyLoading = loading && !refreshing;
  const assignmentEmpty = listBodyLoading && assignments.length === 0 ? (
    <View style={styles.inlineLoad}>
      <SpinningLoader color={colors.primary} size="large" label="Đang tải…" />
    </View>
  ) : (
    <Text style={styles.empty}>
      {userId
        ? (listStatusFilter !== 'all' || filterPriority
          ? 'Không có giao việc khớp bộ lọc.'
          : 'Chưa có giao việc Lắp đặt trong phạm vi này.')
        : 'Đăng nhập để xem giao việc.'}
    </Text>
  );
  const sharedEmpty = listBodyLoading && sharedGroups.length === 0 ? (
    <View style={styles.inlineLoad}>
      <SpinningLoader color={colors.primary} size="large" label="Đang tải…" />
    </View>
  ) : (
    <Text style={styles.empty}>
      {userId
        ? 'Chưa có nhiệm vụ deal VC/LĐ được giao cho bạn.'
        : 'Đăng nhập để xem Không gian chung.'}
    </Text>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {pageTab === 'tasks' ? (
        <WorkProjectTasksPanel
          ListHeaderComponent={tasksListHeader}
          contentPaddingBottom={24 + insets.bottom}
          companyId={tasksCompanyId}
          assigneeId={tasksAssigneeId}
          focusLeadId={focusTaskLeadId}
          focusTaskId={focusTaskId}
          initialStatusFilter={tasksStatusFilter}
        />
      ) : pageTab === 'assignments' ? (
        <FlatList
          data={visibleAssignments}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderAssignment}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          }
          ListEmptyComponent={assignmentEmpty}
        />
      ) : (
        <FlatList
          data={visibleSharedGroups}
          keyExtractor={(g) => String(g.lead_id)}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          }
          ListEmptyComponent={sharedEmpty}
          renderItem={({ item: g, index }) => {
            const accent = [colors.primary, '#8B5CF6', '#14B8A6', '#F59E0B'][index % 4];
            const projectId = g.lead?.project_id ? String(g.lead.project_id) : '';
            return (
              <View style={styles.groupWrap}>
                <TapHighlight
                  onPress={() => {
                    if (projectId) openProjectDetail(projectId, { initialTab: 'shared-workspace' });
                  }}
                  disabled={!projectId}
                >
                  <View style={styles.groupHead}>
                    <View style={[styles.groupAccent, { backgroundColor: accent }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.groupCode} numberOfLines={1}>
                        {g.lead?.code || g.lead?.project_code || 'Deal'}
                      </Text>
                      <Text style={styles.groupTitle} numberOfLines={2}>
                        {g.lead?.title || g.lead?.project_name || 'Không gian chung'}
                      </Text>
                    </View>
                    <View style={[styles.dealBadge, { backgroundColor: colorWithAlpha(accent, 0.18) }]}>
                      <Text style={[styles.dealBadgeText, { color: accent }]}>{g.tasks.length}</Text>
                    </View>
                  </View>
                </TapHighlight>
                {(g.tasks || []).map((t) => {
                  const st = String(t.status || 'pending');
                  const overdue = isOverdue(t.deadline, st);
                  const cross =
                    t.executor_company_name && t.owner_company_name
                    && t.executor_company_name !== t.owner_company_name
                      ? `${t.owner_company_name} → ${t.executor_company_name}`
                      : t.executor_company_name || t.owner_company_name || '';
                  return (
                    <TapHighlight
                      key={String(t.id)}
                      style={[styles.inboxRow, overdue && styles.cardOverdue]}
                      onPress={() => openInboxDetail(t)}
                    >
                      <View style={[styles.statusDot, {
                        backgroundColor: isTaskDone(st)
                          ? colors.success
                          : isTaskInProgress(st)
                            ? colors.primary
                            : colors.warning,
                      }]}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{t.title || 'Nhiệm vụ'}</Text>
                        {cross ? (
                          <Text style={styles.companyLine} numberOfLines={1}>{cross}</Text>
                        ) : null}
                        {overdue ? (
                          <Text style={styles.overdueInline}>Quá hạn</Text>
                        ) : null}
                      </View>
                      <Text style={styles.statusPillTxt}>
                        {STATUS_STAGE_LABEL[st] || statusPillLabel(st)}
                      </Text>
                    </TapHighlight>
                  );
                })}
              </View>
            );
          }}
        />
      )}

      {pageTab !== 'tasks' ? (
        <TapHighlight
          style={styles.fab}
          onPress={() => {
            setAssignShared(pageTab === 'shared');
            setAssignOpen(true);
          }}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabTxt}>
            {pageTab === 'shared' ? 'Giao việc KG chung' : 'Giao việc'}
          </Text>
        </TapHighlight>
      ) : null}

      <AssignWorkModal
        visible={assignOpen}
        companyId={createCompanyId}
        isAdmin={assignAdmin}
        companies={companies}
        sharedWorkspaceMode={assignShared}
        onClose={() => setAssignOpen(false)}
        onCreated={() => {
          if (assignShared) setPageTab('shared');
          else setPageTab('assignments');
          void load({ force: true });
        }}
      />

      <AssignmentDetailModal
        visible={Boolean(detailId)}
        assignment={detailItem}
        assignmentId={detailId}
        onClose={() => {
          setDetailId(null);
          setDetailItem(null);
        }}
        onUpdated={(row) => {
          setDetailItem(row);
          setAssignments((prev) =>
            prev.map((a) => (String(a.id) === String(row.id) ? { ...a, ...row } : a)),
          );
          setSharedGroups((prev) =>
            prev.map((g) => ({
              ...g,
              tasks: (g.tasks || []).map((t) => {
                const tid = t.crm_assignment_id != null
                  ? String(t.crm_assignment_id)
                  : (String(t.id).startsWith('asg_') ? String(t.id).slice(4) : '');
                if (tid !== String(row.id)) return t;
                return { ...t, status: row.status, title: row.title, priority: row.priority, deadline: row.deadline };
              }),
            })),
          );
        }}
      />

      <WorkFilterSheet
        visible={scopeSheetOpen}
        onClose={() => setScopeSheetOpen(false)}
        onReset={() => {
          setFilterCompanyId(canPickScope ? '' : ownCompanyId);
          setFilterAssigneeId(canPickScope ? '' : userId);
          setListStatusFilter('all');
          setFilterPriority('');
          setTasksStatusFilter('all');
          setScopeSheetOpen(false);
        }}
        onApply={(next) => {
          setFilterCompanyId(next.companyId);
          setFilterAssigneeId(next.assigneeId);
          const nextStatus = next.status === 'cancelled' ? 'all' : next.status;
          setListStatusFilter(nextStatus);
          setFilterPriority(next.priority);
          setTasksStatusFilter(nextStatus);
          setScopeSheetOpen(false);
        }}
        canPickScope={canPickScope}
        companyOptions={companyOptions}
        companyId={filterCompanyId}
        ownCompanyId={ownCompanyId}
        ownCompanyLabel={ownCompanyLabel}
        userId={userId}
        assigneeId={filterAssigneeId}
        status={listStatusFilter}
        priority={filterPriority}
      />
    </View>
  );
}

function makeStyles(colors: AppColors, bottomInset: number) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
    headerTextWrap: { flex: 1, minWidth: 0 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    greetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
    greetDate: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 3 },
    greetSub: { color: colors.textFaint, fontSize: 12, marginTop: 6, fontWeight: '500', lineHeight: 17 },
    greetSubCompact: {
      color: colors.textFaint,
      fontSize: 12,
      marginTop: 2,
      fontWeight: '500',
      lineHeight: 16,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: {
      position: 'absolute',
      top: -4,
      right: -6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    scopeSheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    scopeSheetCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: bottomInset + Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    scopeSheetTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 4,
    },
    scopeSheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    scopeSheetRowActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    scopeSheetRowLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 2,
    },
    scopeSheetRowValue: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    scopeSheetClose: {
      marginTop: 4,
      alignItems: 'center',
      paddingVertical: 12,
    },
    scopeSheetCloseTxt: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    modeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      minWidth: 0,
    },
    modeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    modeBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    modeBtnTextActive: { color: colors.primary },
    modeBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colorWithAlpha(colors.primary, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeBadgeText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
    filterChipRow: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: 8,
      gap: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    filterChipOn: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    filterChipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    filterChipTxtOn: { color: colors.primary },
    scopeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      alignItems: 'center',
    },
    scopeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      maxWidth: '100%',
    },
    scopeChipGrow: { flex: 1, minWidth: 0 },
    scopeChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    scopeChipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    scopeChipTxtActive: { color: colors.primary },
    hintBox: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.primary, 0.25),
    },
    hintText: { color: colors.textMuted, fontSize: 12, fontWeight: '600', lineHeight: 17 },
    overdueFilterBar: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.4),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    overdueFilterTxt: {
      flex: 1,
      color: colors.danger,
      fontSize: 12,
      fontWeight: '800',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    statValue: { fontSize: 22, fontWeight: '800' },
    statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600' },
    errorBox: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      padding: 10,
      borderRadius: Radii.md,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.35),
    },
    errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
    listContent: { paddingBottom: bottomInset + 96 },
    inlineLoad: { alignItems: 'center', justifyContent: 'center', paddingTop: 36, paddingBottom: 24 },
    empty: {
      color: colors.textMuted,
      textAlign: 'center',
      fontSize: 14,
      marginTop: 40,
      paddingHorizontal: Spacing.xl,
      lineHeight: 21,
    },
    card: {
      marginHorizontal: Spacing.lg,
      marginBottom: 10,
      padding: 14,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 6,
    },
    cardOverdue: {
      borderColor: colorWithAlpha(colors.danger, 0.55),
      backgroundColor: colorWithAlpha(colors.danger, 0.08),
    },
    overduePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colorWithAlpha(colors.danger, 0.2),
    },
    overduePillTxt: { color: colors.danger, fontSize: 10, fontWeight: '900' },
    overdueInline: { color: colors.danger, fontSize: 11, fontWeight: '800', marginTop: 2 },
    tapHint: { color: colors.textFaint, fontSize: 10, fontWeight: '600', marginLeft: 'auto' },
    quickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    quickBtn: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
      minWidth: 72,
      alignItems: 'center',
    },
    quickBtnTxt: { color: colors.primary, fontSize: 11, fontWeight: '800' },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
    cardTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800' },
    doneTxt: { color: colors.textMuted, textDecorationLine: 'line-through' },
    priPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    priTxt: { fontSize: 10, fontWeight: '800' },
    dealLine: { color: colors.primary, fontSize: 12, fontWeight: '700' },
    desc: { color: colors.textMuted, fontSize: 12, fontWeight: '500', lineHeight: 17 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    statusPillTxt: { color: colors.text, fontSize: 11, fontWeight: '700' },
    metaTxt: { color: colors.textFaint, fontSize: 11, fontWeight: '600', flexShrink: 1 },
    companyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    companyLine: { flex: 1, color: colors.primary, fontSize: 11, fontWeight: '700' },
    groupWrap: {
      marginHorizontal: Spacing.lg,
      marginBottom: 12,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    groupHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      backgroundColor: colors.card,
    },
    groupAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
    groupCode: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    groupTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
    dealBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    dealBadgeText: { fontSize: 12, fontWeight: '800' },
    inboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: bottomInset + 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: colors.primary,
      elevation: 4,
    },
    fabTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  });
}
