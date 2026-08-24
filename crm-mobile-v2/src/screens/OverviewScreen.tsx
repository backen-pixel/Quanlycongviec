import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import {
  fetchCrmAssignments,
  PRIORITY_LABEL,
  STATUS_STAGE_LABEL,
  resolveAssignmentLeadNav,
  type CrmAssignment,
} from '../api/assignments';
import { formatApiError, isAbortError } from '../api/client';
import { fetchCrmListTotal, warmCrmHubPipelines } from '../api/crm';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import {
  fetchDeadlineFocusBreakdown,
  type DeadlineFocusBreakdown,
} from '../api/deadlineOverdue';
import { fetchEventsRange, type AppEvent } from '../api/events';
import {
  fetchCrmCompanies,
  type CrmCompany,
} from '../api/crmMeta';
import Avatar from '../components/Avatar';
import HeaderMenuBell from '../components/HeaderMenuBell';
import ListCreateFab from '../components/ListCreateFab';
import PickerSheet from '../components/PickerSheet';
import SpinningLoader from '../components/SpinningLoader';
import { peekOverviewKpiCache, saveOverviewKpiCache } from '../lib/overviewKpiCache';
import { groupAssignmentsByDeal } from '../lib/assignmentDealGroups';
import { useAuth, currentUserId } from '../context/AuthContext';
import { useCreateMenu } from '../context/CreateMenuContext';
import { useCrmHubFilters } from '../hooks/useCrmHubFilters';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import {
  canSwitchCrmCompany,
  canViewAllCrm,
  lockCrmAssigneeScope,
  lockCrmCompanyScope,
} from '../lib/crmAssignee';
import { buildStageFetchOpts } from '../lib/crmFilters';
import { formatDateShort } from '../lib/format';
import { vnTodayYmd } from '../lib/vnDate';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { PAGE_HPAD, Radii, Shadow, Spacing, useColors, type ThemeColors } from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Overview'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const EMPTY_FOCUS: DeadlineFocusBreakdown = {
  overdue: 0,
  today: 0,
  tomorrow: 0,
  leadOverdue: 0,
  dealOverdue: 0,
  at: 0,
  scopeLabel: '',
};

/** Số mục mỗi trang trên Tổng quan (sự kiện / nhiệm vụ). */
const OVERVIEW_PAGE_SIZE = 4;

/** Token trang đánh số: số trang (1-based) hoặc dấu … */
type OverviewPageToken = number | 'ellipsis';

/** Cửa sổ trang gọn: 1 … 4 5 6 … N (tối đa ~7 ô). `current` là chỉ số 0-based. */
function overviewPageTokens(current: number, total: number, sibling = 1): OverviewPageToken[] {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const cur = Math.min(Math.max(current + 1, 1), total);
  const set = new Set<number>([1, total]);
  for (let i = cur - sibling; i <= cur + sibling; i += 1) {
    if (i >= 1 && i <= total) set.add(i);
  }
  // Gần đầu/cuối: mở rộng thêm 1 ô để ít dấu … hơn
  if (cur <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (cur >= total - 2) {
    set.add(total - 1);
    set.add(total - 2);
    set.add(total - 3);
  }
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: OverviewPageToken[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev > 0 && n - prev > 1) out.push('ellipsis');
    out.push(n);
    prev = n;
  }
  return out;
}

function weekdayViLong(d: Date): string {
  return ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d.getDay()];
}

function formatHeroDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekdayViLong(d)}, ${dd}/${mm}/${d.getFullYear()}`;
}

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function isAssignmentActive(a: CrmAssignment): boolean {
  return a.status !== 'completed' && a.status !== 'cancelled';
}

function isAssignmentOverdue(a: CrmAssignment): boolean {
  if (!a.deadline || !isAssignmentActive(a)) return false;
  return new Date(a.deadline).getTime() < Date.now();
}

/** Khớp tab Nhiệm vụ: Chưa làm + Đang làm. */
function isOpenWorkAssignment(a: CrmAssignment): boolean {
  const st = a.status || 'pending';
  return st === 'pending' || st === 'in_progress';
}

function firstName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

function assignmentEntityKind(a: CrmAssignment): 'lead' | 'deal' | null {
  if (!a.lead?.id) return null;
  return a.lead.type === 'deal' ? 'deal' : 'lead';
}

type KpiTone = 'blue' | 'orange';

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

function OverviewNumberPager({
  styles,
  colors,
  page,
  pageCount,
  onChange,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
}) {
  const tokens = overviewPageTokens(page, pageCount);
  const atStart = page <= 0;
  const atEnd = page >= pageCount - 1;
  return (
    <View style={styles.pagerRow}>
      <Pressable
        style={[styles.pagerArrow, atStart && styles.pagerArrowDisabled]}
        disabled={atStart}
        onPress={() => onChange(Math.max(0, page - 1))}
        hitSlop={8}
        accessibilityLabel="Trang trước"
      >
        <Ionicons
          name="chevron-back"
          size={18}
          color={atStart ? colors.textFaint : colors.blue}
        />
      </Pressable>
      <View style={styles.pagerNums}>
        {tokens.map((tok, idx) =>
          tok === 'ellipsis' ? (
            <Text key={`e-${idx}`} style={styles.pagerEllipsis}>
              …
            </Text>
          ) : (
            <Pressable
              key={`p-${tok}`}
              onPress={() => onChange(tok - 1)}
              hitSlop={4}
              style={[styles.pagerNum, tok === page + 1 && styles.pagerNumOn]}
              accessibilityLabel={`Trang ${tok}`}
              accessibilityState={{ selected: tok === page + 1 }}
            >
              <Text
                style={[styles.pagerNumTxt, tok === page + 1 && styles.pagerNumTxtOn]}
              >
                {tok}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      <Pressable
        style={[styles.pagerArrow, atEnd && styles.pagerArrowDisabled]}
        disabled={atEnd}
        onPress={() => onChange(Math.min(pageCount - 1, page + 1))}
        hitSlop={8}
        accessibilityLabel="Trang sau"
      >
        <Ionicons
          name="chevron-forward"
          size={18}
          color={atEnd ? colors.textFaint : colors.blue}
        />
      </Pressable>
    </View>
  );
}

export default function OverviewScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const { toggle: toggleCreateMenu } = useCreateMenu();
  const {
    ready: filtersReady,
    filters,
    patchFilters,
  } = useCrmHubFilters();

  const uid = currentUserId(user) || user?.id || user?.userId || '';
  const cachedKpi = uid ? peekOverviewKpiCache(uid) : null;
  const canPickCompany = canSwitchCrmCompany(user);
  const canPickAssignee = canViewAllCrm(user);
  const lockCompany = lockCrmCompanyScope(user);
  const lockAssignee = lockCrmAssigneeScope(user);
  const scopeMine = lockAssignee || filters.assignee === 'mine';

  const [loading, setLoading] = useState(() => !cachedKpi);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<DeadlineFocusBreakdown>(() => cachedKpi?.focus || EMPTY_FOCUS);
  const [todayLeadCount, setTodayLeadCount] = useState(() => cachedKpi?.todayLead ?? 0);
  const [todayDealCount, setTodayDealCount] = useState(() => cachedKpi?.todayDeal ?? 0);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [tasks, setTasks] = useState<CrmAssignment[]>([]);
  const [eventPage, setEventPage] = useState(0);
  const [taskPage, setTaskPage] = useState(0);
  /** Deal group đóng mặc định — chạm header để mở (giống app xưởng). */
  const [expandedTaskLeads, setExpandedTaskLeads] = useState<Record<string, boolean>>({});
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const loadGenRef = useRef(0);
  const lastLoadAtRef = useRef(0);
  const hasPaintedRef = useRef(!!cachedKpi);
  const userRef = useRef(user);
  userRef.current = user;

  const displayName = user?.full_name || user?.fullName || user?.email || 'bạn';
  const now = new Date();
  const nick = firstName(displayName);
  const helloLine = `Xin chào, ${nick}!`;
  const dateLabel = formatHeroDate(now);
  const wishLine = 'Chúc bạn một ngày làm việc hiệu quả!';

  const effectiveCompanyId = useMemo(() => {
    if (lockCompany) return String(user?.company_id || filters.companyId || '').trim();
    return String(filters.companyId || '').trim();
  }, [lockCompany, user?.company_id, filters.companyId]);

  useEffect(() => {
    if (!canPickCompany) return undefined;
    let cancelled = false;
    void fetchCrmCompanies()
      .then((list) => {
        if (!cancelled) setCompanies(list);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canPickCompany]);

  // Làm nóng Kanban sớm từ tab Tổng quan — mở Lead/Deal không phải chờ cold bootstrap.
  useEffect(() => {
    if (!filtersReady || !uid) return undefined;
    const companyId = effectiveCompanyId || user?.company_id || undefined;
    const t = setTimeout(() => {
      void warmCrmHubPipelines(companyId || undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [filtersReady, uid, effectiveCompanyId, user?.company_id]);

  const companyLabel = useMemo(() => {
    if (!effectiveCompanyId) return 'Tất cả công ty';
    const c = companies.find((x) => String(x.id) === String(effectiveCompanyId));
    return c?.short_name || c?.name || 'Công ty đã chọn';
  }, [companies, effectiveCompanyId]);

  const scopeHint = useMemo(() => {
    const parts: string[] = [];
    if (effectiveCompanyId) parts.push(companyLabel);
    else if (canPickCompany) parts.push('Tất cả công ty');
    parts.push(scopeMine ? 'Của tôi' : 'Tất cả NV');
    return parts.join(' · ');
  }, [effectiveCompanyId, companyLabel, canPickCompany, scopeMine]);

  const load = useCallback(
    async (opts?: { refresh?: boolean; silent?: boolean }) => {
      if (!filtersReady) return;
      const isRefresh = opts?.refresh ?? false;
      const silent = opts?.silent ?? false;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++loadGenRef.current;

      if (isRefresh && !silent) setRefreshing(true);
      else if (!silent && !hasPaintedRef.current) setLoading(true);
      // Luôn xóa banner lỗi khi bắt đầu tải lại (kể cả silent sau reconnect).
      setError('');

      try {
        const today = vnTodayYmd();
        const companyId = effectiveCompanyId;
        const assigneeMode = scopeMine ? ('mine' as const) : ('all' as const);

        // Khớp bộ lọc Hub (SĐT / vùng / …) — chỉ ép ngày = hôm nay + phạm vi Của tôi/Tất cả.
        // Trước đây phone:'' nên đếm cả lead không SĐT → KPI lệch với tab Lead (mặc định has_phone).
        const todayOpts = {
          ...buildStageFetchOpts(
            {
              ...filters,
              assignee: assigneeMode,
              assigneeUserId: '',
              companyId: companyId || '',
              timePreset: 'custom',
              dateFrom: today,
              dateTo: today,
            },
            '',
            uid,
          ),
          signal: ac.signal,
        };

        // Wave 1 — banner quá hạn + KPI hôm nay theo cùng bộ lọc Hub
        const focusP = fetchDeadlineFocusBreakdown(userRef.current, ac.signal);
        const leadP = fetchCrmListTotal('lead', todayOpts);
        const dealP = fetchCrmListTotal('deal', todayOpts);

        const focusRes = await focusP;
        if (ac.signal.aborted || gen !== loadGenRef.current) return;
        setFocus(focusRes);
        hasPaintedRef.current = true;
        if (!silent) {
          setLoading(false);
          if (!isRefresh) setRefreshing(false);
        }

        const [leadToday, dealToday] = await Promise.all([leadP, dealP]);
        if (ac.signal.aborted || gen !== loadGenRef.current) return;
        setTodayLeadCount(leadToday);
        setTodayDealCount(dealToday);
        if (uid) {
          void saveOverviewKpiCache({
            userId: uid,
            focus: focusRes,
            todayLead: leadToday,
            todayDeal: dealToday,
            at: Date.now(),
          });
        }

        // Wave 2 — sự kiện + nhiệm vụ theo phạm vi quyền / bộ lọc
        const [eventRes, taskRes] = await Promise.all([
          fetchEventsRange({
            dateFrom: today,
            dateTo: today,
            companyId: companyId || undefined,
            userId: scopeMine ? (uid || undefined) : undefined,
            signal: ac.signal,
          }),
          fetchCrmAssignments({
            company_id: companyId || undefined,
            assignee_id: scopeMine ? (uid || undefined) : undefined,
            // Overview chỉ preview vài trang — không tải toàn bộ assignments.
            limit: 80,
            signal: ac.signal,
          }),
        ]);
        if (ac.signal.aborted || gen !== loadGenRef.current) return;

        const openEvents = eventRes
          .filter((e) => e.status !== 'cancelled')
          .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        const focusTasks = taskRes
          .filter(isOpenWorkAssignment)
          .sort((a, b) => {
            const ao = isAssignmentOverdue(a) ? 0 : 1;
            const bo = isAssignmentOverdue(b) ? 0 : 1;
            if (ao !== bo) return ao - bo;
            const as = a.status === 'in_progress' ? 0 : 1;
            const bs = b.status === 'in_progress' ? 0 : 1;
            if (as !== bs) return as - bs;
            const da = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
            const db = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
            return da - db;
          });

        setEvents(openEvents);
        setTasks(focusTasks);
        setEventPage(0);
        setTaskPage(0);
        lastLoadAtRef.current = Date.now();
      } catch (e: unknown) {
        if (isAbortError(e) || ac.signal.aborted || gen !== loadGenRef.current) return;
        const msg = formatApiError(e);
        if (!msg) return;
        setError(msg);
        if (!hasPaintedRef.current) setLoading(false);
      } finally {
        if (!ac.signal.aborted && gen === loadGenRef.current && !silent) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [uid, filtersReady, effectiveCompanyId, scopeMine, filters],
  );

  useFocusEffect(
    useCallback(() => {
      if (!filtersReady) return undefined;
      const OVERVIEW_TTL_MS = 45_000;
      const stale = Date.now() - lastLoadAtRef.current > OVERVIEW_TTL_MS;
      if (!hasPaintedRef.current || stale) {
        void load({ silent: hasPaintedRef.current });
      }
      return () => abortRef.current?.abort();
    }, [load, filtersReady]),
  );

  // Đổi lọc Hub → tải lại KPI. Bỏ qua lần đầu (focus effect đã load) để tránh double-fetch.
  const filterLoadSkipRef = useRef(true);
  useEffect(() => {
    if (!filtersReady) return;
    if (filterLoadSkipRef.current) {
      filterLoadSkipRef.current = false;
      return;
    }
    void load({ silent: hasPaintedRef.current });
  }, [
    filters.companyId,
    filters.assignee,
    filters.phone,
    filters.regionId,
    filtersReady,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useCrmRealtimeRefresh(
    useCallback(() => {
      // Không đè TTL Overview — tránh KPI reload liên tục khi tab đang mở.
      const OVERVIEW_TTL_MS = 45_000;
      if (Date.now() - lastLoadAtRef.current < OVERVIEW_TTL_MS) return;
      void load({ refresh: true, silent: true });
    }, [load]),
  );

  /**
   * Có mạng trở lại → nạp lại KPI / sự kiện / nhiệm vụ.
   * Overview không dùng TanStack observer nên không được refetchOnReconnect.
   */
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (!isOnline || !wasOffline || !filtersReady) return;
    void load({ refresh: true, silent: hasPaintedRef.current });
  }, [isOnline, filtersReady, load]);

  const goTab = (screen: keyof TabParamList) => {
    navigation.navigate(screen);
  };

  const openTodayList = (screen: 'Lead' | 'Deal') => {
    const today = vnTodayYmd();
    patchFilters({
      timePreset: 'custom',
      dateFrom: today,
      dateTo: today,
      assignee: scopeMine ? 'mine' : filters.assignee,
      assigneeUserId: scopeMine ? '' : filters.assigneeUserId,
      companyId: effectiveCompanyId || filters.companyId,
    });
    goTab(screen);
  };

  const companyPickerOptions = useMemo(
    () => [
      { id: '', name: 'Tất cả công ty' },
      ...companies.map((c) => ({
        id: c.id,
        name: c.short_name || c.name,
      })),
    ],
    [companies],
  );

  const kpiItems: { key: string; label: string; value: number; tone: KpiTone; onPress: () => void }[] = [
    {
      key: 'lead_today',
      label: 'Lead tạo hôm nay',
      value: todayLeadCount,
      tone: 'blue',
      onPress: () => openTodayList('Lead'),
    },
    {
      key: 'deal_today',
      label: 'Deal tạo hôm nay',
      value: todayDealCount,
      tone: 'orange',
      onPress: () => openTodayList('Deal'),
    },
  ];

  const quickActions: QuickAction[] = [
    {
      key: 'leaves',
      label: 'Lịch nghỉ',
      icon: 'calendar-outline',
      color: Colors.purple,
      onPress: () => navigation.navigate('Leaves'),
    },
    {
      key: 'qr',
      label: 'Quét QR',
      icon: 'qr-code',
      color: Colors.orange,
      onPress: () => navigation.navigate('QrScan'),
    },
    {
      key: 'deadline',
      label: 'Deadline',
      icon: 'alarm',
      color: Colors.red,
      onPress: () => goTab('Deadline'),
    },
    {
      key: 'events',
      label: 'Sự kiện',
      icon: 'calendar',
      color: Colors.cyan,
      onPress: () => navigation.navigate('Events'),
    },
    {
      key: 'tasks',
      label: 'Nhiệm vụ',
      icon: 'checkbox',
      color: Colors.blue,
      onPress: () => navigation.navigate('Tasks'),
    },
    {
      key: 'messages',
      label: 'Tin nhắn',
      icon: 'chatbubble',
      color: Colors.purple,
      onPress: () => goTab('Messages'),
    },
    {
      key: 'planner',
      label: 'Planner',
      icon: 'grid',
      color: Colors.green,
      onPress: () => navigation.navigate('Planner'),
    },
    {
      key: 'report',
      label: 'Báo cáo',
      icon: 'stats-chart',
      color: Colors.amber,
      onPress: () => navigation.navigate('EmployeeReport'),
    },
  ];

  const eventPageCount = Math.max(1, Math.ceil(events.length / OVERVIEW_PAGE_SIZE));
  const taskDealSections = useMemo(() => groupAssignmentsByDeal(tasks), [tasks]);
  const taskPageCount = Math.max(1, Math.ceil(taskDealSections.length / OVERVIEW_PAGE_SIZE));
  const safeEventPage = Math.min(eventPage, eventPageCount - 1);
  const safeTaskPage = Math.min(taskPage, taskPageCount - 1);
  const previewEvents = events.slice(
    safeEventPage * OVERVIEW_PAGE_SIZE,
    safeEventPage * OVERVIEW_PAGE_SIZE + OVERVIEW_PAGE_SIZE,
  );
  const previewTaskSections = taskDealSections.slice(
    safeTaskPage * OVERVIEW_PAGE_SIZE,
    safeTaskPage * OVERVIEW_PAGE_SIZE + OVERVIEW_PAGE_SIZE,
  );
  const showEventPager = events.length > OVERVIEW_PAGE_SIZE;
  const showTaskPager = taskDealSections.length > OVERVIEW_PAGE_SIZE;

  useEffect(() => {
    setTaskPage(0);
    setExpandedTaskLeads({});
  }, [tasks]);

  const toggleOverviewTaskSection = useCallback((leadId: string) => {
    setExpandedTaskLeads((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
  }, []);

  const toneMap: Record<KpiTone, { fg: string; bg: string }> = {
    orange: { fg: Colors.orange, bg: Colors.orangeSoft },
    blue: { fg: Colors.blue, bg: Colors.blueSoft },
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIdentity}>
            <Avatar
              name={displayName}
              size={52}
              color={Colors.blue}
              avatarUrl={user?.avatar}
            />
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={styles.helloLine} numberOfLines={1}>
                {helloLine}
              </Text>
              <Text style={styles.dateLine}>{dateLabel}</Text>
              <Text style={styles.wishLine} numberOfLines={2}>
                {wishLine}
              </Text>
            </View>
          </View>
          <HeaderMenuBell />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load({ refresh: true })}
            tintColor={Colors.blue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <>
            {error ? (
              <Pressable style={styles.errorBanner} onPress={() => void load()}>
                <Ionicons name="warning-outline" size={16} color={Colors.red} />
                <Text style={styles.errorTxt} numberOfLines={2}>
                  {error} · Chạm để thử lại
                </Text>
              </Pressable>
            ) : null}

            {(canPickCompany || canPickAssignee) ? (
              <View style={styles.filterBar}>
                {canPickCompany ? (
                  <Pressable
                    style={[styles.filterChip, !!effectiveCompanyId && styles.filterChipOn]}
                    onPress={() => setCompanyPickerOpen(true)}
                  >
                    <Ionicons
                      name="business-outline"
                      size={14}
                      color={effectiveCompanyId ? Colors.blue : Colors.textMuted}
                    />
                    <Text
                      style={[styles.filterChipTxt, !!effectiveCompanyId && styles.filterChipTxtOn]}
                      numberOfLines={1}
                    >
                      {companyLabel}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={Colors.textFaint} />
                  </Pressable>
                ) : null}
                {canPickAssignee ? (
                  <View style={styles.assigneeSeg}>
                    <Pressable
                      style={[styles.assigneeBtn, scopeMine && styles.assigneeBtnOn]}
                      onPress={() => patchFilters({ assignee: 'mine', assigneeUserId: '' })}
                    >
                      <Text style={[styles.assigneeBtnTxt, scopeMine && styles.assigneeBtnTxtOn]}>
                        Của tôi
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.assigneeBtn, !scopeMine && styles.assigneeBtnOn]}
                      onPress={() => patchFilters({ assignee: 'all', assigneeUserId: '' })}
                    >
                      <Text style={[styles.assigneeBtnTxt, !scopeMine && styles.assigneeBtnTxtOn]}>
                        Tất cả
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.filterChip, styles.filterChipOn]}>
                    <Ionicons name="person-outline" size={14} color={Colors.blue} />
                    <Text style={[styles.filterChipTxt, styles.filterChipTxtOn]}>Của tôi</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.filterBar}>
                <View style={[styles.filterChip, styles.filterChipOn]}>
                  <Ionicons name="person-outline" size={14} color={Colors.blue} />
                  <Text style={[styles.filterChipTxt, styles.filterChipTxtOn]}>Của tôi</Text>
                </View>
              </View>
            )}
            <Text style={styles.scopeHint}>{scopeHint}</Text>

            {loading && !refreshing && !focus.at ? (
              <View style={styles.inlineLoad}>
                <SpinningLoader size="large" color={Colors.blue} />
                <Text style={styles.muted}>Đang tải tổng quan…</Text>
              </View>
            ) : focus.overdue > 0 ? (
              <Pressable style={styles.alertBanner} onPress={() => goTab('Deadline')}>
                <View style={styles.alertIcon}>
                  <Ionicons name="alert-circle" size={22} color={Colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>
                    {focus.overdue} Lead/Deal quá hạn
                  </Text>
                  <Text style={styles.alertSub}>
                    {focus.leadOverdue} Lead · {focus.dealOverdue} Deal
                    {focus.scopeLabel ? ` · ${focus.scopeLabel}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.red} />
              </Pressable>
            ) : (
              <View style={styles.okBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
                <Text style={styles.okTxt}>Không có Lead/Deal quá hạn</Text>
              </View>
            )}

            <Text style={styles.secTitle}>
              {scopeMine ? 'Lead · Deal hôm nay của tôi' : 'Lead · Deal hôm nay'}
            </Text>
            <View style={styles.kpiGrid}>
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
                    <Text style={styles.kpiLabel} numberOfLines={2}>
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.secHead}>
              <Text style={styles.secTitleInline}>Sự kiện hôm nay</Text>
              <Pressable onPress={() => navigation.navigate('Events')} hitSlop={8}>
                <Text style={styles.link}>
                  {events.length > 0 ? `Tất cả (${events.length})` : 'Mở lịch'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {previewEvents.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.textFaint} />
                  <Text style={styles.emptyTxt}>Không có sự kiện hôm nay</Text>
                </View>
              ) : (
                <>
                  {previewEvents.map((e, idx) => {
                    const timeStr = e.allDay
                      ? 'Cả ngày'
                      : e.endTime
                        ? `${timeOf(e.startTime)} – ${timeOf(e.endTime)}`
                        : timeOf(e.startTime);
                    return (
                      <Pressable
                        key={e.id}
                        style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                        onPress={() => navigation.navigate('Events')}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: (e.typeColor || Colors.cyan) + '22' }]}>
                          <Text style={{ fontSize: 14 }}>{e.typeIcon || '📋'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {e.title}
                          </Text>
                          <Text style={styles.rowSub} numberOfLines={1}>
                            {timeStr}
                            {e.customerName || e.leadTitle
                              ? ` · ${e.customerName || e.leadTitle}`
                              : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textFaint} />
                      </Pressable>
                    );
                  })}
                  {showEventPager ? (
                    <OverviewNumberPager
                      styles={styles}
                      colors={Colors}
                      page={safeEventPage}
                      pageCount={eventPageCount}
                      onChange={(p) => setEventPage(p)}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.secHead}>
              <Text style={styles.secTitleInline}>Nhiệm vụ cần làm</Text>
              <Pressable onPress={() => navigation.navigate('Tasks')} hitSlop={8}>
                <Text style={styles.link}>
                  {tasks.length > 0
                    ? `Tất cả (${taskDealSections.length} Deal · ${tasks.length} việc)`
                    : 'Xem nhiệm vụ'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {previewTaskSections.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="checkbox-outline" size={20} color={Colors.textFaint} />
                  <Text style={styles.emptyTxt}>Không có nhiệm vụ chưa làm / đang làm</Text>
                </View>
              ) : (
                <>
                  {previewTaskSections.map((section, sIdx) => {
                    const expanded = !!expandedTaskLeads[section.leadId];
                    const openCount = section.tasks.filter(
                      (t) => t.status !== 'completed' && t.status !== 'cancelled',
                    ).length;
                    const overdueCount = section.tasks.filter((t) => isAssignmentOverdue(t)).length;
                    const kindLbl =
                      section.kind === 'deal' ? 'Deal' : section.kind === 'lead' ? 'Lead' : null;
                    return (
                      <View
                        key={section.leadId}
                        style={sIdx > 0 ? styles.dealGroupBorder : undefined}
                      >
                        <Pressable
                          style={styles.dealGroupHead}
                          onPress={() => toggleOverviewTaskSection(section.leadId)}
                        >
                          <Ionicons
                            name={expanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={Colors.textMuted}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.entityRow}>
                              {kindLbl ? (
                                <View
                                  style={[
                                    styles.entityBadge,
                                    {
                                      backgroundColor:
                                        section.kind === 'deal'
                                          ? Colors.orangeSoft
                                          : Colors.blueSoft,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.entityBadgeTxt,
                                      {
                                        color:
                                          section.kind === 'deal' ? Colors.orange : Colors.blue,
                                      },
                                    ]}
                                  >
                                    {kindLbl}
                                  </Text>
                                </View>
                              ) : null}
                              <Text style={styles.dealGroupTitle} numberOfLines={1}>
                                {section.code ? `${section.code} · ` : ''}
                                {section.title}
                              </Text>
                            </View>
                            <Text style={styles.rowSub} numberOfLines={1}>
                              {openCount}/{section.tasks.length} còn lại
                              {overdueCount ? ` · ${overdueCount} quá hạn` : ''}
                              {!expanded ? ' · chạm để mở' : ''}
                            </Text>
                          </View>
                          {section.kind && section.tasks[0]?.lead?.id ? (
                            <Pressable
                              hitSlop={8}
                              onPress={() => {
                                const t = section.tasks[0];
                                const nav = resolveAssignmentLeadNav(t);
                                navigation.navigate('LeadDealDetail', {
                                  leadId: t.lead!.id,
                                  kind: section.kind === 'deal' ? 'deal' : 'lead',
                                  code: t.lead?.code || undefined,
                                  title: t.lead?.title || undefined,
                                  initialTab: nav.initialTab,
                                  focusAssignmentId: nav.focusAssignmentId,
                                  focusTaskId: nav.focusTaskId,
                                });
                              }}
                            >
                              <Ionicons name="open-outline" size={16} color={Colors.blue} />
                            </Pressable>
                          ) : null}
                        </Pressable>
                        {expanded
                          ? section.tasks.map((t, idx) => {
                              const overdue = isAssignmentOverdue(t);
                              const statusKey = String(t.status || 'pending');
                              const statusLbl = STATUS_STAGE_LABEL[statusKey] || 'Chưa làm';
                              const pri = PRIORITY_LABEL[String(t.priority || '')] || '';
                              return (
                                <Pressable
                                  key={t.id}
                                  style={[styles.rowItem, styles.dealTaskRow, idx === 0 && styles.rowBorder]}
                                  onPress={() => {
                                    if (t.lead?.id) {
                                      const nav = resolveAssignmentLeadNav(t);
                                      navigation.navigate('LeadDealDetail', {
                                        leadId: t.lead.id,
                                        kind: assignmentEntityKind(t) || 'lead',
                                        code: t.lead.code || undefined,
                                        title: t.lead.title || undefined,
                                        initialTab: nav.initialTab,
                                        focusAssignmentId: nav.focusAssignmentId,
                                        focusTaskId: nav.focusTaskId,
                                      });
                                    } else {
                                      navigation.navigate('Tasks');
                                    }
                                  }}
                                >
                                  <View
                                    style={[
                                      styles.rowIcon,
                                      {
                                        backgroundColor: overdue
                                          ? Colors.redSoft
                                          : statusKey === 'in_progress'
                                            ? Colors.blueSoft
                                            : Colors.amberSoft,
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name={
                                        overdue
                                          ? 'alert-circle'
                                          : statusKey === 'in_progress'
                                            ? 'time'
                                            : 'ellipse-outline'
                                      }
                                      size={18}
                                      color={
                                        overdue
                                          ? Colors.red
                                          : statusKey === 'in_progress'
                                            ? Colors.blue
                                            : Colors.amber
                                      }
                                    />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>
                                      {t.title || 'Nhiệm vụ'}
                                    </Text>
                                    <Text style={styles.rowSub} numberOfLines={1}>
                                      {statusLbl}
                                      {overdue ? ' · Quá hạn' : ''}
                                      {t.deadline ? ` · ${formatDateShort(t.deadline)}` : ''}
                                      {pri ? ` · ${pri}` : ''}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={16} color={Colors.textFaint} />
                                </Pressable>
                              );
                            })
                          : null}
                      </View>
                    );
                  })}
                  {showTaskPager ? (
                    <OverviewNumberPager
                      styles={styles}
                      colors={Colors}
                      page={safeTaskPage}
                      pageCount={taskPageCount}
                      onChange={(p) => setTaskPage(p)}
                    />
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
                  <Text style={styles.quickLabel} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
      </ScrollView>

      <ListCreateFab kind="menu" onPress={toggleCreateMenu} bottom={12} />

      {canPickCompany ? (
        <PickerSheet
          visible={companyPickerOpen}
          title="Chọn công ty"
          options={companyPickerOptions}
          selectedId={effectiveCompanyId || null}
          searchable
          emptyLabel="Tất cả công ty"
          accent={Colors.blue}
          onSelect={(opt) => {
            patchFilters({ companyId: opt?.id || '', regionId: '' });
            setCompanyPickerOpen(false);
          }}
          onClose={() => setCompanyPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    hero: {
      paddingHorizontal: PAGE_HPAD,
      paddingTop: 12,
      paddingBottom: 14,
      backgroundColor: Colors.bg,
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
      color: Colors.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    dateLine: {
      marginTop: 3,
      color: Colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    wishLine: {
      marginTop: 4,
      color: Colors.textMuted,
      fontSize: 13.5,
      fontWeight: '600',
      lineHeight: 18,
    },
    content: { paddingHorizontal: PAGE_HPAD, paddingTop: 8, gap: 0 },
    centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
    inlineLoad: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 14,
      borderRadius: Radii.lg,
      backgroundColor: Colors.surfaceSoft,
    },
    muted: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
    filterBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.lg,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    filterChipOn: {
      borderColor: Colors.blue,
      backgroundColor: Colors.blueSoft,
    },
    filterChipTxt: {
      flexShrink: 1,
      color: Colors.textMuted,
      fontSize: 12.5,
      fontWeight: '700',
    },
    filterChipTxtOn: { color: Colors.blue },
    assigneeSeg: {
      flexDirection: 'row',
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      backgroundColor: Colors.card,
    },
    assigneeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: 'transparent',
    },
    assigneeBtnOn: { backgroundColor: Colors.blueSoft },
    assigneeBtnTxt: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '700' },
    assigneeBtnTxtOn: { color: Colors.blue },
    scopeHint: {
      color: Colors.textFaint,
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 10,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.redSoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.35)',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    errorTxt: { flex: 1, color: Colors.red, fontSize: 12.5, fontWeight: '700' },
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Colors.redSoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.4)',
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 14,
      ...Shadow.card,
    },
    alertIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertTitle: { color: Colors.red, fontSize: 14.5, fontWeight: '800' },
    alertSub: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    okBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.greenSoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.28)',
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 14,
    },
    okTxt: { color: Colors.green, fontSize: 13.5, fontWeight: '700' },
    secTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: Colors.textMuted,
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
      color: Colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    link: { color: Colors.blue, fontSize: 13, fontWeight: '700' },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 4,
    },
    kpiCard: {
      width: '47.5%',
      flexGrow: 1,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 88,
      ...Shadow.card,
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
    kpiLabel: { marginTop: 2, fontSize: 12, fontWeight: '700', color: Colors.textMuted },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      ...Shadow.card,
    },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    emptyTxt: { color: Colors.textFaint, fontSize: 13, fontWeight: '600' },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' },
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
      color: Colors.text,
      fontSize: 12.5,
      fontWeight: '700',
    },
    dealGroupBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.border,
    },
    dealGroupHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dealGroupTitle: {
      flex: 1,
      color: Colors.text,
      fontSize: 13.5,
      fontWeight: '800',
    },
    dealTaskRow: {
      paddingLeft: 28,
      backgroundColor: Colors.cardAlt,
    },
    rowSub: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.border,
      backgroundColor: Colors.cardAlt,
    },
    moreBtnTxt: { color: Colors.blue, fontSize: 13, fontWeight: '800' },
    pagerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.border,
    },
    pagerArrow: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    pagerArrowDisabled: { opacity: 0.45 },
    pagerNums: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 1,
      gap: 4,
      maxWidth: '72%',
    },
    pagerNum: {
      minWidth: 30,
      height: 30,
      paddingHorizontal: 6,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.cardAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: Colors.border,
    },
    pagerNumOn: {
      backgroundColor: Colors.blue,
      borderColor: Colors.blue,
    },
    pagerNumTxt: {
      color: Colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    pagerNumTxtOn: {
      color: '#fff',
    },
    pagerEllipsis: {
      color: Colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
      paddingHorizontal: 2,
      minWidth: 14,
      textAlign: 'center',
    },
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
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
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
    quickLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
    pressed: { opacity: 0.82 },
  });
