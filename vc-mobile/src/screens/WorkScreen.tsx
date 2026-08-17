import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import Avatar from '../components/Avatar';
import AssignWorkModal from '../components/AssignWorkModal';
import AssignmentDetailModal from '../components/AssignmentDetailModal';
import FilterPickerModal, { type FilterOption } from '../components/FilterPickerModal';
import TapHighlight from '../components/TapHighlight';
import WorkFilterModal, {
  EMPTY_WORK_FILTERS,
  type WorkBoardFilters,
} from '../components/WorkFilterModal';
import WorkProjectTasksPanel from '../components/WorkProjectTasksPanel';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
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
  isTaskDone,
  isTaskInProgress,
  isTaskPending,
  statusPillLabel,
} from '../lib/workTasksApi';
import { formatVnWeekdayDate } from '../lib/vcBoardKpis';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';

/** Khớp web CRMAssignmentsPage: admin | manager | sales_admin */
function isAssignmentsAdmin(role?: string | null): boolean {
  return ['admin', 'manager', 'sales_admin'].includes(String(role || '').toLowerCase());
}

const LS_COMPANY = 'vc_assignments_company_id';
const LS_ASSIGNEE_MINE = 'vc_assignments_assignee_mine';

function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || full || 'bạn';
}

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

function countActiveFilters(f: WorkBoardFilters): number {
  let n = 0;
  if (f.status) n += 1;
  if (f.priority) n += 1;
  if (f.q.trim()) n += 1;
  return n;
}

function matchAssignment(a: CrmAssignment, f: WorkBoardFilters): boolean {
  if (f.status && String(a.status || 'pending') !== f.status) return false;
  if (f.priority && String(a.priority || '') !== f.priority) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    a.title,
    a.description,
    assignmentDealLabel(a.lead),
    a.assignee?.full_name,
    ...(a.assignees || []).map((u) => u.full_name),
    a.created_by?.full_name,
    companyShortLabel(a.company),
    companyShortLabel(a.executor_company),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchInboxTask(t: SharedInboxTask, f: WorkBoardFilters): boolean {
  if (f.status && String(t.status || 'pending') !== f.status) return false;
  if (f.priority && String(t.priority || '') !== f.priority) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    t.title,
    assignmentDealLabel(t.lead),
    t.assignee?.full_name,
    t.owner_company_name,
    t.executor_company_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
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
  const userId = user?.id || user?.userId || '';
  const userName = user?.full_name || user?.fullName || 'Bạn';
  const greetName = firstName(userName);
  const ownCompanyId = user?.company_id ? String(user.company_id) : '';
  const assignAdmin = isAssignmentsAdmin(user?.role);

  const [pageTab, setPageTab] = useState<PageTab>('tasks');
  /** Admin: '' = tất cả công ty (khớp web). NV: luôn công ty mình (backend force). */
  const [filterCompanyId, setFilterCompanyId] = useState('');
  /** Admin: true = chỉ việc giao cho tôi; false = tất cả NV (mặc định web). NV: luôn true. */
  const [assigneeMineOnly, setAssigneeMineOnly] = useState(!assignAdmin);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [assignments, setAssignments] = useState<CrmAssignment[]>([]);
  const [sharedGroups, setSharedGroups] = useState<SharedInboxGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignShared, setAssignShared] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<WorkBoardFilters>({ ...EMPTY_WORK_FILTERS });

  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (assignAdmin) {
          const [savedCo, savedMine, list] = await Promise.all([
            AsyncStorage.getItem(LS_COMPANY),
            AsyncStorage.getItem(LS_ASSIGNEE_MINE),
            fetchCompanies().catch(() => [] as CompanyOption[]),
          ]);
          if (cancelled) return;
          setCompanies(list);
          const co = String(savedCo || '').trim();
          if (co && list.some((c) => String(c.id) === co)) setFilterCompanyId(co);
          else setFilterCompanyId('');
          // Admin mặc định xem tất cả NV (như web filterAssignee='').
          setAssigneeMineOnly(savedMine === '1');
        } else {
          setFilterCompanyId(ownCompanyId);
          setAssigneeMineOnly(true);
          if (ownCompanyId) {
            const list = await fetchCompanies().catch(() => [] as CompanyOption[]);
            if (!cancelled) setCompanies(list);
          }
        }
      } finally {
        if (!cancelled) setFiltersReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignAdmin, ownCompanyId]);

  useEffect(() => {
    if (!assignAdmin || !filtersReady) return;
    void AsyncStorage.setItem(LS_COMPANY, filterCompanyId || '');
  }, [assignAdmin, filterCompanyId, filtersReady]);

  useEffect(() => {
    if (!assignAdmin || !filtersReady) return;
    void AsyncStorage.setItem(LS_ASSIGNEE_MINE, assigneeMineOnly ? '1' : '0');
  }, [assignAdmin, assigneeMineOnly, filtersReady]);

  /** Khớp web load(): company_id chỉ khi admin chọn; assignee_id bắt buộc với NV. */
  const load = useCallback(async () => {
    if (!userId || !filtersReady) {
      if (!userId) {
        setAssignments([]);
        setSharedGroups([]);
        setLoading(false);
      }
      return;
    }
    setError(null);
    try {
      const companyParam = assignAdmin
        ? (filterCompanyId || undefined)
        : undefined;
      const assigneeParam = (!assignAdmin || assigneeMineOnly)
        ? userId
        : undefined;

      const [list, inbox] = await Promise.all([
        fetchLogisticsAssignments({
          companyId: companyParam,
          assigneeId: assigneeParam,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          q: filters.q || undefined,
          limit: 200,
        }),
        fetchPrivateDealInbox('logistics'),
      ]);
      setAssignments(list);
      setSharedGroups(inbox.groups);
    } catch (e) {
      setError(formatApiError(e));
      setAssignments([]);
      setSharedGroups([]);
    } finally {
      setLoading(false);
    }
  }, [
    userId,
    filtersReady,
    assignAdmin,
    filterCompanyId,
    assigneeMineOnly,
    filters.status,
    filters.priority,
    filters.q,
  ]);

  useEffect(() => {
    if (!filtersReady) return;
    setLoading(true);
    void load();
  }, [load, filtersReady]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useProductionRealtime({
    onRefresh: () => void load(),
    enabled: Boolean(userId) && filtersReady,
    modes: ['task'],
  });

  const companyOptions: FilterOption[] = useMemo(() => {
    const opts: FilterOption[] = [{ id: '', label: 'Tất cả công ty' }];
    for (const c of companies) {
      opts.push({ id: String(c.id), label: c.name || String(c.id) });
    }
    return opts;
  }, [companies]);

  const selectedCompanyLabel = useMemo(() => {
    if (!filterCompanyId) return 'Tất cả công ty';
    return companyOptions.find((o) => o.id === filterCompanyId)?.label
      || companies.find((c) => String(c.id) === filterCompanyId)?.name
      || 'Công ty';
  }, [filterCompanyId, companyOptions, companies]);

  /** companyId khi tạo giao việc — ưu tiên filter đang chọn. */
  const createCompanyId = filterCompanyId || ownCompanyId || null;

  const visibleAssignments = useMemo(
    () => assignments.filter((a) => matchAssignment(a, filters)),
    [assignments, filters],
  );

  const visibleSharedGroups = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return sharedGroups
      .map((g) => {
        const dealHay = [
          g.lead?.code,
          g.lead?.title,
          g.lead?.project_code,
          g.lead?.project_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const dealMatch = !q || dealHay.includes(q);
        const tasks = (g.tasks || []).filter((t) => {
          if (!matchInboxTask(t, { ...filters, q: dealMatch ? '' : filters.q })) return false;
          return true;
        });
        if (!tasks.length) return null;
        return { ...g, tasks };
      })
      .filter(Boolean) as SharedInboxGroup[];
  }, [sharedGroups, filters]);

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

  const filterCount = countActiveFilters(filters);
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
                <ActivityIndicator color={colors.primary} size="small" />
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
            <Avatar name={userName} avatarUrl={user?.avatar} size={44} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle} numberOfLines={1}>{pageTabTitle(pageTab)}</Text>
              <Text style={styles.greetDate} numberOfLines={1}>
                Xin chào, {greetName} · {formatVnWeekdayDate()}
              </Text>
            </View>
          </View>
          {pageTab !== 'tasks' ? (
            <TapHighlight style={styles.iconBtn} onPress={() => setFilterOpen(true)} hitSlop={8}>
              <Ionicons name="options-outline" size={20} color={colors.text} />
              {filterCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{filterCount}</Text>
                </View>
              ) : null}
            </TapHighlight>
          ) : null}
        </View>
        <Text style={styles.greetSub}>
          {pageTab === 'tasks'
            ? 'Nhiệm vụ vận chuyển / lắp đặt theo dự án — chạm để mở chi tiết'
            : 'Khớp web Lắp đặt — chọn công ty / nhân viên như bộ lọc trên web'}
        </Text>
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

      {pageTab === 'assignments' ? (
        <View style={styles.scopeRow}>
          {assignAdmin ? (
            <TapHighlight
              style={[styles.scopeChip, styles.scopeChipGrow, filterCompanyId ? styles.scopeChipActive : null]}
              onPress={() => setCompanyPickerOpen(true)}
            >
              <Ionicons
                name="business-outline"
                size={14}
                color={filterCompanyId ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.scopeChipTxt, filterCompanyId ? styles.scopeChipTxtActive : null]}
                numberOfLines={1}
              >
                {selectedCompanyLabel}
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={filterCompanyId ? colors.primary : colors.textMuted}
              />
            </TapHighlight>
          ) : (
            <View style={[styles.scopeChip, styles.scopeChipGrow]}>
              <Ionicons name="person-outline" size={14} color={colors.textMuted} />
              <Text style={styles.scopeChipTxt} numberOfLines={1}>
                {userName || 'Việc của tôi'}
              </Text>
            </View>
          )}
          {assignAdmin ? (
            <TapHighlight
              style={[styles.scopeChip, assigneeMineOnly && styles.scopeChipActive]}
              onPress={() => setAssigneeMineOnly((v) => !v)}
            >
              <Text style={[styles.scopeChipTxt, assigneeMineOnly && styles.scopeChipTxtActive]}>
                {assigneeMineOnly ? 'Của tôi' : 'Tất cả NV'}
              </Text>
            </TapHighlight>
          ) : null}
        </View>
      ) : pageTab === 'shared' ? (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Việc deal / công ty khác giao cho bạn. Dùng nút «Giao việc KG chung» để tạo việc gắn deal.
          </Text>
        </View>
      ) : null}

      {pageTab !== 'tasks' ? (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.danger }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Cần xử lý</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>Đang làm</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.success }]}>{stats.done}</Text>
            <Text style={styles.statLabel}>Hoàn thành</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.danger }]}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>Quá hạn</Text>
          </View>
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
            <Avatar name={userName} avatarUrl={user?.avatar} size={44} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle} numberOfLines={1}>Nhiệm vụ</Text>
              <Text style={styles.greetDate} numberOfLines={1}>
                Xin chào, {greetName} · {formatVnWeekdayDate()}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.greetSub}>
          Nhiệm vụ vận chuyển / lắp đặt theo dự án — chạm để mở chi tiết
        </Text>
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

  if (pageTab !== 'tasks' && loading && !refreshing) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {pageTab === 'tasks' ? (
        <WorkProjectTasksPanel
          ListHeaderComponent={tasksListHeader}
          contentPaddingBottom={24 + insets.bottom}
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
          ListEmptyComponent={
            <Text style={styles.empty}>
              {userId
                ? 'Chưa có giao việc Lắp đặt trong phạm vi này.'
                : 'Đăng nhập để xem giao việc.'}
            </Text>
          }
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
          ListEmptyComponent={
            <Text style={styles.empty}>
              {userId
                ? 'Chưa có nhiệm vụ deal VC/LĐ được giao cho bạn.'
                : 'Đăng nhập để xem Không gian chung.'}
            </Text>
          }
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
          void load();
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

      <WorkFilterModal
        visible={filterOpen}
        value={filters}
        bottomInset={insets.bottom}
        onClose={() => setFilterOpen(false)}
        onApply={setFilters}
      />

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Chọn công ty"
        options={companyOptions}
        selectedId={filterCompanyId}
        onSelect={setFilterCompanyId}
        onClose={() => setCompanyPickerOpen(false)}
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
