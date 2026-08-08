import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import Avatar from '../components/Avatar';
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import type { MainTabParamList } from '../navigation/MainTabs';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import { formatVnWeekdayDate } from '../lib/vcBoardKpis';
import { Radii, Spacing, colorWithAlpha } from '../theme';
import {
  type DealTaskSection,
  type WorkTask,
  fetchMyLogisticsTasks,
  groupTasksByDeal,
  isTaskDone,
  isTaskInProgress,
  isTaskPending,
  nextTaskStatus,
  statusPillLabel,
  updateWorkTaskStatus,
} from '../lib/workTasksApi';
import {
  STATUS_STAGE_LABEL,
  fetchPrivateDealInboxTasks,
  type SharedInboxTask,
} from '../lib/sharedWorkspaceApi';

function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || full || 'bạn';
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';
type WorkMode = 'mine' | 'shared';

const WORK_MODES: { key: WorkMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'mine', label: 'Của tôi', icon: 'person-outline' },
  { key: 'shared', label: 'Không gian chung', icon: 'people-outline' },
];

const FILTER_CHIPS: { key: StatusFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'Tất cả', icon: 'list-outline' },
  { key: 'pending', label: 'Chưa làm', icon: 'time-outline' },
  { key: 'in_progress', label: 'Đang làm', icon: 'play-outline' },
  { key: 'completed', label: 'Hoàn thành', icon: 'checkmark-circle-outline' },
];

function filterTasks(tasks: WorkTask[], filter: StatusFilter): WorkTask[] {
  if (filter === 'pending') return tasks.filter((t) => isTaskPending(t.status));
  if (filter === 'in_progress') return tasks.filter((t) => isTaskInProgress(t.status));
  if (filter === 'completed') return tasks.filter((t) => isTaskDone(t.status));
  return tasks;
}

function filterInboxTasks(tasks: SharedInboxTask[], filter: StatusFilter): SharedInboxTask[] {
  if (filter === 'pending') return tasks.filter((t) => isTaskPending(String(t.status || '')));
  if (filter === 'in_progress') return tasks.filter((t) => isTaskInProgress(String(t.status || '')));
  if (filter === 'completed') return tasks.filter((t) => isTaskDone(String(t.status || '')));
  return tasks;
}

function groupInboxByDeal(tasks: SharedInboxTask[]) {
  const map = new Map<string, {
    leadId: string;
    projectId: string | null;
    code: string;
    title: string;
    tasks: SharedInboxTask[];
  }>();
  for (const t of tasks) {
    const leadId = String(t.lead_id || t.lead?.id || '');
    if (!leadId) continue;
    const existing = map.get(leadId);
    if (existing) {
      existing.tasks.push(t);
      continue;
    }
    map.set(leadId, {
      leadId,
      projectId: t.lead?.project_id ? String(t.lead.project_id) : null,
      code: String(t.lead?.code || t.lead?.project_code || 'Deal'),
      title: String(t.lead?.title || t.lead?.project_name || ''),
      tasks: [t],
    });
  }
  return Array.from(map.values());
}

function dotColor(status: string, colors: ReturnType<typeof useTheme>['colors']): string {
  if (isTaskDone(status)) return colors.success;
  if (isTaskInProgress(status)) return colors.primary;
  return colors.warning;
}

function dealAccentColor(index: number, colors: ReturnType<typeof useTheme>['colors']): string {
  const palette = [colors.primary, '#8B5CF6', '#14B8A6', '#F59E0B', '#EC4899'];
  return palette[index % palette.length];
}

export default function WorkScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount, refreshUnread } = useNotifications();
  const { openProjectDetail } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const userId = user?.id || user?.userId || '';
  const userName = user?.full_name || user?.fullName || 'Bạn';
  const greetName = firstName(userName);

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [sharedTasks, setSharedTasks] = useState<SharedInboxTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<WorkMode>('mine');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  const openNotifs = useCallback(async () => {
    void ensureNotificationPermission();
    setNotifOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  const load = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setSharedTasks([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [mine, shared] = await Promise.all([
        fetchMyLogisticsTasks(userId, { limit: 200 }),
        fetchPrivateDealInboxTasks('logistics').catch(() => [] as SharedInboxTask[]),
      ]);
      setTasks(mine);
      setSharedTasks(shared);
    } catch (e) {
      setError(formatApiError(e));
      setTasks([]);
      setSharedTasks([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (userId) {
        const [mine, shared] = await Promise.all([
          fetchMyLogisticsTasks(userId, { limit: 200 }),
          fetchPrivateDealInboxTasks('logistics').catch(() => [] as SharedInboxTask[]),
        ]);
        setTasks(mine);
        setSharedTasks(shared);
        setError(null);
      }
      void refreshUnread();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setRefreshing(false);
    }
  }, [userId, refreshUnread]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const reloadSilent = useCallback(async () => {
    if (!userId) return;
    try {
      const [mine, shared] = await Promise.all([
        fetchMyLogisticsTasks(userId, { limit: 200 }),
        fetchPrivateDealInboxTasks('logistics').catch(() => [] as SharedInboxTask[]),
      ]);
      setTasks(mine);
      setSharedTasks(shared);
    } catch {
      /* giữ list cũ */
    }
  }, [userId]);

  useProductionRealtime({
    onRefresh: reloadSilent,
    enabled: Boolean(userId),
    modes: ['task'],
  });

  const activeTasks = workMode === 'mine' ? tasks : sharedTasks.map((t) => ({
    id: String(t.id),
    status: String(t.status || 'pending'),
  }));

  const stats = useMemo(
    () => ({
      pending: activeTasks.filter((t) => isTaskPending(t.status)).length,
      inProgress: activeTasks.filter((t) => isTaskInProgress(t.status)).length,
      done: activeTasks.filter((t) => isTaskDone(t.status)).length,
    }),
    [activeTasks],
  );

  const sections = useMemo(() => {
    if (workMode === 'shared') return [];
    const grouped = groupTasksByDeal(tasks);
    return grouped
      .map((section, index) => {
        const filtered = filterTasks(section.tasks, filter);
        return {
          ...section,
          sectionIndex: index,
          data: filtered.length ? [{ tasks: filtered }] : [],
        };
      })
      .filter((section) => section.data.length > 0);
  }, [tasks, filter, workMode]);

  const sharedSections = useMemo(() => {
    if (workMode !== 'shared') return [];
    const filtered = filterInboxTasks(sharedTasks, filter);
    return groupInboxByDeal(filtered).map((section, index) => ({
      ...section,
      sectionIndex: index,
    }));
  }, [sharedTasks, filter, workMode]);

  const sharedCount = sharedTasks.length;

  const toggleStatus = async (task: WorkTask) => {
    if (updatingId) return;
    setUpdatingId(task.id);
    try {
      const next = nextTaskStatus(task.status);
      const updated = await updateWorkTaskStatus(task.lead_id, task.id, next);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id && t.lead_id === task.lead_id
            ? { ...t, status: updated.status, title: updated.title }
            : t,
        ),
      );
      setError(null);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setUpdatingId(null);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.sm,
        },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        },
        headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
        headerTextWrap: { flex: 1, minWidth: 0 },
        greetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
        greetDate: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 3 },
        greetSub: { color: colors.textFaint, fontSize: 13, marginTop: 6, fontWeight: '500' },
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
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
        badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
        sectionHead: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: Spacing.lg,
          marginTop: Spacing.md,
          marginBottom: 10,
        },
        sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
        modeRow: {
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: Spacing.lg,
          marginTop: Spacing.sm,
          marginBottom: Spacing.md,
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
        },
        modeBtnActive: {
          borderColor: colors.primary,
          backgroundColor: colors.primarySoft,
        },
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
          paddingVertical: 14,
          alignItems: 'center',
        },
        statCardActive: {
          borderWidth: 1.5,
        },
        statValue: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
        statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600', textAlign: 'center' },
        userName: { color: colors.textMuted, fontSize: 14, marginTop: 4, fontWeight: '600' },
        chipsRow: {
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: Radii.full,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        chipActiveAll: { borderColor: colors.text, backgroundColor: colors.white },
        chipActivePending: { borderColor: colors.warning, backgroundColor: colors.card },
        chipActiveProgress: { borderColor: colors.primary, backgroundColor: colors.card },
        chipActiveDone: { borderColor: colors.success, backgroundColor: colors.card },
        chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
        chipTextActiveAll: { color: '#0E1116' },
        chipTextActivePending: { color: colors.warning },
        chipTextActiveProgress: { color: colors.primary },
        chipTextActiveDone: { color: colors.success },
        errorBox: {
          marginHorizontal: Spacing.lg,
          marginBottom: Spacing.sm,
          padding: 10,
          borderRadius: Radii.md,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
        },
        errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
        sectionWrap: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.lg,
          marginBottom: Spacing.xs,
        },
        sectionCard: {
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
          overflow: 'hidden',
        },
        sectionAccent: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
        },
        dealCodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        dealCode: {
          flex: 1,
          color: colors.text,
          fontSize: 22,
          fontWeight: '900',
          letterSpacing: 0.5,
        },
        dealBadge: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: Radii.full,
          backgroundColor: colorWithAlpha(colors.primary, 0.15),
        },
        dealBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
        dealTitle: {
          color: colors.text,
          fontSize: 16,
          fontWeight: '700',
          marginTop: 6,
          lineHeight: 22,
        },
        dealMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4, fontWeight: '600' },
        taskBlock: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.sm,
          marginBottom: Spacing.md,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        taskRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingVertical: 15,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          gap: 12,
        },
        taskRowLast: { borderBottomWidth: 0 },
        dot: { width: 10, height: 10, borderRadius: 5 },
        taskTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
        taskTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
        statusPill: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: Radii.full,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          minWidth: 92,
          alignItems: 'center',
        },
        statusPillText: { color: colors.text, fontSize: 12, fontWeight: '700' },
        empty: {
          color: colors.textMuted,
          textAlign: 'center',
          fontSize: 14,
          marginTop: 48,
          paddingHorizontal: Spacing.xl,
          lineHeight: 21,
        },
        listContent: { paddingBottom: insets.bottom + 24 },
      }),
    [colors, insets.bottom],
  );

  const renderSectionHeader = ({
    section,
  }: {
    section: DealTaskSection & { data: { tasks: WorkTask[] }[]; sectionIndex: number };
  }) => {
    const accent = dealAccentColor(section.sectionIndex, colors);
    const subtitle = section.customerName || section.title;
    const taskCount = section.data[0]?.tasks.length ?? 0;
    return (
      <View style={styles.sectionWrap}>
        <TapHighlight
          onPress={() => {
            if (section.projectId) openProjectDetail(section.projectId);
          }}
          disabled={!section.projectId}
          pressStyle={{ opacity: 0.88 }}
        >
          <View style={styles.sectionCard}>
            <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
            <View style={{ paddingLeft: 6 }}>
              <View style={styles.dealCodeRow}>
                <Text style={styles.dealCode} numberOfLines={1}>
                  {section.code}
                </Text>
                <View style={[styles.dealBadge, { backgroundColor: colorWithAlpha(accent, 0.18) }]}>
                  <Text style={[styles.dealBadgeText, { color: accent }]}>{taskCount} NV</Text>
                </View>
              </View>
              {subtitle && subtitle !== section.code ? (
                <Text style={styles.dealTitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
              <Text style={styles.dealMeta} numberOfLines={1}>
                {section.projectId ? 'Chạm để mở dự án · ' : ''}
                Giao cho {userName}
              </Text>
            </View>
          </View>
        </TapHighlight>
      </View>
    );
  };

  const renderItem = ({ item }: { item: { tasks: WorkTask[] } }) => (
    <View style={styles.taskBlock}>
      {item.tasks.map((task, index) => {
        const done = isTaskDone(task.status);
        const busy = updatingId === task.id;
        const isLast = index === item.tasks.length - 1;
        return (
          <View key={task.id} style={[styles.taskRow, isLast && styles.taskRowLast]}>
            <View style={[styles.dot, { backgroundColor: dotColor(task.status, colors) }]} />
            <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
              {task.title}
            </Text>
            <TapHighlight
              style={styles.statusPill}
              onPress={() => void toggleStatus(task)}
              disabled={busy}
              pressStyle={{ opacity: 0.82 }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.statusPillText}>{statusPillLabel(task.status)}</Text>
              )}
            </TapHighlight>
          </View>
        );
      })}
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const listHeader = (
    <>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TapHighlight
              style={styles.iconBtn}
              onPress={() => tabNav.navigate('Overview')}
              hitSlop={8}
              accessibilityLabel="Quay lại Tổng quan"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TapHighlight>
            <Avatar name={userName} avatarUrl={user?.avatar} size={44} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle} numberOfLines={1}>
                Công việc
              </Text>
              <Text style={styles.greetDate} numberOfLines={1}>
                Xin chào, {greetName} · {formatVnWeekdayDate()}
              </Text>
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
        <Text style={styles.greetSub}>Của tôi · Không gian chung — VC & lắp đặt</Text>
      </View>

      <View style={styles.modeRow}>
        {WORK_MODES.map((m) => {
          const active = workMode === m.key;
          return (
            <TapHighlight
              key={m.key}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => {
                setWorkMode(m.key);
                setFilter('all');
              }}
            >
              <Ionicons
                name={m.icon}
                size={16}
                color={active ? colors.primary : colors.textMuted}
              />
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

      {workMode === 'shared' ? (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Việc deal giao cho bạn · chạm deal để mở Không gian chung (phân công + nhiệm vụ chéo công ty).
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Ionicons
          name={workMode === 'shared' ? 'people' : 'folder'}
          size={18}
          color={workMode === 'shared' ? colors.primary : '#EAB308'}
        />
        <Text style={styles.sectionTitle}>
          {workMode === 'shared' ? 'Không gian chung' : 'Công việc của tôi'}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <TapHighlight
          style={[
            styles.statCard,
            filter === 'pending' && styles.statCardActive,
            filter === 'pending' && { borderColor: colors.danger },
          ]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.statValue, { color: colors.danger }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Cần xử lý</Text>
        </TapHighlight>
        <TapHighlight
          style={[
            styles.statCard,
            filter === 'in_progress' && styles.statCardActive,
            filter === 'in_progress' && { borderColor: colors.primary },
          ]}
          onPress={() => setFilter('in_progress')}
        >
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.inProgress}</Text>
          <Text style={styles.statLabel}>Đang làm</Text>
        </TapHighlight>
        <TapHighlight
          style={[
            styles.statCard,
            filter === 'completed' && styles.statCardActive,
            filter === 'completed' && { borderColor: colors.success },
          ]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.statValue, { color: colors.success }]}>{stats.done}</Text>
          <Text style={styles.statLabel}>Hoàn thành</Text>
        </TapHighlight>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={{ flexGrow: 0, marginBottom: 0 }}
      >
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.key;
          const chipStyle = [
            styles.chip,
            active && chip.key === 'all' && styles.chipActiveAll,
            active && chip.key === 'pending' && styles.chipActivePending,
            active && chip.key === 'in_progress' && styles.chipActiveProgress,
            active && chip.key === 'completed' && styles.chipActiveDone,
          ];
          const textStyle = [
            styles.chipText,
            active && chip.key === 'all' && styles.chipTextActiveAll,
            active && chip.key === 'pending' && styles.chipTextActivePending,
            active && chip.key === 'in_progress' && styles.chipTextActiveProgress,
            active && chip.key === 'completed' && styles.chipTextActiveDone,
          ];
          const iconColor =
            active && chip.key === 'all'
              ? '#0E1116'
              : active && chip.key === 'pending'
                ? colors.warning
                : active && chip.key === 'in_progress'
                  ? colors.primary
                  : active && chip.key === 'completed'
                    ? colors.success
                    : colors.textMuted;
          return (
            <TapHighlight key={chip.key} style={chipStyle} onPress={() => setFilter(chip.key)}>
              <Ionicons name={chip.icon} size={15} color={iconColor} />
              <Text style={textStyle}>{chip.label}</Text>
            </TapHighlight>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      {workMode === 'mine' ? (
        <SectionList
          style={styles.container}
          sections={sections}
          keyExtractor={(item, index) => `task-group-${index}-${item.tasks[0]?.lead_id || ''}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {userId
                ? filter === 'all'
                  ? 'Chưa có nhiệm vụ vận chuyển lắp đặt nào được giao cho bạn.'
                  : 'Không có nhiệm vụ nào trong bộ lọc này.'
                : 'Đăng nhập để xem công việc được giao.'}
            </Text>
          }
        />
      ) : (
        <FlatList
          style={styles.container}
          data={sharedSections}
          keyExtractor={(item) => item.leadId}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {userId
                ? filter === 'all'
                  ? 'Chưa có việc trong Không gian chung.'
                  : 'Không có nhiệm vụ nào trong bộ lọc này.'
                : 'Đăng nhập để xem Không gian chung.'}
            </Text>
          }
          renderItem={({ item, index }) => {
            const accent = dealAccentColor(index, colors);
            return (
              <View style={styles.sectionWrap}>
                <TapHighlight
                  onPress={() => {
                    if (item.projectId) {
                      openProjectDetail(item.projectId, { initialTab: 'shared-workspace' });
                    }
                  }}
                  disabled={!item.projectId}
                  pressStyle={{ opacity: 0.88 }}
                >
                  <View style={styles.sectionCard}>
                    <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
                    <View style={{ paddingLeft: 6 }}>
                      <View style={styles.dealCodeRow}>
                        <Text style={styles.dealCode} numberOfLines={1}>{item.code}</Text>
                        <View style={[styles.dealBadge, { backgroundColor: colorWithAlpha(accent, 0.18) }]}>
                          <Text style={[styles.dealBadgeText, { color: accent }]}>
                            {item.tasks.length} NV
                          </Text>
                        </View>
                      </View>
                      {item.title ? (
                        <Text style={styles.dealTitle} numberOfLines={2}>{item.title}</Text>
                      ) : null}
                      <Text style={styles.dealMeta} numberOfLines={1}>
                        {item.projectId ? 'Mở Không gian chung · ' : ''}
                        Việc deal giao cho bạn
                      </Text>
                    </View>
                  </View>
                </TapHighlight>
                <View style={styles.taskBlock}>
                  {item.tasks.map((task, taskIdx) => {
                    const st = String(task.status || 'pending');
                    const done = isTaskDone(st);
                    const isLast = taskIdx === item.tasks.length - 1;
                    return (
                      <View key={task.id} style={[styles.taskRow, isLast && styles.taskRowLast]}>
                        <View style={[styles.dot, { backgroundColor: dotColor(st, colors) }]} />
                        <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
                          {task.title || 'Nhiệm vụ'}
                        </Text>
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>
                            {STATUS_STAGE_LABEL[st] || statusPillLabel(st)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          }}
        />
      )}
      <CommentNotificationsModal
        visible={notifOpen}
        onClose={() => {
          setNotifOpen(false);
          void refreshUnread();
        }}
        onOpenProject={(projectId) => {
          setNotifOpen(false);
          openProjectDetail(projectId);
        }}
      />
    </>
  );
}
