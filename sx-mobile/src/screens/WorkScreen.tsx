import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import React,
  { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Image,
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
import ImageGalleryLightbox, { type GalleryImage } from '../components/ImageGalleryLightbox';
import TapHighlight from '../components/TapHighlight';
import WorkFilterSheet, {
  type WorkScopeFilter,
  type WorkStatusFilter,
} from '../components/WorkFilterSheet';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { loadKanbanFilters, saveKanbanFilters, subscribeSharedFilters } from '../lib/kanbanFilterStorage';
import { REALTIME_TASK } from '../lib/realtimeModes';
import { fetchCompanies, type CompanyOption } from '../lib/productionApi';
import {
  isSystemAdmin,
  workshopCompaniesForCrossViewer,
} from '../lib/productionFilters';
import type { MainTabParamList } from '../navigation/MainTabs';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';
import {
  type DealTaskSection,
  type WorkTask,
  type WorkTaskAttachment,
  type WorkTasksStats,
  canViewTeamWork,
  collectAssigneeOptions,
  fetchProductionWorkTaskStats,
  fetchProductionWorkTasksPage,
  fetchWorkTaskAttachments,
  formatTaskDeadline,
  groupTasksByDeal,
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
  WORK_TASKS_PAGE_SIZE,
} from '../lib/workTasksApi';
import { isImageFile, resolveMediaUrl } from '../lib/mediaUtils';
import { saveMessengerAttachment } from '../lib/messengerFileOpen';
import { isQueryAbortError } from '../lib/queryCache';

import SpinningLoader from '../components/SpinningLoader';

type StatusFilter = WorkStatusFilter;
type ScopeFilter = WorkScopeFilter;

type WorkFileKind = 'image' | 'pdf' | 'word' | 'excel' | 'ppt' | 'other';

function workFileKind(file: WorkTaskAttachment): WorkFileKind {
  if (isImageFile({
    mime_type: file.mime_type,
    file_name: file.name,
    file_url: file.file_url,
    name: file.name,
  })) return 'image';
  const mime = String(file.mime_type || '').toLowerCase();
  const probe = `${file.name || ''} ${file.file_url || ''}`.toLowerCase();
  if (mime.includes('pdf') || /\.pdf(\?|$)/i.test(probe)) return 'pdf';
  if (/(word|msword|wordprocessing)/.test(mime) || /\.(docx?|rtf)(\?|$)/i.test(probe)) return 'word';
  if (/(excel|spreadsheet|sheet)/.test(mime) || /\.(xlsx?|csv)(\?|$)/i.test(probe)) return 'excel';
  if (/(powerpoint|presentation)/.test(mime) || /\.(pptx?)(\?|$)/i.test(probe)) return 'ppt';
  return 'other';
}

function workFileIcon(kind: WorkFileKind): keyof typeof Ionicons.glyphMap {
  if (kind === 'image') return 'image-outline';
  if (kind === 'pdf') return 'document-text-outline';
  if (kind === 'word') return 'document-outline';
  if (kind === 'excel') return 'grid-outline';
  if (kind === 'ppt') return 'easel-outline';
  return 'attach-outline';
}

function workFileKindLabel(kind: WorkFileKind): string {
  if (kind === 'image') return 'Ảnh · xem trong app';
  if (kind === 'pdf') return 'PDF · tải về';
  if (kind === 'word') return 'Word · tải về';
  if (kind === 'excel') return 'Excel · tải về';
  if (kind === 'ppt') return 'PowerPoint · tải về';
  return 'Tải về máy';
}

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

type ListRow =
  | { kind: 'section'; key: string; section: DealTaskSection }
  | { kind: 'task'; key: string; task: WorkTask };

function statusColor(status: string, colors: AppColors): string {
  if (isTaskDone(status)) return colors.success;
  if (isTaskInProgress(status)) return colors.primary;
  return colors.warning;
}

function createStyles(colors: AppColors, bottomInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    listFlex: { flex: 1 },
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
      paddingHorizontal: 12,
      height: 42,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 42,
      paddingHorizontal: 12,
      borderRadius: Radii.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterBtnTxt: { color: colors.text, fontSize: 13, fontWeight: '800' },
    filterBtnTxtActive: { color: colors.white },
    filterBtnBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(255,255,255,0.28)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterBtnBadgeTxt: { color: colors.white, fontSize: 10, fontWeight: '800' },
    activeChipScroll: {
      flexGrow: 0,
      flexShrink: 0,
      marginBottom: 6,
      minHeight: 34,
    },
    activeChipContent: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 2,
      alignItems: 'center',
      gap: 6,
    },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 30,
      paddingHorizontal: 10,
      borderRadius: Radii.full,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 180,
    },
    activeChipTxt: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    dropdownChip: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 30,
      borderRadius: Radii.full,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 210,
      overflow: 'hidden',
    },
    dropdownChipActive: {
      borderColor: colorWithAlpha(colors.primary, 0.45),
      backgroundColor: colors.primarySoft,
    },
    dropdownChipMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingLeft: 10,
      paddingRight: 6,
      height: 30,
      flexShrink: 1,
      maxWidth: 180,
    },
    dropdownChipPrefix: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    dropdownChipTxt: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      flexShrink: 1,
    },
    dropdownChipTxtActive: { color: colors.primary },
    dropdownChipClear: {
      width: 32,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    activeChipClear: {
      height: 30,
      paddingHorizontal: 10,
      borderRadius: Radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.primary, 0.35),
    },
    activeChipClearTxt: { color: colors.primary, fontSize: 12, fontWeight: '800' },
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
    statsLine: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statsItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statsDot: { width: 6, height: 6, borderRadius: 3 },
    statsLabel: { fontSize: 11, fontWeight: '700' },
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
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    sectionMeta: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: '600',
      marginTop: 2,
    },
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
    attachModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    attachModalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: Spacing.lg,
      paddingTop: 14,
      paddingBottom: bottomInset + 16,
      maxHeight: '70%',
    },
    attachModalTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
    attachModalSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 12 },
    attachFileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    attachThumb: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.bgElevated,
    },
    attachIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
    },
    attachFileName: { color: colors.text, fontSize: 13.5, fontWeight: '600' },
    attachFileMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    attachEmpty: { color: colors.textMuted, fontSize: 13, fontWeight: '600', paddingVertical: 16 },
    attachModalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    attachModalBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    attachModalBtnPrimary: {
      borderColor: colorWithAlpha(colors.primary, 0.4),
      backgroundColor: colorWithAlpha(colors.primary, 0.14),
    },
    attachModalBtnTxt: { color: colors.text, fontSize: 13, fontWeight: '700' },
    attachModalBtnTxtPrimary: { color: colors.primary, fontSize: 13, fontWeight: '800' },
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
  });
}

export default function WorkScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { openProjectDetail } = useRootNavigation();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Work'>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Work'>>();
  const userId = user?.id || user?.userId || '';
  const userName = user?.full_name || user?.fullName || 'Bạn';
  const teamView = canViewTeamWork(user);
  const isAdminLike = user?.role === 'admin' || isSystemAdmin(user);
  const canPickCompany = Boolean(isAdminLike);

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  /** List theo chip status (server) — tách khỏi `tasks` để KPI Chưa/Đang/Xong/QH không bị lệch. */
  const [chipTasks, setChipTasks] = useState<WorkTask[]>([]);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [chipHasMore, setChipHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chipLoading, setChipLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** KPI từ /stats (đủ toàn bộ) — tránh lệch vì list chỉ tải 200 dòng. */
  const [serverStats, setServerStats] = useState<WorkTasksStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  /** Section deal đóng mặc định — chỉ lưu leadId đang mở (giống VC). */
  const [expandedLeadIds, setExpandedLeadIds] = useState<Record<string, boolean>>({});
  const [scope, setScope] = useState<ScopeFilter>(teamView ? 'team' : 'mine');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [quickPicker, setQuickPicker] = useState<'company' | 'assignee' | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [attachSheet, setAttachSheet] = useState<{
    task: WorkTask;
    files: WorkTaskAttachment[];
    loading: boolean;
  } | null>(null);
  const [gallery, setGallery] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const updatingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const chipSeqRef = useRef(0);
  const tasksLenRef = useRef(0);
  const chipLenRef = useRef(0);
  const lastSilentAtRef = useRef(0);
  const skipNextFocusRefreshRef = useRef(true);
  const workAbortRef = useRef<AbortController | null>(null);
  const chipAbortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreTasksRef = useRef(false);
  const chipHasMoreRef = useRef(false);
  const statusFilterRef = useRef<StatusFilter>('all');
  const searchRef = useRef(search);
  searchRef.current = search;
  const skipFirstSearchEffectRef = useRef(true);

  useEffect(() => { tasksLenRef.current = tasks.length; }, [tasks.length]);
  useEffect(() => { chipLenRef.current = chipTasks.length; }, [chipTasks.length]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { hasMoreTasksRef.current = hasMoreTasks; }, [hasMoreTasks]);
  useEffect(() => { chipHasMoreRef.current = chipHasMore; }, [chipHasMore]);
  useEffect(() => { statusFilterRef.current = statusFilter; }, [statusFilter]);

  // Overview «Công việc của tôi» → mở tab với filter Tôi (+ status nếu có).
  useEffect(() => {
    const p = route.params;
    if (!p) return;
    const nextScope = p.scope;
    const nextStatus = p.status;
    if (!nextScope && !nextStatus) return;

    if (nextScope === 'mine' || nextScope === 'team') {
      setScope(teamView && nextScope === 'team' ? 'team' : 'mine');
      setAssigneeFilter('all');
    }
    if (
      nextStatus === 'all'
      || nextStatus === 'pending'
      || nextStatus === 'in_progress'
      || nextStatus === 'completed'
      || nextStatus === 'overdue'
    ) {
      setStatusFilter(nextStatus);
    }
    navigation.setParams({ scope: undefined, status: undefined });
  }, [route.params, teamView, navigation]);

  const companyOptions = useMemo(() => {
    if (canPickCompany) {
      return [
        { id: '', label: 'Tất cả công ty' },
        ...companies.map((c) => ({ id: String(c.id), label: c.name })),
      ];
    }
    const ownId = user?.company_id ? String(user.company_id) : '';
    if (ownId) {
      const own = companies.find((c) => String(c.id) === ownId);
      return [{ id: ownId, label: own?.name || 'Công ty của tôi' }];
    }
    return workshopCompaniesForCrossViewer(companies, user).map((c) => ({
      id: String(c.id),
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
    await saveKanbanFilters({
      filterCompany: companyId,
    });
  }, []);

  const load = useCallback(async (
    silent = false,
    append = false,
    opts?: { quiet?: boolean; force?: boolean },
  ) => {
    if (!userId || !filtersReady) {
      if (!userId) {
        setTasks([]);
        setHasMoreTasks(false);
        hasMoreTasksRef.current = false;
        setLoading(false);
      }
      return;
    }
    if (append) {
      if (loadingMoreRef.current || !hasMoreTasksRef.current) return;
      loadingMoreRef.current = true;
      if (!opts?.quiet) setLoadingMore(true);
    } else {
      workAbortRef.current?.abort();
    }
    const ac = append ? (workAbortRef.current || new AbortController()) : new AbortController();
    if (!append) workAbortRef.current = ac;
    const seq = append ? loadSeqRef.current : ++loadSeqRef.current;
    if (!silent && !append) setError(null);
    try {
      const assigneeId = !teamView || scope === 'mine' ? userId : null;
      const companyId = filterCompany || (canPickCompany ? null : (user?.company_id || null));
      const offset = append ? tasksLenRef.current : 0;
      const q = searchRef.current.trim() || undefined;
      // Scope load — không gửi status (giữ KPI đúng trên mọi chip).
      const page = await fetchProductionWorkTasksPage({
        assigneeId,
        companyId,
        q,
        limit: WORK_TASKS_PAGE_SIZE,
        offset,
        signal: ac.signal,
        force: opts?.force,
      });
      if (seq !== loadSeqRef.current) return;
      setTasks((prev) => {
        if (!append) return page.tasks;
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...page.tasks.filter((t) => !seen.has(t.id))];
      });
      setHasMoreTasks(page.hasMore);
      hasMoreTasksRef.current = page.hasMore;
      lastSilentAtRef.current = Date.now();
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = String((e as { message?: string })?.message || '');
      if (/aborted|canceled|cancelled/i.test(msg)) return;
      if (!silent && !append) {
        setError(formatApiError(e));
        setTasks([]);
        setHasMoreTasks(false);
        hasMoreTasksRef.current = false;
      }
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [
    userId,
    teamView,
    scope,
    user?.company_id,
    filterCompany,
    canPickCompany,
    filtersReady,
  ]);

  /** KPI server — đếm đủ mọi assignment (không cắt 200). */
  const loadStats = useCallback(async (opts?: { force?: boolean }) => {
    if (!userId || !filtersReady) return;
    try {
      const assigneeId = !teamView || scope === 'mine'
        ? userId
        : (assigneeFilter !== 'all' ? assigneeFilter : null);
      const companyId = filterCompany || (canPickCompany ? null : (user?.company_id || null));
      const next = await fetchProductionWorkTaskStats({
        assigneeId,
        companyId,
        q: search.trim() || undefined,
        force: opts?.force,
      });
      setServerStats(next);
    } catch (e) {
      // Giữ KPI cũ để màn hình không nhảy về 0, nhưng phải thấy được lỗi:
      // trước đây lỗi bị nuốt và thay bằng việc kéo 40 trang để đếm tay.
      if (!isQueryAbortError(e)) console.warn('[WorkScreen] KPI /stats lỗi:', e);
    }
  }, [
    userId,
    filtersReady,
    teamView,
    scope,
    assigneeFilter,
    filterCompany,
    canPickCompany,
    user?.company_id,
    search,
  ]);

  /** Chip status → lọc server (status / overdue). */
  const loadChip = useCallback(async (append = false, opts?: { force?: boolean }) => {
    const chip = statusFilterRef.current;
    if (!userId || !filtersReady || chip === 'all') return;
    if (append) {
      if (loadingMoreRef.current || !chipHasMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      chipAbortRef.current?.abort();
      setChipLoading(true);
    }
    const ac = append ? (chipAbortRef.current || new AbortController()) : new AbortController();
    if (!append) chipAbortRef.current = ac;
    const seq = append ? chipSeqRef.current : ++chipSeqRef.current;
    try {
      const assigneeId = !teamView || scope === 'mine' ? userId : null;
      const companyId = filterCompany || (canPickCompany ? null : (user?.company_id || null));
      const offset = append ? chipLenRef.current : 0;
      const page = await fetchProductionWorkTasksPage({
        assigneeId,
        companyId,
        status: chip === 'overdue' ? null : chip,
        overdue: chip === 'overdue',
        q: searchRef.current.trim() || undefined,
        limit: WORK_TASKS_PAGE_SIZE,
        offset,
        signal: ac.signal,
        force: opts?.force,
      });
      if (seq !== chipSeqRef.current || statusFilterRef.current !== chip) return;
      setChipTasks((prev) => {
        if (!append) return page.tasks;
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...page.tasks.filter((t) => !seen.has(t.id))];
      });
      setChipHasMore(page.hasMore);
      chipHasMoreRef.current = page.hasMore;
    } catch (e) {
      if (seq !== chipSeqRef.current) return;
      const msg = String((e as { message?: string })?.message || '');
      if (/aborted|canceled|cancelled/i.test(msg)) return;
      if (!append) {
        setChipTasks([]);
        setChipHasMore(false);
        chipHasMoreRef.current = false;
      }
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      if (seq === chipSeqRef.current) setChipLoading(false);
    }
  }, [
    userId,
    teamView,
    scope,
    user?.company_id,
    filterCompany,
    canPickCompany,
    filtersReady,
  ]);

  useEffect(() => () => {
    workAbortRef.current?.abort();
    chipAbortRef.current?.abort();
  }, []);

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

  // Đồng bộ công ty khi Overview/Kanban đổi (cùng sx_kanban_filters_v1).
  useEffect(() => {
    const unsub = subscribeSharedFilters((snap) => {
      let next = String(snap.filterCompany || '');
      if (!canPickCompany) {
        const ownId = user?.company_id ? String(user.company_id) : '';
        if (ownId) next = ownId;
      }
      setFilterCompany((prev) => (prev === next ? prev : next));
    });
    return unsub;
  }, [canPickCompany, user?.company_id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(false, false, { force: true }), loadStats({ force: true })]);
      if (statusFilterRef.current !== 'all') await loadChip(false, { force: true });
    } finally {
      setRefreshing(false);
    }
  }, [load, loadChip, loadStats]);

  useEffect(() => {
    if (!filtersReady) return;
    setLoading(true);
    skipNextFocusRefreshRef.current = true;
    void load(false);
    void loadStats();
  }, [load, loadStats, filtersReady]);

  // Search đổi → reload list + KPI server (q trên API). Bỏ qua lần mount đầu (đã load ở trên).
  useEffect(() => {
    if (!filtersReady || !userId) return;
    if (skipFirstSearchEffectRef.current) {
      skipFirstSearchEffectRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      void load(false);
      void loadStats();
      if (statusFilterRef.current !== 'all') void loadChip(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search, load, loadChip, loadStats, filtersReady, userId]);

  // Chip status → list riêng qua API (status / overdue); KPI vẫn từ `tasks` scope.
  useEffect(() => {
    if (!filtersReady || !userId) return;
    if (statusFilter === 'all') {
      chipAbortRef.current?.abort();
      setChipTasks([]);
      setChipHasMore(false);
      chipHasMoreRef.current = false;
      setChipLoading(false);
      return;
    }
    void loadChip(false);
  }, [statusFilter, filtersReady, userId, loadChip]);

  // Quay lại tab / thoát ProjectDetail → refetch nếu đã stale (>12s).
  useFocusEffect(
    useCallback(() => {
      if (!filtersReady || !userId) return undefined;
      if (skipNextFocusRefreshRef.current) {
        skipNextFocusRefreshRef.current = false;
        return undefined;
      }
      const now = Date.now();
      if (now - lastSilentAtRef.current < 12_000) return undefined;
      lastSilentAtRef.current = now;
      void load(true);
      // Stats/chip chỉ refetch nếu đã cũ hơn 12s (load vừa stamp lastSilentAt).
      void loadStats();
      if (statusFilterRef.current !== 'all') void loadChip(false);
      return undefined;
    }, [filtersReady, userId, load, loadChip, loadStats]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !isFocused || !filtersReady || !userId) return;
      const now = Date.now();
      if (now - lastSilentAtRef.current < 60_000) return;
      lastSilentAtRef.current = now;
      void load(true);
      void loadStats();
      if (statusFilterRef.current !== 'all') void loadChip(false);
    });
    return () => sub.remove();
  }, [load, loadChip, loadStats, filtersReady, userId, isFocused]);

  useProductionRealtime({
    // Server vừa đổi dữ liệu → bỏ qua cache, nếu không sẽ hiện lại bản cũ trong TTL.
    onRefresh: () => {
      void load(true, false, { force: true });
      void loadStats({ force: true });
      if (statusFilterRef.current !== 'all') void loadChip(false, { force: true });
    },
    enabled: Boolean(userId) && filtersReady,
    modes: REALTIME_TASK,
    debounceMs: 1500,
  });

  const onSelectCompany = useCallback(async (id: string) => {
    if (!canPickCompany && user?.company_id && id !== String(user.company_id)) return;
    setFilterCompany(id);
    setQuickPicker(null);
    await persistCompanyFilter(id);
  }, [canPickCompany, user?.company_id, persistCompanyFilter]);

  const openTaskProject = useCallback((task: WorkTask) => {
    const pid = task.lead?.project_id;
    if (!pid) return;
    openProjectDetail(String(pid), { focusTaskId: workTaskFocusCrmId(task) });
  }, [openProjectDetail]);

  const bumpTaskFileCount = useCallback((taskId: string) => {
    const bump = (prev: WorkTask[]) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              file_count: (t.file_count ?? 0) + 1,
              attachment_count: (t.attachment_count ?? 0) + 1,
            }
          : t,
      );
    setTasks(bump);
    setChipTasks(bump);
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

  const openAttachSheet = useCallback(async (task: WorkTask) => {
    setAttachSheet({ task, files: [], loading: true });
    try {
      const files = await fetchWorkTaskAttachments(task);
      setAttachSheet({ task, files, loading: false });
    } catch (e) {
      setAttachSheet({ task, files: [], loading: false });
      Alert.alert('Không tải được file', formatApiError(e));
    }
  }, []);

  const onPressAttach = useCallback((task: WorkTask) => {
    const count = task.file_count || task.attachment_count || 0;
    if (count <= 0) {
      void pickFileForTask(task);
      return;
    }
    Alert.alert(
      'File đính kèm',
      `${count} file — chọn thao tác`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xem file', onPress: () => void openAttachSheet(task) },
        { text: 'Thêm file', onPress: () => void pickFileForTask(task) },
      ],
    );
  }, [openAttachSheet, pickFileForTask]);

  const openWorkAttachment = useCallback(async (file: WorkTaskAttachment) => {
    const url = resolveMediaUrl(file.file_url);
    if (!url) {
      Alert.alert('Thiếu link', 'File này không có đường dẫn để mở.');
      return;
    }
    const kind = workFileKind(file);
    if (kind === 'image') {
      const images = (attachSheet?.files || [])
        .filter((f) => workFileKind(f) === 'image')
        .map((f) => {
          const uri = resolveMediaUrl(f.file_url);
          if (!uri) return null;
          return { uri, title: f.name } as GalleryImage;
        })
        .filter(Boolean) as GalleryImage[];
      const idx = Math.max(0, images.findIndex((img) => img.uri === url));
      if (!images.length) {
        Alert.alert('Ảnh', 'Không mở được ảnh này.');
        return;
      }
      setGallery({ images, index: idx >= 0 ? idx : 0 });
      return;
    }
    if (downloadingId) return;
    setDownloadingId(file.id);
    try {
      const saved = await saveMessengerAttachment(url, {
        name: file.name,
        mime: file.mime_type,
      });
      Alert.alert(
        'Đã tải về',
        `«${saved.displayName}» đã lưu vào ${saved.locationHint}.`,
      );
    } catch (e) {
      Alert.alert('Tải file', formatApiError(e) || 'Không tải được file.');
    } finally {
      setDownloadingId(null);
    }
  }, [attachSheet?.files, downloadingId]);

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
    // Search đã gửi `q` lên server — không lọc lại client (tránh che match SĐT/lead).
    const source = statusFilter === 'all' ? tasks : chipTasks;
    return source.filter((t) => {
      // Status đã lọc server khi chip ≠ all — chỉ soft-check overdue nếu BE cũ chưa có param.
      if (statusFilter === 'all') {
        /* no status chip */
      } else if (statusFilter === 'pending' && !isTaskPending(t.status)) return false;
      else if (statusFilter === 'in_progress' && !isTaskInProgress(t.status)) return false;
      else if (statusFilter === 'completed' && !isTaskDone(t.status)) return false;
      else if (statusFilter === 'overdue' && !isTaskOverdue(t)) return false;
      if (teamView && scope === 'team' && assigneeFilter !== 'all') {
        if (!taskAssignedToUser(t, assigneeFilter)) return false;
      }
      if (filterCompany && String(t.company_id || '') !== String(filterCompany)) {
        return false;
      }
      return true;
    });
  }, [tasks, chipTasks, statusFilter, teamView, scope, assigneeFilter, filterCompany]);

  const dealSections = useMemo(() => groupTasksByDeal(filtered), [filtered]);

  const flatRows = useMemo(() => {
    const rows: ListRow[] = [];
    for (const section of dealSections) {
      rows.push({ kind: 'section', key: `s-${section.leadId}`, section });
      if (!expandedLeadIds[section.leadId]) continue;
      for (const task of section.tasks) {
        rows.push({ kind: 'task', key: `t-${task.id}`, task });
      }
    }
    return rows;
  }, [dealSections, expandedLeadIds]);

  const toggleDealSection = useCallback((leadId: string) => {
    setExpandedLeadIds((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
  }, []);

  /** Stats fallback client — scope đã tải (search/KPI ưu tiên /stats). */
  const statsScope = useMemo(() => {
    return tasks.filter((t) => {
      if (teamView && scope === 'team' && assigneeFilter !== 'all') {
        if (!taskAssignedToUser(t, assigneeFilter)) return false;
      }
      if (filterCompany && String(t.company_id || '') !== String(filterCompany)) {
        return false;
      }
      return true;
    });
  }, [tasks, teamView, scope, assigneeFilter, filterCompany]);

  const stats = useMemo(() => {
    if (serverStats) {
      return {
        pending: serverStats.pending,
        inProgress: serverStats.in_progress,
        done: serverStats.completed,
        overdue: serverStats.overdue,
      };
    }
    return {
      pending: statsScope.filter((t) => isTaskPending(t.status)).length,
      inProgress: statsScope.filter((t) => isTaskInProgress(t.status)).length,
      done: statsScope.filter((t) => isTaskDone(t.status)).length,
      overdue: statsScope.filter((t) => isTaskOverdue(t)).length,
    };
  }, [serverStats, statsScope]);

  const personLabel = useMemo(() => {
    if (assigneeFilter === 'all') return 'Tất cả';
    const found = assigneeOptions.find((a) => a.id === assigneeFilter);
    return found?.name || 'Người nhận';
  }, [assigneeFilter, assigneeOptions]);

  const assigneePickerOptions = useMemo(
    () => [
      { id: 'all', label: 'Tất cả' },
      ...assigneeOptions.map((a) => ({ id: a.id, label: a.name })),
    ],
    [assigneeOptions],
  );

  const showCompanyPicker = canPickCompany || companyOptions.length > 1;
  const showAssignee = teamView && scope === 'team';
  const DROPDOWN_MIN_CHOICES = 2;
  const realChoiceCount = (opts: { id: string }[]) =>
    opts.filter((o) => o.id !== '' && o.id !== 'all').length;
  const useCompanyDropdown = showCompanyPicker && realChoiceCount(companyOptions) >= DROPDOWN_MIN_CHOICES;
  const useAssigneeDropdown = showAssignee && realChoiceCount(assigneePickerOptions) >= DROPDOWN_MIN_CHOICES;

  const filterBadge = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (statusFilter !== 'all') n += 1;
    if (teamView && scope === 'mine') n += 1;
    if (showAssignee && assigneeFilter !== 'all') n += 1;
    if (canPickCompany && filterCompany) n += 1;
    return n;
  }, [
    search,
    statusFilter,
    teamView,
    scope,
    showAssignee,
    assigneeFilter,
    canPickCompany,
    filterCompany,
  ]);

  type ActiveChip = { key: string; label: string; onClear: () => void };
  const activeFilterChips = useMemo((): ActiveChip[] => {
    const chips: ActiveChip[] = [];
    const q = search.trim();
    if (q) {
      chips.push({
        key: 'search',
        label: `Tìm: ${q.length > 14 ? `${q.slice(0, 14)}…` : q}`,
        onClear: () => setSearch(''),
      });
    }
    // Phạm vi Đội/Tôi + trạng thái chọn nhanh trên hàng chip — không lặp active-chip
    if (!useCompanyDropdown && filterCompany && canPickCompany) {
      chips.push({
        key: 'company',
        label: companyLabel,
        onClear: () => { void onSelectCompany(''); },
      });
    }
    if (!useAssigneeDropdown && showAssignee && assigneeFilter !== 'all') {
      chips.push({
        key: 'assignee',
        label: personLabel,
        onClear: () => setAssigneeFilter('all'),
      });
    }
    return chips;
  }, [
    search,
    useCompanyDropdown,
    filterCompany,
    canPickCompany,
    companyLabel,
    useAssigneeDropdown,
    showAssignee,
    assigneeFilter,
    personLabel,
    onSelectCompany,
  ]);

  type DropdownChip = {
    key: string;
    prefix: string;
    label: string;
    active: boolean;
    onOpen: () => void;
    onClear?: () => void;
  };

  const filterDropdownChips = useMemo((): DropdownChip[] => {
    const chips: DropdownChip[] = [];
    if (useCompanyDropdown) {
      chips.push({
        key: 'dd-company',
        prefix: 'Công ty',
        label: filterCompany ? companyLabel : 'Tất cả',
        active: !!filterCompany,
        onOpen: () => setQuickPicker('company'),
        onClear: filterCompany ? () => { void onSelectCompany(''); } : undefined,
      });
    }
    if (useAssigneeDropdown) {
      chips.push({
        key: 'dd-assignee',
        prefix: 'Người',
        label: assigneeFilter !== 'all' ? personLabel : 'Tất cả',
        active: assigneeFilter !== 'all',
        onOpen: () => setQuickPicker('assignee'),
        onClear: assigneeFilter !== 'all' ? () => setAssigneeFilter('all') : undefined,
      });
    }
    return chips;
  }, [
    useCompanyDropdown,
    filterCompany,
    companyLabel,
    useAssigneeDropdown,
    assigneeFilter,
    personLabel,
    onSelectCompany,
  ]);

  const showFilterChipRow = activeFilterChips.length > 0 || filterDropdownChips.length > 0;

  const resetWorkFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setScope(teamView ? 'team' : 'mine');
    setAssigneeFilter('all');
    if (canPickCompany) void onSelectCompany('');
  }, [teamView, canPickCompany, onSelectCompany]);

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
      setChipTasks((prev) =>
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

  const renderTaskCard = (task: WorkTask) => {
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
                onPress={() => onPressAttach(task)}
                disabled={busy}
                pressStyle={{ opacity: 0.8 }}
              >
                {busy ? (
                  <SpinningLoader size="small" color={colors.primary} />
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
                <SpinningLoader size="small" color={colors.text} />
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

  const renderRow = ({ item }: { item: ListRow }) => {
    if (item.kind === 'section') {
      const s = item.section;
      const open = s.tasks.filter((t) => !isTaskDone(String(t.status))).length;
      const expanded = !!expandedLeadIds[s.leadId];
      return (
        <View style={styles.sectionCard}>
          <TapHighlight style={styles.sectionHead} onPress={() => toggleDealSection(s.leadId)}>
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={colors.textMuted}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sectionTitle} numberOfLines={1}>
                {s.code ? `${s.code} · ` : ''}{s.title || 'Deal'}
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
                onPress={() => openProjectDetail(String(s.projectId))}
              >
                <Ionicons name="open-outline" size={18} color={colors.primary} />
              </Pressable>
            ) : null}
          </TapHighlight>
        </View>
      );
    }
    return renderTaskCard(item.task);
  };

  if ((loading || (statusFilter !== 'all' && chipLoading && chipTasks.length === 0)) && !refreshing) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <SpinningLoader size="large" color={colors.primary} />
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
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm việc, deal, người…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.filterBtn, filterBadge > 0 && styles.filterBtnActive]}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityLabel="Bộ lọc"
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={filterBadge > 0 ? colors.white : colors.text}
          />
          <Text style={[styles.filterBtnTxt, filterBadge > 0 && styles.filterBtnTxtActive]}>
            Bộ lọc
          </Text>
          {filterBadge > 0 ? (
            <View style={styles.filterBtnBadge}>
              <Text style={styles.filterBtnBadgeTxt}>
                {filterBadge > 9 ? '9+' : filterBadge}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {showFilterChipRow ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeChipScroll}
          contentContainerStyle={styles.activeChipContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {filterDropdownChips.map((chip) => (
            <View
              key={chip.key}
              style={[styles.dropdownChip, chip.active && styles.dropdownChipActive]}
            >
              <Pressable
                style={styles.dropdownChipMain}
                onPress={chip.onOpen}
                accessibilityLabel={`${chip.prefix}: ${chip.label}`}
              >
                <Text style={styles.dropdownChipPrefix} numberOfLines={1}>{chip.prefix}</Text>
                <Text
                  style={[styles.dropdownChipTxt, chip.active && styles.dropdownChipTxtActive]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={chip.active ? colors.primary : colors.textMuted}
                />
              </Pressable>
              {chip.onClear ? (
                <Pressable
                  onPress={chip.onClear}
                  hitSlop={10}
                  style={styles.dropdownChipClear}
                  accessibilityLabel={`Xóa ${chip.prefix}`}
                >
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {activeFilterChips.map((chip) => (
            <Pressable key={chip.key} style={styles.activeChip} onPress={chip.onClear}>
              <Text style={styles.activeChipTxt} numberOfLines={1}>{chip.label}</Text>
              <Ionicons name="close" size={13} color={colors.textMuted} />
            </Pressable>
          ))}
          {(activeFilterChips.length > 0
            || filterDropdownChips.some((c) => c.active)
            || filterBadge > 0) ? (
            <Pressable style={styles.activeChipClear} onPress={resetWorkFilters}>
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.filterScroll}
        >
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
          <View style={[styles.statsDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.statsLabel, { color: colors.warning }]}>Chưa</Text>
          <Text style={[styles.statsNum, { color: colors.warning }]}>{stats.pending}</Text>
        </View>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.statsLabel, { color: colors.primary }]}>Đang</Text>
          <Text style={[styles.statsNum, { color: colors.primary }]}>{stats.inProgress}</Text>
        </View>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.statsLabel, { color: colors.success }]}>Xong</Text>
          <Text style={[styles.statsNum, { color: colors.success }]}>{stats.done}</Text>
        </View>
        <View style={styles.statsItem}>
          <View style={[styles.statsDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.statsLabel, { color: colors.danger }]}>QH</Text>
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
    <View style={styles.container}>
      {/*
        Header/filter nằm NGOÀI FlatList: trên Android, Pressable trong
        ListHeaderComponent (+ removeClippedSubviews / ScrollView ngang lồng)
        thường bị nuốt gesture — chỉ TextInput còn nhận chạm.
      */}
      {listHeader}

      <FlatList
        style={styles.listFlex}
        data={flatRows}
        keyExtractor={(item) => item.key}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        initialNumToRender={16}
        windowSize={7}
        maxToRenderPerBatch={12}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (filtered.length === 0) return;
          if (loading || chipLoading || loadingMoreRef.current) return;
          if (statusFilter !== 'all') {
            if (!chipHasMoreRef.current) return;
            void loadChip(true);
            return;
          }
          if (!hasMoreTasksRef.current) return;
          void load(true, true);
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          filtered.length === 0
            ? null
            : loadingMore
              ? (
                <SpinningLoader style={{ marginVertical: 16 }} color={colors.primary} />
              )
              : (statusFilter === 'all' ? hasMoreTasks : chipHasMore)
                ? (
                  <Text style={[styles.empty, { paddingVertical: 12 }]}>Vuốt thêm để tải tiếp…</Text>
                )
                : null
        }
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

      <Modal
        visible={!!attachSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachSheet(null)}
      >
        <Pressable style={styles.attachModalBackdrop} onPress={() => setAttachSheet(null)}>
          <Pressable style={styles.attachModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.attachModalTitle} numberOfLines={2}>
              {attachSheet?.task.title || 'File đính kèm'}
            </Text>
            <Text style={styles.attachModalSub}>
              {attachSheet?.loading
                ? 'Đang tải danh sách…'
                : `${attachSheet?.files.length || 0} file — ảnh xem trong app, file khác tải về`}
            </Text>
            {attachSheet?.loading ? (
              <SpinningLoader color={colors.primary} style={{ marginVertical: 20 }} />
            ) : attachSheet && attachSheet.files.length > 0 ? (
              <ScrollView style={{ maxHeight: 320 }}>
                {attachSheet.files.map((f) => {
                  const kind = workFileKind(f);
                  const thumb = kind === 'image' ? resolveMediaUrl(f.file_url) : null;
                  const busyDl = downloadingId === f.id;
                  return (
                    <TapHighlight
                      key={f.id}
                      style={styles.attachFileRow}
                      onPress={() => void openWorkAttachment(f)}
                      disabled={busyDl}
                    >
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.attachThumb} />
                      ) : (
                        <View style={styles.attachIconWrap}>
                          <Ionicons name={workFileIcon(kind)} size={18} color={colors.primary} />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.attachFileName} numberOfLines={2}>{f.name}</Text>
                        <Text style={styles.attachFileMeta}>{workFileKindLabel(kind)}</Text>
                      </View>
                      {busyDl ? (
                        <SpinningLoader size="small" color={colors.primary} />
                      ) : (
                        <Ionicons
                          name={kind === 'image' ? 'expand-outline' : 'download-outline'}
                          size={16}
                          color={colors.textMuted}
                        />
                      )}
                    </TapHighlight>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.attachEmpty}>Chưa tìm thấy file (có thể chỉ còn trên deal).</Text>
            )}
            <View style={styles.attachModalActions}>
              <TapHighlight
                style={styles.attachModalBtn}
                onPress={() => setAttachSheet(null)}
              >
                <Text style={styles.attachModalBtnTxt}>Đóng</Text>
              </TapHighlight>
              <TapHighlight
                style={[styles.attachModalBtn, styles.attachModalBtnPrimary]}
                onPress={() => {
                  const t = attachSheet?.task;
                  setAttachSheet(null);
                  if (t) void pickFileForTask(t);
                }}
              >
                <Text style={styles.attachModalBtnTxtPrimary}>Thêm file</Text>
              </TapHighlight>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ImageGalleryLightbox
        visible={!!gallery}
        images={gallery?.images || []}
        initialIndex={gallery?.index || 0}
        onClose={() => setGallery(null)}
      />

      <WorkFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        onReset={() => {
          resetWorkFilters();
          setFilterSheetOpen(false);
        }}
        search={search}
        showScope={teamView}
        scope={scope}
        onScopeChange={(id) => {
          setScope(id);
          setAssigneeFilter('all');
        }}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        showCompanyPicker={showCompanyPicker}
        companyOptions={companyOptions}
        filterCompany={filterCompany}
        onCompanyChange={(id) => { void onSelectCompany(id); }}
        showAssignee={showAssignee}
        assigneeOptions={assigneePickerOptions}
        assigneeFilter={assigneeFilter}
        onAssigneeChange={setAssigneeFilter}
      />

      <FilterPickerModal
        visible={quickPicker === 'company'}
        title="Lọc theo công ty"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={(id) => { void onSelectCompany(id); }}
        onClose={() => setQuickPicker(null)}
      />
      <FilterPickerModal
        visible={quickPicker === 'assignee'}
        title="Lọc theo người nhận"
        options={assigneePickerOptions}
        selectedId={assigneeFilter}
        onSelect={setAssigneeFilter}
        onClose={() => setQuickPicker(null)}
      />
    </View>
  );
}
