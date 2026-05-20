import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import {
  WORK_TASK_PRIORITY_COLOR,
  WORK_TASK_PRIORITY_LABEL,
  WORK_TASK_STATUS_COLOR,
  WORK_TASK_STATUS_LABEL,
  type WorkTask,
  type WorkTaskStatus,
} from '../types/workTask';
import { listWorkTasks, type WorkTaskListQuery } from '../lib/workTaskApi';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'WorkTaskList'>;

type Scope = 'my' | 'all' | 'overdue';

const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: 'my', label: 'Của tôi' },
  { key: 'all', label: 'Tất cả' },
  { key: 'overdue', label: 'Quá hạn' },
];

const STATUS_FILTERS: { key: WorkTaskStatus | null; label: string }[] = [
  { key: null, label: 'Tất cả' },
  { key: 'pending', label: 'Chờ' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'review', label: 'Kiểm tra' },
  { key: 'done', label: 'Xong' },
  { key: 'blocked', label: 'Bị chặn' },
];

function formatDate(d?: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '';
  }
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function WorkTaskListScreen({ navigation }: { navigation: Nav }) {
  const [scope, setScope] = useState<Scope>('my');
  const [statusFilter, setStatusFilter] = useState<WorkTaskStatus | null>(null);
  const [search, setSearch] = useState('');
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'init' | 'refresh' = 'init') => {
      if (mode === 'init') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const q: WorkTaskListQuery = {
          scope,
          page_size: 50,
        };
        if (scope === 'all') {
          if (statusFilter) q.status = statusFilter;
          if (search.trim()) q.search = search.trim();
        }
        const res = await listWorkTasks(q);
        setTasks(res.tasks);
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: string } } };
        const code = err?.response?.status;
        if (code === 401) {
          setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } else if (code === 403) {
          setError('Bạn không có quyền xem công việc.');
        } else {
          setError(err?.response?.data?.error || 'Không tải được công việc. Thử lại.');
        }
        setTasks([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scope, statusFilter, search],
  );

  useEffect(() => {
    void load('init');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load('init');
    }, [load]),
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: tasks.length, open: 0, overdue: 0, done: 0 };
    const now = Date.now();
    tasks.forEach((t) => {
      if (t.status === 'done') c.done += 1;
      else c.open += 1;
      if (t.due_date && new Date(t.due_date).getTime() < now && t.status !== 'done') {
        c.overdue += 1;
      }
    });
    return c;
  }, [tasks]);

  const Header = (
    <View>
      <View style={styles.scopeRow}>
        {SCOPE_TABS.map((s) => {
          const active = scope === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.scopeBtn, active && styles.scopeBtnActive]}
              onPress={() => setScope(s.key)}
            >
              <Text style={[styles.scopeTxt, active && styles.scopeTxtActive]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{counts.total}</Text>
          <Text style={styles.statLabel}>Tổng</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: CrmColors.blue600 }]}>{counts.open}</Text>
          <Text style={styles.statLabel}>Đang xử lý</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: CrmColors.red500 }]}>{counts.overdue}</Text>
          <Text style={styles.statLabel}>Quá hạn</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: CrmColors.emerald600 }]}>{counts.done}</Text>
          <Text style={styles.statLabel}>Xong</Text>
        </View>
      </View>

      {scope === 'all' && (
        <>
          <TextInput
            style={styles.search}
            placeholder="Tìm theo tiêu đề..."
            placeholderTextColor={CrmColors.gray400}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={String(f.key || 'all')}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => String(t.id)}
        ListHeaderComponent={Header}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color={CrmColors.blue600} />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTxt}>
                {scope === 'my'
                  ? 'Bạn chưa được giao công việc nào.'
                  : scope === 'overdue'
                    ? 'Không có công việc quá hạn.'
                    : 'Chưa có công việc nào.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <TaskRow task={item} onPress={() => navigation.navigate('WorkTaskDetail', { id: item.id })} />}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('WorkTaskForm', { mode: 'create' })}
      >
        <Text style={styles.fabTxt}>+ Giao việc</Text>
      </TouchableOpacity>
    </View>
  );
}

function TaskRow({ task, onPress }: { task: WorkTask; onPress: () => void }) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && due.getTime() < Date.now() && task.status !== 'done';
  const statusColor = WORK_TASK_STATUS_COLOR[task.status] || CrmColors.gray500;
  const prioColor =
    (task.priority && WORK_TASK_PRIORITY_COLOR[task.priority]) || CrmColors.gray400;
  return (
    <TouchableOpacity style={[styles.card, CrmShadow.card]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.topRow}>
        {task.projects?.code ? (
          <Text style={styles.projCode}>{task.projects.code}</Text>
        ) : task.task_type === 'personal' ? (
          <Text style={[styles.projCode, { color: CrmColors.purple700 }]}>Cá nhân</Text>
        ) : null}
        {task.stage?.name ? (
          <View style={[styles.stagePill, { backgroundColor: task.stage.color || CrmColors.gray500 }]}>
            <Text style={styles.stageTxt}>{task.stage.name}</Text>
          </View>
        ) : null}
        {task.priority ? (
          <View style={[styles.prioPill, { backgroundColor: prioColor }]}>
            <Text style={styles.prioTxt}>{WORK_TASK_PRIORITY_LABEL[task.priority]}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {task.title}
      </Text>

      {task.projects?.name ? (
        <Text style={styles.projName} numberOfLines={1}>
          {task.projects.name}
        </Text>
      ) : null}

      <View style={styles.bottomRow}>
        <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusTxt}>{WORK_TASK_STATUS_LABEL[task.status] || task.status}</Text>
        </View>
        <View style={styles.bottomRight}>
          {due ? (
            <Text style={[styles.dueTxt, overdue && { color: CrmColors.red500, fontWeight: '700' }]}>
              {overdue ? '⏰ ' : '📅 '}
              {formatDate(task.due_date)}
            </Text>
          ) : null}
          {task.assignee?.full_name ? (
            <View style={styles.assigneeBadge}>
              <View style={styles.assigneeDot}>
                <Text style={styles.assigneeInit}>{initials(task.assignee.full_name)}</Text>
              </View>
              <Text style={styles.assigneeTxt} numberOfLines={1}>
                {task.assignee.full_name}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CrmColors.pageBg },
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    padding: 4,
    marginBottom: 12,
  },
  scopeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: CrmRadii.md },
  scopeBtnActive: { backgroundColor: CrmColors.blue600 },
  scopeTxt: { fontSize: 13, color: CrmColors.gray600, fontWeight: '600' },
  scopeTxtActive: { color: CrmColors.white },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: CrmColors.gray900 },
  statLabel: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },

  search: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
    marginBottom: 8,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipActive: { backgroundColor: CrmColors.blue600, borderColor: CrmColors.blue600 },
  chipTxt: { fontSize: 12, color: CrmColors.gray600, fontWeight: '600' },
  chipTxtActive: { color: CrmColors.white },

  errorBanner: {
    backgroundColor: CrmColors.red50,
    borderColor: CrmColors.red200,
    borderWidth: 1,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorTxt: { color: CrmColors.red700, fontSize: 13 },

  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  projCode: { fontSize: 11, fontWeight: '700', color: CrmColors.blue600 },
  stagePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  stageTxt: { fontSize: 10, color: CrmColors.white, fontWeight: '600' },
  prioPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  prioTxt: { fontSize: 10, color: CrmColors.white, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '600', color: CrmColors.gray900, lineHeight: 20 },
  projName: { fontSize: 11, color: CrmColors.gray500, marginTop: 4 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  bottomRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusTxt: { fontSize: 11, color: CrmColors.white, fontWeight: '700' },
  dueTxt: { fontSize: 11, color: CrmColors.gray500 },
  assigneeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 130 },
  assigneeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeInit: { fontSize: 9, fontWeight: '700', color: CrmColors.blue700 },
  assigneeTxt: { fontSize: 11, color: CrmColors.gray700, flexShrink: 1 },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTxt: { color: CrmColors.gray500, fontSize: 14 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  fabTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 14 },
});
