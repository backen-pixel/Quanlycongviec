import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import Avatar from '../components/Avatar';
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import type { MainTabParamList } from '../navigation/MainTabs';
import { useRootNavigation } from '../navigation/useRootNavigation';
import {
  fetchCommentNotifications,
  isWorkshopDealNotification,
  type SxCommentNotification,
} from '../lib/notificationApi';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import {
  fetchCompanies,
  fetchProductionBoard,
  type CompanyOption,
} from '../lib/productionApi';
import { getAnyCachedBoard, getCachedBoard, isCachedBoardFresh } from '../lib/productionBoardCache';
import { loadKanbanFilters, saveKanbanFilters } from '../lib/kanbanFilterStorage';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import {
  isSystemAdmin,
  workshopCompaniesForCrossViewer,
} from '../lib/productionFilters';
import FilterPickerModal from '../components/FilterPickerModal';
import {
  computeSxBoardKpis,
  formatVnWeekdayDate,
  greetingByHour,
  initialsFrom,
  pickPriorityProjects,
  shortDateLabel,
  type SxBoardKpis,
} from '../lib/sxBoardKpis';
import {
  fetchMyProductionTasks,
  isTaskDone,
  isTaskPending,
  type WorkTask,
} from '../lib/workTasksApi';
import type { ProductionProject } from '../types';
import { Radii, Spacing, colorWithAlpha, getTaskProgressColor } from '../theme';

const EMPTY_KPI: SxBoardKpis = {
  total: 0,
  intake: 0,
  producing: 0,
  awaitingDelivery: 0,
  shipped: 0,
  completed: 0,
  overdue: 0,
};

function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || full || 'bạn';
}

/** Thời gian thông báo: hôm nay = giờ; hôm qua / ngày khác = có ngày để không bị hiểu nhầm. */
function notifTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startThat) / 86400000);
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return hm;
  if (diffDays === 1) return `Hôm qua ${hm}`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${dd}/${mm} ${hm}`;
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function notifListTitle(n: SxCommentNotification): string {
  if (isWorkshopDealNotification(n)) {
    const name = n.metadata?.project_name || n.metadata?.deal_title || n.metadata?.project_code;
    if (name) return String(name);
    return String(n.title || '')
      .replace(/^🏭\s*/, '')
      .replace(/^Deal mới\s*·?\s*/i, '')
      .trim() || 'Deal xưởng';
  }
  const author = n.metadata?.author_name;
  const code = n.metadata?.project_code;
  if (author && code) return `${author} · ${code}`;
  if (author) return author;
  return String(n.title || n.message || 'Thông báo')
    .replace(/^💬\s*/, '')
    .trim();
}

function notifListSubtitle(n: SxCommentNotification): string | null {
  if (isWorkshopDealNotification(n)) {
    if (n.type === 'workshop_new_deal') return 'Deal mới chờ tiếp nhận';
    if (n.type === 'project_assigned') return 'Được gán dự án';
    if (n.type === 'project_created') return 'Dự án mới tạo';
    return 'Deal xưởng';
  }
  const preview = n.metadata?.comment_preview;
  if (preview) return preview;
  const msg = String(n.message || '').trim();
  return msg && msg !== n.title ? msg : null;
}

function priorityBadge(p: ProductionProject): { label: string; bg: string; fg: string } {
  if (p.is_overdue) return { label: 'Quá hạn', bg: '#7F1D1D', fg: '#FCA5A5' };
  const raw = p.delivery_date || p.production_deadline || p.deadline;
  if (raw) {
    const t = new Date(raw);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(t);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
    if (diff >= 0 && diff <= 2) return { label: 'Sắp đến hạn', bg: '#78350F', fg: '#FCD34D' };
  }
  return { label: 'Đang thực hiện', bg: '#1E3A5F', fg: '#93C5FD' };
}

export default function OverviewScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount, refreshUnread } = useNotifications();
  const { unreadTotal: messageUnread } = useMessenger();
  const { openProjectDetail, openOverdueProjects } = useRootNavigation();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const userName = user?.full_name || user?.fullName || user?.email || 'Bạn';
  const greetName = firstName(userName);
  const userId = user?.id || user?.userId || '';

  // Seed nhẹ từ cache bất kỳ (đúng filter sẽ được load() xác nhận ngay sau).
  const cachedBoardInit = getAnyCachedBoard();
  const [loading, setLoading] = useState(!cachedBoardInit);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<SxBoardKpis>(() =>
    cachedBoardInit ? computeSxBoardKpis(cachedBoardInit.projects, cachedBoardInit.stages) : EMPTY_KPI,
  );
  const [priority, setPriority] = useState<ProductionProject[]>(() =>
    cachedBoardInit ? pickPriorityProjects(cachedBoardInit.projects, 5) : [],
  );
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [notifs, setNotifs] = useState<SxCommentNotification[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Admin (kể cả sysadmin) chọn được mọi công ty; NV chỉ công ty của mình. */
  const isAdminLike = user?.role === 'admin' || isSystemAdmin(user);
  const canPickCompany = Boolean(isAdminLike);

  const companyOptions = useMemo(() => {
    if (canPickCompany) {
      return [
        { id: '', label: 'Tất cả công ty' },
        ...companies.map((c) => ({ id: c.id, label: c.name })),
      ];
    }
    // Nhân viên: chỉ công ty gắn JWT (hoặc xưởng HCB/Metalla được phép xem chéo nếu có).
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

  const workshopLabel = useMemo(() => {
    if (!filterCompany) {
      return canPickCompany ? 'Tất cả công ty' : (companyOptions[0]?.label || 'Công ty');
    }
    return companyOptions.find((o) => o.id === filterCompany)?.label
      || companies.find((c) => String(c.id) === String(filterCompany))?.name
      || 'Công ty';
  }, [filterCompany, canPickCompany, companyOptions, companies]);

  const persistCompanyFilter = useCallback(async (companyId: string) => {
    const snap = (await loadKanbanFilters().catch(() => null)) || {};
    await saveKanbanFilters({
      ...snap,
      filterCompany: companyId,
      // Đổi công ty → reset phân loại (Kanban sẽ tự chọn lại).
      filterWorkTypeId: '',
    });
  }, []);

  const loadSeqRef = useRef(0);

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const snap = await loadKanbanFilters().catch(() => null);
      let companyId = snap?.filterCompany || '';
      const workshopTypeId = snap?.filterWorkTypeId || undefined;

      const companyList = await fetchCompanies().catch(() => [] as CompanyOption[]);
      if (seq !== loadSeqRef.current) return;
      setCompanies(companyList);

      if (!canPickCompany) {
        // NV: khóa về công ty của họ
        const ownId = user?.company_id ? String(user.company_id) : '';
        if (ownId) companyId = ownId;
        else if (!companyId && companyList[0]?.id) companyId = String(companyList[0].id);
        if (companyId && companyId !== (snap?.filterCompany || '')) {
          await persistCompanyFilter(companyId);
        }
      } else if (companyId) {
        // Admin: bỏ chọn nếu id không còn trong danh sách
        const exists = companyList.some((c) => String(c.id) === String(companyId));
        if (!exists) companyId = '';
      }

      if (seq !== loadSeqRef.current) return;
      setFilterCompany(companyId);

      const boardFilters = {
        companyId: companyId || undefined,
        workshopTypeId: workshopTypeId && workshopTypeId !== 'none' ? workshopTypeId : undefined,
      };

      // Silent + cache tươi: chỉ refresh tasks/notif, không tải lại full board.
      const skipBoard = mode === 'silent' && isCachedBoardFresh(boardFilters) && !!getCachedBoard(boardFilters);
      const cachedBoard = getCachedBoard(boardFilters) || getAnyCachedBoard();
      if (cachedBoard && mode !== 'refresh') {
        setKpis(computeSxBoardKpis(cachedBoard.projects, cachedBoard.stages));
        setPriority(pickPriorityProjects(cachedBoard.projects, 5));
        if (mode === 'init') setLoading(false);
      }

      const [board, myTasks, notifList] = await Promise.all([
        skipBoard
          ? Promise.resolve(cachedBoard!)
          : fetchProductionBoard(mode === 'refresh', boardFilters, {
              onPartial: (partial) => {
                if (seq !== loadSeqRef.current) return;
                const kpi = computeSxBoardKpis(partial.projects, partial.stages);
                setKpis(kpi);
                setPriority(pickPriorityProjects(partial.projects, 5));
                if (mode === 'init') setLoading(false);
              },
            }),
        userId ? fetchMyProductionTasks(userId).catch(() => [] as WorkTask[]) : Promise.resolve([] as WorkTask[]),
        fetchCommentNotifications(false).catch(() => ({ notifications: [] as SxCommentNotification[], unread_count: 0 })),
      ]);

      if (seq !== loadSeqRef.current) return;
      if (board) {
        setKpis(computeSxBoardKpis(board.projects, board.stages));
        setPriority(pickPriorityProjects(board.projects, 5));
      }
      setTasks(myTasks);
      setNotifs(
        (notifList.notifications || [])
          .slice()
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
          .slice(0, 5),
      );
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, user?.company_id, canPickCompany, persistCompanyFilter]);

  useEffect(() => {
    // Seed KPI theo cùng key filter nếu có; không dùng cache rỗng (key khác).
    void loadKanbanFilters().then((snap) => {
      const filters = {
        companyId: snap?.filterCompany || undefined,
        workshopTypeId:
          snap?.filterWorkTypeId && snap.filterWorkTypeId !== 'none'
            ? snap.filterWorkTypeId
            : undefined,
      };
      void load(getCachedBoard(filters) ? 'silent' : 'init');
    });
  }, [load]);

  const onSelectCompany = useCallback(async (id: string) => {
    setCompanyPickerOpen(false);
    if (!canPickCompany && user?.company_id && id !== String(user.company_id)) return;
    setFilterCompany(id);
    await persistCompanyFilter(id);
    void load('refresh');
  }, [canPickCompany, user?.company_id, persistCompanyFilter, load]);

  useProductionRealtime({
    onRefresh: (info) => {
      if (info?.patched) {
        const cached = getAnyCachedBoard();
        if (cached) {
          setKpis(computeSxBoardKpis(cached.projects, cached.stages));
          setPriority(pickPriorityProjects(cached.projects, 5));
        }
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  const taskStats = useMemo(() => {
    const pending = tasks.filter((t) => isTaskPending(t.status) || String(t.status) === 'in_progress').length;
    const now = Date.now();
    const soon = tasks.filter((t) => {
      if (isTaskDone(t.status)) return false;
      const raw = t.deadline || t.due_date;
      if (!raw) return false;
      const ts = new Date(raw).getTime();
      if (!Number.isFinite(ts)) return false;
      const diff = ts - now;
      return diff >= 0 && diff <= 2 * 86400000;
    }).length;
    const done = tasks.filter((t) => isTaskDone(t.status)).length;
    return { pending, soon, done };
  }, [tasks]);

  const openNotifs = useCallback(async () => {
    void ensureNotificationPermission();
    setNotifOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  const goKanban = useCallback(() => {
    tabNav.navigate('Kanban');
  }, [tabNav]);

  const goWork = useCallback(() => {
    tabNav.navigate('Work');
  }, [tabNav]);

  const kpiCards = [
    { key: 'total', label: 'Tổng', value: kpis.total, color: colors.primary, icon: 'layers-outline' as const },
    { key: 'producing', label: 'Đang SX', value: kpis.producing, color: '#38BDF8', icon: 'construct-outline' as const },
    { key: 'await', label: 'Chờ vận chuyển', value: kpis.awaitingDelivery, color: colors.textMuted, icon: 'cube-outline' as const },
    { key: 'shipped', label: 'Đã vận chuyển', value: kpis.shipped, color: colors.success, icon: 'car-outline' as const },
    { key: 'done', label: 'Hoàn tất', value: kpis.completed, color: colors.warning, icon: 'checkmark-done-outline' as const },
    { key: 'overdue', label: 'Quá hạn', value: kpis.overdue, color: colors.danger, icon: 'alert-circle-outline' as const },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Avatar name={userName} avatarUrl={user?.avatar} size={48} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.greetTitle}>
                {greetingByHour()}, {greetName}!
              </Text>
              <Text style={styles.greetSub}>Chúc bạn một ngày làm việc hiệu quả! 👋</Text>
            </View>
          </View>
          <View style={styles.headerBtns}>
            <TapHighlight style={styles.iconBtn} onPress={() => void openNotifs()} hitSlop={8}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </TapHighlight>
            <TapHighlight
              style={styles.iconBtn}
              onPress={() => tabNav.navigate('Profile')}
              hitSlop={8}
            >
              <Ionicons name="menu-outline" size={22} color={colors.text} />
              {messageUnread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
                </View>
              ) : null}
            </TapHighlight>
          </View>
        </View>

        {/* Date + workshop */}
        <View style={styles.metaRow}>
          <View style={[styles.metaCard, { flex: 1.05 }]}>
            <View style={[styles.metaIcon, { backgroundColor: colorWithAlpha(colors.primary, 0.18) }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaTitle} numberOfLines={1}>{formatVnWeekdayDate()}</Text>
              <Text style={styles.metaSub}>Ngày làm việc</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.metaCard, { flex: 1 }]}
            activeOpacity={canPickCompany ? 0.85 : 1}
            onPress={() => {
              if (canPickCompany) setCompanyPickerOpen(true);
            }}
            disabled={!canPickCompany}
          >
            <View style={[styles.metaIcon, { backgroundColor: colorWithAlpha('#8B5CF6', 0.18) }]}>
              <Ionicons name="business-outline" size={18} color="#A78BFA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaTitle} numberOfLines={1}>{workshopLabel}</Text>
              <Text style={styles.metaSub}>
                {canPickCompany ? 'Chạm để chọn công ty' : 'Công ty của bạn'}
              </Text>
            </View>
            {canPickCompany ? (
              <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
            ) : null}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TapHighlight onPress={() => void load('init')}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TapHighlight>
          </View>
        ) : null}

        {/* Tổng quan sản xuất */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="stats-chart" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Tổng quan sản xuất</Text>
          </View>
          <TapHighlight onPress={goKanban}>
            <Text style={styles.linkText}>Xem chi tiết ›</Text>
          </TapHighlight>
        </View>

        {loading && kpis.total === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.kpiScroll}
          >
            {kpiCards.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={styles.kpiCard}
                activeOpacity={c.key === 'overdue' && c.value > 0 ? 0.85 : 1}
                onPress={() => {
                  if (c.key === 'overdue' && c.value > 0) openOverdueProjects();
                }}
                disabled={!(c.key === 'overdue' && c.value > 0)}
              >
                <Ionicons name={c.icon} size={16} color={c.color} />
                <Text style={[styles.kpiValue, { color: c.color }]}>{c.value}</Text>
                <Text style={styles.kpiLabel} numberOfLines={2}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Overdue alert */}
        {kpis.overdue > 0 ? (
          <View style={styles.alertCard}>
            <View style={styles.alertLeft}>
              <View style={styles.alertIcon}>
                <Ionicons name="time" size={20} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>
                  {kpis.overdue} công việc đang quá hạn
                </Text>
                <Text style={styles.alertSub}>
                  Vui lòng ưu tiên xử lý để đảm bảo tiến độ.
                </Text>
              </View>
            </View>
            <TapHighlight style={styles.alertBtn} onPress={openOverdueProjects}>
              <Text style={styles.alertBtnText}>Xem ngay</Text>
            </TapHighlight>
          </View>
        ) : null}

        {/* Công việc hôm nay */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="clipboard" size={18} color={colors.warning} />
            <Text style={styles.sectionTitle}>Công việc của tôi hôm nay</Text>
          </View>
          <TapHighlight onPress={goWork}>
            <Text style={styles.linkText}>Xem tất cả ›</Text>
          </TapHighlight>
        </View>
        <View style={styles.taskStatRow}>
          <TouchableOpacity style={[styles.taskStatCard, styles.taskStatDanger]} onPress={goWork} activeOpacity={0.88}>
            <Ionicons name="document-text" size={22} color="#FCA5A5" />
            <Text style={styles.taskStatValue}>{taskStats.pending}</Text>
            <Text style={styles.taskStatLabel}>Cần xử lý</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.taskStatCard, styles.taskStatWarn]} onPress={goWork} activeOpacity={0.88}>
            <Ionicons name="hourglass" size={22} color="#FCD34D" />
            <Text style={styles.taskStatValue}>{taskStats.soon}</Text>
            <Text style={styles.taskStatLabel}>Sắp đến hạn</Text>
            <Text style={styles.taskStatHint}>Trong 2 ngày</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.taskStatCard, styles.taskStatOk]} onPress={goWork} activeOpacity={0.88}>
            <Ionicons name="checkmark-circle" size={22} color="#86EFAC" />
            <Text style={styles.taskStatValue}>{taskStats.done}</Text>
            <Text style={styles.taskStatLabel}>Đã hoàn thành</Text>
          </TouchableOpacity>
        </View>

        {/* Ưu tiên xử lý */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="locate" size={18} color={colors.danger} />
            <Text style={styles.sectionTitle}>Ưu tiên xử lý</Text>
          </View>
        </View>
        <View style={styles.listCard}>
          {priority.length === 0 ? (
            <Text style={styles.emptyText}>Không có hạng mục ưu tiên</Text>
          ) : (
            priority.map((p, idx) => {
              const badge = priorityBadge(p);
              const pct = Math.max(0, Math.min(100, Number(p.progress || 0)));
              const done = Number(p.done_tasks || 0);
              const total = Number(p.task_total || 0);
              const accent = getTaskProgressColor(pct, colors);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.prioRow, idx > 0 && styles.prioRowBorder]}
                  onPress={() => openProjectDetail(p.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.prioAvatar, { backgroundColor: colorWithAlpha(accent, 0.25) }]}>
                    <Text style={[styles.prioAvatarText, { color: accent }]}>
                      {initialsFrom(p.customer_name || p.name || p.code)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.prioTitle} numberOfLines={1}>{p.name || p.code}</Text>
                    <Text style={styles.prioSub} numberOfLines={1}>
                      {p.production_person_name
                        ? `Phụ trách: ${p.production_person_name}`
                        : (p.customer_name || p.code)}
                    </Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: accent }]} />
                    </View>
                    <Text style={styles.progressLabel}>
                      {total > 0 ? `${done}/${total} nhiệm vụ` : `${pct}% tiến độ`}
                    </Text>
                  </View>
                  <View style={styles.prioRight}>
                    <View style={[styles.prioBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.prioBadgeText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                    <Text style={styles.prioDate}>
                      {shortDateLabel(p.delivery_date || p.production_deadline || p.deadline)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Thông báo mới */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="notifications" size={18} color="#A78BFA" />
            <Text style={styles.sectionTitle}>Thông báo mới</Text>
          </View>
          <TapHighlight onPress={() => void openNotifs()}>
            <Text style={styles.linkText}>Xem tất cả ›</Text>
          </TapHighlight>
        </View>
        <View style={styles.listCard}>
          {notifs.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có thông báo mới</Text>
          ) : (
            notifs.map((n, idx) => {
              const subtitle = notifListSubtitle(n);
              return (
              <TouchableOpacity
                key={n.id}
                style={[styles.notifRow, idx > 0 && styles.prioRowBorder]}
                activeOpacity={0.85}
                onPress={() => {
                  const pid = n.metadata?.project_id || (n.entity_type === 'project' ? n.entity_id : null);
                  if (pid) openProjectDetail(String(pid));
                  else void openNotifs();
                }}
              >
                <View style={[styles.notifIcon, { backgroundColor: colorWithAlpha(colors.primary, 0.2) }]}>
                  <Ionicons
                    name={
                      isWorkshopDealNotification(n)
                        ? 'briefcase-outline'
                        : n.type?.includes('logistics') || n.message?.includes('vận chuyển')
                          ? 'car'
                          : 'chatbubble-ellipses-outline'
                    }
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.notifText} numberOfLines={2}>
                    {notifListTitle(n)}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.notifProject} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.notifTime}>{notifTime(n.created_at)}</Text>
              </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      <CommentNotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenProject={(pid) => {
          setNotifOpen(false);
          openProjectDetail(pid);
        }}
      />

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Chọn công ty"
        options={companyOptions}
        selectedId={filterCompany}
        onSelect={(id) => { void onSelectCompany(id); }}
        onClose={() => setCompanyPickerOpen(false)}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.lg,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    headerTextWrap: { flex: 1, minWidth: 0 },
    greetTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    greetSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    headerBtns: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    metaRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    metaCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metaIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
    metaSub: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      marginTop: 4,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
    linkText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
    kpiScroll: { gap: 8, paddingBottom: Spacing.md },
    kpiCard: {
      width: 92,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    kpiValue: { fontSize: 22, fontWeight: '800', marginTop: 4 },
    kpiLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', lineHeight: 14 },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#2A1518' : '#FEF2F2',
      borderRadius: Radii.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? '#7F1D1D' : '#FECACA',
      marginBottom: Spacing.lg,
    },
    alertLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    alertIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colorWithAlpha(colors.danger, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
    alertSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    alertBtn: {
      backgroundColor: colors.danger,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.md,
    },
    alertBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    taskStatRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
    taskStatCard: {
      flex: 1,
      borderRadius: Radii.lg,
      padding: 12,
      minHeight: 110,
      justifyContent: 'space-between',
    },
    taskStatDanger: { backgroundColor: isDark ? '#7F1D1D' : '#DC2626' },
    taskStatWarn: { backgroundColor: isDark ? '#78350F' : '#D97706' },
    taskStatOk: { backgroundColor: isDark ? '#14532D' : '#16A34A' },
    taskStatValue: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 8 },
    taskStatLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '700' },
    taskStatHint: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 },
    listCard: {
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      marginBottom: Spacing.lg,
      overflow: 'hidden',
    },
    emptyText: {
      color: colors.textFaint,
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 18,
    },
    prioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
    },
    prioRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    prioAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    prioAvatarText: { fontSize: 13, fontWeight: '800' },
    prioTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
    prioSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    progressTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.cardAlt,
      marginTop: 8,
      overflow: 'hidden',
    },
    progressFill: { height: 5, borderRadius: 3 },
    progressLabel: { color: colors.textFaint, fontSize: 10, marginTop: 4 },
    prioRight: { alignItems: 'flex-end', gap: 6 },
    prioBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.full },
    prioBadgeText: { fontSize: 10, fontWeight: '700' },
    prioDate: { color: colors.textFaint, fontSize: 10 },
    notifRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    notifIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifText: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    notifProject: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    notifTime: { color: colors.textFaint, fontSize: 11 },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderRadius: Radii.md,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorText: { color: colors.danger, fontSize: 13 },
    retryText: { color: colors.primary, fontWeight: '700', marginTop: 8 },
  });
}
