import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  type CrmAssignment,
} from '../api/assignments';
import { formatApiError, isAbortError } from '../api/client';
import { fetchCrmListTotal } from '../api/crm';
import {
  fetchDeadlineFocusBreakdown,
  type DeadlineFocusBreakdown,
} from '../api/deadlineOverdue';
import { fetchEventsRange, type AppEvent } from '../api/events';
import Avatar from '../components/Avatar';
import HeaderMenuBell from '../components/HeaderMenuBell';
import ListCreateFab from '../components/ListCreateFab';
import SpinningLoader from '../components/SpinningLoader';
import { peekOverviewKpiCache, saveOverviewKpiCache } from '../lib/overviewKpiCache';
import { useAuth, currentUserId } from '../context/AuthContext';
import { useCreateMenu } from '../context/CreateMenuContext';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import {
  buildStageFetchOpts,
  DEFAULT_CRM_FILTERS,
} from '../lib/crmFilters';
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

/** Số nhiệm vụ hiện mỗi trang trên Tổng quan. */
const TASK_PAGE_SIZE = 5;

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

function assignmentEntityLabel(a: CrmAssignment): string | null {
  const lead = a.lead;
  if (!lead?.id) return null;
  const kind = lead.type === 'deal' ? 'Deal' : 'Lead';
  const title = (lead.title || '').trim() || kind;
  const code = lead.code ? `${lead.code} · ` : '';
  return `${kind}: ${code}${title}`;
}

type KpiTone = 'blue' | 'orange';

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

export default function OverviewScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { toggle: toggleCreateMenu } = useCreateMenu();

  const uid = currentUserId(user) || user?.id || user?.userId || '';
  const cachedKpi = uid ? peekOverviewKpiCache(uid) : null;

  const [loading, setLoading] = useState(() => !cachedKpi);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<DeadlineFocusBreakdown>(() => cachedKpi?.focus || EMPTY_FOCUS);
  const [todayLeadCount, setTodayLeadCount] = useState(() => cachedKpi?.todayLead ?? 0);
  const [todayDealCount, setTodayDealCount] = useState(() => cachedKpi?.todayDeal ?? 0);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [tasks, setTasks] = useState<CrmAssignment[]>([]);
  const [taskVisibleCount, setTaskVisibleCount] = useState(TASK_PAGE_SIZE);
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

  const load = useCallback(
    async (opts?: { refresh?: boolean; silent?: boolean }) => {
      const isRefresh = opts?.refresh ?? false;
      const silent = opts?.silent ?? false;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++loadGenRef.current;

      if (isRefresh && !silent) setRefreshing(true);
      else if (!silent && !hasPaintedRef.current) setLoading(true);
      if (!silent) setError('');

      try {
        const today = vnTodayYmd();
        const myTodayOpts = {
          ...buildStageFetchOpts(
            {
              ...DEFAULT_CRM_FILTERS,
              phone: '',
              assignee: 'mine',
              companyId: user?.company_id || '',
              timePreset: 'custom',
              dateFrom: today,
              dateTo: today,
            },
            '',
            uid,
          ),
          signal: ac.signal,
        };

        // Wave 1 — vẽ banner quá hạn ngay khi RPC xong, không đợi đếm hôm nay
        const focusP = fetchDeadlineFocusBreakdown(userRef.current, ac.signal);
        const leadP = fetchCrmListTotal('lead', myTodayOpts);
        const dealP = fetchCrmListTotal('deal', myTodayOpts);

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

        // Wave 2 — sự kiện + nhiệm vụ (không chặn first paint)
        const [eventRes, taskRes] = await Promise.all([
          fetchEventsRange({
            dateFrom: today,
            dateTo: today,
            userId: uid || undefined,
            signal: ac.signal,
          }),
          fetchCrmAssignments({
            assignee_id: uid || undefined,
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
        setTaskVisibleCount(TASK_PAGE_SIZE);
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
    [uid, user?.company_id],
  );

  useFocusEffect(
    useCallback(() => {
      const OVERVIEW_TTL_MS = 45_000;
      const stale = Date.now() - lastLoadAtRef.current > OVERVIEW_TTL_MS;
      if (!hasPaintedRef.current || stale) {
        void load({ silent: hasPaintedRef.current });
      }
      return () => abortRef.current?.abort();
    }, [load]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      void load({ refresh: true, silent: true });
    }, [load]),
  );

  const goTab = (screen: keyof TabParamList) => {
    navigation.navigate(screen);
  };

  const kpiItems: { key: string; label: string; value: number; tone: KpiTone; onPress: () => void }[] = [
    {
      key: 'lead_today',
      label: 'Lead hôm nay',
      value: todayLeadCount,
      tone: 'blue',
      onPress: () => goTab('Lead'),
    },
    {
      key: 'deal_today',
      label: 'Deal hôm nay',
      value: todayDealCount,
      tone: 'orange',
      onPress: () => goTab('Deal'),
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

  const previewEvents = events.slice(0, 5);
  const previewTasks = tasks.slice(0, taskVisibleCount);
  const hasMoreTasks = taskVisibleCount < tasks.length;
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

            <Text style={styles.secTitle}>Lead · Deal hôm nay của tôi</Text>
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
                previewEvents.map((e, idx) => {
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
                })
              )}
            </View>

            <View style={styles.secHead}>
              <Text style={styles.secTitleInline}>Nhiệm vụ cần làm</Text>
              <Pressable onPress={() => navigation.navigate('Tasks')} hitSlop={8}>
                <Text style={styles.link}>
                  {tasks.length > 0 ? `Tất cả (${tasks.length})` : 'Xem nhiệm vụ'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {previewTasks.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="checkbox-outline" size={20} color={Colors.textFaint} />
                  <Text style={styles.emptyTxt}>Không có nhiệm vụ chưa làm / đang làm</Text>
                </View>
              ) : (
                <>
                  {previewTasks.map((t, idx) => {
                    const overdue = isAssignmentOverdue(t);
                    const statusKey = String(t.status || 'pending');
                    const statusLbl = STATUS_STAGE_LABEL[statusKey] || 'Chưa làm';
                    const pri = PRIORITY_LABEL[String(t.priority || '')] || '';
                    const entityLbl = assignmentEntityLabel(t);
                    const entityKind = assignmentEntityKind(t);
                    return (
                      <Pressable
                        key={t.id}
                        style={[styles.rowItem, idx > 0 && styles.rowBorder]}
                        onPress={() => {
                          if (t.lead?.id) {
                            navigation.navigate('LeadDealDetail', {
                              leadId: t.lead.id,
                              kind: entityKind || 'lead',
                              code: t.lead.code || undefined,
                              title: t.lead.title || undefined,
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
                          {entityLbl ? (
                            <View style={styles.entityRow}>
                              <View
                                style={[
                                  styles.entityBadge,
                                  {
                                    backgroundColor:
                                      entityKind === 'deal' ? Colors.orangeSoft : Colors.blueSoft,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.entityBadgeTxt,
                                    { color: entityKind === 'deal' ? Colors.orange : Colors.blue },
                                  ]}
                                >
                                  {entityKind === 'deal' ? 'Deal' : 'Lead'}
                                </Text>
                              </View>
                              <Text style={styles.entityName} numberOfLines={1}>
                                {t.lead?.title || entityLbl}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.rowSub} numberOfLines={1}>
                              Không gắn Lead/Deal
                            </Text>
                          )}
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
                  })}
                  {hasMoreTasks ? (
                    <Pressable
                      style={styles.moreBtn}
                      onPress={() =>
                        setTaskVisibleCount((n) => Math.min(n + TASK_PAGE_SIZE, tasks.length))
                      }
                    >
                      <Text style={styles.moreBtnTxt}>
                        Xem thêm ({Math.min(TASK_PAGE_SIZE, tasks.length - taskVisibleCount)})
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={Colors.blue} />
                    </Pressable>
                  ) : tasks.length > TASK_PAGE_SIZE ? (
                    <Pressable
                      style={styles.moreBtn}
                      onPress={() => setTaskVisibleCount(TASK_PAGE_SIZE)}
                    >
                      <Text style={styles.moreBtnTxt}>Thu gọn</Text>
                      <Ionicons name="chevron-up" size={16} color={Colors.blue} />
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
                  <Text style={styles.quickLabel} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
      </ScrollView>

      <ListCreateFab kind="menu" onPress={toggleCreateMenu} bottom={12} />
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
