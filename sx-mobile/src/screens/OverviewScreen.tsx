/**
 * Tổng quan SX — bố cục giống CRM mobile (hero + banner + KPI + danh sách + lối tắt).
 * Không còn section «Thông báo mới» (chuông header mở modal).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { loadKanbanFilters, saveKanbanFilters } from '../lib/kanbanFilterStorage';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import {
  fetchCompanies,
  fetchProductionBoard,
  fetchProductionBoardSummary,
  isAbortError,
  type CompanyOption,
} from '../lib/productionApi';
import { getCachedBoard, isCachedBoardFresh } from '../lib/productionBoardCache';
import {
  isSystemAdmin,
  workshopCompaniesForCrossViewer,
} from '../lib/productionFilters';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import {
  computeSxBoardKpis,
  formatVnWeekdayDate,
  initialsFrom,
  pickOverdueProjects,
  shortDateLabel,
  type SxBoardKpis,
} from '../lib/sxBoardKpis';
import {
  assignmentDealCardLabel,
  canViewTeamWork,
  fetchMyProductionTasks,
  fetchProductionWorkTasks,
  formatTaskDeadline,
  isTaskInProgress,
  isTaskOverdue,
  isTaskPending,
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

const PAGE_HPAD = 14;
const TASK_PAGE_SIZE = 5;
const DEAL_PAGE_SIZE = 5;
const PRIORITY_FETCH_LIMIT = 80;
const KPI_CARD_WIDTH = 132;

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

function isOpenWorkTask(t: WorkTask): boolean {
  return isTaskPending(t.status) || isTaskInProgress(t.status);
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

type KpiTone = 'blue' | 'cyan' | 'muted' | 'green' | 'orange' | 'red';

export default function OverviewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { unreadCount, refreshUnread } = useNotifications();
  const { unreadTotal: messageUnread } = useMessenger();
  const { openProjectDetail, openOverdueProjects, openMessages, navigation: rootNav } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const userName = user?.full_name || user?.fullName || user?.email || 'Bạn';
  const nick = firstName(userName);
  const userId = user?.id || user?.userId || '';
  const helloLine = `Xin chào, ${nick}!`;
  const dateLabel = formatVnWeekdayDate();
  const wishLine = 'Chúc bạn một ngày làm việc hiệu quả!';

  const confirmLogout = useCallback(() => {
    Alert.alert('Đăng xuất', 'Bạn chắc chắn muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<SxBoardKpis>(EMPTY_KPI);
  const [overdueDeals, setOverdueDeals] = useState<ProductionProject[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [taskPage, setTaskPage] = useState(1);
  const [dealPage, setDealPage] = useState(1);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardFiltersRef = useRef<{ companyId?: string; workshopTypeId?: string }>({});
  const loadSeqRef = useRef(0);
  const boardAbortRef = useRef<AbortController | null>(null);
  const companiesRef = useRef<CompanyOption[]>([]);
  companiesRef.current = companies;

  /** Admin hệ thống (admin không gắn company) — thấy / chọn mọi công ty. */
  const sysAdmin = isSystemAdmin(user);
  /** Admin/manager công ty — thấy cả đội trong công ty; NV thường chỉ việc/deal của mình. */
  const teamView = canViewTeamWork(user);
  const ownOnly = !teamView;
  const canPickCompany = sysAdmin;
  const lockedCompanyId = !sysAdmin && user?.company_id ? String(user.company_id) : '';

  const companyOptions = useMemo(() => {
    if (sysAdmin) {
      return [
        { id: '', label: 'Tất cả công ty' },
        ...companies.map((c) => ({ id: String(c.id), label: c.name })),
      ];
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
    const companyChanged = prev !== next;
    await saveKanbanFilters({
      ...snap,
      filterCompany: companyId,
      // Chỉ xóa phân loại khi đổi xưởng thật — giữ khi khóa lại cùng company JWT.
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
      const workshopTypeId = snap?.filterWorkTypeId || undefined;
      const dealCompanyId = snap?.filterDealCompany || undefined;

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
      } else if (companyId) {
        const exists = companyList.some((c) => String(c.id) === String(companyId));
        if (!exists) companyId = '';
      }

      if (seq !== loadSeqRef.current) return;
      setFilterCompany(companyId);

      const boardFilters = {
        companyId: companyId || undefined,
        dealCompanyId: dealCompanyId || undefined,
        workshopTypeId:
          companyId && workshopTypeId && workshopTypeId !== 'none'
            ? workshopTypeId
            : undefined,
      };
      boardFiltersRef.current = boardFilters;

      const skipBoard = mode === 'silent' && isCachedBoardFresh(boardFilters) && !!getCachedBoard(boardFilters);
      const cachedBoard = getCachedBoard(boardFilters);

      const applyScopedBoard = (projects: ProductionProject[], stages: KanbanStage[] = []) => {
        const scoped = scopeProjectsForUser(projects, { userId, ownOnly });
        setOverdueDeals(pickOverdueProjects(scoped, PRIORITY_FETCH_LIMIT, stages));
        return scoped;
      };

      if (mode === 'init' || mode === 'refresh') setKpis(EMPTY_KPI);
      if (cachedBoard && mode !== 'refresh') {
        const scoped = applyScopedBoard(cachedBoard.projects, cachedBoard.stages);
        if (ownOnly) setKpis(computeSxBoardKpis(scoped, cachedBoard.stages));
        if (mode === 'init') setLoading(false);
      }

      // Admin hệ thống / admin công ty: giao việc đội (theo company). NV: chỉ của mình.
      const tasksPromise = !userId
        ? Promise.resolve([] as WorkTask[])
        : ownOnly
          ? fetchMyProductionTasks(userId, { signal: ac.signal }).catch(() => [] as WorkTask[])
          : fetchProductionWorkTasks({
              companyId: companyId || null,
              limit: WORK_TASKS_PAGE_SIZE,
              offset: 0,
              signal: ac.signal,
            }).catch(() => [] as WorkTask[]);

      const [board, summary, myTasks] = await Promise.all([
        skipBoard
          ? Promise.resolve(cachedBoard!)
          : fetchProductionBoard(mode === 'refresh', boardFilters, {
              signal: ac.signal,
              onPartial: (partial) => {
                if (seq !== loadSeqRef.current) return;
                const scoped = applyScopedBoard(partial.projects, partial.stages);
                if (ownOnly) setKpis(computeSxBoardKpis(scoped, partial.stages));
                if (mode === 'init') setLoading(false);
              },
            }),
        // Summary toàn công ty — NV không dùng (tính từ deal mình phụ trách).
        ownOnly
          ? Promise.resolve(null)
          : fetchProductionBoardSummary(boardFilters, mode === 'refresh', ac.signal).catch((e) => {
              if (isAbortError(e)) throw e;
              return null;
            }),
        tasksPromise,
      ]);

      if (seq !== loadSeqRef.current) return;
      if (board) {
        const scoped = applyScopedBoard(board.projects, board.stages);
        if (ownOnly) {
          setKpis(computeSxBoardKpis(scoped, board.stages));
        } else if (summary) {
          const client = computeSxBoardKpis(board.projects, board.stages);
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
          setKpis(computeSxBoardKpis(board.projects, board.stages));
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
      setTasks(myTasks);
      setTaskPage(1);
      setDealPage(1);
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
      const filters = {
        companyId: snap?.filterCompany || undefined,
        workshopTypeId:
          snap?.filterWorkTypeId && snap.filterWorkTypeId !== 'none'
            ? snap.filterWorkTypeId
            : undefined,
      };
      void load(getCachedBoard(filters) ? 'silent' : 'init');
    });
  }, [load]);

  const onSelectCompany = useCallback(async (id: string) => {
    setCompanyPickerOpen(false);
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
          const scoped = scopeProjectsForUser(cached.projects, { userId, ownOnly });
          setOverdueDeals(pickOverdueProjects(scoped, PRIORITY_FETCH_LIMIT, cached.stages));
          if (ownOnly) {
            setKpis(computeSxBoardKpis(scoped, cached.stages));
            return;
          }
        }
        void fetchProductionBoardSummary(boardFiltersRef.current).then((summary) => {
          if (!summary) return;
          const cachedBoard = getCachedBoard(boardFiltersRef.current);
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
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  const overdueTasksAll = useMemo(() => tasks.filter((t) => isTaskOverdue(t)), [tasks]);
  const overdueTaskCount = overdueTasksAll.length;

  /** Chưa làm + Đang làm — ưu tiên quá hạn trước (giống CRM). */
  const openTasks = useMemo(() => {
    const open = tasks.filter(isOpenWorkTask);
    return open.slice().sort((a, b) => {
      const ao = isTaskOverdue(a) ? 0 : 1;
      const bo = isTaskOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ad = taskDueIso(a) || '';
      const bd = taskDueIso(b) || '';
      return ad.localeCompare(bd);
    });
  }, [tasks]);

  const taskPages = totalPagesOf(openTasks.length, TASK_PAGE_SIZE);
  const dealPages = totalPagesOf(overdueDeals.length, DEAL_PAGE_SIZE);
  const safeTaskPage = Math.min(taskPage, taskPages);
  const safeDealPage = Math.min(dealPage, dealPages);
  const previewTasks = pageSlice(openTasks, safeTaskPage, TASK_PAGE_SIZE);
  const previewDeals = pageSlice(overdueDeals, safeDealPage, DEAL_PAGE_SIZE);

  useEffect(() => {
    if (taskPage > taskPages) setTaskPage(taskPages);
  }, [taskPage, taskPages]);
  useEffect(() => {
    if (dealPage > dealPages) setDealPage(dealPages);
  }, [dealPage, dealPages]);

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

  const toneMap: Record<KpiTone, { fg: string; bg: string }> = {
    blue: { fg: colors.primary, bg: colors.primarySoft },
    cyan: { fg: '#38BDF8', bg: colorWithAlpha('#38BDF8', 0.18) },
    muted: { fg: colors.textMuted, bg: colors.cardAlt },
    green: { fg: colors.success, bg: colorWithAlpha(colors.success, 0.16) },
    orange: { fg: colors.warning, bg: colorWithAlpha(colors.warning, 0.16) },
    red: { fg: colors.danger, bg: colors.dangerSoft },
  };

  const kpiItems: {
    key: string;
    label: string;
    value: number;
    tone: KpiTone;
    onPress: () => void;
  }[] = [
    { key: 'total', label: 'Tổng dự án', value: kpis.total, tone: 'blue', onPress: goKanban },
    { key: 'producing', label: 'Đang sản xuất', value: kpis.producing, tone: 'cyan', onPress: goKanban },
    {
      key: 'await',
      label: 'Chờ vận chuyển',
      value: kpis.awaitingDelivery,
      tone: 'muted',
      onPress: goKanban,
    },
    {
      key: 'shipped',
      label: 'Đã vận chuyển',
      value: kpis.shipped,
      tone: 'green',
      onPress: goKanban,
    },
    {
      key: 'done',
      label: 'Hoàn tất',
      value: kpis.completed,
      tone: 'orange',
      onPress: goKanban,
    },
    {
      key: 'overdue',
      label: 'Quá hạn dự án',
      value: kpis.overdue,
      tone: 'red',
      onPress: () => { if (kpis.overdue > 0) openOverdueProjects(); else goKanban(); },
    },
  ];

  const quickActions: {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress: () => void;
  }[] = [
    { key: 'kanban', label: 'Dự án', icon: 'grid-outline', color: colors.primary, onPress: goKanban },
    {
      key: 'work',
      label: 'Công việc',
      icon: 'checkbox-outline',
      color: colors.warning,
      onPress: () => goWork('all'),
    },
    {
      key: 'messages',
      label: 'Tin nhắn',
      icon: 'chatbubbles-outline',
      color: '#A78BFA',
      onPress: () => openMessages(),
    },
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
      key: 'overdue',
      label: 'Quá hạn',
      icon: 'alert-circle-outline',
      color: colors.danger,
      onPress: openOverdueProjects,
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
    {
      key: 'logout',
      label: 'Đăng xuất',
      icon: 'log-out-outline',
      color: colors.danger,
      onPress: confirmLogout,
    },
  ];

  const overdueDealCount = ownOnly ? overdueDeals.length : kpis.overdue;
  const overdueTotal = overdueTaskCount + overdueDealCount;

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
          <View style={styles.headerBtns}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => tabNav.navigate('Profile')}
              accessibilityLabel="Menu"
              hitSlop={6}
            >
              <Ionicons name="menu-outline" size={20} color={colors.text} />
              {messageUnread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => void openNotifs()}
              accessibilityLabel="Thông báo"
              hitSlop={6}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
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
        {error ? (
          <Pressable style={styles.errorBanner} onPress={() => void load('init')}>
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={styles.errorTxt} numberOfLines={2}>
              {error} · Chạm để thử lại
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={styles.scopeChip}
          onPress={() => { if (canPickCompany) setCompanyPickerOpen(true); }}
          disabled={!canPickCompany}
        >
          <Ionicons name="business-outline" size={14} color={colors.primary} />
          <Text style={styles.scopeChipTxt} numberOfLines={1}>{workshopLabel}</Text>
          {canPickCompany ? (
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          ) : null}
        </Pressable>

        {loading && !refreshing && kpis.total === 0 && overdueTotal === 0 ? (
          <View style={styles.inlineLoad}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.muted}>Đang tải tổng quan…</Text>
          </View>
        ) : overdueTotal > 0 ? (
          <Pressable
            style={styles.alertBanner}
            onPress={() => {
              if (overdueTaskCount > 0) goWork('overdue');
              else openOverdueProjects();
            }}
          >
            <View style={styles.alertIcon}>
              <Ionicons name="alert-circle" size={22} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>
                {overdueTotal} hạng mục quá hạn
              </Text>
              <Text style={styles.alertSub}>
                {[
                  overdueTaskCount > 0 ? `${overdueTaskCount} công việc` : null,
                  overdueDealCount > 0 ? `${overdueDealCount} dự án` : null,
                ].filter(Boolean).join(' · ')}
                {` · ${workshopLabel}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.danger} />
          </Pressable>
        ) : (
          <View style={styles.okBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.okTxt}>Không có công việc / dự án quá hạn</Text>
          </View>
        )}

        <Text style={styles.secTitle}>Tổng quan sản xuất</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={styles.kpiScroll}
        >
          {kpiItems.map((k, idx) => {
            const tone = toneMap[k.tone];
            return (
              <Pressable
                key={k.key}
                style={({ pressed }) => [
                  styles.kpiCard,
                  idx > 0 && styles.kpiCardGap,
                  pressed && styles.pressed,
                ]}
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
          <Text style={styles.secTitleInline}>Công việc cần làm</Text>
          <Pressable onPress={() => goWork('all')} hitSlop={8}>
            <Text style={styles.link}>
              {openTasks.length > 0 ? `Tất cả (${openTasks.length})` : 'Xem công việc'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          {previewTasks.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkbox-outline" size={20} color={colors.textFaint} />
              <Text style={styles.emptyTxt}>Không có việc chưa làm / đang làm</Text>
            </View>
          ) : (
            <>
              {previewTasks.map((t, idx) => {
                const overdue = isTaskOverdue(t);
                const deal = assignmentDealCardLabel(t.lead);
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
                    style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                    onPress={() => {
                      const pid = t.lead?.project_id;
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
                      {deal ? (
                        <Text style={styles.rowSub} numberOfLines={1}>{deal}</Text>
                      ) : null}
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {statusPillLabel(t.status)}
                        {overdue ? ' · Quá hạn' : ''}
                        {` · ${due}`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Pressable>
                );
              })}
              {openTasks.length > TASK_PAGE_SIZE ? (
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

        <View style={styles.secHead}>
          <Text style={styles.secTitleInline}>Dự án quá hạn</Text>
          <Pressable onPress={openOverdueProjects} hitSlop={8}>
            <Text style={styles.link}>
              {(ownOnly ? overdueDeals.length : kpis.overdue) > 0
                ? `Tất cả (${ownOnly ? overdueDeals.length : kpis.overdue})`
                : 'Mở danh sách'}
            </Text>
          </Pressable>
        </View>
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
                  onPress={() => openProjectDetail(p.id)}
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
                      Hạn {shortDateLabel(p.delivery_date || p.production_deadline || p.deadline)}
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
              ) : !ownOnly && kpis.overdue > overdueDeals.length ? (
                <Pressable style={styles.moreBtn} onPress={openOverdueProjects}>
                  <Text style={styles.moreBtnTxt}>Xem tất cả trên Deadline</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        <Text style={styles.secTitle}>Lối tắt</Text>
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
    scopeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginBottom: 12,
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
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.dangerSoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.4),
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
      backgroundColor: colorWithAlpha(colors.success, 0.12),
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.success, 0.28),
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 14,
    },
    okTxt: { color: colors.success, fontSize: 13.5, fontWeight: '700', flex: 1 },
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
    kpiScroll: {
      paddingRight: PAGE_HPAD,
      paddingBottom: 4,
      alignItems: 'stretch',
    },
    kpiCard: {
      width: KPI_CARD_WIDTH,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 96,
    },
    kpiCardGap: { marginLeft: 10 },
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
    emptyTxt: { flex: 1, color: colors.textFaint, fontSize: 13, fontWeight: '600' },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
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
    quickLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
    pressed: { opacity: 0.82 },
  });
}
