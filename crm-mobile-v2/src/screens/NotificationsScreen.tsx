import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import { useOrgActivityFeed } from '../hooks/useOrgActivityFeed';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EmployeeReportQuery } from '../api/employeeReport';
import { fetchDeadlineFocusBreakdown } from '../api/deadlineOverdue';
import {
  fetchNotificationCounts,
  fetchNotifications,
  invalidateNotificationCountsCache,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationChannel,
  type NotificationCounts,
} from '../api/notifications';
import { openFromNotificationPayload } from '../lib/notificationNavigation';
import { setNotificationCounts } from '../lib/notificationCountsStore';
import {
  getDeadlineOverdueBreakdown,
  isDeadlineOverdueFresh,
  subscribeDeadlineOverdue,
} from '../lib/deadlineOverdueStore';
import { peekCrmHubFiltersForUser } from '../lib/crmHubFilterStore';
import { formatBadgeCount } from '../components/NotificationBadge';
import ReportRecentActivityFeed from '../components/reports/ReportRecentActivityFeed';
import SpinningLoader from '../components/SpinningLoader';
import { currentUserId, useAuth } from '../context/AuthContext';
import { isSystemAdmin } from '../lib/crmAssignee';
import { getPerfTier } from '../lib/devicePerf';
import type { ActivityFeedItem } from '../lib/reportActivityFeed';
import { timeLabel } from '../lib/media';
import { vnAddDaysYmd, vnTodayYmd } from '../lib/vnDate';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

const EMPTY_COUNTS: NotificationCounts = {
  activity: 0,
  assignments: 0,
  events: 0,
  deadlines: 0,
  total: 0,
};

const NOTIF_CACHE_TTL_MS = 90_000;

type NotifCacheEntry = { items: AppNotification[]; at: number };

const notifListCache = new Map<string, NotifCacheEntry>();

function notifCacheKey(channel: NotificationChannel, onlyUnread: boolean): string {
  return `${channel}|${onlyUnread ? 'u' : 'a'}`;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

type NotificationTab = NotificationChannel | 'work';

const TABS: { key: NotificationTab; label: string }[] = [
  { key: 'activity', label: 'Hoạt động' },
  { key: 'work', label: 'Công việc' },
  { key: 'assignments', label: 'Giao việc' },
  { key: 'events', label: 'Sự kiện' },
  { key: 'deadlines', label: 'Nhắc hạn' },
];

type IconMeta = { icon: keyof typeof Ionicons.glyphMap; color: keyof ThemeColors };

function iconForType(type: string | null, entityType: string | null): IconMeta {
  const t = (type || '').toLowerCase();
  const e = (entityType || '').toLowerCase();
  if (t.includes('deadline') || t.includes('overdue') || t.includes('reminder')) {
    return { icon: 'alarm', color: 'red' };
  }
  if (t.includes('assign') || e === 'crm_assignment' || e === 'crm_task' || e === 'task') {
    return { icon: 'clipboard', color: 'purple' };
  }
  if (t.includes('event') || e === 'event') return { icon: 'calendar', color: 'cyan' };
  if (t.includes('won') || t.includes('deal')) return { icon: 'trophy', color: 'amber' };
  if (e === 'crm_lead' || e === 'lead' || t.includes('lead')) return { icon: 'people', color: 'blue' };
  if (e === 'crm_deal') return { icon: 'pricetags', color: 'orange' };
  if (t.includes('chat') || t.includes('message')) return { icon: 'chatbubble', color: 'green' };
  if (t.includes('approval')) return { icon: 'shield-checkmark', color: 'orange' };
  return { icon: 'notifications', color: 'blue' };
}

function dayGroupLabel(iso: string | null): string {
  if (!iso) return 'Khác';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Khác';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hôm nay';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Section = { title: string; data: AppNotification[] };

function groupByDay(items: AppNotification[]): Section[] {
  const map = new Map<string, AppNotification[]>();
  for (const n of items) {
    const key = dayGroupLabel(n.created_at);
    const arr = map.get(key);
    if (arr) arr.push(n);
    else map.set(key, [n]);
  }
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

export default function NotificationsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  const [tab, setTab] = useState<NotificationTab>('activity');
  const isWorkTab = tab === 'work';
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workRefreshing, setWorkRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_COUNTS);
  const [overdueBd, setOverdueBd] = useState(() => getDeadlineOverdueBreakdown());
  const abortRef = useRef<AbortController | null>(null);
  const countsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => subscribeDeadlineOverdue(setOverdueBd), []);
  const overdueTotal = overdueBd?.total ?? 0;
  const overdueLead = overdueBd?.lead ?? 0;
  const overdueDeal = overdueBd?.deal ?? 0;

  const uid = currentUserId(user);
  const userCompanyId = user?.company_id || '';
  const activityQuery = useMemo<EmployeeReportQuery>(() => {
    const today = vnTodayYmd();
    const from = vnAddDaysYmd(today, -13) || today;
    const hub = uid ? peekCrmHubFiltersForUser(uid) : null;
    const companyId = hub?.filters.companyId || userCompanyId || '';
    return {
      date_from: from,
      date_to: today,
      type: 'all',
      ...(companyId ? { company_id: String(companyId) } : {}),
    };
  }, [uid, userCompanyId]);

  const workNeedsCompany = isSystemAdmin(user) && !activityQuery.company_id;
  const {
    items: activityItems,
    loading: activityLoading,
    error: activityError,
    refresh: refreshActivity,
  } = useOrgActivityFeed(activityQuery, isWorkTab && !workNeedsCompany);

  const refreshCounts = useCallback(async () => {
    countsAbortRef.current?.abort();
    const ac = new AbortController();
    countsAbortRef.current = ac;
    try {
      const next = await fetchNotificationCounts(ac.signal);
      if (!ac.signal.aborted) {
        setCounts(next);
        setNotificationCounts(next);
      }
    } catch {
      if (!ac.signal.aborted) {
        setCounts(EMPTY_COUNTS);
        setNotificationCounts(EMPTY_COUNTS);
      }
    }
  }, []);

  const tabBadge = useCallback(
    (key: NotificationTab): number => {
      if (key === 'work') return activityItems.length;
      if (key === 'deadlines') return Math.max(counts.deadlines || 0, overdueTotal);
      return counts[key] ?? 0;
    },
    [activityItems.length, counts, overdueTotal],
  );

  const load = useCallback(
    async (opts?: { refresh?: boolean; silent?: boolean; channel?: NotificationChannel }) => {
      const channel = opts?.channel ?? (tab as NotificationChannel);
      const key = notifCacheKey(channel, onlyUnread);
      const cached = notifListCache.get(key);
      const isRefresh = opts?.refresh ?? false;
      const silent = opts?.silent ?? (cached?.items.length ?? 0) > 0;

      if (!isRefresh && cached && Date.now() - cached.at < NOTIF_CACHE_TTL_MS) {
        setItems(cached.items);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (cached?.items.length) setItems(cached.items);

      if (isRefresh && !silent) setRefreshing(true);
      else if (!silent) setLoading(true);
      if (!silent) setError('');

      try {
        const list = await fetchNotifications({ channel, onlyUnread, signal: ac.signal });
        if (!ac.signal.aborted) {
          notifListCache.set(key, { items: list, at: Date.now() });
          setItems(list);
          if (channel === 'deadlines') {
            const unreadN = list.filter((n) => !n.is_read).length;
            if (unreadN > 0) {
              setCounts((prev) => {
                const next = { ...prev, deadlines: Math.max(prev.deadlines, unreadN) };
                next.total = next.activity + next.assignments + next.events + next.deadlines;
                setNotificationCounts(next);
                return next;
              });
            }
          }
        }
      } catch (e: unknown) {
        if (!ac.signal.aborted) {
          setError((e as { message?: string })?.message || 'Không tải được thông báo');
          if (!cached?.items.length) setItems([]);
        }
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [tab, onlyUnread],
  );

  const refreshWork = useCallback(async () => {
    setWorkRefreshing(true);
    try {
      await refreshActivity();
    } finally {
      setWorkRefreshing(false);
    }
  }, [refreshActivity]);

  useFocusEffect(
    useCallback(() => {
      void refreshCounts();
      if (!isDeadlineOverdueFresh() && user) {
        void fetchDeadlineFocusBreakdown(user).catch(() => {});
      }
      return () => {
        abortRef.current?.abort();
        countsAbortRef.current?.abort();
      };
    }, [refreshCounts, user]),
  );

  useEffect(() => {
    if (isWorkTab) {
      // useOrgActivityFeed tự tải khi enabled — không gọi refresh lần nữa (abort → treo spinner).
      return;
    }
    const channel = tab as NotificationChannel;
    const key = notifCacheKey(channel, onlyUnread);
    const cached = notifListCache.get(key);
    if (cached?.items.length) {
      setItems(cached.items);
      setLoading(false);
      void load({ silent: true, refresh: true, channel });
    } else {
      setItems([]);
      setLoading(true);
      void load({ channel });
    }
  }, [tab, onlyUnread, isWorkTab, load]);

  useCrmRealtimeRefresh(
    useCallback(() => {
      void refreshCounts();
      if (isWorkTab) void refreshActivity();
      else void load({ refresh: true, silent: true });
    }, [load, isWorkTab, refreshCounts, refreshActivity]),
  );

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);
  const sections = useMemo(() => groupByDay(items), [items]);
  const showBlockingLoader = loading && items.length === 0;
  const showBgRefresh = !isWorkTab
    ? (loading || refreshing) && items.length > 0
    : activityLoading && activityItems.length > 0;

  // Tải ngầm các tab còn lại (không phải tab đang xem) để chuyển tab tức thì.
  // Trì hoãn để không tranh băng thông với lượt tải đầu tiên của tab hiện tại.
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    const channels: NotificationChannel[] = ['activity', 'assignments', 'events', 'deadlines'];
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Máy yếu: prefetch muộn hơn + thưa hơn.
    const tier = getPerfTier();
    const delayMs = tier === 'low' ? 4000 : tier === 'mid' ? 2200 : 1200;
    const gapMs = tier === 'low' ? 700 : tier === 'mid' ? 450 : 300;
    timer = setTimeout(() => {
      (async () => {
        for (const ch of channels) {
          if (cancelled) break;
          const key = notifCacheKey(ch, false);
          const cached = notifListCache.get(key);
          if (cached && Date.now() - cached.at < NOTIF_CACHE_TTL_MS) continue;
          try {
            const list = await fetchNotifications({ channel: ch, onlyUnread: false });
            if (cancelled) break;
            notifListCache.set(key, { items: list, at: Date.now() });
          } catch {
            // Bỏ qua lỗi tải ngầm, tab sẽ tự tải lại khi người dùng mở.
          }
          await new Promise((resolve) => setTimeout(resolve, gapMs));
        }
      })();
    }, delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const syncListCache = useCallback((channel: NotificationChannel, nextItems: AppNotification[]) => {
    const key = notifCacheKey(channel, onlyUnread);
    notifListCache.set(key, { items: nextItems, at: Date.now() });
  }, [onlyUnread]);

  const handleMarkAll = async () => {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    const nextItems = items.map((n) => ({ ...n, is_read: true }));
    setItems(nextItems);
    syncListCache(tab as NotificationChannel, nextItems);
    setCounts(EMPTY_COUNTS);
    invalidateNotificationCountsCache();
    setNotificationCounts(EMPTY_COUNTS);
    try {
      await markAllNotificationsRead();
      const next = await fetchNotificationCounts(undefined, { force: true });
      setCounts(next);
    } catch {
      void load();
      void refreshCounts();
    } finally {
      setMarking(false);
    }
  };

  const openDeadlineTab = useCallback(() => {
    navigation.navigate('Tabs', { screen: 'Deadline' });
  }, [navigation]);

  const navigateForNotification = (n: AppNotification) => {
    openFromNotificationPayload({
      type: n.type,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
      metadata: n.metadata ?? undefined,
      title: n.title,
    });
  };

  const overduePanel = tab === 'deadlines' && overdueTotal > 0 ? (
    <Pressable style={styles.overdueCard} onPress={openDeadlineTab}>
      <View style={styles.overdueIcon}>
        <Ionicons name="alert-circle" size={22} color={Colors.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.overdueTitle}>
          {overdueTotal} Lead/Deal quá hạn
        </Text>
        <Text style={styles.overdueSub}>
          {overdueLead} Lead · {overdueDeal} Deal · cùng bộ lọc tab Deadline
        </Text>
        <Text style={styles.overdueCta}>Mở tab Deadline</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.red} />
    </Pressable>
  ) : null;

  const handlePress = (n: AppNotification) => {
    if (!n.is_read) {
      const nextItems = items.map((it) => (it.id === n.id ? { ...it, is_read: true } : it));
      setItems(nextItems);
      syncListCache(tab as NotificationChannel, nextItems);
      if (!isWorkTab) {
        const ch = tab as NotificationChannel;
        setCounts((prev) => {
          const nextVal = Math.max(0, (prev[ch] ?? 0) - 1);
          const next = { ...prev, [ch]: nextVal };
          next.total = next.activity + next.assignments + next.events + next.deadlines;
          setNotificationCounts(next);
          return next;
        });
      }
      void markNotificationRead(n.id)
        .then(() => refreshCounts())
        .catch(() => {});
    }
    navigateForNotification(n);
  };

  const handleActivityPress = (item: ActivityFeedItem) => {
    if (!item.leadId) return;
    const kind = item.leadType
      || (/\bDEAL\b/i.test(item.title) ? 'deal' : 'lead');
    navigation.navigate('LeadDealDetail', {
      leadId: item.leadId,
      kind,
      title: item.title.split('·').pop()?.trim() || undefined,
      initialTab: item.kind === 'comment' ? 'comments' : undefined,
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Thông báo</Text>
            <Text style={styles.sub}>
              {isWorkTab
                ? 'Sự kiện thực · cập nhật realtime'
                : unreadCount > 0
                  ? `${unreadCount} thông báo mới`
                  : 'Đã xem hết'}
            </Text>
          </View>
        </View>

        {!isWorkTab ? (
          <Pressable
            style={[styles.markAllBtn, (marking || unreadCount === 0) && { opacity: 0.5 }]}
            onPress={() => void handleMarkAll()}
            disabled={marking || unreadCount === 0}
          >
            <Ionicons name="checkmark-done" size={16} color={Colors.blue} />
            <Text style={styles.markAllTxt}>Đánh dấu đã đọc tất cả</Text>
          </Pressable>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const badgeLabel = formatBadgeCount(tabBadge(t.key));
            return (
              <Pressable
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{t.label}</Text>
                {badgeLabel ? (
                  <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeTxt, active && styles.tabBadgeTxtActive]}>
                      {badgeLabel}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {!isWorkTab ? (
          <View style={styles.unreadRow}>
            <Text style={styles.unreadLbl}>Chỉ chưa đọc</Text>
            <Switch
              value={onlyUnread}
              onValueChange={setOnlyUnread}
              trackColor={{ false: Colors.border, true: Colors.blue }}
            />
          </View>
        ) : null}

        {showBgRefresh ? (
          <View style={styles.bgRefreshRow}>
            <SpinningLoader size={14} color={Colors.blue} />
            <Text style={styles.bgRefreshTxt}>Đang tải…</Text>
          </View>
        ) : null}
      </View>

      {isWorkTab ? (
        workNeedsCompany ? (
          <View style={styles.center}>
            <Ionicons name="business-outline" size={36} color={Colors.textFaint} />
            <Text style={styles.errTxt}>Chọn công ty ở bộ lọc CRM để xem hoạt động công việc.</Text>
          </View>
        ) : activityLoading && !activityItems.length ? (
          <View style={styles.blockingLoader}>
            <SpinningLoader variant="large" color={Colors.blue} />
            <Text style={styles.blockingLoaderTxt}>Đang tải…</Text>
          </View>
        ) : activityError && !activityItems.length ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={36} color={Colors.textFaint} />
            <Text style={styles.errTxt}>{activityError}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void refreshWork()}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.workScroll, { paddingBottom: insets.bottom + 40 }]}
            refreshControl={(
              <RefreshControl
                refreshing={workRefreshing}
                onRefresh={() => void refreshWork()}
                tintColor={Colors.blue}
              />
            )}
          >
            <View style={styles.workCard}>
              <Text style={styles.workTitle}>Hoạt động gần đây</Text>
              <Text style={styles.workSub}>Sự kiện thực · cập nhật realtime</Text>
              <ReportRecentActivityFeed
                items={activityItems}
                loading={activityLoading}
                onItemPress={handleActivityPress}
              />
            </View>
          </ScrollView>
        )
      ) : showBlockingLoader ? (
        <View style={styles.blockingLoader}>
          <SpinningLoader variant="large" color={Colors.blue} />
          <Text style={styles.blockingLoaderTxt}>Đang tải…</Text>
        </View>
      ) : error && !items.length ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={Colors.textFaint} />
          <Text style={styles.errTxt}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
            <Text style={styles.retryTxt}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          stickySectionHeadersEnabled={false}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
          ListHeaderComponent={overduePanel}
          ListEmptyComponent={
            overduePanel ? (
              <Text style={styles.overdueHint}>
                Không có thông báo nhắc hạn trong hộp thư — số badge là hồ sơ quá hạn realtime.
              </Text>
            ) : (
              <View style={styles.center}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="notifications-off-outline" size={28} color={Colors.textFaint} />
                </View>
                <Text style={styles.emptyTxt}>
                  {onlyUnread ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
                </Text>
              </View>
            )
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item: n }) => {
            const meta = iconForType(n.type, n.entity_type);
            const color = Colors[meta.color] as string;
            return (
              <Pressable
                style={[styles.card, !n.is_read && styles.cardUnread]}
                onPress={() => handlePress(n)}
              >
                {!n.is_read ? <View style={styles.unreadBar} /> : null}
                <View style={[styles.cardIcon, { backgroundColor: color + '22' }]}>
                  <Ionicons name={meta.icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTopRow}>
                    <Text style={[styles.cardTitle, !n.is_read && styles.cardTitleUnread]} numberOfLines={2}>
                      {n.title}
                    </Text>
                    <Text style={styles.cardTime}>{timeLabel(n.created_at)}</Text>
                  </View>
                  {n.message ? (
                    <Text style={styles.cardMsg} numberOfLines={3}>
                      {n.message}
                    </Text>
                  ) : null}
                </View>
                {!n.is_read ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderSoft },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
    },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    sub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: Colors.blueSoft,
    },
    markAllTxt: { color: Colors.blue, fontWeight: '800', fontSize: 13 },
    tabsRow: { gap: 8, paddingTop: 12, paddingBottom: 2 },
    tab: {
      flexDirection: 'row',
      paddingHorizontal: 14,
      height: 34,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    tabActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
    tabTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '800' },
    tabTxtActive: { color: '#fff' },
    tabBadge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 99,
      backgroundColor: Colors.red,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadgeActive: { backgroundColor: '#fff' },
    tabBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900', lineHeight: 12 },
    tabBadgeTxtActive: { color: Colors.blue },
    unreadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingVertical: 2,
    },
    unreadLbl: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
    bgRefreshRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 8,
      paddingBottom: 2,
    },
    bgRefreshTxt: { color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
    blockingLoader: { alignItems: 'center', justifyContent: 'center', marginTop: 40, gap: 10 },
    blockingLoaderTxt: { color: Colors.textFaint, fontSize: 13, fontWeight: '700' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 24 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: Colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    overdueCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 14,
      marginTop: 14,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.4)',
      backgroundColor: Colors.redSoft,
    },
    overdueIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overdueTitle: { color: Colors.red, fontSize: 14.5, fontWeight: '800' },
    overdueSub: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    overdueCta: { color: Colors.red, fontSize: 12, fontWeight: '800', marginTop: 6 },
    overdueHint: {
      color: Colors.textFaint,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      paddingHorizontal: 28,
      paddingTop: 16,
      paddingBottom: 8,
    },
    errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center' },
    retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radii.md, backgroundColor: Colors.blue },
    retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    sectionHeader: {
      color: Colors.textFaint,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
    },
    card: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      marginHorizontal: 14,
      marginBottom: 8,
      padding: 12,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      overflow: 'hidden',
    },
    cardUnread: { backgroundColor: Colors.blueSoft, borderColor: 'rgba(47,107,255,0.35)' },
    unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Colors.blue },
    cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    cardTitleUnread: { fontWeight: '900' },
    cardTime: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', marginTop: 1 },
    cardMsg: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.blue, marginTop: 4 },
    workScroll: { paddingHorizontal: 14, paddingTop: 12 },
    workCard: {
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 4,
    },
    workTitle: { color: Colors.text, fontSize: 16, fontWeight: '900' },
    workSub: { color: Colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  });
