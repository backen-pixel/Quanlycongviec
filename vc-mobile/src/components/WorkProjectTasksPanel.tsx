import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  canViewTeamWork,
  fetchLogisticsWorkTasksPage,
  formatTaskDeadline,
  groupTasksByDeal,
  isTaskDone,
  isTaskInProgress,
  isTaskOverdue,
  isTaskPending,
  isWorkTaskWorkshop,
  statusPillLabel,
  taskDueIso,
  updateWorkTaskStatus,
  workTaskFocusCrmId,
  type DealTaskSection,
  type WorkTask,
  WORK_TASKS_PAGE_SIZE,
} from '../lib/workTasksApi';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';
import TapHighlight from './TapHighlight';

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';

const STATUS_CHIPS: {
  key: StatusFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'Tất cả', icon: 'list-outline' },
  { key: 'pending', label: 'Chưa', icon: 'time-outline' },
  { key: 'in_progress', label: 'Đang', icon: 'play-outline' },
  { key: 'completed', label: 'Xong', icon: 'checkmark-circle-outline' },
  { key: 'overdue', label: 'Quá hạn', icon: 'alert-circle-outline' },
];

function statusColor(status: string, colors: AppColors): string {
  if (isTaskDone(status)) return colors.success;
  if (isTaskInProgress(status)) return colors.primary;
  return colors.warning;
}

type ListRow =
  | { kind: 'section'; key: string; section: DealTaskSection }
  | { kind: 'task'; key: string; task: WorkTask; section: DealTaskSection };

type Props = {
  ListHeaderComponent?: React.ReactElement | null;
  contentPaddingBottom?: number;
};

export default function WorkProjectTasksPanel({
  ListHeaderComponent,
  contentPaddingBottom = 24,
}: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { openProjectDetail } = useRootNavigation();
  const userId = user?.id || user?.userId || '';
  const canTeam = canViewTeamWork(user);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mineOnly, setMineOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const assigneeId = mineOnly || !canTeam ? userId : undefined;
      const page = await fetchLogisticsWorkTasksPage({
        assigneeId: assigneeId || null,
        limit: WORK_TASKS_PAGE_SIZE * 4,
      });
      setTasks(page.tasks);
    } catch (e) {
      setError(formatApiError(e));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [userId, mineOnly, canTeam]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

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
    enabled: Boolean(userId),
    modes: ['task'],
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const st = String(t.status || 'pending');
      if (statusFilter === 'pending') return isTaskPending(st);
      if (statusFilter === 'in_progress') return isTaskInProgress(st);
      if (statusFilter === 'completed') return isTaskDone(st);
      if (statusFilter === 'overdue') return isTaskOverdue(t);
      return true;
    });
  }, [tasks, statusFilter]);

  const sections = useMemo(() => groupTasksByDeal(filtered), [filtered]);

  const flatRows = useMemo(() => {
    const rows: ListRow[] = [];
    for (const section of sections) {
      rows.push({ kind: 'section', key: `s-${section.leadId}`, section });
      for (const task of section.tasks) {
        rows.push({ kind: 'task', key: `t-${task.id}`, task, section });
      }
    }
    return rows;
  }, [sections]);

  const stats = useMemo(() => ({
    pending: tasks.filter((t) => isTaskPending(String(t.status))).length,
    inProgress: tasks.filter((t) => isTaskInProgress(String(t.status))).length,
    done: tasks.filter((t) => isTaskDone(String(t.status))).length,
    overdue: tasks.filter((t) => isTaskOverdue(t)).length,
  }), [tasks]);

  const openTask = (task: WorkTask, section: DealTaskSection) => {
    const projectId = section.projectId || task.lead?.project_id;
    if (!projectId) {
      Alert.alert('Thiếu dự án', 'Nhiệm vụ này chưa gắn dự án VC.');
      return;
    }
    openProjectDetail(String(projectId), {
      focusTaskId: workTaskFocusCrmId(task),
      initialTab: 'tasks',
    });
  };

  const applyStatus = async (task: WorkTask, next: string) => {
    if (updatingId || String(task.status) === next) return;
    const id = String(task.id);
    setUpdatingId(id);
    const prev = tasks;
    setTasks((p) => p.map((t) => (String(t.id) === id ? { ...t, status: next } : t)));
    try {
      await updateWorkTaskStatus(task.lead_id, id, next, {
        workshop: isWorkTaskWorkshop(task),
      });
    } catch (e) {
      setTasks(prev);
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setUpdatingId(null);
    }
  };

  const quickActions = (task: WorkTask) => {
    const st = String(task.status || 'pending');
    if (isTaskDone(st)) return [{ key: 'pending', label: 'Mở lại' }];
    if (isTaskInProgress(st)) {
      return [
        { key: 'completed', label: 'Xong' },
        { key: 'pending', label: 'Mở lại' },
      ];
    }
    return [
      { key: 'in_progress', label: 'Đang làm' },
      { key: 'completed', label: 'Xong' },
    ];
  };

  const panelHeader = (
    <View>
      {ListHeaderComponent}
      <View style={styles.scopeRow}>
        {canTeam ? (
          <TapHighlight
            style={[styles.scopeChip, mineOnly && styles.scopeChipActive]}
            onPress={() => setMineOnly((v) => !v)}
          >
            <Text style={[styles.scopeChipTxt, mineOnly && styles.scopeChipTxtActive]}>
              {mineOnly ? 'Của tôi' : 'Tất cả NV'}
            </Text>
          </TapHighlight>
        ) : (
          <View style={styles.scopeChip}>
            <Text style={styles.scopeChipTxt}>Của tôi</Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {STATUS_CHIPS.map((chip) => {
          const active = statusFilter === chip.key;
          return (
            <Pressable
              key={chip.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStatusFilter(chip.key)}
            >
              <Ionicons
                name={chip.icon}
                size={14}
                color={active ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.danger }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Chưa</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.inProgress}</Text>
          <Text style={styles.statLabel}>Đang</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>{stats.done}</Text>
          <Text style={styles.statLabel}>Xong</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.danger }]}>{stats.overdue}</Text>
          <Text style={styles.statLabel}>Quá hạn</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  if (loading && !tasks.length) {
    return (
      <View style={styles.center}>
        {panelHeader}
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <FlatList
      data={flatRows}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={panelHeader}
      contentContainerStyle={{ paddingBottom: contentPaddingBottom, flexGrow: 1 }}
      refreshControl={(
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
      )}
      ListEmptyComponent={(
        <View style={styles.empty}>
          <Ionicons name="checkbox-outline" size={36} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>Chưa có nhiệm vụ dự án</Text>
          <Text style={styles.emptySub}>
            Nhiệm vụ VC/LĐ trong chi tiết dự án sẽ hiện tại đây.
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        if (item.kind === 'section') {
          const s = item.section;
          const open = s.tasks.filter((t) => !isTaskDone(String(t.status))).length;
          return (
            <View style={styles.sectionHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionTitle} numberOfLines={1}>
                  {s.code ? `${s.code} · ` : ''}{s.title || 'Dự án'}
                </Text>
                <Text style={styles.sectionMeta}>
                  {open}/{s.tasks.length} còn lại
                  {s.customerName ? ` · ${s.customerName}` : ''}
                </Text>
              </View>
              {s.projectId ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => openProjectDetail(String(s.projectId), { initialTab: 'tasks' })}
                >
                  <Ionicons name="open-outline" size={18} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          );
        }

        const task = item.task;
        const st = String(task.status || 'pending');
        const done = isTaskDone(st);
        const overdue = isTaskOverdue(task);
        const due = taskDueIso(task);

        return (
          <View style={[styles.card, overdue && styles.cardOverdue]}>
            <TapHighlight onPress={() => openTask(task, item.section)}>
              <View style={styles.cardTop}>
                <View style={[styles.dot, { backgroundColor: statusColor(st, colors) }]} />
                <Text style={[styles.cardTitle, done && styles.doneTxt]} numberOfLines={2}>
                  {task.title}
                </Text>
                {overdue ? (
                  <View style={styles.overduePill}>
                    <Text style={styles.overduePillTxt}>Quá hạn</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.metaRow}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillTxt}>{statusPillLabel(st)}</Text>
                </View>
                <Text style={[styles.metaTxt, overdue && { color: colors.danger }]}>
                  {formatTaskDeadline(due)}
                </Text>
                {isWorkTaskWorkshop(task) ? (
                  <Text style={styles.wsTag}>Xưởng</Text>
                ) : null}
              </View>
              <Text style={styles.tapHint}>Mở trong chi tiết dự án</Text>
            </TapHighlight>
            <View style={styles.quickRow}>
              {quickActions(task).map((act) => (
                <Pressable
                  key={act.key}
                  style={styles.quickBtn}
                  disabled={updatingId === String(task.id)}
                  onPress={() => void applyStatus(task, act.key)}
                >
                  {updatingId === String(task.id) ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.quickBtnTxt}>{act.label}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        );
      }}
    />
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    center: { flex: 1 },
    scopeRow: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.lg,
      marginBottom: 8,
      gap: 8,
    },
    scopeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.full,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scopeChipActive: {
      borderColor: colorWithAlpha(colors.primary, 0.45),
      backgroundColor: colors.primarySoft,
    },
    scopeChipTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    scopeChipTxtActive: { color: colors.primary },
    chipScroll: { flexGrow: 0, marginBottom: 8 },
    chipRow: { paddingHorizontal: Spacing.lg, gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 32,
      paddingHorizontal: 10,
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
    },
    chipTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    chipTxtActive: { color: colors.primary },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: Spacing.lg,
      marginBottom: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      alignItems: 'center',
    },
    statValue: { fontSize: 16, fontWeight: '800' },
    statLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
    errorBox: {
      marginHorizontal: Spacing.lg,
      marginBottom: 8,
      padding: 10,
      borderRadius: Radii.md,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '800', color: colors.text },
    emptySub: { marginTop: 4, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: Spacing.lg,
      paddingTop: 12,
      paddingBottom: 6,
    },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
    sectionMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
    card: {
      marginHorizontal: Spacing.lg,
      marginBottom: 8,
      padding: 12,
      borderRadius: Radii.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardOverdue: { borderColor: colorWithAlpha(colors.danger, 0.45) },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
    doneTxt: { textDecorationLine: 'line-through', color: colors.textMuted },
    overduePill: {
      backgroundColor: colors.dangerSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radii.sm,
    },
    overduePillTxt: { fontSize: 10, fontWeight: '800', color: colors.danger },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
    statusPill: {
      backgroundColor: colors.bg,
      borderRadius: Radii.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusPillTxt: { fontSize: 11, fontWeight: '700', color: colors.text },
    metaTxt: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
    wsTag: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radii.sm,
      overflow: 'hidden',
    },
    tapHint: { marginTop: 6, fontSize: 11, color: colors.textFaint, fontWeight: '600' },
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    quickBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: Radii.sm,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.primary, 0.25),
      minHeight: 36,
    },
    quickBtnTxt: { fontSize: 12, fontWeight: '800', color: colors.primary },
  });
}
