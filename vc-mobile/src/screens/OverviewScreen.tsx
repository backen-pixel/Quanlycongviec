import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { loadKanbanFilters, saveKanbanFilters } from '../lib/kanbanFilterStorage';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
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
  fetchMyLogisticsTasks,
  formatTaskDeadline,
  isTaskInProgress,
  isTaskOverdue,
  isTaskPending,
  statusPillLabel,
  taskDueIso,
  workTaskFocusCrmId,
  type WorkTask,
} from '../lib/workTasksApi';
import type { ProductionProject } from '../types';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';

const TASK_PAGE_SIZE = 5;
const PREVIEW_NOTIFS = 5;
const KPI_CARD_W = 132;
const KPI_CARD_GAP = 10;

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

function isOpenWorkTask(t: WorkTask): boolean {
  const st = String(t.status || 'pending');
  return isTaskPending(st) || isTaskInProgress(st);
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
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [taskVisibleCount, setTaskVisibleCount] = useState(TASK_PAGE_SIZE);
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

  const isAdminLike = isSystemAdmin(user) || isCompanyScopedAdmin(user);
  const canPickCompany = isSystemAdmin(user);

  const companyOptions = useMemo(() => {
    if (isSystemAdmin(user)) {
      return companies.map((c) => ({ id: c.id, label: c.name }));
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
      return companyOptions[0]?.label || 'Công ty';
    }
    return companyOptions.find((o) => o.id === filterCompany)?.label
      || companies.find((c) => String(c.id) === String(filterCompany))?.name
      || 'Công ty';
  }, [filterCompany, companyOptions, companies]);

  const persistCompanyFilter = useCallback(async (companyId: string) => {
    const snap = (await loadKanbanFilters().catch(() => null)) || {};
    await saveKanbanFilters({
      ...snap,
      filterCompany: companyId,
      filterWorkTypeId: '',
    });
  }, []);

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const snap = await loadKanbanFilters().catch(() => null);
      let companyId = snap?.filterCompany || '';
      const workshopTypeId = snap?.filterWorkTypeId || undefined;

      let companyList = companiesRef.current;
      if (mode !== 'silent' || !companyList.length) {
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
      } else {
        // Sysadmin: luôn chọn 1 công ty cụ thể (không «Tất cả») — khớp web.
        const exists = companyId
          && companyList.some((c) => String(c.id) === String(companyId));
        if (!exists) {
          companyId = companyList[0]?.id ? String(companyList[0].id) : '';
          if (companyId) await persistCompanyFilter(companyId);
        }
      }

      if (seq !== loadSeqRef.current) return;
      setFilterCompany(companyId);

      const boardFilters = {
        companyId: companyId || undefined,
        workshopTypeId:
          companyId && workshopTypeId && workshopTypeId !== 'none'
            ? workshopTypeId
            : undefined,
      };
      boardFiltersRef.current = boardFilters;

      const skipBoard = mode === 'silent' && isCachedBoardFresh(boardFilters) && !!getCachedBoard(boardFilters);
      const cachedBoard = getCachedBoard(boardFilters);

      if (cachedBoard && mode !== 'refresh') {
        setKpis(computeVcBoardKpis(cachedBoard.projects, cachedBoard.stages));
        if (mode === 'init') setLoading(false);
      }

      const today = ymd(new Date());
      const tasksPromise = !userId
        ? Promise.resolve([] as WorkTask[])
        : fetchMyLogisticsTasks(userId).catch(() => [] as WorkTask[]);
      const eventsPromise = fetchEventsRange({
        dateFrom: today,
        dateTo: today,
        companyId: companyId || undefined,
        module: 'logistics',
        userId: userId || undefined,
      }).catch(() => [] as AppEvent[]);

      const [board, myTasks, todayEvents, notifList] = await Promise.all([
        skipBoard ? Promise.resolve(cachedBoard!) : fetchProductionBoard(mode === 'refresh', boardFilters),
        tasksPromise,
        eventsPromise,
        fetchCommentNotifications(false).catch(() => ({
          notifications: [] as SxCommentNotification[],
          unread_count: 0,
        })),
      ]);

      if (seq !== loadSeqRef.current) return;
      if (board) {
        if (!skipBoard) setCachedBoard(boardFilters, board);
        setKpis(computeVcBoardKpis(board.projects, board.stages));
      }
      setTasks(myTasks);
      setEvents(todayEvents);
      setNotifs(
        (notifList.notifications || [])
          .filter(isVcRelevantNotification)
          .slice()
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
          .slice(0, PREVIEW_NOTIFS),
      );
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, user?.company_id, canPickCompany, persistCompanyFilter]);

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

  /** Quay lại Tổng quan → đọc cache (Kanban đã patch) rồi refresh nền nếu stale. */
  useFocusEffect(
    useCallback(() => {
      const filters = boardFiltersRef.current;
      const cached = getCachedBoard(filters);
      if (cached) {
        setKpis(computeVcBoardKpis(cached.projects, cached.stages));
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
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  const openTasks = useMemo(() => {
    const list = tasks.filter(isOpenWorkTask);
    return list.slice().sort((a, b) => {
      const ao = isTaskOverdue(a) ? 0 : 1;
      const bo = isTaskOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ad = taskDueIso(a) || '9999';
      const bd = taskDueIso(b) || '9999';
      return String(ad).localeCompare(String(bd));
    });
  }, [tasks]);

  const previewTasks = openTasks.slice(0, taskVisibleCount);
  const hasMoreTasks = taskVisibleCount < openTasks.length;
  const overdueTaskCount = useMemo(() => tasks.filter((t) => isTaskOverdue(t)).length, [tasks]);

  const openNotifs = useCallback(async () => {
    void ensureNotificationPermission();
    setNotifOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  const openCommentForProjectId = useCallback(async (projectId: string) => {
    try {
      const proj = await fetchProductionProject(projectId);
      setCommentProject(proj);
    } catch {
      setCommentProject({
        id: projectId,
        code: '',
        name: 'Dự án',
      } as ProductionProject);
    }
  }, []);

  const goKanban = useCallback(() => tabNav.navigate('Kanban'), [tabNav]);
  const goKanbanFocus = useCallback(
    (focusKpi: VcKpiFocusKey) => tabNav.navigate('Kanban', { focusKpi }),
    [tabNav],
  );

  const openNotification = useCallback((n: SxCommentNotification) => {
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
    if (focus) goKanbanFocus(focus);
    if (pid) openProjectDetail(pid);
    else if (!focus) void openNotifs();
  }, [goKanbanFocus, openCommentForProjectId, openNotifs, openProjectDetail]);
  const goWork = useCallback(() => tabNav.navigate('Work'), [tabNav]);
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
      label: 'Đang vận chuyển',
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
      label: 'Có vấn đề',
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
      onPress: () => goKanbanFocus('overdue'),
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
      onPress: goWork,
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
            <ActivityIndicator color={colors.primary} size="large" />
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
                onPress={() => (kpis.overdue > 0 ? openOverdueProjects() : goWork())}
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
                      overdueTaskCount > 0 ? `${overdueTaskCount} công việc` : null,
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

            <View style={styles.boardSummary}>
              <Text style={styles.boardSummaryLbl}>Bảng VC · Lắp đặt</Text>
              <Text style={styles.boardSummaryVal}>
                {kpis.totalShipping}
                <Text style={styles.boardSummarySep}> || </Text>
                {kpis.totalInstall}
                <Text style={styles.boardSummaryMuted}> thẻ</Text>
              </Text>
            </View>

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
              <Pressable onPress={goWork} hitSlop={8}>
                <Text style={styles.link}>
                  {openTasks.length > 0 ? `Tất cả (${openTasks.length})` : 'Xem công việc'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {previewTasks.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="checkbox-outline" size={20} color={colors.textFaint} />
                  <Text style={styles.emptyTxt}>Không có nhiệm vụ chưa làm / đang làm</Text>
                </View>
              ) : (
                <>
                  {previewTasks.map((t, idx) => {
                    const overdue = isTaskOverdue(t);
                    const statusKey = String(t.status || 'pending');
                    const statusLbl = statusPillLabel(statusKey);
                    const deal = assignmentDealCardLabel(t.lead);
                    const due = formatTaskDeadline(taskDueIso(t));
                    return (
                      <Pressable
                        key={t.id}
                        style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                        onPress={() => {
                          const pid = t.lead?.project_id;
                          if (pid) {
                            openProjectDetail(String(pid), { focusTaskId: workTaskFocusCrmId(t) });
                          } else {
                            goWork();
                          }
                        }}
                      >
                        <View
                          style={[
                            styles.rowIcon,
                            {
                              backgroundColor: overdue
                                ? colors.dangerSoft
                                : isTaskInProgress(statusKey)
                                  ? colors.primarySoft
                                  : colorWithAlpha(colors.warning, 0.16),
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              overdue
                                ? 'alert-circle'
                                : isTaskInProgress(statusKey)
                                  ? 'time'
                                  : 'ellipse-outline'
                            }
                            size={18}
                            color={
                              overdue
                                ? colors.danger
                                : isTaskInProgress(statusKey)
                                  ? colors.primary
                                  : colors.warning
                            }
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{t.title || 'Nhiệm vụ'}</Text>
                          {deal ? (
                            <View style={styles.entityRow}>
                              <View style={[styles.entityBadge, { backgroundColor: colors.primarySoft }]}>
                                <Text style={[styles.entityBadgeTxt, { color: colors.primary }]}>VC</Text>
                              </View>
                              <Text style={styles.entityName} numberOfLines={1}>{deal}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.rowSub} numberOfLines={1}>
                            {statusLbl}
                            {overdue ? ' · Quá hạn' : ''}
                            {due ? ` · ${due}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                      </Pressable>
                    );
                  })}
                  {hasMoreTasks ? (
                    <Pressable
                      style={styles.moreBtn}
                      onPress={() =>
                        setTaskVisibleCount((n) => Math.min(n + TASK_PAGE_SIZE, openTasks.length))
                      }
                    >
                      <Text style={styles.moreBtnTxt}>
                        Xem thêm ({Math.min(TASK_PAGE_SIZE, openTasks.length - taskVisibleCount)})
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={colors.primary} />
                    </Pressable>
                  ) : openTasks.length > TASK_PAGE_SIZE ? (
                    <Pressable
                      style={styles.moreBtn}
                      onPress={() => setTaskVisibleCount(TASK_PAGE_SIZE)}
                    >
                      <Text style={styles.moreBtnTxt}>Thu gọn</Text>
                      <Ionicons name="chevron-up" size={16} color={colors.primary} />
                    </Pressable>
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
        onClose={() => setCommentProject(null)}
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
    boardSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    boardSummaryLbl: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    boardSummaryVal: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '800',
    },
    boardSummarySep: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
    boardSummaryMuted: { color: colors.textMuted, fontWeight: '600', fontSize: 12 },
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
