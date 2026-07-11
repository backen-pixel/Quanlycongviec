import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionPipelineStepper from '../components/projectDetail/ProductionPipelineStepper';
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
  taskDeadline,
} from '../lib/projectDetailApi';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { formatMoneyAmount, Radii, Spacing, getTaskProgressColor } from '../theme';
import type { CrmTask, ProductionProjectDetail, ProjectActivity } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>;
type TabKey = 'tasks' | 'documents' | 'drive' | 'info' | 'team' | 'schedule';

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ProjectDetailScreen({ route, navigation }: Props) {
  const { projectId } = route.params;
  const { colors } = useTheme();
  const { joinProjectRoom, leaveProjectRoom } = useNotifications();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('tasks');
  const [project, setProject] = useState<ProductionProjectDetail | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [dealId, setDealId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const detail = await fetchProductionProjectDetail(projectId);
      setProject(detail);
      let resolvedDealId = detail.crmDeals?.[0]?.id || null;
      if (!resolvedDealId) resolvedDealId = await fetchDealIdForProject(projectId);
      setDealId(resolvedDealId);
      const [taskRows, actRows] = await Promise.all([
        resolvedDealId ? fetchCrmDealTasks(resolvedDealId) : Promise.resolve([]),
        fetchProjectActivities(projectId),
      ]);
      setTasks(taskRows);
      setActivities(actRows);
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
        scheduleItem: {
          backgroundColor: colors.card,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          marginBottom: 8,
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
        <ScrollView
          scrollEnabled={tab === 'tasks' || tab === 'info' || tab === 'schedule'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: tab === 'documents' || tab === 'drive' || tab === 'team' ? 0 : insets.bottom + 24 }}
          nestedScrollEnabled
        >
          <View style={styles.content}>
          <ProductionPipelineStepper
            stages={project?.vcKanbanStages || project?.sxKanbanStages || []}
            currentStageId={project?.vc_kanban_column_id}
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
            <Text style={styles.progressLabel}>Tiến độ lắp đặt</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%`, backgroundColor: progressColor }]} />
            </View>
            <Text style={[styles.progressPct, { color: progressColor }]}>{progress}%</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
          contentContainerStyle={styles.tabsInner}
        >
          {([
            ['tasks', `Công việc${taskTotal ? ` (${taskTotal})` : ''}`],
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
              <Text style={styles.empty}>Chưa có nhiệm vụ VC — đồng bộ từ web khi deal có bộ mẫu vận chuyển lắp đặt.</Text>
            )
          )}

          {tab === 'info' && project && (
            <View style={styles.infoCard}>
              {[
                ['Khách hàng', project.customer?.full_name || project.customer_name || '—'],
                ['Điện thoại', project.customer?.phone || project.customer_phone || '—'],
                ['Công ty', project.company?.short_name || project.company?.name || project.company_name || '—'],
                ['Loại xưởng', project.workshop_type?.name || project.workshop_type_name || '—'],
                ['Vận chuyển (VC)', project.logistics_person?.full_name || project.logistics_person_name || '—'],
                ['Lắp đặt (LĐ)', project.installer_person?.full_name || project.installer_person_name || '—'],
                ['Hạn dự án', formatDate(project.deadline) || '—'],
                ['Mô tả', project.description?.trim() || project.notes?.trim() || '—'],
              ].map(([label, value]) => (
                <View key={label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}

          {tab === 'schedule' && (
            <>
              {project?.deadline ? (
                <View style={styles.scheduleItem}>
                  <Text style={styles.infoLabel}>Hạn dự án</Text>
                  <Text style={styles.infoValue}>{formatDate(project.deadline)}</Text>
                </View>
              ) : null}
              {tasks.filter((t) => taskDeadline(t)).map((t) => (
                <View key={t.id} style={styles.scheduleItem}>
                  <Text style={styles.infoLabel}>{formatDate(taskDeadline(t))}</Text>
                  <Text style={styles.infoValue}>{t.title}</Text>
                </View>
              ))}
              {activities.slice(0, 10).map((a) => (
                <View key={a.id} style={styles.scheduleItem}>
                  <Text style={styles.infoLabel}>{formatDate(a.created_at)} · Hoạt động</Text>
                  <Text style={styles.infoValue}>{a.title || a.content || '—'}</Text>
                </View>
              ))}
              {!project?.deadline && !tasks.some((t) => taskDeadline(t)) && !activities.length ? (
                <Text style={styles.empty}>Chưa có lịch hẹn</Text>
              ) : null}
            </>
          )}
        </View>
        </ScrollView>

        {tab === 'documents' ? (
          <View style={{ flex: 1, minHeight: 320 }}>
            <ProjectDocumentsTab
              projectId={projectId}
              dealId={dealId}
              sharedDocuments={project?.sharedDocuments}
            />
          </View>
        ) : null}

        {tab === 'drive' ? (
          <View style={{ flex: 1, minHeight: 320 }}>
            <ProjectDriveTab projectId={projectId} />
          </View>
        ) : null}

        {tab === 'team' && project ? (
          <View style={{ flex: 1, minHeight: 320 }}>
            <ProjectMembersTab project={project} dealId={dealId} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
