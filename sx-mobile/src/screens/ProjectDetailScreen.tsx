import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionPipelineStepper from '../components/projectDetail/ProductionPipelineStepper';
import ProjectCommentsTab from '../components/projectDetail/ProjectCommentsTab';
import ProjectCrmTaskRow from '../components/projectDetail/ProjectCrmTaskRow';
import ProjectDocumentsTab from '../components/projectDetail/ProjectDocumentsTab';
import ProjectDriveTab from '../components/projectDetail/ProjectDriveTab';
import ProjectMembersTab from '../components/projectDetail/ProjectMembersTab';
import TapHighlight from '../components/TapHighlight';
import { formatApiError } from '../api/client';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import {
  calcCrmProductionTaskProgress,
  fetchCrmDealTasks,
  fetchDealIdForProject,
  fetchProductionProjectDetail,
  fetchProjectActivities,
  groupCrmTasksByStage,
  isCrmProductionTaskDone,
  updateProjectDates,
} from '../lib/projectDetailApi';
import { fetchThreadComments, resolveCommentSource } from '../lib/commentApi';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { formatMoneyAmount, Radii, Spacing, getTaskProgressColor } from '../theme';
import type { CrmTask, ProductionProjectDetail, ProjectActivity } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>;
type TabKey = 'tasks' | 'documents' | 'drive' | 'info' | 'team' | 'schedule' | 'comments';
type EditableDateField = 'order_date' | 'delivery_date' | 'deadline';

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateValue(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export default function ProjectDetailScreen({ route, navigation }: Props) {
  const { projectId } = route.params;
  const { colors } = useTheme();
  const { joinProjectRoom, leaveProjectRoom, joinLeadRoom, leaveLeadRoom } = useNotifications();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('tasks');
  const [project, setProject] = useState<ProductionProjectDetail | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [dealId, setDealId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [editingDateField, setEditingDateField] = useState<EditableDateField | null>(null);
  const [dateDraft, setDateDraft] = useState<Date>(new Date());
  const [dateSaving, setDateSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const detail = await fetchProductionProjectDetail(projectId);
      setProject(detail);
      let resolvedDealId =
        detail.crmDeals?.find((d) => String((d as { type?: string }).type || '') === 'deal')?.id
        || detail.crmDeals?.[0]?.id
        || null;
      if (!resolvedDealId) resolvedDealId = await fetchDealIdForProject(projectId);
      setDealId(resolvedDealId);
      const [taskRows, actRows, commentRows] = await Promise.all([
        resolvedDealId ? fetchCrmDealTasks(resolvedDealId) : Promise.resolve([]),
        fetchProjectActivities(projectId),
        fetchThreadComments(resolveCommentSource(projectId, resolvedDealId)).catch(() => []),
      ]);
      setTasks(taskRows);
      setActivities(actRows);
      setCommentCount(commentRows.length);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    joinProjectRoom(projectId);
    return () => leaveProjectRoom(projectId);
  }, [projectId, joinProjectRoom, leaveProjectRoom]);

  useEffect(() => {
    if (!dealId) return undefined;
    joinLeadRoom(dealId);
    return () => leaveLeadRoom(dealId);
  }, [dealId, joinLeadRoom, leaveLeadRoom]);

  useProductionRealtime({
    projectId,
    dealId,
    onRefresh: () => load(true),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onTaskUpdated = useCallback((updated: CrmTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  }, []);

  const onTaskDeleted = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const openDateEditor = useCallback((field: EditableDateField, current?: string | null) => {
    setDateDraft(parseDateValue(current));
    setEditingDateField(field);
  }, []);

  const cancelDateEditor = useCallback(() => {
    setEditingDateField(null);
  }, []);

  const saveDateField = useCallback(async (field: EditableDateField, value: string | null) => {
    if (!project) return;
    setDateSaving(true);
    try {
      const patch =
        field === 'order_date'
          ? { order_date: value }
          : field === 'delivery_date'
            ? { delivery_date: value }
            : { deadline: value };
      await updateProjectDates(projectId, patch);
      setProject((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        if (field === 'delivery_date') next.production_deadline = value;
        return next;
      });
      setEditingDateField(null);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setDateSaving(false);
    }
  }, [project, projectId]);

  const onDatePickerChange = useCallback((_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      // Android đóng picker ngay; nếu có date thì lưu
      const field = editingDateField;
      setEditingDateField(null);
      if (date && field) void saveDateField(field, toYmd(date));
      return;
    }
    if (date) setDateDraft(date);
  }, [editingDateField, saveDateField]);

  const scheduleMilestones = useMemo(() => {
    if (!project) {
      return [] as Array<{
        key: string;
        label: string;
        date: string | null;
        icon: keyof typeof Ionicons.glyphMap;
        accent: string;
        hint: string;
      }>;
    }
    return [
      {
        key: 'order',
        label: 'Ngày đặt hàng',
        date: project.order_date || null,
        icon: 'cart-outline' as const,
        accent: colors.primary,
        hint: 'Thời điểm khách đặt hàng',
      },
      {
        key: 'delivery',
        label: 'Ngày giao hàng',
        date: project.delivery_date || project.production_deadline || null,
        icon: 'car-outline' as const,
        accent: '#0D9488',
        hint: 'Mốc giao hàng dự kiến',
      },
      {
        key: 'deadline',
        label: 'Hạn dự án',
        date: project.deadline || null,
        icon: 'flag-outline' as const,
        accent: '#D97706',
        hint: 'Hạn hoàn thành dự án',
      },
    ];
  }, [project, colors.primary]);

  /** Nhóm theo quy trình SX — cùng thứ tự web (stage + order_index). */
  const taskGroups = useMemo(() => groupCrmTasksByStage(tasks), [tasks]);
  const { done: taskDone, total: taskTotal, percent: progress } = useMemo(
    () => calcCrmProductionTaskProgress(
      tasks,
      Number(project?.productionTaskProgress ?? project?.progress ?? 0),
    ),
    [tasks, project?.productionTaskProgress, project?.progress],
  );
  const progressColor = getTaskProgressColor(progress, colors);
  const docCount = project?.sharedDocuments?.length ?? 0;
  const valueStr = formatMoneyAmount(project?.estimated_value);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
          gap: 10,
        },
        backBtn: {
          width: 38,
          height: 38,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerBody: { flex: 1, minWidth: 0 },
        code: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
        title: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
        content: { padding: Spacing.lg, gap: 14 },
        statsRow: { flexDirection: 'row', gap: 8 },
        statCard: {
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 10,
          paddingHorizontal: 8,
          alignItems: 'center',
        },
        statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 },
        statValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
        statValueAccent: { color: colors.success },
        progressBox: {
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
        },
        progressLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
        progressTrack: {
          height: 8,
          borderRadius: Radii.full,
          backgroundColor: colors.cardAlt,
          overflow: 'hidden',
        },
        progressFill: { height: '100%', borderRadius: Radii.full },
        progressPct: { color: colors.textFaint, fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'right' },
        tabs: {
          flexGrow: 0,
          flexShrink: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        tabsInner: { flexDirection: 'row', paddingHorizontal: 4 },
        tabBtn: { paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
        tabBtnActive: { borderBottomColor: colors.primary },
        tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
        tabTextActive: { color: colors.primary },
        groupHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          marginTop: 4,
        },
        groupTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
        groupCount: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
        taskRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          marginBottom: 8,
        },
        taskCheck: {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        },
        taskCheckDone: { borderColor: colors.success, backgroundColor: colors.success + '22' },
        taskBody: { flex: 1, minWidth: 0 },
        taskTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
        taskTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
        taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
        taskMetaText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        avatar: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
        infoCard: {
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
          gap: 10,
        },
        infoRow: { gap: 2 },
        infoLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
        infoValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
        infoEditRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        infoEditBody: { flex: 1, minWidth: 0, gap: 2 },
        infoEditHint: { color: colors.primary, fontSize: 11, fontWeight: '700' },
        dateEditorBox: {
          marginTop: 6,
          gap: 8,
          padding: 10,
          borderRadius: Radii.md,
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
        },
        dateEditorActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
        dateBtn: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: Radii.md,
          backgroundColor: colors.primary,
        },
        dateBtnMuted: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        dateBtnDanger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
        dateBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 12 },
        dateBtnTxtMuted: { color: colors.text, fontWeight: '700', fontSize: 12 },
        dateBtnTxtDanger: { color: colors.danger, fontWeight: '800', fontSize: 12 },
        sectionTitle: {
          color: colors.text,
          fontSize: 14,
          fontWeight: '800',
          marginBottom: 8,
          marginTop: 4,
        },
        personRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        personLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', width: 110 },
        personName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
        scheduleCard: {
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        scheduleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 16,
          paddingVertical: 18,
        },
        scheduleRowDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginLeft: 70,
        },
        scheduleIconWrap: {
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        scheduleBody: { flex: 1, minWidth: 0, gap: 4 },
        scheduleLabel: {
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.2,
          textTransform: 'uppercase',
        },
        scheduleDate: {
          color: colors.text,
          fontSize: 20,
          fontWeight: '800',
          letterSpacing: -0.3,
        },
        scheduleDateEmpty: {
          color: colors.textFaint,
          fontSize: 17,
          fontWeight: '700',
        },
        scheduleHint: {
          color: colors.textFaint,
          fontSize: 12,
          fontWeight: '500',
        },
        errBox: {
          margin: Spacing.lg,
          padding: 12,
          borderRadius: Radii.md,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
        },
        errText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
        empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 14 },
      }),
    [colors, insets.top],
  );

  if (loading && !project) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayTitle = project?.crmDeals?.[0]?.title || project?.name || 'Dự án';
  const displayCode = project?.crmDeals?.[0]?.code || project?.code || '';
  const isFullHeightTab = tab === 'comments' || tab === 'documents' || tab === 'drive' || tab === 'team';

  const tabsBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabs}
      contentContainerStyle={styles.tabsInner}
    >
      {([
        ['tasks', `Công việc${taskTotal ? ` (${taskTotal})` : ''}`],
        ['comments', `Bình luận${commentCount ? ` (${commentCount})` : ''}`],
        ['documents', `Tài liệu${docCount ? ` (${docCount})` : ''}`],
        ['drive', 'Drive'],
        ['info', 'Thông tin'],
        ['team', 'Đội ngũ'],
        ['schedule', 'Lịch'],
      ] as [TabKey, string][]).map(([key, label]) => (
        <TapHighlight
          key={key}
          style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
          onPress={() => setTab(key)}
        >
          <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
        </TapHighlight>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TapHighlight>
        <View style={styles.headerBody}>
          <Text style={styles.code}>{displayCode}</Text>
          <Text style={styles.title} numberOfLines={2}>{displayTitle}</Text>
        </View>
      </View>

      {err ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{err}</Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {isFullHeightTab ? tabsBar : null}
        {isFullHeightTab ? null : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          nestedScrollEnabled
        >
          <View style={styles.content}>
          <ProductionPipelineStepper
            stages={project?.sxKanbanStages || []}
            currentStageId={project?.sx_kanban_column_id}
          />

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Công việc</Text>
              <Text style={styles.statValue}>{taskDone}/{taskTotal || project?.task_total || 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hoạt động</Text>
              <Text style={[styles.statValue, styles.statValueAccent]}>{activities.length}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Tài liệu</Text>
              <Text style={styles.statValue}>{docCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Giá trị</Text>
              <Text style={styles.statValue} numberOfLines={1}>{valueStr ? `${valueStr} đ` : '0 đ'}</Text>
            </View>
          </View>

          <View style={styles.progressBox}>
            <Text style={styles.progressLabel}>Tiến độ sản xuất</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%`, backgroundColor: progressColor }]} />
            </View>
            <Text style={[styles.progressPct, { color: progressColor }]}>{progress}%</Text>
          </View>
        </View>

        {tabsBar}

        <View style={{ padding: Spacing.lg }}>
          {tab === 'tasks' && (
            taskGroups.length ? taskGroups.map((group) => {
              const doneInGroup = group.tasks.filter((t) => isCrmProductionTaskDone(t.status)).length;
              return (
                <View key={group.key} style={{ marginBottom: 16 }}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.label}</Text>
                    <Text style={styles.groupCount}>{doneInGroup}/{group.tasks.length}</Text>
                  </View>
                  {group.tasks.map((task) =>
                    dealId ? (
                      <ProjectCrmTaskRow
                        key={task.id}
                        task={task}
                        dealId={dealId}
                        onUpdated={onTaskUpdated}
                        onDeleted={onTaskDeleted}
                      />
                    ) : null,
                  )}
                </View>
              );
            }) : (
              <Text style={styles.empty}>Chưa có nhiệm vụ SX — đồng bộ từ web khi deal có template.</Text>
            )
          )}

          {tab === 'info' && project && (
            <View style={styles.infoCard}>
              {[
                ['Khách hàng', project.customer?.full_name || project.customer_name || '—'],
                ['Điện thoại', project.customer?.phone || project.customer_phone || '—'],
                ['Công ty', project.company?.short_name || project.company?.name || project.company_name || '—'],
                ['Loại xưởng', project.workshop_type?.name || project.workshop_type_name || '—'],
              ].map(([label, value]) => (
                <View key={label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              ))}

              {(
                [
                  { field: 'order_date' as const, label: 'Ngày đặt hàng', value: project.order_date },
                  {
                    field: 'delivery_date' as const,
                    label: 'Ngày giao hàng',
                    value: project.delivery_date || project.production_deadline,
                  },
                  { field: 'deadline' as const, label: 'Hạn dự án', value: project.deadline },
                ] as const
              ).map((row) => (
                <View key={row.field}>
                  <Pressable
                    style={styles.infoEditRow}
                    onPress={() => openDateEditor(row.field, row.value)}
                  >
                    <View style={styles.infoEditBody}>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={styles.infoValue}>{formatDate(row.value) || '—'}</Text>
                      <Text style={styles.infoEditHint}>Chạm để chỉnh sửa</Text>
                    </View>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  </Pressable>
                  {editingDateField === row.field ? (
                    <View style={styles.dateEditorBox}>
                      {(Platform.OS === 'ios' || editingDateField === row.field) ? (
                        <DateTimePicker
                          value={dateDraft}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={onDatePickerChange}
                          locale="vi-VN"
                        />
                      ) : null}
                      {Platform.OS === 'ios' ? (
                        <View style={styles.dateEditorActions}>
                          <Pressable
                            style={[styles.dateBtn, styles.dateBtnDanger]}
                            onPress={() => void saveDateField(row.field, null)}
                            disabled={dateSaving}
                          >
                            <Text style={styles.dateBtnTxtDanger}>Xóa</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.dateBtn, styles.dateBtnMuted]}
                            onPress={cancelDateEditor}
                            disabled={dateSaving}
                          >
                            <Text style={styles.dateBtnTxtMuted}>Huỷ</Text>
                          </Pressable>
                          <Pressable
                            style={styles.dateBtn}
                            onPress={() => void saveDateField(row.field, toYmd(dateDraft))}
                            disabled={dateSaving}
                          >
                            {dateSaving ? (
                              <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                              <Text style={styles.dateBtnTxt}>Lưu</Text>
                            )}
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.dateEditorActions}>
                          <Pressable
                            style={[styles.dateBtn, styles.dateBtnDanger]}
                            onPress={() => void saveDateField(row.field, null)}
                            disabled={dateSaving}
                          >
                            <Text style={styles.dateBtnTxtDanger}>Xóa ngày</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.dateBtn, styles.dateBtnMuted]}
                            onPress={cancelDateEditor}
                          >
                            <Text style={styles.dateBtnTxtMuted}>Đóng</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              ))}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Mô tả</Text>
                <Text style={styles.infoValue}>{project.description?.trim() || project.notes?.trim() || '—'}</Text>
              </View>
            </View>
          )}

          {tab === 'schedule' && (
            <>
              <Text style={styles.sectionTitle}>Mốc thời gian dự án</Text>
              <View style={styles.scheduleCard}>
                {scheduleMilestones.map((m, index) => {
                  const dateText = formatDate(m.date);
                  return (
                    <View key={m.key}>
                      {index > 0 ? <View style={styles.scheduleRowDivider} /> : null}
                      <View style={styles.scheduleRow}>
                        <View style={[styles.scheduleIconWrap, { backgroundColor: `${m.accent}18` }]}>
                          <Ionicons name={m.icon} size={22} color={m.accent} />
                        </View>
                        <View style={styles.scheduleBody}>
                          <Text style={styles.scheduleLabel}>{m.label}</Text>
                          <Text style={dateText ? styles.scheduleDate : styles.scheduleDateEmpty}>
                            {dateText || 'Chưa có'}
                          </Text>
                          <Text style={styles.scheduleHint}>{m.hint}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
        </ScrollView>
        )}

        {tab === 'documents' ? (
          <View style={{ flex: 1 }}>
            <ProjectDocumentsTab
              projectId={projectId}
              dealId={dealId}
              sharedDocuments={project?.sharedDocuments}
            />
          </View>
        ) : null}

        {tab === 'comments' ? (
          <View style={{ flex: 1 }}>
            <ProjectCommentsTab
              projectId={projectId}
              dealId={dealId}
              authorTagUserId={project?.production_person_id}
              onCountChange={setCommentCount}
            />
          </View>
        ) : null}

        {tab === 'drive' ? (
          <View style={{ flex: 1 }}>
            <ProjectDriveTab projectId={projectId} />
          </View>
        ) : null}

        {tab === 'team' && project ? (
          <View style={{ flex: 1 }}>
            <ProjectMembersTab project={project} dealId={dealId} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
