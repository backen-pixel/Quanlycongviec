import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../SpinningLoader';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  PRIORITY_LABEL,
  STATUS_STAGE_LABEL,
  createLeadAssignment,
  deleteCrmAssignment,
  fetchAssignmentColumns,
  fetchLeadAssignments,
  updateCrmAssignment,
  type CrmAssignment,
} from '../../api/assignments';
import { formatApiError } from '../../api/client';
import { fetchLeadMembers, type LeadCrmTask, type LeadMember } from '../../api/leadDetail';
import { fetchLeadTasks, updateLeadTask } from '../../api/leadTasks';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';

type AssignModule = 'all' | 'crm' | 'production' | 'logistics';

type Props = {
  leadId: string;
  companyId?: string | null;
  leadType?: string | null;
};

const MODULE_TABS: { id: AssignModule; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'Tất cả', icon: 'grid-outline' },
  { id: 'crm', label: 'CRM', icon: 'briefcase-outline' },
  { id: 'production', label: 'SX', icon: 'construct-outline' },
  { id: 'logistics', label: 'VC', icon: 'car-outline' },
];

const PRIORITIES = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'TB' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Gấp' },
];

const SOURCE_OPTIONS = [
  { value: 'customer_request', label: 'Phát sinh từ khách hàng' },
  { value: 'employee_error', label: 'Lỗi từ nhân viên' },
];

const ERROR_MODULES = [
  { value: 'crm', label: 'CRM' },
  { value: 'production', label: 'Xưởng (SX)' },
  { value: 'logistics', label: 'VC / LĐ' },
];

const LOGISTICS_ROLES = new Set([
  'logistics_admin', 'logistics', 'driver', 'installer', 'shipping',
]);
const PRODUCTION_ROLES = new Set([
  'production_admin', 'production_staff', 'production',
]);
const CRM_ROLES = new Set([
  'sales', 'sales_admin', 'customer_care', 'designer', 'manager', 'staff', 'admin',
  'accounting', 'ketoan', 'region_admin', 'crm_production_admin', 'crm_production_staff',
]);

function memberModulesFromUser(user?: LeadMember['user'] | null): AssignModule[] {
  if (!user) return ['crm'];
  const drive = String(user.drive_module || '').trim().toLowerCase();
  if (drive === 'vc' || drive === 'logistics') return ['logistics'];
  if (drive === 'sx' || drive === 'production') return ['production'];
  if (drive === 'crm') return ['crm'];
  const r = String(user.role || '').trim().toLowerCase();
  if (LOGISTICS_ROLES.has(r)) return ['logistics'];
  if (r === 'production_admin' || r === 'production_staff' || r === 'production') return ['production'];
  if (r === 'crm_production_admin' || r === 'crm_production_staff') return ['crm', 'production'];
  if (CRM_ROLES.has(r) || !r) return ['crm'];
  if (PRODUCTION_ROLES.has(r)) return ['production'];
  return ['crm'];
}

function memberBelongsToModule(member: LeadMember, moduleId: AssignModule): boolean {
  if (!moduleId || moduleId === 'all') return true;
  return memberModulesFromUser(member.user || null).includes(moduleId);
}

function assignmentBelongsToModule(a: CrmAssignment, moduleId: AssignModule): boolean {
  if (!moduleId || moduleId === 'all') return true;
  const stored = String(a.assignment_module || '').toLowerCase();
  if (stored === 'crm' || stored === 'production' || stored === 'logistics') {
    return stored === moduleId;
  }
  return true;
}

function moduleLabel(mod?: string | null): string {
  if (mod === 'production') return 'SX';
  if (mod === 'logistics') return 'VC';
  return 'CRM';
}

function fmtDeadline(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function statusColor(status: string | null | undefined, Colors: ThemeColors): string {
  if (status === 'completed') return Colors.green;
  if (status === 'in_progress') return Colors.blue;
  if (status === 'cancelled') return Colors.textFaint;
  return Colors.orange;
}

export default function LeadSharedWorkspaceTab({ leadId, companyId }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [moduleTab, setModuleTab] = useState<AssignModule>('crm');
  const [members, setMembers] = useState<LeadMember[]>([]);
  const [assignments, setAssignments] = useState<CrmAssignment[]>([]);
  const [sharedTasks, setSharedTasks] = useState<LeadCrmTask[]>([]);
  const [columnId, setColumnId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('17:00');
  const [priority, setPriority] = useState('medium');
  const [taskSourceType, setTaskSourceType] = useState('customer_request');
  const [employeeErrorModule, setEmployeeErrorModule] = useState('crm');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const formModule: AssignModule = moduleTab === 'all' ? 'crm' : moduleTab;

  const formMembers = useMemo(
    () => members.filter((m) => memberBelongsToModule(m, formModule)),
    [members, formModule],
  );

  const filteredAssignments = useMemo(
    () => assignments.filter((a) => assignmentBelongsToModule(a, moduleTab)),
    [assignments, moduleTab],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [mem, assigns, cols, tasks] = await Promise.all([
        fetchLeadMembers(leadId),
        fetchLeadAssignments(leadId),
        fetchAssignmentColumns(),
        fetchLeadTasks(leadId, { taskScope: 'production', taskCompanyScope: 'shared' }).catch(() => [] as LeadCrmTask[]),
      ]);
      setMembers(mem);
      setAssignments(assigns);
      setSharedTasks(tasks);
      if (cols[0]?.id) setColumnId((prev) => prev || String(cols[0].id));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setDesc('');
    setDeadlineDate('');
    setDeadlineTime('17:00');
    setPriority('medium');
    setTaskSourceType('customer_request');
    setEmployeeErrorModule('crm');
    setMemberIds(new Set());
    setEditingId(null);
    setFormOpen(false);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
    setMemberIds(new Set(formMembers.map((m) => String(m.user_id || '')).filter(Boolean)));
  };

  const openEdit = (a: CrmAssignment) => {
    const mod = String(a.assignment_module || '').toLowerCase();
    if (mod === 'crm' || mod === 'production' || mod === 'logistics') {
      setModuleTab(mod);
    }
    setEditingId(a.id);
    setFormOpen(true);
    setTitle(a.title || '');
    setDesc(a.description || '');
    if (a.deadline) {
      const d = new Date(a.deadline);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        setDeadlineDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        setDeadlineTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    } else {
      setDeadlineDate('');
      setDeadlineTime('17:00');
    }
    setPriority(String(a.priority || 'medium'));
    const src = String(a.task_source_type || '').toLowerCase();
    setTaskSourceType(src === 'employee_error' ? 'employee_error' : 'customer_request');
    const errMod = String(a.employee_error_module || '').toLowerCase();
    setEmployeeErrorModule(
      errMod === 'production' || errMod === 'logistics' || errMod === 'crm' ? errMod : 'crm',
    );
    const ids = (
      a.assignees?.length
        ? a.assignees.map((u) => u.id)
        : (a.assignee_id ? [a.assignee_id] : a.assignee?.id ? [a.assignee.id] : [])
    ).map(String).filter(Boolean);
    setMemberIds(new Set(ids));
  };

  const toggleMember = (uid: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('Thiếu tiêu đề', 'Nhập tiêu đề phân công');
      return;
    }
    if (!memberIds.size) {
      Alert.alert('Thiếu người nhận', 'Chọn ít nhất một thành viên');
      return;
    }
    if (taskSourceType === 'employee_error' && !employeeErrorModule) {
      Alert.alert('Thiếu khối', 'Chọn khối phát sinh lỗi');
      return;
    }
    let deadlineIso: string | null = null;
    if (deadlineDate.trim()) {
      const local = `${deadlineDate.trim()}T${deadlineTime.trim() || '17:00'}`;
      const d = new Date(local);
      if (Number.isNaN(d.getTime())) {
        Alert.alert('Ngày không hợp lệ', 'Dùng định dạng yyyy-mm-dd và HH:mm');
        return;
      }
      deadlineIso = d.toISOString();
    }

    setSaving(true);
    try {
      const sourcePayload = {
        task_source_type: taskSourceType,
        employee_error_module: taskSourceType === 'employee_error' ? employeeErrorModule : null,
      };
      if (editingId) {
        await updateCrmAssignment(editingId, {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          column_id: columnId || null,
          deadline: deadlineIso,
          assignee_ids: [...memberIds],
          assignment_module: formModule,
          ...sourcePayload,
        });
      } else {
        await createLeadAssignment(leadId, {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          column_id: columnId || null,
          deadline: deadlineIso,
          assignee_ids: [...memberIds],
          assignment_module: formModule,
          company_id: companyId || undefined,
          ...sourcePayload,
        });
      }
      resetForm();
      await load(true);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const cycleStatus = (a: CrmAssignment) => {
    const order = ['pending', 'in_progress', 'completed', 'cancelled'];
    const cur = String(a.status || 'pending');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    Alert.alert('Đổi trạng thái', `Chuyển «${a.title}» → ${STATUS_STAGE_LABEL[next] || next}?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đổi',
        onPress: () => {
          void (async () => {
            try {
              await updateCrmAssignment(a.id, { status: next });
              await load(true);
            } catch (e) {
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  const removeAssignment = (a: CrmAssignment) => {
    Alert.alert('Xóa phân công', `Xóa «${a.title}»?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteCrmAssignment(a.id);
              await load(true);
            } catch (e) {
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  const cycleTaskStatus = (t: LeadCrmTask) => {
    const order = ['pending', 'in_progress', 'completed', 'cancelled'];
    const cur = String(t.status || 'pending');
    const next = order[(order.indexOf(cur) + 1) % order.length] || 'pending';
    Alert.alert('Đổi trạng thái', `Chuyển «${t.title}» → ${STATUS_STAGE_LABEL[next] || next}?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đổi',
        onPress: () => {
          void (async () => {
            try {
              await updateLeadTask(leadId, t.id, { status: next });
              await load(true);
            } catch (e) {
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  if (loading && !assignments.length && !members.length) {
    return <SpinningLoader color={Colors.blue} style={{ marginTop: 32 }} />;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={Colors.blue}
        />
      }
    >
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Phân công thành viên</Text>
          <Text style={styles.sectionHint}>Giao việc cho thành viên deal theo khối CRM / SX / VC.</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnTxt}>Tạo</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modTabs}>
        {MODULE_TABS.map((t) => {
          const active = moduleTab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[styles.modChip, active && styles.modChipActive]}
              onPress={() => setModuleTab(t.id)}
            >
              <Ionicons name={t.icon} size={14} color={active ? '#fff' : Colors.textMuted} />
              <Text style={[styles.modChipTxt, active && styles.modChipTxtActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTxt}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retryTxt}>Thử lại</Text>
          </Pressable>
        </View>
      ) : null}

      {!filteredAssignments.length ? (
        <View style={styles.emptyBox}>
          <Ionicons name="people-circle-outline" size={36} color={Colors.textFaint} />
          <Text style={styles.emptyTitle}>Chưa có phân công</Text>
          <Text style={styles.emptyHint}>Bấm «Tạo» để giao việc cho thành viên tham gia deal.</Text>
        </View>
      ) : (
        filteredAssignments.map((a) => {
          const people = a.assignees?.length
            ? a.assignees
            : (a.assignee ? [a.assignee] : []);
          const st = String(a.status || 'pending');
          return (
            <View key={a.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{a.title || 'Không tiêu đề'}</Text>
                <View style={[styles.statusPill, { backgroundColor: statusColor(st, Colors) + '22' }]}>
                  <Text style={[styles.statusTxt, { color: statusColor(st, Colors) }]}>
                    {STATUS_STAGE_LABEL[st] || st}
                  </Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaChip}>{moduleLabel(a.assignment_module)}</Text>
                {a.priority ? (
                  <Text style={styles.metaChip}>{PRIORITY_LABEL[String(a.priority)] || a.priority}</Text>
                ) : null}
                {a.task_source_type === 'employee_error' ? (
                  <Text style={styles.metaChip}>Lỗi NV</Text>
                ) : a.task_source_type === 'customer_request' ? (
                  <Text style={styles.metaChip}>Từ KH</Text>
                ) : null}
              </View>
              {people.length ? (
                <Text style={styles.peopleTxt} numberOfLines={2}>
                  {people.map((p) => p.full_name || 'NV').join(', ')}
                </Text>
              ) : null}
              {a.deadline ? (
                <Text style={styles.deadlineTxt}>Hạn: {fmtDeadline(a.deadline)}</Text>
              ) : null}
              <View style={styles.cardActions}>
                <Pressable onPress={() => cycleStatus(a)} hitSlop={6}>
                  <Text style={styles.actionLink}>Trạng thái</Text>
                </Pressable>
                <Pressable onPress={() => openEdit(a)} hitSlop={6}>
                  <Text style={styles.actionLink}>Sửa</Text>
                </Pressable>
                <Pressable onPress={() => removeAssignment(a)} hitSlop={6}>
                  <Text style={[styles.actionLink, { color: Colors.red }]}>Xóa</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <View style={styles.divider} />

      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Nhiệm vụ giao chéo công ty</Text>
          <Text style={styles.sectionHint}>
            Nhiệm vụ / checklist giao cho công ty đối tác — xem và cập nhật tại đây.
          </Text>
        </View>
      </View>

      {!sharedTasks.length ? (
        <View style={styles.emptyBox}>
          <Ionicons name="git-compare-outline" size={36} color={Colors.textFaint} />
          <Text style={styles.emptyTitle}>Chưa có nhiệm vụ giao chéo</Text>
          <Text style={styles.emptyHint}>Khi giao nhiệm vụ cho công ty khác, chúng sẽ hiện ở đây.</Text>
        </View>
      ) : (
        sharedTasks.map((t) => {
          const st = String(t.status || 'pending');
          const people = t.assignees?.length
            ? t.assignees
            : (t.assignee ? [t.assignee] : []);
          return (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{t.title || 'Nhiệm vụ'}</Text>
                <View style={[styles.statusPill, { backgroundColor: statusColor(st, Colors) + '22' }]}>
                  <Text style={[styles.statusTxt, { color: statusColor(st, Colors) }]}>
                    {STATUS_STAGE_LABEL[st] || st}
                  </Text>
                </View>
              </View>
              {t.shared_view === 'checklist_only' ? (
                <Text style={styles.metaChip}>Chỉ checklist</Text>
              ) : null}
              {people.length ? (
                <Text style={styles.peopleTxt} numberOfLines={2}>
                  {people.map((p) => p.full_name || 'NV').join(', ')}
                </Text>
              ) : null}
              <View style={styles.cardActions}>
                <Pressable onPress={() => cycleTaskStatus(t)} hitSlop={6}>
                  <Text style={styles.actionLink}>Trạng thái</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={formOpen} animationType="slide" onRequestClose={resetForm}>
        <View style={[styles.modalRoot, { backgroundColor: Colors.bg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={resetForm} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
            <Text style={styles.modalTitle}>{editingId ? 'Sửa phân công' : 'Tạo phân công'}</Text>
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={() => void submit()}
            >
              {saving ? <SpinningLoader color="#fff" size="small" /> : <Text style={styles.saveTxt}>Lưu</Text>}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalPad} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Khối: {moduleLabel(formModule)}</Text>

            <Text style={styles.fieldLabel}>Tiêu đề *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ví dụ: Kiểm tra kích thước lắp đặt"
              placeholderTextColor={Colors.textFaint}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Mô tả</Text>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="Ghi chú thêm…"
              placeholderTextColor={Colors.textFaint}
              style={[styles.input, styles.textarea]}
              multiline
            />

            <Text style={styles.fieldLabel}>Hạn (yyyy-mm-dd · HH:mm)</Text>
            <View style={styles.rowInputs}>
              <TextInput
                value={deadlineDate}
                onChangeText={setDeadlineDate}
                placeholder="yyyy-mm-dd"
                placeholderTextColor={Colors.textFaint}
                style={[styles.input, { flex: 1.3 }]}
                autoCapitalize="none"
              />
              <TextInput
                value={deadlineTime}
                onChangeText={setDeadlineTime}
                placeholder="HH:mm"
                placeholderTextColor={Colors.textFaint}
                style={[styles.input, { flex: 1 }]}
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.fieldLabel}>Ưu tiên</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p.value}
                  style={[styles.choiceChip, priority === p.value && styles.choiceChipActive]}
                  onPress={() => setPriority(p.value)}
                >
                  <Text style={[styles.choiceTxt, priority === p.value && styles.choiceTxtActive]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Loại nhiệm vụ *</Text>
            <View style={styles.chipRow}>
              {SOURCE_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.choiceChip, taskSourceType === o.value && styles.choiceChipActive]}
                  onPress={() => setTaskSourceType(o.value)}
                >
                  <Text style={[styles.choiceTxt, taskSourceType === o.value && styles.choiceTxtActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {taskSourceType === 'employee_error' ? (
              <>
                <Text style={styles.fieldLabel}>Khối phát sinh lỗi *</Text>
                <View style={styles.chipRow}>
                  {ERROR_MODULES.map((o) => (
                    <Pressable
                      key={o.value}
                      style={[styles.choiceChip, employeeErrorModule === o.value && styles.choiceChipActive]}
                      onPress={() => setEmployeeErrorModule(o.value)}
                    >
                      <Text style={[styles.choiceTxt, employeeErrorModule === o.value && styles.choiceTxtActive]}>
                        {o.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.assignHead}>
              <Text style={styles.fieldLabel}>Người nhận * ({memberIds.size})</Text>
              <Pressable
                onPress={() => setMemberIds(new Set(formMembers.map((m) => String(m.user_id || '')).filter(Boolean)))}
              >
                <Text style={styles.actionLink}>Chọn hết</Text>
              </Pressable>
            </View>
            {!formMembers.length ? (
              <Text style={styles.emptyHint}>Không có thành viên khối {moduleLabel(formModule)} trên deal.</Text>
            ) : (
              formMembers.map((m) => {
                const uid = String(m.user_id || m.user?.id || '');
                if (!uid) return null;
                const name = m.user?.full_name || 'Thành viên';
                const on = memberIds.has(uid);
                return (
                  <Pressable key={uid} style={styles.memberRow} onPress={() => toggleMember(uid)}>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? Colors.blue : Colors.textFaint}
                    />
                    <Text style={styles.memberName}>{name}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    pad: { padding: Spacing.md, paddingBottom: 40 },
    sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
    sectionHint: { fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 15 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: C.blue,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.md,
    },
    addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
    modTabs: { gap: 8, paddingBottom: 12 },
    modChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radii.lg,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    modChipActive: { backgroundColor: C.blue, borderColor: C.blue },
    modChipTxt: { fontSize: 12, fontWeight: '700', color: C.textMuted },
    modChipTxtActive: { color: '#fff' },
    errorBox: {
      backgroundColor: C.redSoft,
      borderRadius: Radii.md,
      padding: 12,
      marginBottom: 10,
    },
    errorTxt: { color: C.red, fontSize: 13 },
    retryTxt: { color: C.blue, fontWeight: '700', marginTop: 6 },
    emptyBox: { alignItems: 'center', paddingVertical: 24, gap: 6 },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: C.textMuted },
    emptyHint: { fontSize: 12, color: C.textFaint, textAlign: 'center', paddingHorizontal: 16 },
    card: {
      backgroundColor: C.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: C.borderSoft,
      padding: 12,
      marginBottom: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
    statusPill: { borderRadius: Radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
    statusTxt: { fontSize: 11, fontWeight: '800' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    metaChip: {
      fontSize: 10,
      fontWeight: '700',
      color: C.blue,
      backgroundColor: C.blueSoft,
      overflow: 'hidden',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radii.sm,
    },
    peopleTxt: { fontSize: 12, color: C.textMuted, marginTop: 6 },
    deadlineTxt: { fontSize: 11, color: C.orange, marginTop: 4, fontWeight: '600' },
    cardActions: { flexDirection: 'row', gap: 14, marginTop: 10 },
    actionLink: { fontSize: 12, fontWeight: '700', color: C.blue },
    divider: { height: 1, backgroundColor: C.borderSoft, marginVertical: 18 },
    modalRoot: { flex: 1, paddingTop: 48 },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.borderSoft,
    },
    modalTitle: { fontSize: 16, fontWeight: '800', color: C.text },
    saveBtn: {
      backgroundColor: C.blue,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radii.md,
      minWidth: 56,
      alignItems: 'center',
    },
    saveTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
    modalPad: { padding: 16, paddingBottom: 40 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginTop: 12, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: C.borderSoft,
      backgroundColor: C.card,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.text,
      fontSize: 14,
    },
    textarea: { minHeight: 72, textAlignVertical: 'top' },
    rowInputs: { flexDirection: 'row', gap: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choiceChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.borderSoft,
      backgroundColor: C.card,
    },
    choiceChipActive: { backgroundColor: C.blueSoft, borderColor: C.blue },
    choiceTxt: { fontSize: 12, fontWeight: '600', color: C.textMuted },
    choiceTxtActive: { color: C.blue },
    assignHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    memberName: { fontSize: 14, color: C.text, fontWeight: '600' },
  });
}
