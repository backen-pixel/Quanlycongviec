import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { Radii, Spacing, colorWithAlpha } from '../theme';
import {
  type DealTaskSection,
  type WorkTask,
  fetchMyProductionTasks,
  groupTasksByDeal,
  isTaskDone,
  isTaskInProgress,
  isTaskPending,
  nextTaskStatus,
  statusPillLabel,
  updateWorkTaskStatus,
} from '../lib/workTasksApi';

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';

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
  const { openProjectDetail } = useRootNavigation();
  const userId = user?.id || user?.userId || '';
  const userName = user?.full_name || user?.fullName || 'Bạn';

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const rows = await fetchMyProductionTasks(userId);
      setTasks(rows);
    } catch (e) {
      setError(formatApiError(e));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (userId) {
        const rows = await fetchMyProductionTasks(userId);
        setTasks(rows);
        setError(null);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useProductionRealtime({ onRefresh: onRefresh, enabled: Boolean(userId) });

  const stats = useMemo(
    () => ({
      total: tasks.length,
      inProgress: tasks.filter((t) => isTaskInProgress(t.status)).length,
      done: tasks.filter((t) => isTaskDone(t.status)).length,
    }),
    [tasks],
  );

  const sections = useMemo(() => {
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
  }, [tasks, filter]);

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
        screenTitle: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.3 },
        userName: { color: colors.textMuted, fontSize: 14, marginTop: 4, fontWeight: '600' },
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
        statValue: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
        statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600' },
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
        <Text style={styles.screenTitle}>Công việc</Text>
        <Text style={styles.userName}>{userName}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.total}</Text>
          <Text style={styles.statLabel}>Tổng</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.inProgress}</Text>
          <Text style={styles.statLabel}>Đang làm</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>{stats.done}</Text>
          <Text style={styles.statLabel}>Hoàn thành</Text>
        </View>
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
  );
}
