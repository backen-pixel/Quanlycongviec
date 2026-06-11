import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import TapHighlight from '../components/TapHighlight';
import FilterPickerModal from '../components/FilterPickerModal';
import MoveColumnModal from '../components/MoveColumnModal';
import ProjectCommentModal from '../components/ProjectCommentModal';
import Toast, { type ToastKind, type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNotifications } from '../context/NotificationContext';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  fetchCompanies,
  fetchProductionBoard,
  fetchProductionProject,
  fetchProjectCommentIndex,
  fetchWorkshopTypes,
  moveProjectToStage,
  type BoardFilters,
  type CommentIndexEntry,
  type CompanyOption,
  type WorkshopTypeOption,
} from '../lib/productionApi';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useTheme } from '../context/ThemeContext';
import { type AppColors, colorWithAlpha, formatMoneyAmount, getTaskProgressColor, HIT_TARGET, Radii, Spacing, stageColor } from '../theme';
import type { KanbanStage, ProductionBoard, ProductionProject } from '../types';

type QuickFilter = 'all' | 'mine' | 'overdue' | 'today';

const INTAKE_BUCKET = 'won_pending';

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

type VcTag = { label: 'Chờ VC' | 'Đang VC'; bg: string; border: string; color: string };

function getVcTag(p: ProductionProject, stages: KanbanStage[]): VcTag | null {
  if (isAwaitingDelivery(p, stages)) {
    return { label: 'Chờ VC', bg: '#33415533', border: '#94A3B8', color: '#CBD5E1' };
  }
  const status = String(p.status || '');
  if (['shipping', 'installing', 'warranty'].includes(status)) {
    return { label: 'Đang VC', bg: '#0EA5E933', border: '#38BDF8', color: '#7DD3FC' };
  }
  return null;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const TYPE_PALETTE = [
  '#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EC4899', '#10B981', '#F97316', '#06B6D4',
];
function typeColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return TYPE_PALETTE[Math.abs(h) % TYPE_PALETTE.length];
}

const AVATAR_COLORS = ['#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#F97316'];
function avatarColor(name?: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const VC_SHIPPED_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);

function stageById(stages: KanbanStage[], colId?: string | null): KanbanStage | undefined {
  if (!colId) return undefined;
  return stages.find((s) => String(s.id) === String(colId));
}

/** Đã bàn giao / đang vận chuyển (khớp web `projectIsShipped`). */
function isShipped(p: ProductionProject): boolean {
  return VC_SHIPPED_STATUSES.has(String(p.status || ''));
}

/** Ở cột bàn giao VC, chưa vận chuyển (khớp web `projectIsAwaitingDelivery`). */
function isAwaitingDelivery(p: ProductionProject, stages: KanbanStage[]): boolean {
  if (isShipped(p)) return false;
  const colId = p.resolved_column_id ?? p.sx_kanban_column_id;
  const col = stageById(stages, colId);
  return Boolean(col?.is_handover_to_logistics);
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  try {
    const d = new Date(value);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  } catch {
    return false;
  }
}

export default function KanbanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createKanbanStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount, refreshUnread, commentToast, dismissCommentToast, projectMetaRef } = useNotifications();
  const { openProjectDetail, openMessages } = useRootNavigation();
  const myId = user?.id || user?.userId || null;
  const { unreadTotal: messageUnread } = useMessenger();

  const [board, setBoard] = useState<ProductionBoard>({ stages: [], projects: [], kpis: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterWorkTypeId, setFilterWorkTypeId] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkshopTypeOption[]>([]);
  // Ref cache danh sách công ty — không bao giờ bị xóa khi board reload theo filter.
  const allCompaniesRef = useRef<CompanyOption[]>([]);
  const [workTypePickerOpen, setWorkTypePickerOpen] = useState(false);
  const [moveModalProject, setMoveModalProject] = useState<ProductionProject | null>(null);
  const [commentProject, setCommentProject] = useState<ProductionProject | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commentIndex, setCommentIndex] = useState<Record<string, CommentIndexEntry>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs để load() luôn dùng giá trị filter mới nhất mà không cần thêm vào deps array.
  const filterCompanyRef = useRef('');
  const filterWorkTypeIdRef = useRef('');
  const isFirstMount = useRef(true);

  const isSystemAdmin = user?.role === 'admin' && !user?.company_id;
  const companyForTypes = filterCompany || user?.company_id || null;

  const showToast = useCallback((message: string, kind: ToastKind) => {
    setToast({ message, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const openCommentForProjectId = useCallback(
    async (projectId: string) => {
      const local = board.projects.find((p) => String(p.id) === String(projectId));
      if (local) {
        setCommentProject(local);
        return;
      }
      try {
        const proj = await fetchProductionProject(projectId);
        setCommentProject(proj);
      } catch (e) {
        showToast(formatApiError(e), 'error');
      }
    },
    [board.projects, showToast],
  );

  const openNotifications = useCallback(async () => {
    void ensureNotificationPermission();
    setNotificationsOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    for (const p of board.projects) {
      projectMetaRef.current.set(String(p.id), { code: p.code, name: p.name });
    }
  }, [board.projects, projectMetaRef]);

  useEffect(() => {
    if (!commentToast) return undefined;
    const t = setTimeout(() => dismissCommentToast(), 4500);
    return () => clearTimeout(t);
  }, [commentToast, dismissCommentToast]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const filters: BoardFilters = {
        companyId: filterCompanyRef.current || undefined,
        workshopTypeId: filterWorkTypeIdRef.current || undefined,
      };
      const data = await fetchProductionBoard(mode === 'silent', filters);
      setBoard(data);
      setActiveIndex((prev) => Math.min(prev, Math.max(0, data.stages.length - 1)));
    } catch (e) {
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Đồng bộ refs với state để load() luôn dùng filter mới nhất.
  useEffect(() => { filterCompanyRef.current = filterCompany; }, [filterCompany]);
  useEffect(() => { filterWorkTypeIdRef.current = filterWorkTypeId; }, [filterWorkTypeId]);

  useEffect(() => { void load('init'); }, [load]);

  // Re-fetch board khi company hoặc phân loại đổi (bỏ qua lần mount đầu tiên).
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    setActiveIndex(0);
    void load('init');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompany, filterWorkTypeId]);

  useProductionRealtime({
    onRefresh: () => load('silent'),
  });

  useEffect(() => {
    const ids = board.projects.map((p) => p.id).filter(Boolean);
    if (!ids.length) {
      setCommentIndex({});
      return;
    }
    void fetchProjectCommentIndex(ids)
      .then(setCommentIndex)
      .catch(() => setCommentIndex({}));
  }, [board.projects]);

  useEffect(() => {
    void fetchCompanies()
      .then((list) => {
        setCompanies(list);
        // Lưu vào ref để companyOptions không bị mất khi board reload theo filter.
        if (list.length > 0) allCompaniesRef.current = list;
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!companyForTypes) {
      setWorkTypes([]);
      return;
    }
    void fetchWorkshopTypes(companyForTypes)
      .then(setWorkTypes)
      .catch(() => setWorkTypes([]));
  }, [companyForTypes]);

  const companyOptions = useMemo(() => {
    // Ưu tiên: ref cache (ổn định qua board reload) > companies state > fallback từ board.projects
    const stable = allCompaniesRef.current.length ? allCompaniesRef.current : companies;
    const fromApi = stable.length
      ? stable
      : (() => {
          const map = new Map<string, string>();
          board.projects.forEach((p) => {
            if (p.company_id && p.company_name) map.set(p.company_id, p.company_name);
          });
          return Array.from(map, ([id, name]) => ({ id, name }));
        })();
    return [{ id: '', label: 'Tất cả' }, ...fromApi.map((c) => ({ id: c.id, label: c.name }))];
  }, [companies, board.projects]);

  const workTypeOptions = useMemo(
    () => [
      { id: '', label: 'Tất cả phân loại' },
      { id: 'none', label: 'Chưa phân loại' },
      ...workTypes.map((t) => ({ id: t.id, label: t.name })),
    ],
    [workTypes],
  );

  // selectedCompanyLabel — không cần vì công ty hiện dạng chips ngang
  const selectedWorkTypeLabel = workTypeOptions.find((o) => o.id === filterWorkTypeId)?.label || 'Phân loại';

  const stages = board.stages;
  const activeStage: KanbanStage | undefined = stages[activeIndex];
  const canPrev = activeIndex > 0;
  const canNext = activeIndex < stages.length - 1;
  const accent = stageColor(activeStage?.color, activeIndex);

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return board.projects.filter((p) => {
      if (needle) {
        const hay = `${p.code} ${p.name} ${p.customer_name || ''} ${p.customer_phone || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (quickFilter === 'mine' && String(p.production_person_id || '') !== String(myId || '')) return false;
      if (quickFilter === 'overdue' && !p.is_overdue) return false;
      if (quickFilter === 'today' && !isToday(p.production_deadline || p.deadline)) return false;
      // filterCompany được lọc server-side (company_id gửi lên /projects), không cần lọc lại.
      // filterWorkTypeId lọc client-side như web (chỉ /pipeline-stages nhận workshop_type_id).
      if (filterWorkTypeId === 'none' && p.workshop_type_id) return false;
      if (filterWorkTypeId && filterWorkTypeId !== 'none'
        && String(p.workshop_type_id || '') !== String(filterWorkTypeId)) return false;
      return true;
    });
  }, [board.projects, search, quickFilter, myId, filterWorkTypeId]);

  const projectsByStage = useMemo(() => {
    const map = new Map<string, ProductionProject[]>();
    stages.forEach((s) => map.set(s.id, []));
    filteredProjects.forEach((p) => {
      const key = p.resolved_column_id;
      if (key && map.has(key)) map.get(key)!.push(p);
    });
    return map;
  }, [stages, filteredProjects]);

  const columnProjects = activeStage ? (projectsByStage.get(activeStage.id) || []) : [];
  const filterActive = search.trim().length > 0 || quickFilter !== 'all'
    || !!filterCompany || !!filterWorkTypeId;

  const moveCardTo = useCallback(
    async (project: ProductionProject, targetStageId: string) => {
      const target = stages.find((s) => String(s.id) === String(targetStageId));
      if (!target) return;
      const fromColId = project.resolved_column_id ?? project.sx_kanban_column_id ?? null;
      const isIntake = target.bucket_slug === INTAKE_BUCKET;
      setMovingId(project.id);
      setBoard((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === project.id
            ? { ...p, sx_kanban_column_id: target.id, resolved_column_id: target.id, sx_intake: isIntake }
            : p,
        ),
      }));
      try {
        const result = await moveProjectToStage(project.id, target.id, {
          currentStageId: fromColId,
          isIntake,
          companyId: project.company_id ?? user?.company_id ?? null,
        });
        const newColId = result.sx_kanban_column_id ?? target.id;
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  sx_kanban_column_id: newColId,
                  resolved_column_id: newColId,
                  sx_intake: isIntake,
                  current_stage_id: result.current_stage_id ?? p.current_stage_id,
                }
              : p,
          ),
        }));
        showToast(`Đã chuyển ${project.code} → ${target.name}`, 'success');
      } catch (e) {
        setBoard((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === project.id
              ? { ...p, sx_kanban_column_id: fromColId, resolved_column_id: fromColId }
              : p,
          ),
        }));
        showToast(formatApiError(e), 'error');
      } finally {
        setMovingId(null);
      }
    },
    [stages, showToast, user?.company_id],
  );

  const statPills = useMemo(() => {
    const list = filteredProjects;
    const intakeStage = stages.find((s) => s.bucket_slug === INTAKE_BUCKET);
    const handoverStage = stages.find((s) => s.is_handover_to_logistics);
    const producing = list.filter((p) => {
      const col = p.resolved_column_id;
      if (!col || col === intakeStage?.id || col === handoverStage?.id) return false;
      if (isShipped(p) || isAwaitingDelivery(p, stages)) return false;
      return p.status === 'producing' || !['completed'].includes(String(p.status || ''));
    }).length;
    const awaitingDelivery = list.filter((p) => isAwaitingDelivery(p, stages)).length;
    const shipped = list.filter((p) => isShipped(p)).length;
    const completed = list.filter((p) => p.status === 'completed').length;
    const intake = list.filter((p) => p.resolved_column_id === intakeStage?.id || p.sx_intake).length;
    const overdue = list.filter((p) => p.is_overdue).length;
    return [
      { label: 'Tổng', value: list.length, color: colors.text },
      { label: 'Đang SX', value: producing, color: colors.primary },
      { label: 'Chờ vận chuyển', value: awaitingDelivery, color: '#94A3B8' },
      { label: 'Đã vận chuyển', value: shipped, color: '#38BDF8' },
      { label: 'Hoàn tất', value: completed, color: colors.success },
      { label: 'Kế hoạch', value: intake, color: colors.textMuted },
      ...(overdue > 0 ? [{ label: 'Quá hạn', value: overdue, color: colors.danger }] : []),
    ];
  }, [filteredProjects, stages]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  if (error && !stages.length) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Ionicons name="cloud-offline-outline" size={44} color={colors.textFaint} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load('init')}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Khối cố định — không bị FlatList co lại trên Android */}
      <View style={styles.fixedTop}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>Xưởng SX</Text>
          <Text style={styles.appSub}>Bảng điều hành sản xuất</Text>
        </View>
        <View style={styles.headerBtns}>
          <TapHighlight style={styles.iconBtn} onPress={() => openMessages('chats')} hitSlop={8}>
            <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
            {messageUnread > 0 ? (
              <View style={[styles.notifBadge, styles.msgBadge]}>
                <Text style={styles.notifBadgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
              </View>
            ) : null}
          </TapHighlight>
          <TapHighlight style={styles.iconBtn} onPress={() => openMessages('calls')} hitSlop={8}>
            <Ionicons name="call-outline" size={20} color={colors.text} />
          </TapHighlight>
          <TapHighlight style={styles.iconBtn} onPress={() => void openNotifications()} hitSlop={8}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </TapHighlight>
          <TapHighlight style={styles.iconBtn} onPress={() => load('refresh')} hitSlop={8}>
            <Ionicons name="refresh-outline" size={20} color={colors.text} />
          </TapHighlight>
        </View>
      </View>

      {commentToast && !notificationsOpen ? (
        <TapHighlight
          style={styles.commentToast}
          onPress={() => {
            const pid = commentToast.notification.metadata?.project_id || commentToast.notification.entity_id;
            dismissCommentToast();
            if (pid) void openCommentForProjectId(String(pid));
          }}
        >
          <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.commentToastTitle} numberOfLines={1}>
              {commentToast.notification.title}
            </Text>
            {commentToast.notification.metadata?.comment_preview ? (
              <Text style={styles.commentToastBody} numberOfLines={2}>
                "{commentToast.notification.metadata.comment_preview}"
              </Text>
            ) : (
              <Text style={styles.commentToastBody} numberOfLines={2}>
                {commentToast.notification.message}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </TapHighlight>
      ) : null}

      {/* ── SEARCH ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tên mã, tên khách, SĐT..."
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── QUICK FILTER CHIPS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
        nestedScrollEnabled
      >
        {([
          { id: 'all', label: 'Tất cả' },
          { id: 'mine', label: 'Của tôi' },
          { id: 'overdue', label: 'Quá hạn' },
          { id: 'today', label: 'Hôm nay' },
        ] as const).map((c, idx, arr) => {
          const active = quickFilter === c.id;
          return (
            <TapHighlight
              key={c.id}
              onPress={() => setQuickFilter(c.id)}
              style={[styles.chip, active && styles.chipActive, idx < arr.length - 1 && styles.chipGap]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {c.label}
              </Text>
            </TapHighlight>
          );
        })}
        {filterActive ? (
          <Pressable
            onPress={() => {
              setSearch('');
              setQuickFilter('all');
              setFilterCompany('');
              setFilterWorkTypeId('');
            }}
            style={[styles.chipClear, styles.chipGap]}
          >
            <Ionicons name="close" size={13} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>

      {/* ── COMPANY CHIPS — 1 tap đổi công ty, không cần modal ── */}
      {(isSystemAdmin || companyOptions.length > 2) ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.companyChipScroll}
          contentContainerStyle={styles.companyChipContent}
          nestedScrollEnabled
        >
          {companyOptions.map((opt, idx) => {
            const active = filterCompany === opt.id;
            return (
              <TapHighlight
                key={opt.id}
                onPress={() => {
                  if (active) return;
                  setFilterCompany(opt.id);
                  setFilterWorkTypeId('');
                }}
                style={[
                  styles.companyChip,
                  active && styles.companyChipActive,
                  idx < companyOptions.length - 1 && styles.chipGap,
                ]}
              >
                {active ? (
                  <Ionicons name="business" size={11} color={colors.white} style={{ marginRight: 3 }} />
                ) : null}
                <Text
                  style={[styles.companyChipText, active && styles.companyChipTextActive]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </TapHighlight>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ── DROPDOWN FILTER — Phân loại ── */}
      <View style={styles.dropdownRow}>
        <Pressable
          style={[styles.dropdownBtn, filterWorkTypeId ? styles.dropdownBtnActive : null, styles.dropdownBtnFlex]}
          hitSlop={4}
          onPress={() => setWorkTypePickerOpen(true)}
        >
          <Ionicons name="layers-outline" size={14} color={filterWorkTypeId ? colors.primary : colors.textMuted} />
          <Text
            style={[styles.dropdownText, filterWorkTypeId ? styles.dropdownTextActive : null]}
            numberOfLines={1}
          >
            {filterWorkTypeId ? selectedWorkTypeLabel : 'Phân loại'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textFaint} />
        </Pressable>
      </View>

      {/* ── KPI PILLS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsScroll}
        contentContainerStyle={styles.statsContent}
        nestedScrollEnabled
      >
        {statPills.map((s, idx) => (
          <View key={s.label} style={[styles.statPill, idx > 0 && styles.statPillGap]}>
            <View style={styles.statValueBox}>
              <Text style={[styles.statValue, { color: s.color }]} numberOfLines={1}>
                {String(s.value)}
              </Text>
            </View>
            <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ── COLUMN HEADER + DOT NAV ── */}
      <View style={styles.colHeaderRow}>
        <Pressable
          onPress={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={!canPrev}
          hitSlop={10}
          style={[styles.colNavArrow, !canPrev && styles.colNavArrowHidden]}
        >
          <Ionicons name="chevron-back" size={20} color={canPrev ? colors.text : colors.textFaint} />
        </Pressable>

        <View style={styles.colHeaderCenter}>
          <Text style={styles.colIcon}>{activeStage?.icon || '📋'}</Text>
          <Text style={styles.colName} numberOfLines={1}>{activeStage?.name || '—'}</Text>
          <View style={[styles.colBadge, { backgroundColor: accent }]}>
            <Text style={styles.colBadgeText}>{columnProjects.length}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => setActiveIndex((i) => Math.min(stages.length - 1, i + 1))}
          disabled={!canNext}
          hitSlop={10}
          style={[styles.colNavArrow, !canNext && styles.colNavArrowHidden]}
        >
          <Ionicons name="chevron-forward" size={20} color={canNext ? colors.text : colors.textFaint} />
        </Pressable>
      </View>

      {/* Dot indicator */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dotsScroll}
        contentContainerStyle={styles.dotsRow}
        nestedScrollEnabled
      >
        {stages.map((s, i) => {
          const active = i === activeIndex;
          return (
            <Pressable key={s.id} onPress={() => setActiveIndex(i)} hitSlop={8} style={i > 0 ? styles.dotGap : undefined}>
              <View
                style={[
                  styles.dot,
                  active && { width: 20, backgroundColor: stageColor(s.color, i) },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      </View>{/* end fixedTop */}

      {/* ── CARD LIST ── */}
      <FlatList
        style={styles.listFlex}
        data={columnProjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 88 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="file-tray-outline" size={38} color={colors.textFaint} />
            <Text style={styles.emptyText}>
              {filterActive ? 'Không tìm thấy dự án phù hợp bộ lọc' : 'Cột này chưa có dự án'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
          const progressColor = getTaskProgressColor(progress, colors);
          const isMoving = movingId === item.id;
          const workTypeName = item.workshop_type_name;
          const workTypeColor = workTypeName ? typeColor(workTypeName) : null;
          const stageName = item.stage_name;
          const avatarBg = avatarColor(item.customer_name);
          const avatarLetters = initials(item.customer_name);
          const moneyAmount = formatMoneyAmount(item.estimated_value);
          const dateStr = formatDate(item.production_deadline || item.deadline);
          const vcTag = getVcTag(item, stages);
          const personName = item.production_person_name?.trim() || null;
          const commentCount = commentIndex[item.id]?.count ?? 0;

          return (
            <View style={[styles.card, { borderLeftColor: accent }]}>
              <Pressable onPress={() => openProjectDetail(item.id)}>
              {/* Row 1: code + tags + date */}
              <View style={styles.cardRow1}>
                <Text style={styles.cardCode}>{item.code}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.cardTagsScroll}
                  contentContainerStyle={styles.cardTags}
                >
                  {workTypeName ? (
                    <View style={[styles.tag, styles.tagGap, { backgroundColor: `${workTypeColor}22`, borderColor: workTypeColor! }]}>
                      <Text style={[styles.tagText, { color: workTypeColor! }]} numberOfLines={1}>{workTypeName}</Text>
                    </View>
                  ) : null}
                  {stageName && stageName !== activeStage?.name ? (
                    <View style={[styles.tagStage, styles.tagGap]}>
                      <Text style={styles.tagStageText} numberOfLines={1}>{stageName}</Text>
                    </View>
                  ) : null}
                  {vcTag ? (
                    <View style={[styles.tag, styles.tagGap, { backgroundColor: vcTag.bg, borderColor: vcTag.border }]}>
                      <Text style={[styles.tagText, { color: vcTag.color }]}>{vcTag.label}</Text>
                    </View>
                  ) : null}
                  {item.is_overdue ? (
                    <View style={[styles.tagOverdue, styles.tagGap]}>
                      <Text style={styles.tagOverdueText}>Quá hạn</Text>
                    </View>
                  ) : null}
                </ScrollView>
                {dateStr ? <Text style={styles.cardDate}>{dateStr}</Text> : null}
              </View>

              {/* Card name */}
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>

              {/* Row 2: avatar + customer */}
              <View style={styles.customerRow}>
                <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={styles.avatarText}>{avatarLetters}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {item.customer_name || '—'}
                    {item.customer_phone ? (
                      <Text style={styles.customerPhone}> · {item.customer_phone}</Text>
                    ) : null}
                  </Text>
                  {item.company_name ? (
                    <Text style={styles.companyName} numberOfLines={1}>{item.company_name}</Text>
                  ) : null}
                </View>
              </View>

              {/* Người phụ trách */}
              <View style={styles.personRow}>
                <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} />
                <Text style={styles.personLabel}>Phụ trách:</Text>
                <Text style={styles.personName} numberOfLines={1}>
                  {personName || 'Chưa gán'}
                </Text>
              </View>

              {/* Stage info if in intake/unassigned */}
              {!item.stage_name ? (
                <Text style={styles.stageHint}>Chưa phân giao đoạn</Text>
              ) : null}

              {/* Tasks + progress */}
              {(item.task_total || 0) > 0 ? (
                <View style={styles.progressSection}>
                  <View style={styles.taskCountRow}>
                    <Ionicons name="checkbox-outline" size={13} color={progressColor} />
                    <Text style={styles.taskCount}>
                      <Text style={{ color: progressColor, fontWeight: '800' }}>{item.done_tasks || 0}</Text>
                      <Text style={{ color: colors.textMuted }}>/{item.task_total} nhiệm vụ</Text>
                    </Text>
                  </View>
                  <View style={styles.progressRow}>
                    <View style={[styles.progressTrack, { backgroundColor: colorWithAlpha(progressColor, 0.18) }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress}%`, backgroundColor: progressColor },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressPct, { color: progressColor }]}>{progress}%</Text>
                  </View>
                </View>
              ) : null}

              </Pressable>
              {/* Bottom: value + icon actions */}
              <View style={styles.cardBottom}>
                <View style={styles.cardBottomLeft}>
                  {moneyAmount ? (
                    <View style={styles.valueBox}>
                      <View style={styles.valueIconWrap}>
                        <Ionicons name="cash-outline" size={15} color={colors.valueText} />
                      </View>
                      <Text style={styles.valueAmount} numberOfLines={1}>{moneyAmount}</Text>
                      <Text style={styles.valueCurrency}>{'\u20AB'}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardActions}>
                  <TapHighlight
                    style={styles.cardActionBtn}
                    onPress={() => setCommentProject(item)}
                    accessibilityLabel="Bình luận"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                    {commentCount > 0 ? (
                      <View style={styles.actionBadge}>
                        <Text style={styles.actionBadgeText}>
                          {commentCount > 99 ? '99+' : commentCount}
                        </Text>
                      </View>
                    ) : null}
                  </TapHighlight>
                  <TapHighlight
                    style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
                    onPress={() => setMoveModalProject(item)}
                    disabled={isMoving}
                    accessibilityLabel="Chuyển cột"
                  >
                    {isMoving ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name="swap-horizontal" size={18} color={colors.white} />
                    )}
                  </TapHighlight>
                </View>
              </View>
            </View>
          );
        }}
      />

      <MoveColumnModal
        visible={!!moveModalProject}
        stages={stages}
        currentStageId={moveModalProject?.resolved_column_id ?? moveModalProject?.sx_kanban_column_id}
        onSelect={(stageId) => {
          if (moveModalProject) void moveCardTo(moveModalProject, stageId);
          setMoveModalProject(null);
        }}
        onClose={() => setMoveModalProject(null)}
      />

      <ProjectCommentModal
        visible={!!commentProject}
        project={commentProject}
        onClose={() => setCommentProject(null)}
        onPosted={(count) => {
          if (!commentProject) return;
          setCommentIndex((prev) => ({
            ...prev,
            [commentProject.id]: {
              count,
              last_at: new Date().toISOString(),
              last_user_id: myId,
            },
          }));
        }}
      />

      <CommentNotificationsModal
        visible={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          void refreshUnread();
        }}
        onOpenProject={(projectId) => void openCommentForProjectId(projectId)}
      />

      <FilterPickerModal
        visible={workTypePickerOpen}
        title="Chọn phân loại"
        options={workTypeOptions}
        selectedId={filterWorkTypeId}
        onSelect={setFilterWorkTypeId}
        onClose={() => setWorkTypePickerOpen(false)}
      />

      <Toast state={toast} />
    </View>
  );
}

function createKanbanStyles(c: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  fixedTop: { flexShrink: 0 },
  listFlex: { flex: 1 },
  center: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: c.textMuted, fontSize: 13 },
  errorText: { color: c.textMuted, textAlign: 'center', fontSize: 13 },
  retryBtn: {
    backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: Radii.md, minHeight: HIT_TARGET, justifyContent: 'center',
  },
  retryText: { color: c.white, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 0,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 6,
  },
  appTitle: { color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  appSub: { color: c.textMuted, fontSize: 12, marginTop: 1 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: Radii.md,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18,
    borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: c.bg,
  },
  msgBadge: { backgroundColor: '#6C5CE7' },
  notifBadgeText: { color: c.white, fontSize: 10, fontWeight: '800' },
  commentToast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: Spacing.lg, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: Radii.lg, borderWidth: 1,
    borderColor: c.primary + '55', backgroundColor: c.primarySoft,
  },
  commentToastTitle: { color: c.text, fontSize: 13, fontWeight: '800' },
  commentToastBody: { color: c.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },

  // Search
  searchRow: { paddingHorizontal: Spacing.lg, paddingBottom: 8, flexShrink: 0 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: Radii.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 14 },

  // Chips — chiều cao cố định, tránh bị FlatList co
  chipScroll: { height: 36, flexShrink: 0, flexGrow: 0 },
  chipContent: { paddingHorizontal: Spacing.lg, alignItems: 'center', height: 36 },
  chipGap: { marginRight: 6 },
  chip: {
    paddingHorizontal: 14, height: 32, borderRadius: Radii.full,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.textMuted, fontSize: 13, fontWeight: '700', lineHeight: 16 },
  chipTextActive: { color: c.white },
  chipClear: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Dropdowns
  dropdownRow: {
    flexDirection: 'row', flexShrink: 0,
    paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 4,
  },
  // Company chips — hàng ngang, 1 tap đổi công ty
  companyChipScroll: { height: 38, flexShrink: 0, flexGrow: 0, marginBottom: 4 },
  companyChipContent: { paddingHorizontal: Spacing.lg, alignItems: 'center', height: 38 },
  companyChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13, height: 30, borderRadius: Radii.full,
    backgroundColor: c.card, borderWidth: 1.5, borderColor: c.border,
    maxWidth: 150,
  },
  companyChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  companyChipText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
  companyChipTextActive: { color: c.white },

  // Dropdown filter row — chỉ còn Phân loại
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: Radii.md, paddingHorizontal: 12, height: 36, marginRight: 8,
  },
  dropdownBtnFlex: { flex: 1 },
  dropdownBtnActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
  dropdownText: { color: c.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  dropdownTextActive: { color: c.primary, fontWeight: '700' },

  // KPI — chiều cao cố định từng ô, tránh chữ chồng
  statsScroll: { height: 58, flexShrink: 0, flexGrow: 0, marginBottom: 2 },
  statsContent: { paddingHorizontal: Spacing.lg, alignItems: 'center', height: 58 },
  statPillGap: { marginLeft: 8 },
  statPill: {
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 72, height: 52,
  },
  statValueBox: { height: 22, justifyContent: 'center', alignItems: 'center', width: '100%' },
  statValue: { fontSize: 17, fontWeight: '800', lineHeight: 20, textAlign: 'center', includeFontPadding: false },
  statLabel: { color: c.textMuted, fontSize: 10, lineHeight: 12, textAlign: 'center', marginTop: 2, includeFontPadding: false },

  // Column header
  colHeaderRow: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 0,
    paddingHorizontal: Spacing.sm, paddingTop: 4, gap: 4,
  },
  colNavArrow: {
    width: 36, height: 36, borderRadius: Radii.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  colNavArrowHidden: { opacity: 0.25 },
  colHeaderCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 4,
  },
  colIcon: { fontSize: 16 },
  colName: { color: c.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  colBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.full,
    minWidth: 26, alignItems: 'center',
  },
  colBadgeText: { color: c.white, fontSize: 12, fontWeight: '800' },

  // Dots
  dotsScroll: { height: 24, flexShrink: 0, flexGrow: 0 },
  dotsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: Spacing.lg, height: 24,
  },
  dotGap: { marginLeft: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },

  // Cards
  listContent: { paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 24 },
  card: {
    backgroundColor: c.card, borderRadius: Radii.lg,
    borderWidth: 1, borderColor: c.border,
    borderLeftWidth: 4, padding: 12, marginBottom: 10,
  },

  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardCode: { color: c.textFaint, fontSize: 11, fontWeight: '700', flexShrink: 0 },
  cardTagsScroll: { flex: 1, maxHeight: 24 },
  cardTags: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  tagGap: { marginRight: 4 },
  tag: {
    borderRadius: Radii.full, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagText: { fontSize: 10, fontWeight: '700' },
  tagStage: {
    backgroundColor: `${c.warning}22`, borderRadius: Radii.full,
    borderWidth: 1, borderColor: c.warning,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagStageText: { color: c.warning, fontSize: 10, fontWeight: '700' },
  tagOverdue: {
    backgroundColor: c.dangerSoft, borderRadius: Radii.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagOverdueText: { color: c.danger, fontSize: 10, fontWeight: '700' },
  cardDate: { color: c.textFaint, fontSize: 11, fontWeight: '600' },

  cardName: { color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },

  customerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.white, fontSize: 12, fontWeight: '800' },
  customerName: { color: c.text, fontSize: 13, fontWeight: '600' },
  customerPhone: { color: c.textMuted, fontWeight: '400' },
  companyName: { color: c.textFaint, fontSize: 11, marginTop: 1 },

  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, marginBottom: 2,
    backgroundColor: c.cardAlt, borderRadius: Radii.sm,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: c.border,
  },
  personLabel: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
  personName: { flex: 1, color: c.text, fontSize: 12, fontWeight: '700' },

  stageHint: { color: c.textFaint, fontSize: 11, marginBottom: 4, fontStyle: 'italic' },

  progressSection: { marginTop: 6 },
  taskCountRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  taskCount: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: {
    flex: 1, height: 8, borderRadius: Radii.full,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: Radii.full },
  progressPct: { fontSize: 11, fontWeight: '800', width: 34, textAlign: 'right' },

  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, gap: 8,
  },
  cardBottomLeft: { flex: 1, minWidth: 0 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  cardActionBtn: {
    width: 38, height: 38, borderRadius: Radii.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border,
  },
  cardActionBtnPrimary: {
    backgroundColor: c.primary, borderColor: c.primaryDark,
  },
  actionBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: c.danger, borderWidth: 1.5, borderColor: c.card,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBadgeText: { color: c.white, fontSize: 9, fontWeight: '800', lineHeight: 11 },
  valueBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.valueBg, borderRadius: Radii.md,
    borderWidth: 1, borderColor: c.valueBorder,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  valueIconWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: c.valueBorder, alignItems: 'center', justifyContent: 'center',
  },
  valueAmount: { flexShrink: 1, color: c.valueText, fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  valueCurrency: { color: c.valueMuted, fontSize: 13, fontWeight: '700', marginLeft: 1 },

  emptyBox: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
