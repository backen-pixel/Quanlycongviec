import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionPipelineStepper from '../components/projectDetail/ProductionPipelineStepper';
import ProjectCrmTaskRow from '../components/projectDetail/ProjectCrmTaskRow';
import ProjectDocumentsTab from '../components/projectDetail/ProjectDocumentsTab';
import ProjectDriveTab from '../components/projectDetail/ProjectDriveTab';
import ProjectMembersTab from '../components/projectDetail/ProjectMembersTab';
import ProjectSharedWorkspaceTab from '../components/projectDetail/ProjectSharedWorkspaceTab';
import ProjectCommentModal from '../components/ProjectCommentModal';
import TapHighlight from '../components/TapHighlight';
import { formatApiError } from '../api/client';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import {
  calcCrmProductionTaskProgress,
  createLogisticsWorkshopTask,
  createCrmLogisticsTask,
  fetchCrmDealTasks,
  fetchDealIdForProject,
  fetchLeadTaskDocuments,
  fetchLogisticsWorkshopTasks,
  fetchProductionProjectDetail,
  fetchProjectActivities,
  fetchProjectDocuments,
  fetchProjectTaskFiles,
  fetchUsersForAssign,
  filterVcAreaTabTasks,
  filterVcLogisticsUiTasks,
  filterVcStagesByAreaTab,
  groupCrmTasksByStage,
  isCrmProductionTaskDone,
  isInstallLogisticsPipelineStage,
  resolveVcTaskPipelineStageId,
  taskDeadline,
  updateCrmTask,
  updateWorkshopTask,
} from '../lib/projectDetailApi';
import {
  fetchDealCommentIndex,
  fetchProjectCommentIndex,
} from '../lib/logisticsApi';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { formatMoneyAmount, Radii, Spacing, getTaskProgressColor } from '../theme';
import type { CrmTask, PersonRef, ProductionProjectDetail, ProjectActivity } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>;
type TabKey = 'tasks' | 'shared-workspace' | 'comments' | 'documents' | 'drive' | 'info' | 'team' | 'schedule';
type VcAreaTab = 'shipping' | 'install' | 'all';

type TaskStageGroup = ReturnType<typeof groupCrmTasksByStage>[number];

const VALID_TABS: TabKey[] = [
  'tasks', 'shared-workspace', 'comments', 'documents', 'drive', 'info', 'team', 'schedule',
];

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ProjectDetailScreen({ route, navigation }: Props) {
  const { projectId, initialTab, focusTaskId: focusTaskIdParam } = route.params;
  const incomingFocusId = focusTaskIdParam ? String(focusTaskIdParam) : '';
  const [highlightTaskId, setHighlightTaskId] = useState(incomingFocusId);
  const { colors } = useTheme();
  const { joinProjectRoom, leaveProjectRoom, joinLeadRoom, leaveLeadRoom } = useNotifications();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>(() => {
    const t = String(initialTab || (incomingFocusId ? 'tasks' : '')).trim() as TabKey;
    return VALID_TABS.includes(t) ? t : 'tasks';
  });
  const [project, setProject] = useState<ProductionProjectDetail | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [vcAreaTab, setVcAreaTab] = useState<VcAreaTab>('shipping');
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [showAddStageId, setShowAddStageId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState('');
  const [assignUsers, setAssignUsers] = useState<PersonRef[]>([]);
  const [addingTask, setAddingTask] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dealId, setDealId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const didApplyFocusRef = useRef('');

  useEffect(() => {
    if (!incomingFocusId) return;
    setHighlightTaskId(incomingFocusId);
    setTab('tasks');
    didApplyFocusRef.current = '';
    navigation.setParams({ focusTaskId: undefined });
  }, [incomingFocusId, navigation]);

  useEffect(() => {
    if (!highlightTaskId) return undefined;
    const t = setTimeout(() => setHighlightTaskId(''), 4500);
    return () => clearTimeout(t);
  }, [highlightTaskId]);

  useEffect(() => {
    setHighlightTaskId('');
    didApplyFocusRef.current = '';
  }, [projectId]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const detail = await fetchProductionProjectDetail(projectId);
      setProject(detail);
      let resolvedDealId = detail.crmDeals?.[0]?.id || null;
      if (!resolvedDealId) resolvedDealId = await fetchDealIdForProject(projectId);
      setDealId(resolvedDealId);
      const ownerCompanyId = detail.company_id || detail.company?.id || null;
      const sharedDocCount = Array.isArray(detail.sharedDocuments) ? detail.sharedDocuments.length : 0;
      const [crmTasks, workshopTasks, actRows, commentMeta, documentsMeta] = await Promise.all([
        resolvedDealId
          ? fetchCrmDealTasks(resolvedDealId, { ownerCompanyId })
          : Promise.resolve([]),
        // Chỉ dùng khi không có deal — khớp web WorkshopProjectTasksPanel
        resolvedDealId ? Promise.resolve([]) : fetchLogisticsWorkshopTasks(projectId),
        fetchProjectActivities(projectId),
        (async () => {
          try {
            if (resolvedDealId) {
              const idx = await fetchDealCommentIndex([resolvedDealId]);
              const hit = idx[resolvedDealId] || idx[String(resolvedDealId)];
              return Number(hit?.count) || 0;
            }
            const idx = await fetchProjectCommentIndex([projectId]);
            const hit = idx[projectId] || idx[String(projectId)];
            return Number(hit?.count) || 0;
          } catch {
            return 0;
          }
        })(),
        // Khớp tab Tài liệu: CRM shared + tài liệu dự án + file NV + tài liệu NV CRM
        (async () => {
          try {
            const [wDocs, tFiles, crmTaskDocs] = await Promise.all([
              fetchProjectDocuments(projectId),
              fetchProjectTaskFiles(projectId),
              resolvedDealId ? fetchLeadTaskDocuments(resolvedDealId) : Promise.resolve([]),
            ]);
            return sharedDocCount + wDocs.length + tFiles.length + crmTaskDocs.length;
          } catch {
            return sharedDocCount;
          }
        })(),
      ]);
      // Web: có deal → CRMTasksTab (API đã merge workshop logistics); không deal → bảng tasks.
      if (resolvedDealId) {
        setTasks(filterVcLogisticsUiTasks(crmTasks));
      } else {
        setTasks(workshopTasks);
      }
      setActivities(actRows);
      setCommentCount(commentMeta);
      setDocCount(documentsMeta);
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
    void fetchUsersForAssign()
      .then(setAssignUsers)
      .catch(() => setAssignUsers([]));
  }, []);

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

  const completeStageAll = useCallback((group: TaskStageGroup) => {
    const toComplete = group.tasks.filter((t) => !isCrmProductionTaskDone(t.status));
    if (!toComplete.length) {
      Alert.alert('Xong hết', 'Không còn nhiệm vụ chưa hoàn thành trong giai đoạn này.');
      return;
    }
    Alert.alert(
      'Xong hết',
      `Đánh dấu hoàn thành ${toComplete.length} nhiệm vụ trong «${group.label}»?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xong hết',
          onPress: () => {
            void (async () => {
              const prev = tasks;
              const ids = new Set(toComplete.map((t) => t.id));
              setBulkBusy(true);
              setTasks((p) => p.map((t) => (ids.has(t.id) ? { ...t, status: 'completed' } : t)));
              try {
                await Promise.all(toComplete.map((t) => {
                  const isWs = t.source === 'workshop' || t._workshop_project_task;
                  if (isWs) return updateWorkshopTask(t.id, { status: 'completed' });
                  if (!dealId) return Promise.resolve(t);
                  return updateCrmTask(dealId, t.id, { status: 'completed' });
                }));
                await load(true);
              } catch (e) {
                setTasks(prev);
                Alert.alert('Lỗi', formatApiError(e));
              } finally {
                setBulkBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [dealId, tasks, load]);

  const submitAddTask = useCallback(async (stageId: string, stageLabel: string, bucketSlug?: string | null) => {
    const title = newTaskTitle.trim();
    if (!title) {
      Alert.alert('Thiếu tiêu đề', 'Nhập tên công việc.');
      return;
    }
    setAddingTask(true);
    try {
      const guessed = String(bucketSlug || '').toLowerCase().includes('install')
        ? 'installation'
        : String(bucketSlug || '').toLowerCase().includes('delivery_pending')
          || String(stageLabel || '').toLowerCase().includes('tiếp nhận')
          ? 'delivery_pending'
          : 'shipping';
      let created: CrmTask;
      if (dealId) {
        // Khớp web CRMTasksTab — tạo crm_tasks vc_* (hiện ngay trên API logistics)
        created = await createCrmLogisticsTask(dealId, {
          title,
          priority: newTaskPriority,
          assignee_id: newTaskAssigneeId || null,
          logistics_pipeline_stage_id: stageId,
          order_index: tasks.filter((t) => String(t.logistics_pipeline_stage_id) === String(stageId)).length,
        });
      } else {
        created = await createLogisticsWorkshopTask({
          projectId,
          title,
          priority: newTaskPriority,
          assignee_id: newTaskAssigneeId || null,
          logistics_pipeline_stage_id: stageId,
          guessed_stage_slug: guessed,
        });
      }
      setTasks((prev) => [...prev, created]);
      setNewTaskTitle('');
      setNewTaskAssigneeId('');
      setNewTaskPriority('medium');
      setShowAddStageId(null);
      setExpandedStages((p) => ({ ...p, [stageId]: true }));
      await load(true);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setAddingTask(false);
    }
  }, [newTaskTitle, newTaskPriority, newTaskAssigneeId, projectId, dealId, tasks, load]);

  const vcStages = project?.vcKanbanStages || project?.sxKanbanStages || [];
  const areaStages = useMemo(
    () => filterVcStagesByAreaTab(vcStages, vcAreaTab),
    [vcStages, vcAreaTab],
  );
  const visibleTasks = useMemo(
    () => filterVcAreaTabTasks(tasks, vcAreaTab, vcStages),
    [tasks, vcAreaTab, vcStages],
  );
  const taskGroups = useMemo(
    () => groupCrmTasksByStage(visibleTasks, areaStages, { includeEmpty: areaStages.length > 0 }),
    [visibleTasks, areaStages],
  );

  // Focus từ Work/Overview: chọn đúng tab VC, expand stage chứa task, highlight ~4s.
  useEffect(() => {
    if (!highlightTaskId || loading || !tasks.length) return;
    if (didApplyFocusRef.current === String(highlightTaskId)) return;
    const fid = String(highlightTaskId);
    const focused = tasks.find((t) => String(t.id) === fid);
    if (!focused) return;
    didApplyFocusRef.current = fid;

    const stages = project?.vcKanbanStages || project?.sxKanbanStages || [];
    const sid = resolveVcTaskPipelineStageId(focused, stages);
    let area: VcAreaTab = 'shipping';
    if (sid && stages.length) {
      const stage = stages.find((s) => String(s.id) === String(sid));
      if (stage && isInstallLogisticsPipelineStage(stage)) area = 'install';
    } else {
      const meta = focused.metadata && typeof focused.metadata === 'object' ? focused.metadata : {};
      const guessed = String((meta as { guessed_stage_slug?: string }).guessed_stage_slug || '').toLowerCase();
      const slug = String(focused.stage_slug || '').toLowerCase();
      if (guessed.includes('install') || slug.includes('install')) area = 'install';
    }
    setVcAreaTab(area);

    const groupKey = sid || '_other';
    setExpandedStages((p) => ({ ...p, [groupKey]: true }));
  }, [highlightTaskId, loading, tasks, project?.vcKanbanStages, project?.sxKanbanStages]);

  const { done: taskDone, total: taskTotal, percent: progress } = useMemo(
    () => calcCrmProductionTaskProgress(
      visibleTasks,
      Number(project?.productionTaskProgress ?? project?.progress ?? 0),
    ),
    [visibleTasks, project?.productionTaskProgress, project?.progress],
  );
  const progressColor = getTaskProgressColor(progress, colors);
  const valueStr = formatMoneyAmount(project?.estimated_value);
  const isFullHeightTab =
    tab === 'comments'
    || tab === 'documents'
    || tab === 'drive'
    || tab === 'team'
    || tab === 'shared-workspace';

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
        tabsInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
        tabBtn: { paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
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
        vcAreaRow: {
          flexDirection: 'row',
          backgroundColor: colors.border,
          borderRadius: Radii.md,
          padding: 3,
          marginBottom: 14,
        },
        vcAreaBtn: {
          flex: 1,
          paddingVertical: 8,
          borderRadius: Radii.sm,
          alignItems: 'center',
        },
        vcAreaBtnActive: { backgroundColor: colors.card },
        vcAreaText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
        vcAreaTextActive: { color: colors.text },
        stageCard: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          overflow: 'hidden',
          marginBottom: 12,
          backgroundColor: colors.card,
        },
        stageHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 10,
          backgroundColor: colors.bg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        stageHeadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
        stageDot: { width: 8, height: 8, borderRadius: 4 },
        stageTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
        stageMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
        doneAllBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: '#059669',
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: Radii.sm,
        },
        doneAllTxt: { color: '#FFF', fontSize: 11, fontWeight: '700' },
        stageBody: { paddingHorizontal: 8, paddingVertical: 8 },
        addTaskBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 8,
          paddingHorizontal: 8,
        },
        addTaskBtnTxt: { color: colors.primary, fontSize: 12, fontWeight: '600' },
        addForm: {
          backgroundColor: colors.primarySoft || '#FFF7ED',
          borderRadius: Radii.sm,
          padding: 10,
          gap: 8,
          marginTop: 4,
        },
        addInput: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.sm,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 14,
          color: colors.text,
          backgroundColor: colors.card,
        },
        addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        chip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft || '#FFF7ED' },
        chipTxt: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
        chipTxtActive: { color: colors.primary },
        addActions: { flexDirection: 'row', gap: 8 },
        addSaveBtn: {
          backgroundColor: colors.primary,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: Radii.sm,
        },
        addSaveTxt: { color: '#FFF', fontSize: 12, fontWeight: '700' },
        addCancelBtn: {
          backgroundColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: Radii.sm,
        },
        addCancelTxt: { color: colors.text, fontSize: 12, fontWeight: '600' },
        stageEmptyHint: {
          fontSize: 12,
          color: colors.textMuted,
          paddingHorizontal: 8,
          paddingVertical: 6,
        },
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

  const tabsBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabs}
      contentContainerStyle={styles.tabsInner}
    >
      {([
        ['tasks', `Công việc${taskTotal ? ` (${taskTotal})` : ''}`],
        ...(dealId ? [['shared-workspace', 'Không gian chung'] as [TabKey, string]] : []),
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

        {tabsBar}

        <View style={{ padding: Spacing.lg }}>
          {tab === 'tasks' && (
            <>
              <View style={styles.vcAreaRow}>
                {([
                  ['shipping', 'Vận chuyển'],
                  ['install', 'Lắp đặt'],
                  ['all', 'Tất cả'],
                ] as [VcAreaTab, string][]).map(([id, label]) => (
                  <TapHighlight
                    key={id}
                    style={[styles.vcAreaBtn, vcAreaTab === id && styles.vcAreaBtnActive]}
                    onPress={() => setVcAreaTab(id)}
                  >
                    <Text style={[styles.vcAreaText, vcAreaTab === id && styles.vcAreaTextActive]}>
                      {label}
                    </Text>
                  </TapHighlight>
                ))}
              </View>
              {taskGroups.length ? taskGroups.map((group) => {
                const expanded = expandedStages[group.key] ?? group.tasks.length > 0;
                const openInGroup = group.openCount ?? group.tasks.filter((t) => !isCrmProductionTaskDone(t.status)).length;
                const doneInGroup = group.doneCount ?? group.tasks.filter((t) => isCrmProductionTaskDone(t.status)).length;
                const stageMeta = areaStages.find((s) => String(s.id) === String(group.key));
                const isAdding = showAddStageId === group.key;
                return (
                  <View key={group.key} style={styles.stageCard}>
                    <View style={styles.stageHeader}>
                      <Pressable
                        style={styles.stageHeadBtn}
                        onPress={() => setExpandedStages((p) => ({
                          ...p,
                          [group.key]: !expanded,
                        }))}
                      >
                        <Ionicons
                          name={expanded ? 'chevron-down' : 'chevron-forward'}
                          size={16}
                          color={colors.textMuted}
                        />
                        {group.color ? (
                          <View style={[styles.stageDot, { backgroundColor: group.color }]} />
                        ) : null}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.stageTitle} numberOfLines={1}>{group.label}</Text>
                          <Text style={styles.stageMeta}>
                            {doneInGroup}/{group.tasks.length} xong
                            {openInGroup ? ` · ${openInGroup} còn lại` : ''}
                          </Text>
                        </View>
                      </Pressable>
                      {openInGroup > 0 ? (
                        <Pressable
                          style={[styles.doneAllBtn, bulkBusy && { opacity: 0.6 }]}
                          disabled={bulkBusy}
                          onPress={() => completeStageAll(group)}
                        >
                          <Ionicons name="checkmark-done-outline" size={14} color="#FFF" />
                          <Text style={styles.doneAllTxt}>Xong hết</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {expanded ? (
                      <View style={styles.stageBody}>
                        {group.tasks.length ? group.tasks.map((task) => (
                          <ProjectCrmTaskRow
                            key={task.id}
                            task={task}
                            dealId={dealId}
                            projectCompanyId={project?.company_id || project?.company?.id || null}
                            highlighted={Boolean(highlightTaskId) && String(task.id) === String(highlightTaskId)}
                            onUpdated={onTaskUpdated}
                            onDeleted={onTaskDeleted}
                          />
                        )) : (
                          <Text style={styles.stageEmptyHint}>Chưa có công việc — thêm việc bên dưới.</Text>
                        )}
                        {isAdding ? (
                          <View style={styles.addForm}>
                            <TextInput
                              style={styles.addInput}
                              placeholder="Tên công việc..."
                              placeholderTextColor={colors.textMuted}
                              value={newTaskTitle}
                              onChangeText={setNewTaskTitle}
                              autoFocus
                            />
                            <View style={styles.addRow}>
                              {(['low', 'medium', 'high'] as const).map((p) => (
                                <Pressable
                                  key={p}
                                  style={[styles.chip, newTaskPriority === p && styles.chipActive]}
                                  onPress={() => setNewTaskPriority(p)}
                                >
                                  <Text style={[styles.chipTxt, newTaskPriority === p && styles.chipTxtActive]}>
                                    {p === 'low' ? 'Thấp' : p === 'high' ? 'Cao' : 'TB'}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                            {assignUsers.length ? (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40 }}>
                                <View style={styles.addRow}>
                                  <Pressable
                                    style={[styles.chip, !newTaskAssigneeId && styles.chipActive]}
                                    onPress={() => setNewTaskAssigneeId('')}
                                  >
                                    <Text style={[styles.chipTxt, !newTaskAssigneeId && styles.chipTxtActive]}>
                                      Chưa giao
                                    </Text>
                                  </Pressable>
                                  {assignUsers.slice(0, 20).map((u) => (
                                    <Pressable
                                      key={String(u.id)}
                                      style={[styles.chip, newTaskAssigneeId === String(u.id) && styles.chipActive]}
                                      onPress={() => setNewTaskAssigneeId(String(u.id))}
                                    >
                                      <Text
                                        style={[
                                          styles.chipTxt,
                                          newTaskAssigneeId === String(u.id) && styles.chipTxtActive,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {u.full_name || 'NV'}
                                      </Text>
                                    </Pressable>
                                  ))}
                                </View>
                              </ScrollView>
                            ) : null}
                            <View style={styles.addActions}>
                              <Pressable
                                style={[styles.addSaveBtn, addingTask && { opacity: 0.6 }]}
                                disabled={addingTask}
                                onPress={() => void submitAddTask(
                                  group.key,
                                  group.label,
                                  stageMeta?.bucket_slug,
                                )}
                              >
                                <Text style={styles.addSaveTxt}>{addingTask ? 'Đang lưu…' : 'Thêm'}</Text>
                              </Pressable>
                              <Pressable
                                style={styles.addCancelBtn}
                                onPress={() => {
                                  setShowAddStageId(null);
                                  setNewTaskTitle('');
                                }}
                              >
                                <Text style={styles.addCancelTxt}>Hủy</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : group.key !== '_other' ? (
                          <Pressable
                            style={styles.addTaskBtn}
                            onPress={() => {
                              setShowAddStageId(group.key);
                              setNewTaskTitle('');
                              setExpandedStages((p) => ({ ...p, [group.key]: true }));
                            }}
                          >
                            <Ionicons name="add" size={14} color={colors.primary} />
                            <Text style={styles.addTaskBtnTxt}>Thêm việc</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              }) : (
                <Text style={styles.empty}>
                  Chưa có cột pipeline VC — kiểm tra cấu hình giai đoạn trên web.
                </Text>
              )}
            </>
          )}

          {tab === 'info' && project && (
            <View style={styles.infoCard}>
              {[
                ['Khách hàng', project.customer?.full_name || project.customer_name || '—'],
                ['Điện thoại', project.customer?.phone || project.customer_phone || '—'],
                ['Công ty', project.company?.short_name || project.company?.name || project.company_name || '—'],
                ['Loại', project.workshop_type?.name || project.workshop_type_name || '—'],
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
        )}

        {tab === 'shared-workspace' && dealId ? (
          <View style={{ flex: 1 }}>
            <ProjectSharedWorkspaceTab
              leadId={dealId}
              companyId={project?.company_id || project?.company?.id || null}
            />
          </View>
        ) : null}

        {tab === 'comments' && project ? (
          <View style={{ flex: 1 }}>
            <ProjectCommentModal
              visible
              embedded
              project={project}
              preferredDealId={dealId}
              onClose={() => {}}
              onPosted={setCommentCount}
            />
          </View>
        ) : null}

        {tab === 'documents' ? (
          <View style={{ flex: 1 }}>
            <ProjectDocumentsTab
              projectId={projectId}
              dealId={dealId}
              sharedDocuments={project?.sharedDocuments}
              onTotalCountChange={setDocCount}
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
