import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type SectionListData,
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
  pickPrimaryCrmDealId,
  updateCrmTask,
  updateProjectDates,
  updateProjectMoney,
  type CrmTaskStageGroup,
} from '../lib/projectDetailApi';
import { fetchThreadComments, resolveCommentSource } from '../lib/commentApi';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { formatMoneyAmount, Radii, Spacing, getTaskProgressColor } from '../theme';
import type { CrmTask, ProductionProjectDetail, ProjectActivity } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>;
type TabKey = 'tasks' | 'documents' | 'drive' | 'info' | 'team' | 'schedule' | 'comments';
type EditableDateField = 'order_date' | 'delivery_date' | 'deadline';
type EditableMoneyField = 'production_value' | 'deposit_amount';

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
  const { projectId, focusTaskId: focusTaskIdParam } = route.params;
  const focusTaskId = focusTaskIdParam ? String(focusTaskIdParam) : '';
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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingMoneyField, setEditingMoneyField] = useState<EditableMoneyField | null>(null);
  const [moneyDraft, setMoneyDraft] = useState('');
  const [moneySaving, setMoneySaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const tasksListRef = useRef<SectionList<CrmTask, CrmTaskStageGroup>>(null);
  const scrollInnerRef = useRef<View>(null);
  const focusTargetRef = useRef<View>(null);
  const didFocusScroll = useRef(false);
  const loadSeqRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (silent = false) => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    const seq = ++loadSeqRef.current;
    const forProjectId = projectId;
    if (!silent) setLoading(true);
    setErr('');
    try {
      const detail = await fetchProductionProjectDetail(forProjectId);
      if (seq !== loadSeqRef.current || ac.signal.aborted) return;
      setProject(detail);

      let resolvedDealId =
        pickPrimaryCrmDealId(detail.crmDeals)
        || null;
      if (!resolvedDealId) resolvedDealId = await fetchDealIdForProject(forProjectId);
      if (seq !== loadSeqRef.current || ac.signal.aborted) return;

      // Activities không phụ thuộc deal — chạy song song với tasks.
      const actPromise = fetchProjectActivities(forProjectId);

      const workshopTypeId = detail.workshop_type_id || detail.workshop_type?.id || null;

      let taskRows = resolvedDealId
        ? await fetchCrmDealTasks(resolvedDealId, { workshopTypeId })
        : [];

      // Nếu focusTaskId không nằm trên deal chính — thử các deal còn lại song song.
      if (
        focusTaskId
        && resolvedDealId
        && !taskRows.some((t) => String(t.id) === String(focusTaskId))
        && (detail.crmDeals?.length || 0) > 1
      ) {
        const others = (detail.crmDeals || []).filter((d) => String(d.id) !== String(resolvedDealId));
        const altPages = await Promise.all(
          others.map((d) => fetchCrmDealTasks(String(d.id), { workshopTypeId }).catch(() => [] as CrmTask[])),
        );
        if (seq !== loadSeqRef.current || ac.signal.aborted) return;
        for (let i = 0; i < others.length; i += 1) {
          const altRows = altPages[i] || [];
          if (altRows.some((t) => String(t.id) === String(focusTaskId))) {
            resolvedDealId = String(others[i].id);
            taskRows = altRows;
            break;
          }
        }
      }

      if (seq !== loadSeqRef.current || ac.signal.aborted) return;
      setDealId(resolvedDealId);

      const [actRows, commentRows] = await Promise.all([
        actPromise,
        fetchThreadComments(resolveCommentSource(forProjectId, resolvedDealId)).catch(() => []),
      ]);
      if (seq !== loadSeqRef.current || ac.signal.aborted) return;
      setTasks(taskRows);
      setActivities(actRows);
      setCommentCount(commentRows.length);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = String((e as { message?: string })?.message || '');
      if (/aborted|canceled|cancelled/i.test(msg)) return;
      setErr(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current && !silent) setLoading(false);
    }
  }, [projectId, focusTaskId]);

  useEffect(() => {
    void load(false);
    return () => { loadAbortRef.current?.abort(); };
  }, [load]);

  useEffect(() => {
    didFocusScroll.current = false;
    if (focusTaskId) setTab('tasks');
  }, [focusTaskId, projectId]);

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

  const completeStageAll = useCallback((group: CrmTaskStageGroup) => {
    if (!dealId) return;
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
                await Promise.all(
                  toComplete.map((t) => updateCrmTask(dealId, t.id, { status: 'completed' })),
                );
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

  const openDateEditor = useCallback((field: EditableDateField, current?: string | null) => {
    setDateDraft(parseDateValue(current));
    setEditingDateField(field);
  }, []);

  const openMoneyEditor = useCallback((field: EditableMoneyField, current?: number | null) => {
    const n = Number(current);
    setMoneyDraft(Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '');
    setEditingMoneyField(field);
  }, []);

  const cancelMoneyEditor = useCallback(() => {
    setEditingMoneyField(null);
    setMoneyDraft('');
  }, []);

  const saveMoneyField = useCallback(async (field: EditableMoneyField, raw: string | null) => {
    if (!project) return;
    const trimmed = String(raw ?? '').trim().replace(/[^\d]/g, '');
    let value: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      value = Number.isFinite(n) && n > 0 ? n : null;
    }

    const nextProduction = field === 'production_value'
      ? value
      : (Number(project.production_value) > 0 ? Number(project.production_value) : 0);
    const nextDeposit = field === 'deposit_amount'
      ? (value || 0)
      : (Number(project.deposit_amount) > 0 ? Number(project.deposit_amount) : 0);
    if (field === 'deposit_amount' && nextDeposit > 0 && nextProduction > 0 && nextDeposit > nextProduction) {
      Alert.alert('Lỗi', 'Tiền cọc không được lớn hơn giá trị sản xuất.');
      return;
    }

    setMoneySaving(true);
    try {
      await updateProjectMoney(projectId, { [field]: value });
      setProject((prev) => (prev ? { ...prev, [field]: value } : prev));
      setEditingMoneyField(null);
      setMoneyDraft('');
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setMoneySaving(false);
    }
  }, [project, projectId]);

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
  const taskGroups = useMemo(
    () => groupCrmTasksByStage(tasks, project?.sxKanbanStages || []),
    [tasks, project?.sxKanbanStages],
  );

  /** Đưa nhóm/công việc được focus lên đầu để dễ thấy khi mở từ tab Công việc. */
  const orderedTaskGroups = useMemo(() => {
    if (!focusTaskId) return taskGroups;
    const fid = String(focusTaskId);
    const withFocus = taskGroups
      .map((g) => {
        const hit = g.tasks.find((t) => String(t.id) === fid);
        if (!hit) return g;
        return { ...g, tasks: [hit, ...g.tasks.filter((t) => String(t.id) !== fid)] };
      })
      .sort((a, b) => {
        const aHit = a.tasks.some((t) => String(t.id) === fid) ? 0 : 1;
        const bHit = b.tasks.some((t) => String(t.id) === fid) ? 0 : 1;
        return aHit - bHit;
      });
    return withFocus;
  }, [taskGroups, focusTaskId]);

  const focusedTask = useMemo(
    () => (focusTaskId ? tasks.find((t) => String(t.id) === String(focusTaskId)) || null : null),
    [tasks, focusTaskId],
  );

  const taskSections = useMemo(
    (): Array<SectionListData<CrmTask, CrmTaskStageGroup>> =>
      orderedTaskGroups.map((g) => ({
        ...g,
        data: dealId ? g.tasks : [],
      })),
    [orderedTaskGroups, dealId],
  );

  useEffect(() => {
    if (!focusTaskId || loading || !focusedTask || didFocusScroll.current) return;
    const timer = setTimeout(() => {
      didFocusScroll.current = true;
      // Task đã được đưa lên đầu section 0 — cuộn tới item đầu sau header.
      tasksListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        viewOffset: 24,
        animated: true,
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [focusTaskId, loading, focusedTask]);

  const { done: taskDone, total: taskTotal, percent: progress } = useMemo(
    () => calcCrmProductionTaskProgress(
      tasks,
      Number(project?.productionTaskProgress ?? project?.progress ?? 0),
    ),
    [tasks, project?.productionTaskProgress, project?.progress],
  );
  const progressColor = getTaskProgressColor(progress, colors);
  const docCount = project?.sharedDocuments?.length ?? 0;
  const productionValue = Number(project?.production_value ?? 0);
  const depositAmount = Number(project?.deposit_amount ?? 0);
  const debtAmount = Math.max(0, productionValue - depositAmount);
  const productionValueStr = formatMoneyAmount(productionValue);
  const depositStr = formatMoneyAmount(depositAmount);
  const debtStr = formatMoneyAmount(debtAmount);

  const displayDeal = useMemo(() => {
    const deals = project?.crmDeals || [];
    if (!deals.length) return null;
    if (dealId) {
      const hit = deals.find((d) => String(d.id) === String(dealId));
      if (hit) return hit;
    }
    const primaryId = pickPrimaryCrmDealId(deals);
    return (primaryId && deals.find((d) => String(d.id) === String(primaryId))) || deals[0];
  }, [project?.crmDeals, dealId]);

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
        moneyRow: { flexDirection: 'row', gap: 8 },
        moneyCard: {
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 10,
          paddingHorizontal: 8,
        },
        moneyCardDebt: { borderColor: colors.danger + '55' },
        moneyLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 },
        moneyValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
        moneyValueDebt: { color: colors.danger },
        moneyHint: { color: colors.textFaint, fontSize: 9, fontWeight: '600', marginTop: 4 },
        moneyModalRoot: { flex: 1, justifyContent: 'flex-end' },
        moneyModalBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
        },
        moneyModalSheet: {
          backgroundColor: colors.card,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          padding: Spacing.lg,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          gap: 10,
          borderTopWidth: 1,
          borderColor: colors.border,
        },
        moneyModalTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
        moneyModalSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
        moneyModalInput: {
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: Radii.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.text,
          fontSize: 18,
          fontWeight: '800',
          backgroundColor: colors.bgElevated,
        },
        moneyModalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
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
          gap: 8,
          marginBottom: 8,
          marginTop: 4,
        },
        groupHeadMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
        groupDot: { width: 8, height: 8, borderRadius: 4 },
        groupTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
        groupCount: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 2 },
        doneAllBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colors.success,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: Radii.md,
        },
        doneAllTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
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
        focusBanner: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          marginBottom: 14,
          borderRadius: Radii.lg,
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: colors.primary + '14',
        },
        focusBannerWarn: {
          borderColor: colors.warning,
          backgroundColor: colors.warning + '14',
        },
        focusBannerTitle: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
        focusBannerSub: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2, lineHeight: 19 },
        empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 14 },
      }),
    [colors, insets.top, insets.bottom],
  );

  if (loading && !project) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayTitle = displayDeal?.title || project?.name || 'Dự án';
  const displayCode = displayDeal?.code || project?.code || '';
  const isFullHeightTab = tab === 'comments' || tab === 'documents' || tab === 'drive' || tab === 'team';
  const useTasksVirtualList = tab === 'tasks';

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

  const projectSummaryHeader = (
    <View ref={scrollInnerRef} collapsable={false} style={styles.content}>
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
      </View>

      <View style={styles.moneyRow}>
        <Pressable
          style={styles.moneyCard}
          onPress={() => openMoneyEditor('production_value', project?.production_value)}
        >
          <Text style={styles.moneyLabel}>Giá trị sản xuất</Text>
          <Text style={styles.moneyValue} numberOfLines={1}>
            {productionValueStr ? `${productionValueStr} đ` : '0 đ'}
          </Text>
          <Text style={styles.moneyHint}>Chạm để sửa</Text>
        </Pressable>
        <Pressable
          style={styles.moneyCard}
          onPress={() => openMoneyEditor('deposit_amount', project?.deposit_amount)}
        >
          <Text style={styles.moneyLabel}>Tiền cọc</Text>
          <Text style={styles.moneyValue} numberOfLines={1}>
            {depositStr ? `${depositStr} đ` : '0 đ'}
          </Text>
          <Text style={styles.moneyHint}>Chạm để sửa</Text>
        </Pressable>
        <View style={[styles.moneyCard, styles.moneyCardDebt]}>
          <Text style={styles.moneyLabel}>Công nợ</Text>
          <Text style={[styles.moneyValue, debtAmount > 0 && styles.moneyValueDebt]} numberOfLines={1}>
            {debtStr ? `${debtStr} đ` : '0 đ'}
          </Text>
          <Text style={styles.moneyHint}>= SX − cọc</Text>
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
  );

  const focusBannerBlock = (
    <>
      {focusTaskId && focusedTask ? (
        <View ref={focusTargetRef} collapsable={false} style={styles.focusBanner}>
          <Ionicons name="locate" size={16} color={colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.focusBannerTitle}>Công việc đang mở</Text>
            <Text style={styles.focusBannerSub} numberOfLines={2}>{focusedTask.title}</Text>
          </View>
        </View>
      ) : focusTaskId && !loading && tasks.length > 0 ? (
        <View style={[styles.focusBanner, styles.focusBannerWarn]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
          <Text style={[styles.focusBannerSub, { color: colors.warning, flex: 1 }]}>
            Không tìm thấy nhiệm vụ gắn deal — đang mở tab Công việc của dự án.
          </Text>
        </View>
      ) : null}
    </>
  );

  const renderTaskSectionHeader = (
    { section }: { section: SectionListData<CrmTask, CrmTaskStageGroup> },
  ) => {
    const doneInGroup = section.doneCount ?? section.tasks.filter((t) => isCrmProductionTaskDone(t.status)).length;
    const openInGroup = section.openCount ?? (section.tasks.length - doneInGroup);
    return (
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: 8, marginTop: 4 }}>
        <View style={styles.groupHeader}>
          <View style={styles.groupHeadMain}>
            {section.color ? (
              <View style={[styles.groupDot, { backgroundColor: section.color }]} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.groupTitle} numberOfLines={1}>{section.label}</Text>
              <Text style={styles.groupCount}>
                {doneInGroup}/{section.tasks.length} xong
                {openInGroup ? ` · ${openInGroup} còn lại` : ''}
              </Text>
            </View>
          </View>
          {openInGroup > 0 && dealId ? (
            <Pressable
              style={[styles.doneAllBtn, bulkBusy && { opacity: 0.6 }]}
              disabled={bulkBusy}
              onPress={() => completeStageAll(section as CrmTaskStageGroup)}
            >
              <Ionicons name="checkmark-done-outline" size={14} color="#FFF" />
              <Text style={styles.doneAllTxt}>Xong hết</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const renderTaskItem = ({ item }: { item: CrmTask }) => {
    if (!dealId) return null;
    return (
      <View style={{ paddingHorizontal: Spacing.lg }}>
        <ProjectCrmTaskRow
          task={item}
          dealId={dealId}
          onUpdated={onTaskUpdated}
          onDeleted={onTaskDeleted}
          highlighted={Boolean(focusTaskId) && String(item.id) === String(focusTaskId)}
        />
      </View>
    );
  };

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

        {useTasksVirtualList ? (
          <SectionList
            ref={tasksListRef}
            sections={taskSections}
            keyExtractor={(item) => String(item.id)}
            stickySectionHeadersEnabled={false}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            refreshControl={(
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListHeaderComponent={(
              <>
                {projectSummaryHeader}
                {tabsBar}
                <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm }}>
                  {focusBannerBlock}
                </View>
              </>
            )}
            ListEmptyComponent={(
              <Text style={[styles.empty, { paddingHorizontal: Spacing.lg, paddingTop: 8 }]}>
                Chưa có nhiệm vụ SX — đồng bộ từ web khi deal có template.
              </Text>
            )}
            renderSectionHeader={renderTaskSectionHeader}
            renderItem={renderTaskItem}
          />
        ) : null}

        {isFullHeightTab || useTasksVirtualList ? null : (
        <ScrollView
          ref={scrollRef}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          nestedScrollEnabled
        >
          {projectSummaryHeader}

        {tabsBar}

        <View style={{ padding: Spacing.lg }}>
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
                  {
                    field: 'production_value' as const,
                    label: 'Giá trị sản xuất',
                    hint: 'Chi phí xưởng — khác giá trị deal CRM',
                    value: project.production_value,
                    display: productionValueStr ? `${productionValueStr} đ` : '0 đ',
                  },
                  {
                    field: 'deposit_amount' as const,
                    label: 'Tiền cọc',
                    hint: 'Chạm để thêm / sửa / xóa',
                    value: project.deposit_amount,
                    display: depositStr ? `${depositStr} đ` : '0 đ',
                  },
                ] as const
              ).map((row) => (
                <Pressable
                  key={row.field}
                  style={styles.infoEditRow}
                  onPress={() => openMoneyEditor(row.field, row.value)}
                >
                  <View style={styles.infoEditBody}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.display}</Text>
                    <Text style={styles.infoEditHint}>{row.hint}</Text>
                  </View>
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </Pressable>
              ))}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Công nợ (SX)</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[styles.infoValue, debtAmount > 0 && { color: colors.danger }]}>
                    {debtStr ? `${debtStr} đ` : '0 đ'}
                  </Text>
                  <Text style={styles.infoEditHint}>= Giá trị sản xuất − Tiền cọc</Text>
                </View>
              </View>

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

      <Modal
        visible={!!editingMoneyField}
        transparent
        animationType="fade"
        onRequestClose={cancelMoneyEditor}
      >
        <KeyboardAvoidingView
          style={styles.moneyModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.moneyModalBackdrop} onPress={cancelMoneyEditor} />
          <View style={styles.moneyModalSheet}>
            <Text style={styles.moneyModalTitle}>
              {editingMoneyField === 'deposit_amount' ? 'Tiền cọc' : 'Giá trị sản xuất'}
            </Text>
            <Text style={styles.moneyModalSub}>
              {editingMoneyField === 'deposit_amount'
                ? 'Nhập số tiền cọc (VNĐ). Để trống rồi Xóa để gỡ.'
                : 'Chi phí xưởng — khác giá trị deal CRM'}
            </Text>
            <TextInput
              style={styles.moneyModalInput}
              value={moneyDraft}
              onChangeText={(t) => setMoneyDraft(t.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.moneyModalActions}>
              <Pressable
                style={[styles.dateBtn, styles.dateBtnDanger]}
                onPress={() => editingMoneyField && void saveMoneyField(editingMoneyField, null)}
                disabled={moneySaving}
              >
                <Text style={styles.dateBtnTxtDanger}>Xóa</Text>
              </Pressable>
              <Pressable
                style={[styles.dateBtn, styles.dateBtnMuted]}
                onPress={cancelMoneyEditor}
                disabled={moneySaving}
              >
                <Text style={styles.dateBtnTxtMuted}>Huỷ</Text>
              </Pressable>
              <Pressable
                style={styles.dateBtn}
                onPress={() => editingMoneyField && void saveMoneyField(editingMoneyField, moneyDraft)}
                disabled={moneySaving}
              >
                {moneySaving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.dateBtnTxt}>Lưu</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
