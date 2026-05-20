import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MoreStackParamList } from '../navigation/types';
import {
  deleteWorkTask,
  getWorkTask,
  listWorkTaskComments,
  postWorkTaskComment,
  updateWorkTaskStatus,
} from '../lib/workTaskApi';
import {
  WORK_TASK_PRIORITY_COLOR,
  WORK_TASK_PRIORITY_LABEL,
  WORK_TASK_STATUS_COLOR,
  WORK_TASK_STATUS_LABEL,
  type WorkTask,
  type WorkTaskComment,
  type WorkTaskStatus,
} from '../types/workTask';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { useAuth } from '../context/AuthContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'WorkTaskDetail'>;
type R = RouteProp<MoreStackParamList, 'WorkTaskDetail'>;

const STATUS_OPTIONS: WorkTaskStatus[] = [
  'pending',
  'todo',
  'in_progress',
  'review',
  'done',
  'blocked',
  'deferred',
];

function formatDateTime(d?: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatDate(d?: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('vi-VN');
  } catch {
    return '—';
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

export default function WorkTaskDetailScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route: R;
}) {
  const { id } = route.params;
  const { user } = useAuth();

  const [task, setTask] = useState<WorkTask | null>(null);
  const [comments, setComments] = useState<WorkTaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStatus, setSavingStatus] = useState<WorkTaskStatus | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'init' | 'refresh' = 'init') => {
      if (mode === 'init') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const [t, cs] = await Promise.all([
          getWorkTask(id),
          listWorkTaskComments(id).catch(() => [] as WorkTaskComment[]),
        ]);
        setTask(t);
        setComments(cs);
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: string } } };
        setError(err?.response?.data?.error || 'Không tải được công việc.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load('init');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load('init');
    }, [load]),
  );

  const handleStatusChange = useCallback(
    async (next: WorkTaskStatus) => {
      if (!task || task.status === next) return;
      setSavingStatus(next);
      try {
        const updated = await updateWorkTaskStatus(task.id, next);
        setTask({ ...task, ...updated });
      } catch (e) {
        Alert.alert('Lỗi', 'Không đổi trạng thái được. Thử lại.');
      } finally {
        setSavingStatus(null);
      }
    },
    [task],
  );

  const handlePostComment = useCallback(async () => {
    const content = newComment.trim();
    if (!content || !task) return;
    setPosting(true);
    try {
      const c = await postWorkTaskComment(task.id, content);
      setComments((prev) => [c, ...prev]);
      setNewComment('');
    } catch (e) {
      Alert.alert('Lỗi', 'Không gửi được bình luận.');
    } finally {
      setPosting(false);
    }
  }, [newComment, task]);

  const handleDelete = useCallback(() => {
    if (!task) return;
    Alert.alert('Xóa công việc?', `"${task.title}" sẽ bị xóa vĩnh viễn.`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWorkTask(task.id);
            navigation.goBack();
          } catch {
            Alert.alert('Lỗi', 'Không xóa được công việc.');
          }
        },
      },
    ]);
  }, [task, navigation]);

  const canEdit = useMemo(() => {
    if (!task || !user) return false;
    const uid = String(user.userId || user.id || '');
    return (
      uid &&
      (uid === String(task.created_by_id || '') ||
        uid === String(task.assignee_id || '') ||
        user.role === 'admin' ||
        user.role === 'manager')
    );
  }, [task, user]);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.loadingBox}>
        <Text style={styles.empty}>{error || 'Không tìm thấy công việc.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load('init')}>
          <Text style={styles.retryTxt}>Tải lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = WORK_TASK_STATUS_COLOR[task.status] || CrmColors.gray500;
  const prioColor =
    (task.priority && WORK_TASK_PRIORITY_COLOR[task.priority]) || CrmColors.gray400;
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && due.getTime() < Date.now() && task.status !== 'done';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: CrmColors.pageBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />
        }
      >
        <View style={[styles.card, CrmShadow.card]}>
          <View style={styles.headerRow}>
            {task.projects?.code ? (
              <Text style={styles.projCode}>{task.projects.code}</Text>
            ) : task.task_type === 'personal' ? (
              <Text style={[styles.projCode, { color: CrmColors.purple700 }]}>Cá nhân</Text>
            ) : null}
            {task.priority ? (
              <View style={[styles.prioPill, { backgroundColor: prioColor }]}>
                <Text style={styles.prioTxt}>{WORK_TASK_PRIORITY_LABEL[task.priority]}</Text>
              </View>
            ) : null}
            <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
              <Text style={styles.statusTxt}>
                {WORK_TASK_STATUS_LABEL[task.status] || task.status}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{task.title}</Text>

          {task.projects?.name ? (
            <Text style={styles.projName}>📁 {task.projects.name}</Text>
          ) : null}

          {task.description ? (
            <Text style={styles.description}>{task.description}</Text>
          ) : null}

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Người giao</Text>
              <Text style={styles.metaValue}>{task.creator?.full_name || '—'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Người làm</Text>
              <Text style={styles.metaValue}>{task.assignee?.full_name || 'Chưa giao'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Hạn chót</Text>
              <Text
                style={[
                  styles.metaValue,
                  overdue && { color: CrmColors.red500, fontWeight: '700' },
                ]}
              >
                {formatDate(task.due_date)}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Tạo lúc</Text>
              <Text style={styles.metaValue}>{formatDateTime(task.created_at)}</Text>
            </View>
          </View>

          {canEdit && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() =>
                  navigation.navigate('WorkTaskForm', { mode: 'edit', id: task.id })
                }
              >
                <Text style={styles.btnSecondaryTxt}>✏️ Sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnDanger} onPress={handleDelete}>
                <Text style={styles.btnDangerTxt}>🗑 Xóa</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.sectionTitle}>Đổi trạng thái</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((s) => {
              const active = task.status === s;
              const c = WORK_TASK_STATUS_COLOR[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusBtn,
                    active && { backgroundColor: c, borderColor: c },
                    savingStatus === s && { opacity: 0.6 },
                  ]}
                  disabled={!!savingStatus}
                  onPress={() => handleStatusChange(s)}
                >
                  <Text style={[styles.statusBtnTxt, active && { color: CrmColors.white }]}>
                    {WORK_TASK_STATUS_LABEL[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {task.participants && task.participants.length > 0 ? (
          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.sectionTitle}>Người hỗ trợ / quan sát</Text>
            {task.participants.map((p) => (
              <View key={`${p.user_id}-${p.role}`} style={styles.participantRow}>
                <View style={styles.assigneeDot}>
                  <Text style={styles.assigneeInit}>
                    {initials(p.user?.full_name || '?')}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.participantName}>{p.user?.full_name || 'Người dùng'}</Text>
                  <Text style={styles.participantRole}>
                    {p.role === 'observer' ? 'Quan sát' : 'Hỗ trợ'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {task.checklists && task.checklists.length > 0 ? (
          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {task.checklists.map((c) => (
              <View key={c.id} style={styles.checklistRow}>
                <Text style={styles.checklistTick}>{c.is_done ? '☑' : '☐'}</Text>
                <Text
                  style={[
                    styles.checklistTitle,
                    c.is_done && { textDecorationLine: 'line-through', color: CrmColors.gray400 },
                  ]}
                >
                  {c.title}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.sectionTitle}>Bình luận ({comments.length})</Text>

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Viết bình luận, trao đổi..."
              placeholderTextColor={CrmColors.gray400}
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!newComment.trim() || posting) && { opacity: 0.5 }]}
              onPress={handlePostComment}
              disabled={!newComment.trim() || posting}
            >
              <Text style={styles.sendBtnTxt}>{posting ? '...' : 'Gửi'}</Text>
            </TouchableOpacity>
          </View>

          {comments.length === 0 ? (
            <Text style={styles.commentEmpty}>Chưa có bình luận nào.</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.assigneeDot}>
                  <Text style={styles.assigneeInit}>{initials(c.user?.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentAuthor}>{c.user?.full_name || 'Người dùng'}</Text>
                    <Text style={styles.commentTime}>{formatDateTime(c.created_at)}</Text>
                  </View>
                  <Text style={styles.commentContent}>{c.content}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    flex: 1,
    backgroundColor: CrmColors.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  empty: { color: CrmColors.gray600, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  retryTxt: { color: CrmColors.white, fontWeight: '700' },

  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  projCode: { fontSize: 12, fontWeight: '700', color: CrmColors.blue600 },
  prioPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  prioTxt: { fontSize: 11, color: CrmColors.white, fontWeight: '700' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusTxt: { fontSize: 11, color: CrmColors.white, fontWeight: '700' },

  title: { fontSize: 18, fontWeight: '700', color: CrmColors.gray900, marginBottom: 6 },
  projName: { fontSize: 13, color: CrmColors.gray600, marginBottom: 8 },
  description: { fontSize: 14, color: CrmColors.gray700, lineHeight: 20, marginBottom: 12 },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray100,
  },
  metaItem: { flexBasis: '46%', flexGrow: 1, minWidth: 120 },
  metaLabel: { fontSize: 11, color: CrmColors.gray500 },
  metaValue: { fontSize: 13, color: CrmColors.gray900, fontWeight: '600', marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnSecondary: {
    flex: 1,
    backgroundColor: CrmColors.blue50,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnSecondaryTxt: { color: CrmColors.blue700, fontWeight: '700' },
  btnDanger: {
    flex: 1,
    backgroundColor: CrmColors.red50,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnDangerTxt: { color: CrmColors.red700, fontWeight: '700' },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900, marginBottom: 10 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  statusBtnTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray700 },

  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  participantName: { fontSize: 13, color: CrmColors.gray900, fontWeight: '600' },
  participantRole: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  assigneeDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeInit: { fontSize: 11, fontWeight: '700', color: CrmColors.blue700 },

  checklistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  checklistTick: { fontSize: 16, color: CrmColors.gray600 },
  checklistTitle: { fontSize: 13, color: CrmColors.gray800, flex: 1 },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  commentInput: {
    flex: 1,
    backgroundColor: CrmColors.gray100,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: CrmColors.gray900,
    minHeight: 40,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  sendBtnTxt: { color: CrmColors.white, fontWeight: '700' },

  commentEmpty: { color: CrmColors.gray500, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray100,
  },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: CrmColors.gray900 },
  commentTime: { fontSize: 10, color: CrmColors.gray500 },
  commentContent: { fontSize: 13, color: CrmColors.gray700, lineHeight: 18, marginTop: 4 },
});
