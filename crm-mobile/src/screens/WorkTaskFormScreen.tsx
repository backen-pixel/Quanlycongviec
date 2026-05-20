import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MoreStackParamList } from '../navigation/types';
import {
  createWorkTask,
  getWorkTask,
  updateWorkTask,
  type CreateWorkTaskPayload,
  type UpdateWorkTaskPayload,
  type WorkTaskUserOption,
} from '../lib/workTaskApi';
import {
  WORK_TASK_PRIORITY_COLOR,
  WORK_TASK_PRIORITY_LABEL,
  WORK_TASK_PRIORITY_ORDER,
  type WorkTaskPriority,
} from '../types/workTask';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import AssigneePickerModal from '../components/AssigneePickerModal';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'WorkTaskForm'>;
type R = RouteProp<MoreStackParamList, 'WorkTaskForm'>;

type DueQuick = 'none' | 'today' | 'tomorrow' | 'in3' | 'in7' | 'custom';

const QUICK_DUE_LABELS: Record<DueQuick, string> = {
  none: 'Không có hạn',
  today: 'Hôm nay',
  tomorrow: 'Ngày mai',
  in3: '+3 ngày',
  in7: '+7 ngày',
  custom: 'Tùy chọn',
};

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

function toInputDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function fromInputDate(s: string): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function WorkTaskFormScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route: R;
}) {
  const { mode, id } = route.params;
  const isEdit = mode === 'edit' && !!id;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkTaskPriority>('medium');
  const [assignee, setAssignee] = useState<WorkTaskUserOption | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueQuick, setDueQuick] = useState<DueQuick>('none');
  const [customDateStr, setCustomDateStr] = useState('');
  const [taskType, setTaskType] = useState<'project' | 'personal'>('personal');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      try {
        const t = await getWorkTask(id);
        if (!mounted || !t) return;
        setTitle(t.title || '');
        setDescription(t.description || '');
        setPriority((t.priority as WorkTaskPriority) || 'medium');
        if (t.assignee) {
          setAssignee({
            id: String(t.assignee.id),
            full_name: t.assignee.full_name || null,
            email: t.assignee.email || null,
            avatar: t.assignee.avatar || null,
          });
        }
        setDueDate(t.due_date || null);
        setCustomDateStr(toInputDate(t.due_date));
        setDueQuick(t.due_date ? 'custom' : 'none');
        setTaskType((t.task_type as 'project' | 'personal') || 'personal');
      } catch {
        Alert.alert('Lỗi', 'Không tải được công việc.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isEdit, id]);

  const handleQuickDue = useCallback((q: DueQuick) => {
    setDueQuick(q);
    if (q === 'none') {
      setDueDate(null);
      setCustomDateStr('');
    } else if (q === 'today') {
      const iso = plusDays(0);
      setDueDate(iso);
      setCustomDateStr(toInputDate(iso));
    } else if (q === 'tomorrow') {
      const iso = plusDays(1);
      setDueDate(iso);
      setCustomDateStr(toInputDate(iso));
    } else if (q === 'in3') {
      const iso = plusDays(3);
      setDueDate(iso);
      setCustomDateStr(toInputDate(iso));
    } else if (q === 'in7') {
      const iso = plusDays(7);
      setDueDate(iso);
      setCustomDateStr(toInputDate(iso));
    }
  }, []);

  const handleCustomDate = useCallback((s: string) => {
    setCustomDateStr(s);
    const iso = fromInputDate(s);
    if (iso) {
      setDueDate(iso);
      setDueQuick('custom');
    } else if (!s.trim()) {
      setDueDate(null);
      setDueQuick('none');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const t = title.trim();
    if (!t) {
      Alert.alert('Thiếu tiêu đề', 'Vui lòng nhập tiêu đề công việc.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && id) {
        const payload: UpdateWorkTaskPayload = {
          title: t,
          description: description.trim() || null,
          priority,
          assignee_id: assignee?.id || null,
          due_date: dueDate,
        };
        await updateWorkTask(id, payload);
        navigation.goBack();
      } else {
        const payload: CreateWorkTaskPayload = {
          title: t,
          description: description.trim() || null,
          priority,
          assignee_id: assignee?.id || null,
          due_date: dueDate,
          task_type: taskType,
        };
        const created = await createWorkTask(payload);
        navigation.replace('WorkTaskDetail', { id: created.id });
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      Alert.alert('Lỗi', err?.response?.data?.error || 'Không lưu được công việc.');
    } finally {
      setSaving(false);
    }
  }, [
    isEdit,
    id,
    title,
    description,
    priority,
    assignee,
    dueDate,
    taskType,
    navigation,
  ]);

  const assigneeLabel = useMemo(() => {
    if (!assignee) return 'Chọn người làm';
    return assignee.full_name || assignee.email || 'Người dùng';
  }, [assignee]);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: CrmColors.pageBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.label}>Tiêu đề *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Thiết kế 3D nhà bếp anh A"
            placeholderTextColor={CrmColors.gray400}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Yêu cầu, ghi chú, mục tiêu..."
            placeholderTextColor={CrmColors.gray400}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.sectionTitle}>Giao cho</Text>
          <TouchableOpacity style={styles.assigneeBtn} onPress={() => setPickerOpen(true)}>
            <View style={styles.assigneeAvatar}>
              <Text style={styles.assigneeInit}>
                {assignee
                  ? (assignee.full_name || assignee.email || '?')
                      .split(/\s+/)
                      .map((w) => w[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.assigneeLabel}>{assigneeLabel}</Text>
              {assignee?.email ? (
                <Text style={styles.assigneeEmail} numberOfLines={1}>
                  {assignee.email}
                </Text>
              ) : (
                <Text style={styles.assigneeHint}>Bấm để chọn người được giao</Text>
              )}
            </View>
            {assignee ? (
              <TouchableOpacity onPress={() => setAssignee(null)} style={styles.clearAssignee}>
                <Text style={styles.clearAssigneeTxt}>×</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.sectionTitle}>Mức độ ưu tiên</Text>
          <View style={styles.row}>
            {WORK_TASK_PRIORITY_ORDER.map((p) => {
              const active = priority === p;
              const c = WORK_TASK_PRIORITY_COLOR[p];
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.prioBtn,
                    active && { backgroundColor: c, borderColor: c },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.prioBtnTxt, active && { color: CrmColors.white }]}>
                    {WORK_TASK_PRIORITY_LABEL[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.sectionTitle}>Hạn chót</Text>
          <View style={styles.row}>
            {(['none', 'today', 'tomorrow', 'in3', 'in7', 'custom'] as DueQuick[]).map((q) => {
              const active = dueQuick === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[styles.dueChip, active && styles.dueChipActive]}
                  onPress={() => handleQuickDue(q)}
                >
                  <Text style={[styles.dueChipTxt, active && styles.dueChipTxtActive]}>
                    {QUICK_DUE_LABELS[q]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {(dueQuick === 'custom' || dueDate) && (
            <>
              <Text style={[styles.label, { marginTop: 10 }]}>Hạn (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-05-30"
                placeholderTextColor={CrmColors.gray400}
                value={customDateStr}
                onChangeText={handleCustomDate}
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              />
              {dueDate ? (
                <Text style={styles.dueHint}>
                  ⏰ Sẽ nhắc vào{' '}
                  {new Date(dueDate).toLocaleDateString('vi-VN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {!isEdit && (
          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.sectionTitle}>Loại công việc</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.typeBtn, taskType === 'personal' && styles.typeBtnActive]}
                onPress={() => setTaskType('personal')}
              >
                <Text
                  style={[styles.typeBtnTxt, taskType === 'personal' && styles.typeBtnTxtActive]}
                >
                  📌 Cá nhân
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, taskType === 'project' && styles.typeBtnActive]}
                onPress={() => setTaskType('project')}
              >
                <Text
                  style={[styles.typeBtnTxt, taskType === 'project' && styles.typeBtnTxtActive]}
                >
                  🏗 Theo dự án
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.typeHint}>
              Công việc theo dự án nên được tạo trên web để chọn đúng dự án & giai đoạn.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, (saving || !title.trim()) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={saving || !title.trim()}
        >
          <Text style={styles.submitTxt}>
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : '✅ Giao việc'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <AssigneePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(u) => setAssignee(u)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    flex: 1,
    backgroundColor: CrmColors.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
  },
  label: { fontSize: 12, color: CrmColors.gray600, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: CrmColors.gray100,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  assigneeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  assigneeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeInit: { color: CrmColors.blue700, fontWeight: '700' },
  assigneeLabel: { fontSize: 14, color: CrmColors.gray900, fontWeight: '600' },
  assigneeEmail: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  assigneeHint: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  clearAssignee: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CrmColors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAssigneeTxt: { fontSize: 18, color: CrmColors.gray600 },

  prioBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  prioBtnTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray700 },

  dueChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.full,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  dueChipActive: { backgroundColor: CrmColors.blue600, borderColor: CrmColors.blue600 },
  dueChipTxt: { fontSize: 12, color: CrmColors.gray700, fontWeight: '600' },
  dueChipTxtActive: { color: CrmColors.white },
  dueHint: { fontSize: 12, color: CrmColors.gray600, marginTop: 8 },

  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  typeBtnTxt: { fontSize: 13, fontWeight: '600', color: CrmColors.gray700 },
  typeBtnTxtActive: { color: CrmColors.blue700 },
  typeHint: { fontSize: 11, color: CrmColors.gray500, marginTop: 8, fontStyle: 'italic' },

  submitBtn: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    alignItems: 'center',
    marginTop: 12,
  },
  submitTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 16 },
});
