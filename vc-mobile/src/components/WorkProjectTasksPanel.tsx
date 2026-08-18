import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { REALTIME_TASK } from '../lib/realtimeModes';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
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
  uploadWorkTaskFile,
  workTaskFocusCrmId,
  type DealTaskSection,
  type WorkTask,
  WORK_TASKS_PAGE_SIZE,
} from '../lib/workTasksApi';
import { filterVcAreaTabTasks, filterVcLogisticsUiTasks } from '../lib/projectDetailApi';
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
  /** Lọc công ty (logistics) — truyền xuống overview API. */
  companyId?: string | null;
  /** Lọc nhân viên: null/undefined = tất cả (khi được phép); có id = theo người. */
  assigneeId?: string | null;
  /** Mở sẵn section deal + làm nổi bật task (từ Tổng quan). */
  focusLeadId?: string | null;
  focusTaskId?: string | null;
  /** Deep-link lọc trạng thái (vd. overdue). */
  initialStatusFilter?: 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue' | null;
};

export default function WorkProjectTasksPanel({
  ListHeaderComponent,
  contentPaddingBottom = 24,
  companyId = null,
  assigneeId = null,
  focusLeadId = null,
  focusTaskId = null,
  initialStatusFilter = null,
}: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { openProjectDetail } = useRootNavigation();
  const userId = user?.id || user?.userId || '';
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  /** Section đóng mặc định — chỉ lưu leadId đang mở. */
  const [expandedLeadIds, setExpandedLeadIds] = useState<Record<string, boolean>>({});
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (!initialStatusFilter) return;
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  const load = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    setError(null);
    try {
      const page = await fetchLogisticsWorkTasksPage({
        assigneeId: assigneeId || null,
        companyId: companyId || null,
        limit: WORK_TASKS_PAGE_SIZE * 4,
      });
      if (seq !== loadSeqRef.current) return;
      // Khớp tab Công việc trong chi tiết deal (chỉ vc_* + workshop).
      const aligned = filterVcLogisticsUiTasks(page.tasks) as WorkTask[];
      setTasks(aligned.filter((t) => t.id && t.lead_id));
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(formatApiError(e));
      setTasks([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [userId, assigneeId, companyId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const lead = focusLeadId ? String(focusLeadId) : '';
    if (!lead) return;
    setExpandedLeadIds((prev) => ({ ...prev, [lead]: true }));
  }, [focusLeadId]);

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
    modes: REALTIME_TASK,
  });

  const filtered = useMemo(() => {
    // Luôn lọc Vận chuyển — khớp chi tiết deal (tab mặc định), không hiện chip khu vực.
    const byArea = filterVcAreaTabTasks(tasks, 'shipping', []) as WorkTask[];
    return byArea.filter((t) => {
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
      if (!expandedLeadIds[section.leadId]) continue;
      for (const task of section.tasks) {
        rows.push({ kind: 'task', key: `t-${task.id}`, task, section });
      }
    }
    return rows;
  }, [sections, expandedLeadIds]);

  const stats = useMemo(() => {
    const base = filterVcAreaTabTasks(tasks, 'shipping', []) as WorkTask[];
    return {
      pending: base.filter((t) => isTaskPending(String(t.status))).length,
      inProgress: base.filter((t) => isTaskInProgress(String(t.status))).length,
      done: base.filter((t) => isTaskDone(String(t.status))).length,
      overdue: base.filter((t) => isTaskOverdue(t)).length,
    };
  }, [tasks]);

  const toggleSection = (leadId: string) => {
    setExpandedLeadIds((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
  };

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

  const bumpFileCount = (taskId: string) => {
    setTasks((prev) => prev.map((t) => (
      String(t.id) === String(taskId)
        ? {
            ...t,
            file_count: (t.file_count ?? 0) + 1,
            attachment_count: (t.attachment_count ?? 0) + 1,
          }
        : t
    )));
  };

  const uploadMedia = async (
    task: WorkTask,
    file: { uri: string; name: string; mime: string },
    successMsg: string,
  ) => {
    if (updatingId) return;
    setUpdatingId(String(task.id));
    try {
      await uploadWorkTaskFile(task, file);
      bumpFileCount(String(task.id));
      Alert.alert('Đã đính kèm', successMsg);
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setUpdatingId(null);
    }
  };

  const capturePhoto = async (task: WorkTask) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền camera', 'Cần quyền camera để chụp ảnh.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    await uploadMedia(
      task,
      {
        uri: a.uri,
        name: a.fileName || `photo_${Date.now()}.jpg`,
        mime: a.mimeType || 'image/jpeg',
      },
      'Ảnh đã đính kèm vào nhiệm vụ.',
    );
  };

  const captureVideo = async (task: WorkTask) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền camera', 'Cần quyền camera để quay video.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 120,
      quality: 0.7,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    await uploadMedia(
      task,
      {
        uri: a.uri,
        name: a.fileName || `video_${Date.now()}.mp4`,
        mime: a.mimeType || 'video/mp4',
      },
      'Video đã đính kèm vào nhiệm vụ.',
    );
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
          const expanded = !!expandedLeadIds[s.leadId];
          return (
            <View style={styles.sectionCard}>
              <TapHighlight style={styles.sectionHead} onPress={() => toggleSection(s.leadId)}>
                <Ionicons
                  name={expanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.textMuted}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sectionTitle} numberOfLines={1}>
                    {s.code ? `${s.code} · ` : ''}{s.title || 'Dự án'}
                  </Text>
                  <Text style={styles.sectionMeta}>
                    {open}/{s.tasks.length} còn lại
                    {s.customerName ? ` · ${s.customerName}` : ''}
                    {!expanded ? ' · chạm để mở' : ''}
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
              </TapHighlight>
            </View>
          );
        }

        const task = item.task;
        const st = String(task.status || 'pending');
        const done = isTaskDone(st);
        const overdue = isTaskOverdue(task);
        const due = taskDueIso(task);
        const busy = updatingId === String(task.id);
        const fileCount = task.file_count ?? task.attachment_count ?? 0;
        const focused = Boolean(
          focusTaskId
          && (String(workTaskFocusCrmId(task) || '') === String(focusTaskId)
            || String(task.id) === String(focusTaskId)),
        );

        return (
          <View style={[styles.card, overdue && styles.cardOverdue, focused && styles.cardFocus]}>
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
                {fileCount > 0 ? (
                  <View style={styles.fileBadge}>
                    <Ionicons name="attach" size={12} color={colors.textMuted} />
                    <Text style={styles.metaTxt}>{fileCount}</Text>
                  </View>
                ) : null}
              </View>
            </TapHighlight>

            <View style={styles.mediaRow}>
              <TapHighlight
                style={styles.mediaBtn}
                disabled={busy}
                onPress={() => void capturePhoto(task)}
              >
                <Ionicons name="camera" size={16} color={colors.primary} />
                <Text style={styles.mediaBtnTxt}>Chụp</Text>
              </TapHighlight>
              <TapHighlight
                style={[styles.mediaBtn, styles.mediaBtnAlt]}
                disabled={busy}
                onPress={() => void captureVideo(task)}
              >
                <Ionicons name="videocam" size={16} color={colors.text} />
                <Text style={styles.mediaBtnTxtAlt}>Quay</Text>
              </TapHighlight>
              <TapHighlight
                style={styles.openBtn}
                onPress={() => openTask(task, item.section)}
              >
                <Ionicons name="open-outline" size={15} color={colors.primary} />
                <Text style={styles.openBtnTxt}>Mở</Text>
              </TapHighlight>
            </View>

            <View style={styles.quickRow}>
              {quickActions(task).map((act) => (
                <Pressable
                  key={act.key}
                  style={styles.quickBtn}
                  disabled={busy}
                  onPress={() => void applyStatus(task, act.key)}
                >
                  {busy ? (
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
    sectionCard: {
      marginHorizontal: Spacing.lg,
      marginTop: 8,
      marginBottom: 4,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
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
    cardFocus: {
      borderColor: colors.primary,
      backgroundColor: colorWithAlpha(colors.primary, 0.08),
    },
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
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radii.full,
      backgroundColor: colors.cardAlt,
    },
    statusPillTxt: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
    metaTxt: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    fileBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    mediaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    mediaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.md,
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.primary, 0.28),
    },
    mediaBtnAlt: {
      backgroundColor: colors.cardAlt,
      borderColor: colors.border,
    },
    mediaBtnTxt: { fontSize: 12, fontWeight: '700', color: colors.primary },
    mediaBtnTxtAlt: { fontSize: 12, fontWeight: '700', color: colors.text },
    openBtn: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    openBtnTxt: { fontSize: 12, fontWeight: '700', color: colors.primary },
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    quickBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardAlt,
      minHeight: 36,
    },
    quickBtnTxt: { fontSize: 12, fontWeight: '700', color: colors.text },
  });
}
