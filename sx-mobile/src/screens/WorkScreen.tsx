import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import FilterPickerModal from '../components/FilterPickerModal';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { loadKanbanFilters, saveKanbanFilters } from '../lib/kanbanFilterStorage';
import { REALTIME_TASK } from '../lib/realtimeModes';
import { fetchCompanies, type CompanyOption } from '../lib/productionApi';
import {
  isSystemAdmin,
  workshopCompaniesForCrossViewer,
} from '../lib/productionFilters';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';
import {
  type WorkAssigneeOption,
  type WorkTask,
  assignmentDealCardLabel,
  canViewTeamWork,
  collectAssigneeOptions,
  fetchProductionWorkTasks,
  formatTaskDeadline,
  isTaskDone,
  isTaskInProgress,
  isTaskOverdue,
  isTaskPending,
  nextTaskStatus,
  priorityLabel,
  stageSlugLabel,
  statusPillLabel,
  taskAssignedToUser,
  taskDueIso,
  updateWorkTaskStatus,
  uploadWorkTaskFile,
  workTaskFocusCrmId,
} from '../lib/workTasksApi';

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';
type ScopeFilter = 'team' | 'mine';

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

function initials(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function statusColor(status: string, colors: AppColors): string {
  if (isTaskDone(status)) return colors.success;
  if (isTaskInProgress(status)) return colors.primary;
  return colors.warning;
}

function createStyles(colors: AppColors, bottomInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerTextWrap: { flex: 1, minWidth: 0 },
    screenTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 1, fontWeight: '600' },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIconBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
    },
    searchRow: {
      marginHorizontal: Spacing.lg,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 10,
      minHeight: 38,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 7, fontWeight: '500' },
    filterBar: {
      paddingBottom: 6,
    },
    filterScroll: {
      paddingHorizontal: Spacing.lg,
      gap: 6,
      alignItems: 'center',
      paddingRight: Spacing.lg,
    },
    iconChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 34,
      paddingHorizontal: 10,
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    iconChipActive: {
      borderColor: colors.primary,
      backgroundColor: colorWithAlpha(colors.primary, 0.14),
    },
    iconChipTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    iconChipTxtActive: {
      color: colors.primary,
    },
    seg: {
      flexDirection: 'row',
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.card,
      height: 34,
    },
    segBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 10,
      height: 34,
    },
    segBtnActive: { backgroundColor: colorWithAlpha(colors.primary, 0.14) },
    segTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    segTxtActive: { color: colors.primary },
    statsLine: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statsItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statsDot: { width: 6, height: 6, borderRadius: 3 },
    statsNum: { fontSize: 12, fontWeight: '800' },
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
    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: bottomInset + 28, gap: 10 },
    card: {
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    cardBody: { paddingLeft: 14, paddingRight: 12, paddingVertical: 12 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radii.full,
    },
    statusBadgeTxt: { fontSize: 11, fontWeight: '800' },
    metaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    prioPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.full,
      backgroundColor: colorWithAlpha(colors.danger, 0.12),
    },
    prioTxt: { color: colors.danger, fontSize: 11, fontWeight: '800' },
    dueTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    dueOverdue: { color: colors.danger },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      lineHeight: 22,
      marginTop: 8,
    },
    titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
    desc: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colorWithAlpha(colors.primary, 0.18),
    },
    avatarTxt: { color: colors.primary, fontSize: 11, fontWeight: '800' },
    infoTxt: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
    dealRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    dealTxt: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    stagePill: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.sm,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stageTxt: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      gap: 10,
    },
    openLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    openLinkTxt: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    attachIconBtn: {
      width: 36,
      height: 36,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachIconBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
    },
    attachIconBtnPhoto: {
      borderColor: colorWithAlpha(colors.primary, 0.45),
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
    },
    attachIconBtnVideo: {
      borderColor: colorWithAlpha('#A855F7', 0.45),
      backgroundColor: colorWithAlpha('#A855F7', 0.12),
    },
    mediaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    attachBadgeDot: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    attachBadgeDotTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
    statusBtn: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radii.full,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      minWidth: 100,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    statusBtnTxt: { color: colors.text, fontSize: 12, fontWeight: '800' },
    empty: {
      color: colors.textMuted,
      textAlign: 'center',
      fontSize: 14,
      marginTop: 40,
      paddingHorizontal: Spacing.xl,
      lineHeight: 21,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingBottom: bottomInset + 16,
      maxHeight: '70%',
    },
    modalHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginTop: 10,
      marginBottom: 8,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      paddingHorizontal: Spacing.lg,
      marginBottom: 8,
    },
    modalItem: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalItemTxt: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
    modalItemActive: { color: colors.primary },
  });
}

export default function WorkScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openProjectDetail } = useRootNavigation();
  const userId = user?.id || user?.userId || '';
  const userName = user?.full_name || user?.fullName || 'Bạn';
  const teamView = canViewTeamWork(user);
  const isAdminLike = user?.role === 'admin' || isSystemAdmin(user);
  const canPickCompany = Boolean(isAdminLike);

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scope, setScope] = useState<ScopeFilter>(teamView ? 'team' : 'mine');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [personModal, setPersonModal] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const updatingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const lastSilentAtRef = useRef(0);
  const skipNextFocusRefreshRef = useRef(true);

  const companyOptions = useMemo(() => {
    if (canPickCompany) {
      return [
        { id: '', label: 'Tất cả công ty' },
        ...companies.map((c) => ({ id: c.id, label: c.name })),
      ];
    }
    const ownId = user?.company_id ? String(user.company_id) : '';
    if (ownId) {
      const own = companies.find((c) => String(c.id) === ownId);
      return [{ id: ownId, label: own?.name || 'Công ty của tôi' }];
    }
    return workshopCompaniesForCrossViewer(companies, user).map((c) => ({
      id: c.id,
      label: c.name,
    }));
  }, [canPickCompany, companies, user]);

  const companyLabel = useMemo(() => {
    if (!filterCompany) return canPickCompany ? 'Tất cả công ty' : (companyOptions[0]?.label || 'Công ty');
    return companyOptions.find((o) => o.id === filterCompany)?.label
      || companies.find((c) => String(c.id) === String(filterCompany))?.name
      || 'Công ty';
  }, [filterCompany, canPickCompany, companyOptions, companies]);

  const persistCompanyFilter = useCallback(async (companyId: string) => {
    const snap = (await loadKanbanFilters().catch(() => null)) || {};
    await saveKanbanFilters({
      ...snap,
      filterCompany: companyId,
    });
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!userId || !filtersReady) {
      if (!userId) {
        setTasks([]);
        setLoading(false);
      }
      return;
    }
    const seq = ++loadSeqRef.current;
    if (!silent) setError(null);
    try {
      const assigneeId = !teamView || scope === 'mine' ? userId : null;
      const companyId = filterCompany || (canPickCompany ? null : (user?.company_id || null));
      const rows = await fetchProductionWorkTasks({
        assigneeId,
        companyId,
      });
      if (seq !== loadSeqRef.current) return;
      setTasks(rows);
      lastSilentAtRef.current = Date.now();
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (!silent) {
        setError(formatApiError(e));
        setTasks([]);
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [userId, teamView, scope, user?.company_id, filterCompany, canPickCompany, filtersReady]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [snap, companyList] = await Promise.all([
        loadKanbanFilters().catch(() => null),
        fetchCompanies().catch(() => [] as CompanyOption[]),
      ]);
      if (cancelled) return;
      setCompanies(companyList);
      let companyId = snap?.filterCompany || '';
      if (!canPickCompany) {
        const ownId = user?.company_id ? String(user.company_id) : '';
        if (ownId) companyId = ownId;
        else if (!companyId && companyList[0]?.id) companyId = String(companyList[0].id);
      } else if (companyId) {
        const exists = companyList.some((c) => String(c.id) === String(companyId));
        if (!exists) companyId = '';
      }
      setFilterCompany(companyId);
      setFiltersReady(true);
    })();
    return () => { cancelled = true; };
  }, [canPickCompany, user?.company_id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(false);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    if (!filtersReady) return;
    setLoading(true);
    skipNextFocusRefreshRef.current = true;
    void load(false);
  }, [load, filtersReady]);

  // Quay lại tab / thoát ProjectDetail → refetch để KPI quá hạn + trạng thái khớp server.
  useFocusEffect(
    useCallback(() => {
      if (!filtersReady || !userId) return undefined;
      if (skipNextFocusRefreshRef.current) {
        skipNextFocusRefreshRef.current = false;
        return undefined;
      }
      const now = Date.now();
      if (now - lastSilentAtRef.current < 8_000) return undefined;
      lastSilentAtRef.current = now;
      void load(true);
      return undefined;
    }, [filtersReady, userId, load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !filtersReady || !userId) return;
      const now = Date.now();
      if (now - lastSilentAtRef.current < 60_000) return;
      lastSilentAtRef.current = now;
      void load(true);
    });
    return () => sub.remove();
  }, [load, filtersReady, userId]);

  useProductionRealtime({
    onRefresh: () => { void load(true); },
    enabled: Boolean(userId) && filtersReady,
    modes: REALTIME_TASK,
    debounceMs: 1500,
  });

  const onSelectCompany = useCallback(async (id: string) => {
    setCompanyPickerOpen(false);
    if (!canPickCompany && user?.company_id && id !== String(user.company_id)) return;
    setFilterCompany(id);
    await persistCompanyFilter(id);
  }, [canPickCompany, user?.company_id, persistCompanyFilter]);

  const openTaskProject = useCallback((task: WorkTask) => {
    const pid = task.lead?.project_id;
    if (!pid) return;
    openProjectDetail(String(pid), { focusTaskId: workTaskFocusCrmId(task) });
  }, [openProjectDetail]);

  const bumpTaskFileCount = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              file_count: (t.file_count ?? 0) + 1,
              attachment_count: (t.attachment_count ?? 0) + 1,
            }
          : t,
      ),
    );
  }, []);

  const uploadMediaForTask = useCallback(async (
    task: WorkTask,
    file: { uri: string; name: string; mime: string },
    successMsg: string,
  ) => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdatingId(task.id);
    try {
      await uploadWorkTaskFile(task, file);
      bumpTaskFileCount(task.id);
      setError(null);
      Alert.alert('Đã đính kèm', successMsg);
    } catch (e) {
      setError(formatApiError(e));
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      updatingRef.current = false;
      setUpdatingId(null);
    }
  }, [bumpTaskFileCount]);

  const pickFileForTask = useCallback(async (task: WorkTask) => {
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    await uploadMediaForTask(
      task,
      { uri: a.uri, name: a.name || 'file', mime: a.mimeType || 'application/octet-stream' },
      'File đã đính kèm vào công việc.',
    );
  }, [uploadMediaForTask]);

  const capturePhotoForTask = useCallback(async (task: WorkTask) => {
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
    await uploadMediaForTask(
      task,
      {
        uri: a.uri,
        name: a.fileName || `photo_${Date.now()}.jpg`,
        mime: a.mimeType || 'image/jpeg',
      },
      'Ảnh đã đính kèm vào công việc.',
    );
  }, [uploadMediaForTask]);

  const captureVideoForTask = useCallback(async (task: WorkTask) => {
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
    await uploadMediaForTask(
      task,
      {
        uri: a.uri,
        name: a.fileName || `video_${Date.now()}.mp4`,
        mime: a.mimeType || 'video/mp4',
      },
      'Video đã đính kèm vào công việc.',
    );
  }, [uploadMediaForTask]);

  const assigneeOptions = useMemo(() => collectAssigneeOptions(tasks), [tasks]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter === 'pending' && !isTaskPending(t.status)) return false;
      if (statusFilter === 'in_progress' && !isTaskInProgress(t.status)) return false;
      if (statusFilter === 'completed' && !isTaskDone(t.status)) return false;
      if (statusFilter === 'overdue' && !isTaskOverdue(t)) return false;
      if (teamView && scope === 'team' && assigneeFilter !== 'all') {
        if (!taskAssignedToUser(t, assigneeFilter)) return false;
      }
      if (filterCompany && String(t.company_id || '') !== String(filterCompany)) {
        return false;
      }
      if (needle) {
        const hay = [
          t.title,
          t.description,
          t.lead?.code,
          t.lead?.title,
          assignmentDealCardLabel(t.lead),
          t.assignee?.full_name,
          ...(t.assignees || []).map((a) => a.full_name),
          t.stage_slug,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, search, teamView, scope, assigneeFilter, filterCompany]);

  const stats = useMemo(
    () => ({
      total: filtered.length,
      pending: filtered.filter((t) => isTaskPending(t.status)).length,
      inProgress: filtered.filter((t) => isTaskInProgress(t.status)).length,
      overdue: filtered.filter((t) => isTaskOverdue(t)).length,
    }),
    [filtered],
  );

  const personLabel = useMemo(() => {
    if (assigneeFilter === 'all') return 'Người';
    const found = assigneeOptions.find((a) => a.id === assigneeFilter);
    return found?.name?.split(/\s+/).slice(-1)[0] || 'Người';
  }, [assigneeFilter, assigneeOptions]);

  const toggleStatus = async (task: WorkTask) => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdatingId(task.id);
    try {
      const next = nextTaskStatus(task.status);
      const updated = await updateWorkTaskStatus(
        task.lead_id,
        task.id,
        next,
        'assignment',
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: updated.status, title: updated.title || t.title }
            : t,
        ),
      );
      setError(null);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      updatingRef.current = false;
      setUpdatingId(null);
    }
  };

  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);

  const renderCard = ({ item: task }: { item: WorkTask }) => {
    const done = isTaskDone(task.status);
    const overdue = isTaskOverdue(task);
    const accent = statusColor(task.status, colors);
    const busy = updatingId === task.id;
    const people =
      task.assignees && task.assignees.length
        ? task.assignees
        : task.assignee
          ? [task.assignee]
          : [];
    const assigneeName =
      people.map((p) => p.full_name?.trim()).filter(Boolean).join(', ')
      || (teamView ? 'Chưa gán' : userName);
    const dealLabel = assignmentDealCardLabel(task.lead);
    const stage = stageSlugLabel(task.stage_slug);
    const prio = priorityLabel(task.priority);
    const due = formatTaskDeadline(taskDueIso(task));

    return (
      <View style={styles.card}>
        <View style={[styles.cardAccent, { backgroundColor: accent }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={[styles.statusBadge, { backgroundColor: colorWithAlpha(accent, 0.15) }]}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
              <Text style={[styles.statusBadgeTxt, { color: accent }]}>{statusPillLabel(task.status)}</Text>
            </View>
            <View style={styles.metaRight}>
              {prio === 'Cao' ? (
                <View style={styles.prioPill}>
                  <Text style={styles.prioTxt}>Cao</Text>
                </View>
              ) : null}
              <Text style={[styles.dueTxt, overdue && styles.dueOverdue]}>
                {overdue ? 'Quá hạn · ' : ''}
                {due}
              </Text>
            </View>
          </View>

          <Text
            style={[styles.title, done && styles.titleDone]}
            numberOfLines={2}
            onPress={() => {
              if (task.lead?.project_id) openTaskProject(task);
            }}
          >
            {task.title}
          </Text>

          {task.description ? (
            <Text style={styles.desc} numberOfLines={2}>
              {task.description}
            </Text>
          ) : null}

          <View style={styles.infoRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{initials(people[0]?.full_name || assigneeName)}</Text>
            </View>
            <Text style={styles.infoTxt} numberOfLines={1}>
              {assigneeName}
            </Text>
          </View>

          {dealLabel ? (
            <View style={styles.dealRow}>
              <Ionicons name="business-outline" size={14} color={colors.textMuted} />
              <Text style={styles.dealTxt} numberOfLines={1}>
                {dealLabel}
              </Text>
            </View>
          ) : null}

          {stage ? (
            <View style={styles.stagePill}>
              <Text style={styles.stageTxt}>{stage}</Text>
            </View>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={[styles.mediaRow, { flex: 1, minWidth: 0 }]}>
              <TapHighlight
                style={[
                  styles.attachIconBtn,
                  (task.file_count || 0) > 0 && styles.attachIconBtnActive,
                ]}
                onPress={() => void pickFileForTask(task)}
                disabled={busy}
                pressStyle={{ opacity: 0.8 }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name="attach"
                    size={18}
                    color={(task.file_count || 0) > 0 ? colors.primary : colors.textMuted}
                  />
                )}
                {(task.file_count || 0) > 0 ? (
                  <View style={styles.attachBadgeDot}>
                    <Text style={styles.attachBadgeDotTxt}>
                      {(task.file_count || 0) > 9 ? '9+' : String(task.file_count)}
                    </Text>
                  </View>
                ) : null}
              </TapHighlight>
              <TapHighlight
                style={[styles.attachIconBtn, styles.attachIconBtnPhoto]}
                onPress={() => void capturePhotoForTask(task)}
                disabled={busy}
                pressStyle={{ opacity: 0.8 }}
              >
                <Ionicons name="camera" size={18} color={colors.primary} />
              </TapHighlight>
              <TapHighlight
                style={[styles.attachIconBtn, styles.attachIconBtnVideo]}
                onPress={() => void captureVideoForTask(task)}
                disabled={busy}
                pressStyle={{ opacity: 0.8 }}
              >
                <Ionicons name="videocam" size={18} color="#A855F7" />
              </TapHighlight>
              {task.lead?.project_id ? (
                <TapHighlight
                  style={[styles.openLink, { flexShrink: 1 }]}
                  onPress={() => openTaskProject(task)}
                  pressStyle={{ opacity: 0.75 }}
                >
                  <Ionicons name="open-outline" size={15} color={colors.primary} />
                  <Text style={styles.openLinkTxt} numberOfLines={1}>Mở</Text>
                </TapHighlight>
              ) : null}
            </View>
            <TapHighlight
              style={styles.statusBtn}
              onPress={() => void toggleStatus(task)}
              disabled={busy}
              pressStyle={{ opacity: 0.8 }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.statusBtnTxt}>
                  {isTaskDone(task.status) ? 'Mở lại' : isTaskPending(task.status) ? 'Bắt đầu' : 'Hoàn thành'}
                </Text>
              )}
            </TapHighlight>
          </View>
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const listHeader = (
    <>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.screenTitle}>Công việc</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {companyLabel}
            {teamView ? (scope === 'team' ? ' · Đội' : ' · Tôi') : ` · ${userName}`}
            {assigneeFilter !== 'all' ? ` · ${personLabel}` : ''}
          </Text>
        </View>
        {(canPickCompany || companyOptions.length > 1) ? (
          <TapHighlight
            style={[styles.headerIconBtn, filterCompany ? styles.headerIconBtnActive : null]}
            onPress={() => setCompanyPickerOpen(true)}
          >
            <Ionicons
              name="business-outline"
              size={18}
              color={filterCompany ? colors.primary : colors.textMuted}
            />
          </TapHighlight>
        ) : null}
        {teamView && scope === 'team' ? (
          <TapHighlight
            style={[styles.headerIconBtn, assigneeFilter !== 'all' && styles.headerIconBtnActive]}
            onPress={() => setPersonModal(true)}
          >
            <Ionicons
              name="person-outline"
              size={18}
              color={assigneeFilter !== 'all' ? colors.primary : colors.textMuted}
            />
          </TapHighlight>
        ) : null}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm việc, deal, người…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {teamView ? (
            <View style={styles.seg}>
              <TapHighlight
                style={[styles.segBtn, scope === 'team' && styles.segBtnActive]}
                onPress={() => {
                  setScope('team');
                  setAssigneeFilter('all');
                }}
              >
                <Ionicons
                  name="people-outline"
                  size={15}
                  color={scope === 'team' ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.segTxt, scope === 'team' && styles.segTxtActive]}>Đội</Text>
              </TapHighlight>
              <TapHighlight
                style={[styles.segBtn, scope === 'mine' && styles.segBtnActive]}
                onPress={() => {
                  setScope('mine');
                  setAssigneeFilter('all');
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={15}
                  color={scope === 'mine' ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.segTxt, scope === 'mine' && styles.segTxtActive]}>Tôi</Text>
              </TapHighlight>
            </View>
          ) : null}

          {STATUS_CHIPS.map((chip) => {
            const active = statusFilter === chip.key;
            const iconColor = active
              ? (chip.key === 'overdue' ? colors.danger : colors.primary)
              : colors.textMuted;
            return (
              <TapHighlight
                key={chip.key}
                style={[
                  styles.iconChip,
                  active && styles.iconChipActive,
                  active && chip.key === 'overdue' && { borderColor: colors.danger },
                ]}
                onPress={() => setStatusFilter(chip.key)}
              >
                <Ionicons name={chip.icon} size={15} color={iconColor} />
                <Text
                  style={[
                    styles.iconChipTxt,
                    active && styles.iconChipTxtActive,
                    active && chip.key === 'overdue' && { color: colors.danger },
                  ]}
                >
                  {chip.label}
                </Text>
              </TapHighlight>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.statsLine}>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.statsNum, { color: colors.text }]}>{stats.total}</Text>
        </View>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.statsNum, { color: colors.warning }]}>{stats.pending}</Text>
        </View>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.statsNum, { color: colors.primary }]}>{stats.inProgress}</Text>
        </View>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.statsNum, { color: colors.danger }]}>{stats.overdue}</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <FlatList
        style={styles.container}
        data={filtered}
        keyExtractor={(item) => `asg-${item.id}`}
        renderItem={renderCard}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        initialNumToRender={12}
        windowSize={7}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {!userId
              ? 'Đăng nhập để xem công việc.'
              : search.trim() || statusFilter !== 'all' || assigneeFilter !== 'all'
                ? 'Không có công việc khớp bộ lọc.'
                : teamView && scope === 'team'
                  ? 'Chưa có giao việc sản xuất trong phạm vi công ty.'
                  : 'Chưa có giao việc sản xuất nào cho bạn.'}
          </Text>
        }
      />

      <Modal visible={personModal} transparent animationType="slide" onRequestClose={() => setPersonModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPersonModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Lọc theo người nhận</Text>
            <FlatList
              data={[{ id: 'all', name: 'Tất cả' }, ...assigneeOptions] as WorkAssigneeOption[]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const active = assigneeFilter === item.id;
                return (
                  <TapHighlight
                    style={styles.modalItem}
                    onPress={() => {
                      setAssigneeFilter(item.id);
                      setPersonModal(false);
                    }}
                  >
                    <Text style={[styles.modalItemTxt, active && styles.modalItemActive]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </TapHighlight>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Lọc theo công ty"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={(id) => { void onSelectCompany(id); }}
        onClose={() => setCompanyPickerOpen(false)}
      />
    </>
  );
}
