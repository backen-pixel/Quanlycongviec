import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchCrmAssignmentLookups,
  fetchCrmAssignmentStats,
  fetchCrmAssignments,
  PRIORITY_LABEL,
  STATUS_STAGE_LABEL,
  resolveAssignmentLeadNav,
  type AssignmentPriority,
  type CrmAssignment,
  type CrmAssignmentStats,
} from '../api/assignments';
import { fetchCrmCompanies } from '../api/crm';
import { formatApiError, isAbortError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateShort } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type StatusSegment = 'pending' | 'in_progress' | 'completed';

/** Trang list — KPI lấy từ /stats (không cắt theo trang). */
const TASKS_PAGE_SIZE = 40;

const EMPTY_STATS: CrmAssignmentStats = {
  pending: 0,
  in_progress: 0,
  completed: 0,
  overdue: 0,
  total: 0,
};

const STATUS_SEGMENTS: { key: StatusSegment; label: string }[] = [
  { key: 'pending', label: 'Chưa làm' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed', label: 'Hoàn thành' },
];

const PRIORITY_OPTIONS: { key: '' | AssignmentPriority; label: string }[] = [
  { key: '', label: 'Tất cả mức' },
  { key: 'urgent', label: 'Gấp' },
  { key: 'high', label: 'Cao' },
  { key: 'medium', label: 'TB' },
  { key: 'low', label: 'Thấp' },
];

function isAdminLike(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'sales_admin';
}

function assigneeList(a: CrmAssignment) {
  return a.assignees?.length ? a.assignees : a.assignee ? [a.assignee] : [];
}

function assigneeLabel(a: CrmAssignment): string {
  const list = assigneeList(a);
  if (!list.length) return 'Chưa giao';
  if (list.length === 1) return list[0].full_name || list[0].email || 'NV';
  return `${list[0].full_name || 'NV'} +${list.length - 1}`;
}

function isOverdue(a: CrmAssignment): boolean {
  if (!a.deadline || a.status === 'completed' || a.status === 'cancelled') return false;
  return new Date(a.deadline).getTime() < Date.now();
}

function leadLabel(a: CrmAssignment): string | null {
  const lead = a.lead;
  if (!lead?.id) return null;
  const code = lead.code ? `${lead.code} · ` : '';
  return `${code}${lead.title || (lead.type === 'deal' ? 'Deal' : 'Lead')}`;
}

function priorityStyle(priority: string | null | undefined, Colors: ThemeColors) {
  switch (priority) {
    case 'urgent':
      return { bg: Colors.redSoft, text: Colors.red, border: 'rgba(239,68,68,0.35)' };
    case 'high':
      return { bg: Colors.amberSoft, text: Colors.amber, border: 'rgba(245,158,11,0.35)' };
    case 'low':
      return { bg: Colors.surfaceSoft, text: Colors.textMuted, border: Colors.border };
    case 'medium':
    default:
      return { bg: Colors.blueSoft, text: Colors.blue, border: 'rgba(47,107,255,0.35)' };
  }
}

function statusIcon(status: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (status === 'completed') return 'checkmark-circle';
  if (status === 'in_progress') return 'time';
  return 'ellipse-outline';
}

function statusIconColor(status: string | null | undefined, Colors: ThemeColors): string {
  if (status === 'completed') return Colors.green;
  if (status === 'in_progress') return Colors.blue;
  return Colors.textFaint;
}

export default function TasksScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  const [rows, setRows] = useState<CrmAssignment[]>([]);
  const [serverStats, setServerStats] = useState<CrmAssignmentStats>(EMPTY_STATS);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [statusSegment, setStatusSegment] = useState<StatusSegment>('pending');
  const [companyFilter, setCompanyFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'' | AssignmentPriority>('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<CrmAssignment | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastLoadAtRef = useRef(0);
  const rowsRef = useRef<CrmAssignment[]>([]);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const loadGenRef = useRef(0);
  rowsRef.current = rows;
  hasMoreRef.current = hasMore;

  const showCompanyPicker = isAdminLike(user?.role);
  const showAssigneePicker = isAdminLike(user?.role);
  /** Giống web: chỉ lọc company khi user chọn chip (không ép company_id). */
  const companyQuery = companyFilter || undefined;
  const uid = user?.id || user?.userId || '';

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (!showCompanyPicker) return;
    void fetchCrmCompanies()
      .then((list) => setCompanies(list.map((c) => ({ id: c.id, name: c.shortName || c.name }))))
      .catch(() => setCompanies([]));
  }, [showCompanyPicker]);

  useEffect(() => {
    const ac = new AbortController();
    const companyForLookups = companyQuery || user?.company_id || undefined;
    void fetchCrmAssignmentLookups(companyForLookups, ac.signal)
      .then((lk) =>
        setUsers(
          lk.users.map((u) => ({
            id: u.id,
            name: u.full_name || u.email || u.id,
          })),
        ),
      )
      .catch(() => setUsers([]));
    return () => ac.abort();
  }, [companyQuery, user?.company_id]);

  const load = useCallback(async (opts?: { refresh?: boolean; silent?: boolean; append?: boolean }) => {
    const isRefresh = opts?.refresh ?? false;
    const silent = opts?.silent ?? false;
    const append = opts?.append ?? false;

    if (append) {
      if (loadingMoreRef.current || !hasMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      loadGenRef.current += 1;
      if (isRefresh && !silent) setRefreshing(true);
      else if (!silent) setLoading(true);
      if (!silent) setError('');
    }

    const gen = loadGenRef.current;
    const signal = abortRef.current?.signal;
    try {
      const assigneeId = assigneeFilter || (!showAssigneePicker && uid ? uid : undefined);
      const offset = append ? rowsRef.current.length : 0;
      const listParams = {
        company_id: companyQuery,
        assignee_id: assigneeId,
        priority: priorityFilter || undefined,
        status_group: statusSegment,
        status: statusSegment,
        q: search || undefined,
        limit: TASKS_PAGE_SIZE,
        offset,
        signal,
      };

      // KPI đếm đủ (không cắt trang). Không gắn abort list — tránh KPI = đúng 1 trang (40).
      const statsPromise = append
        ? Promise.resolve(null as CrmAssignmentStats | null)
        : fetchCrmAssignmentStats({
            company_id: companyQuery,
            assignee_id: assigneeId,
            priority: priorityFilter || undefined,
            q: search || undefined,
          });

      const [listSettled, statsSettled] = await Promise.all([
        fetchCrmAssignments(listParams).then(
          (list) => ({ ok: true as const, list }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        statsPromise.then(
          (s) => ({ ok: true as const, s }),
          () => ({ ok: false as const }),
        ),
      ]);
      if (signal?.aborted || (!append && gen !== loadGenRef.current)) return;

      if (!listSettled.ok) {
        if (append) return;
        const msg = formatApiError(listSettled.err);
        if (msg) setError(msg);
        setRows([]);
        setHasMore(false);
        if (statsSettled.ok) setServerStats(statsSettled.s);
        lastLoadAtRef.current = Date.now();
        return;
      }

      const list = listSettled.list;
      setRows((prev) => {
        if (!append) return list;
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const row of list) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            merged.push(row);
          }
        }
        return merged;
      });
      setHasMore(list.length >= TASKS_PAGE_SIZE);
      if (!append && statsSettled.ok) {
        setServerStats(statsSettled.s);
      }
      lastLoadAtRef.current = Date.now();
    } catch (e: unknown) {
      if (append || isAbortError(e) || signal?.aborted) return;
      if (!append && gen !== loadGenRef.current) return;
      const msg = formatApiError(e);
      if (msg) setError(msg);
      setRows([]);
      setHasMore(false);
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [assigneeFilter, companyQuery, priorityFilter, search, showAssigneePicker, statusSegment, uid]);

  const loadRef = useRef(load);
  loadRef.current = load;

  // Đổi lọc / tìm kiếm → luôn tải lại ngay (không bị TTL chặn).
  useEffect(() => {
    void load({ silent: lastLoadAtRef.current > 0 });
  }, [load]);

  // Focus lại màn: chỉ soft-refresh khi quá TTL (load ổn định qua loadRef).
  useFocusEffect(
    useCallback(() => {
      const TASKS_TTL_MS = 45_000;
      if (lastLoadAtRef.current === 0) {
        return () => abortRef.current?.abort();
      }
      if (Date.now() - lastLoadAtRef.current > TASKS_TTL_MS) {
        void loadRef.current({ refresh: true, silent: true });
      }
      return () => abortRef.current?.abort();
    }, []),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      const TASKS_TTL_MS = 45_000;
      if (Date.now() - lastLoadAtRef.current < TASKS_TTL_MS) return;
      void loadRef.current({ refresh: true, silent: true });
    }, []),
  );

  const stats = serverStats;

  const segmentCounts = useMemo(
    () => ({
      pending: stats.pending,
      in_progress: stats.in_progress,
      completed: stats.completed,
    }),
    [stats],
  );

  const filtered = useMemo(() => {
    // Server đã lọc theo status_group (hoặc status fallback); chỉ sort deadline.
    const list = [...rows];
    list.sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [rows]);

  const onEndReached = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    void load({ append: true, silent: true });
  }, [load]);

  const companyLabel = useMemo(() => {
    if (!companyFilter) return 'Tất cả công ty';
    return companies.find((c) => c.id === companyFilter)?.name || 'Công ty';
  }, [companyFilter, companies]);

  const assigneeLabelFilter = useMemo(() => {
    if (!assigneeFilter) return 'Tất cả NV';
    return users.find((u) => u.id === assigneeFilter)?.name || 'Nhân viên';
  }, [assigneeFilter, users]);

  const priorityLabelFilter = useMemo(() => {
    if (!priorityFilter) return 'Ưu tiên';
    return PRIORITY_LABEL[priorityFilter] || 'Ưu tiên';
  }, [priorityFilter]);

  const renderCard = ({ item: t }: { item: CrmAssignment }) => {
    const pri = priorityStyle(t.priority, Colors);
    const overdue = isOverdue(t);
    const lead = leadLabel(t);
    const done = t.status === 'completed';

    return (
      <Pressable style={styles.taskCard} onPress={() => setDetailItem(t)}>
        <View style={styles.taskCardTop}>
          <Ionicons
            name={statusIcon(t.status)}
            size={18}
            color={statusIconColor(t.status, Colors)}
            style={{ marginTop: 2 }}
          />
          <View style={styles.taskCardBody}>
            <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
              {t.title || 'Không có tiêu đề'}
            </Text>
            {lead ? (
              <View style={styles.leadRow}>
                <Ionicons name="link-outline" size={12} color={Colors.purple} />
                <Text style={styles.leadTxt} numberOfLines={1}>
                  {lead}
                </Text>
              </View>
            ) : null}
            {t.description ? (
              <Text style={styles.taskDesc} numberOfLines={2}>
                {t.description}
              </Text>
            ) : null}
            <View style={styles.taskMeta}>
              <View style={[styles.priBadge, { backgroundColor: pri.bg, borderColor: pri.border }]}>
                <Text style={[styles.priBadgeTxt, { color: pri.text }]}>
                  {PRIORITY_LABEL[t.priority || 'medium'] || 'TB'}
                </Text>
              </View>
              {t.deadline ? (
                <View style={styles.deadlineRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color={overdue ? Colors.red : Colors.textFaint}
                  />
                  <Text style={[styles.deadlineTxt, overdue && { color: Colors.red, fontWeight: '800' }]}>
                    {formatDateShort(t.deadline)}
                    {overdue ? ' · Quá hạn' : ''}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.assigneeRow}>
              <Ionicons name="person-outline" size={12} color={Colors.blue} />
              <Text style={styles.assigneeTxt} numberOfLines={1}>
                {assigneeLabel(t)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const listHeader = (
    <>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <View style={styles.headerTitleRow}>
            <LinearGradient
              colors={['#2F6BFF', '#0EA5E9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIcon}
            >
              <Ionicons name="clipboard" size={22} color={Colors.white} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Giao việc CRM</Text>
              <Text style={styles.headerSub}>
                {stats.total} nhiệm vụ — {stats.completed} hoàn thành — {stats.in_progress} đang làm
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={styles.statHead}>
            <Ionicons name="list" size={14} color={Colors.textMuted} />
            <Text style={styles.statLbl}>TỔNG</Text>
          </View>
          <Text style={[styles.statVal, { color: Colors.text }]}>{stats.total}</Text>
          <Text style={styles.statSub}>nhiệm vụ</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statHead}>
            <Ionicons name="time-outline" size={14} color={Colors.blue} />
            <Text style={styles.statLbl}>ĐANG LÀM</Text>
          </View>
          <Text style={[styles.statVal, { color: Colors.blue }]}>{stats.in_progress}</Text>
          <Text style={styles.statSub}>đang xử lý</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statHead}>
            <Ionicons name="warning-outline" size={14} color={Colors.red} />
            <Text style={styles.statLbl}>QUÁ HẠN</Text>
          </View>
          <Text style={[styles.statVal, { color: Colors.red }]}>{stats.overdue}</Text>
          <Text style={styles.statSub}>cần xử lý</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statHead}>
            <Ionicons name="checkmark-circle-outline" size={14} color={Colors.green} />
            <Text style={styles.statLbl}>HOÀN THÀNH</Text>
          </View>
          <Text style={[styles.statVal, { color: Colors.green }]}>{stats.completed}</Text>
          <Text style={styles.statSub}>đã xong</Text>
        </View>
      </View>

      <View style={styles.segmentRow}>
        {STATUS_SEGMENTS.map((s) => {
          const active = statusSegment === s.key;
          return (
            <Pressable
              key={s.key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setStatusSegment(s.key)}
            >
              <Text style={[styles.segmentTxt, active && styles.segmentTxtActive]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
        style={styles.chipRow}
      >
        {showCompanyPicker ? (
          <Pressable style={styles.filterPill} onPress={() => setCompanyPickerOpen(true)}>
            <Ionicons name="business-outline" size={14} color={Colors.blue} />
            <Text style={styles.filterPillTxt} numberOfLines={1}>
              {companyLabel}
            </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
          </Pressable>
        ) : null}
        {showAssigneePicker ? (
          <Pressable style={styles.filterPill} onPress={() => setAssigneePickerOpen(true)}>
            <Ionicons name="people-outline" size={14} color={Colors.blue} />
            <Text style={styles.filterPillTxt} numberOfLines={1}>
              {assigneeLabelFilter}
            </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
          </Pressable>
        ) : null}
        <Pressable style={styles.filterPill} onPress={() => setPriorityPickerOpen(true)}>
          <Ionicons name="flag-outline" size={14} color={Colors.amber} />
          <Text style={styles.filterPillTxt} numberOfLines={1}>
            {priorityLabelFilter}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </Pressable>
      </ScrollView>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm nhiệm vụ..."
            placeholderTextColor={Colors.textFaint}
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
          />
        </View>
      </View>

      <View style={styles.sectionHead}>
        <View style={styles.sectionDot} />
        <Text style={styles.sectionTitle}>{STATUS_STAGE_LABEL[statusSegment]}</Text>
        <Text style={styles.sectionCount}>{segmentCounts[statusSegment]}</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {loading && !rows.length ? (
        <View style={styles.center}>
          <SpinningLoader color={Colors.blue} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <SpinningLoader color={Colors.blue} />
              </View>
            ) : hasMore ? (
              <Text style={{ textAlign: 'center', color: Colors.textFaint, fontSize: 12, paddingVertical: 10 }}>
                Kéo xuống để tải thêm…
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={40} color={Colors.textFaint} />
              <Text style={styles.empty}>{error || 'Không có việc nào'}</Text>
            </View>
          }
        />
      )}

      <Modal visible={companyPickerOpen} transparent animationType="fade" onRequestClose={() => setCompanyPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCompanyPickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Chọn công ty</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {[{ id: '', name: 'Tất cả công ty' }, ...companies].map((c) => (
                <Pressable
                  key={c.id || 'all'}
                  style={styles.modalItem}
                  onPress={() => {
                    setCompanyFilter(c.id);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemTxt, companyFilter === c.id && styles.modalItemTxtActive]}>
                    {c.name}
                  </Text>
                  {companyFilter === c.id ? <Ionicons name="checkmark" size={18} color={Colors.blue} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={assigneePickerOpen} transparent animationType="fade" onRequestClose={() => setAssigneePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssigneePickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Chọn nhân viên</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {[{ id: '', name: 'Tất cả NV' }, ...users].map((u) => (
                <Pressable
                  key={u.id || 'all'}
                  style={styles.modalItem}
                  onPress={() => {
                    setAssigneeFilter(u.id);
                    setAssigneePickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemTxt, assigneeFilter === u.id && styles.modalItemTxtActive]}>
                    {u.name}
                  </Text>
                  {assigneeFilter === u.id ? <Ionicons name="checkmark" size={18} color={Colors.blue} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={priorityPickerOpen} transparent animationType="fade" onRequestClose={() => setPriorityPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPriorityPickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Mức ưu tiên</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {PRIORITY_OPTIONS.map((p) => (
                <Pressable
                  key={p.key || 'all'}
                  style={styles.modalItem}
                  onPress={() => {
                    setPriorityFilter(p.key);
                    setPriorityPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemTxt, priorityFilter === p.key && styles.modalItemTxtActive]}>
                    {p.label}
                  </Text>
                  {priorityFilter === p.key ? <Ionicons name="checkmark" size={18} color={Colors.blue} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!detailItem} transparent animationType="slide" onRequestClose={() => setDetailItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailItem(null)}>
          <Pressable style={[styles.detailSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            {detailItem ? (
              <>
                <View style={styles.detailHead}>
                  <Text style={styles.detailTitle}>{detailItem.title || 'Nhiệm vụ'}</Text>
                  <Pressable onPress={() => setDetailItem(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={Colors.textMuted} />
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 420 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLbl}>Trạng thái</Text>
                    <Text style={styles.detailVal}>
                      {STATUS_STAGE_LABEL[detailItem.status || 'pending'] || detailItem.status}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLbl}>Ưu tiên</Text>
                    <Text style={styles.detailVal}>
                      {PRIORITY_LABEL[detailItem.priority || 'medium'] || 'TB'}
                    </Text>
                  </View>
                  {detailItem.deadline ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLbl}>Hạn</Text>
                      <Text style={[styles.detailVal, isOverdue(detailItem) && { color: Colors.red }]}>
                        {formatDateShort(detailItem.deadline)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLbl}>Người thực hiện</Text>
                    <Text style={styles.detailVal}>
                      {assigneeList(detailItem)
                        .map((u) => u.full_name || u.email)
                        .filter(Boolean)
                        .join(', ') || 'Chưa giao'}
                    </Text>
                  </View>
                  {detailItem.created_by?.full_name ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLbl}>Người tạo</Text>
                      <Text style={styles.detailVal}>{detailItem.created_by.full_name}</Text>
                    </View>
                  ) : null}
                  {leadLabel(detailItem) ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLbl}>Lead / Deal</Text>
                      <Text style={styles.detailVal}>{leadLabel(detailItem)}</Text>
                    </View>
                  ) : null}
                  {detailItem.lead?.id ? (
                    <Pressable
                      style={[styles.filterPill, { alignSelf: 'stretch', justifyContent: 'center', marginTop: 12 }]}
                      onPress={() => {
                        const lead = detailItem.lead!;
                        const navTo = resolveAssignmentLeadNav(detailItem);
                        setDetailItem(null);
                        navigation.navigate('LeadDealDetail', {
                          leadId: lead.id,
                          kind: lead.type === 'deal' ? 'deal' : 'lead',
                          code: lead.code || undefined,
                          title: lead.title || undefined,
                          initialTab: navTo.initialTab,
                          focusAssignmentId: navTo.focusAssignmentId,
                          focusTaskId: navTo.focusTaskId,
                        });
                      }}
                    >
                      <Ionicons name="open-outline" size={16} color={Colors.blue} />
                      <Text style={styles.filterPillTxt}>Mở trong Lead/Deal</Text>
                    </Pressable>
                  ) : null}
                  {detailItem.company?.short_name || detailItem.company?.name ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLbl}>Công ty</Text>
                      <Text style={styles.detailVal}>
                        {detailItem.company?.short_name || detailItem.company?.name}
                      </Text>
                    </View>
                  ) : null}
                  {detailItem.description ? (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailLbl}>Mô tả</Text>
                      <Text style={styles.detailDesc}>{detailItem.description}</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 12,
      marginHorizontal: -8,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    headerBody: { flex: 1 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    headerSub: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    statCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      minWidth: '46%',
    },
    statHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    statLbl: {
      color: Colors.textFaint,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    statVal: { fontSize: 28, fontWeight: '900', marginBottom: 2 },
    statSub: { color: Colors.textMuted, fontSize: 11 },
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: Radii.lg,
      borderWidth: 1.5,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    segmentActive: {
      borderColor: Colors.text,
      backgroundColor: Colors.surfaceSoft,
    },
    segmentTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
    segmentTxtActive: { color: Colors.text, fontWeight: '800' },
    chipRow: { marginBottom: 10, marginHorizontal: -16 },
    chipScroll: { paddingHorizontal: 16, gap: 8 },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      maxWidth: 180,
    },
    filterPillTxt: { color: Colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    searchRow: { marginBottom: 12 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: 12,
      height: 46,
    },
    searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    sectionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: Colors.textFaint,
    },
    sectionTitle: { flex: 1, color: Colors.textMuted, fontSize: 14, fontWeight: '800' },
    sectionCount: { color: Colors.textFaint, fontSize: 13, fontWeight: '700' },
    taskCard: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      marginBottom: 10,
      ...Shadow.card,
    },
    taskCardTop: { flexDirection: 'row', gap: 10 },
    taskCardBody: { flex: 1, minWidth: 0 },
    taskTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    taskTitleDone: { color: Colors.textMuted, textDecorationLine: 'line-through' },
    leadRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    leadTxt: { color: Colors.purple, fontSize: 11, fontWeight: '700', flex: 1 },
    taskDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    taskMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
    priBadge: {
      borderRadius: Radii.pill,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    priBadgeTxt: { fontSize: 10, fontWeight: '800' },
    deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deadlineTxt: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
    assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    assigneeTxt: { color: Colors.blue, fontSize: 11, fontWeight: '700', flex: 1 },
    emptyBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 12,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    empty: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: Colors.card,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingTop: 16,
      paddingHorizontal: 16,
    },
    modalTitle: { color: Colors.text, fontSize: 17, fontWeight: '900', marginBottom: 12 },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    modalItemTxt: { color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1, paddingRight: 8 },
    modalItemTxtActive: { color: Colors.blue, fontWeight: '800' },
    detailSheet: {
      backgroundColor: Colors.card,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingTop: 16,
      paddingHorizontal: 16,
      maxHeight: '85%',
    },
    detailHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    detailTitle: { flex: 1, color: Colors.text, fontSize: 18, fontWeight: '900', lineHeight: 24 },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    detailLbl: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
    detailVal: { color: Colors.text, fontSize: 13, fontWeight: '800', flex: 1, textAlign: 'right' },
    detailBlock: { paddingVertical: 12 },
    detailDesc: { color: Colors.text, fontSize: 14, lineHeight: 20, marginTop: 6 },
  });
