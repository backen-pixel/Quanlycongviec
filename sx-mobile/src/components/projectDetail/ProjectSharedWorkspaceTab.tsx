import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import {
  assignmentBelongsToModule,
  assignmentModuleLabel,
  companyIdForAssignModule,
  createLeadSharedAssignment,
  deleteSharedAssignment,
  errorModuleLabel,
  fetchAssignmentColumns,
  fetchLeadSharedAssignments,
  fetchSharedWorkspaceMembers,
  fetchSpawnedAdditionalDeals,
  formatAssignDeadline,
  memberMatchesAssignPool,
  nextAssignStatus,
  priorityLabel,
  statusLabel,
  taskSourceLabel,
  updateSharedAssignment,
  type AssignModule,
  type AssignPriority,
  type AssignmentColumn,
  type AssignStatus,
  type CompanyScope,
  type ModuleTab,
  type SharedWorkspaceAssignment,
  type SharedWorkspaceMember,
  type SpawnedDealItem,
  type TaskSourceType,
} from '../../lib/sharedWorkspaceApi';
import { HIT_TARGET, Radii, Spacing, type AppColors } from '../../theme';
import SpinningLoader from '../SpinningLoader';
import TapHighlight from '../TapHighlight';

type Props = {
  dealId?: string | null;
  /** Công ty CRM của deal. */
  companyId?: string | null;
  /** Công ty xưởng SX. */
  sxCompanyId?: string | null;
  /** Công ty VC (nếu có). */
  vcCompanyId?: string | null;
  defaultModule?: ModuleTab;
};

const MODULE_TABS: { id: ModuleTab; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'crm', label: 'CRM' },
  { id: 'production', label: 'SX' },
  { id: 'logistics', label: 'LD' },
];

const PRIORITIES: { value: AssignPriority; label: string }[] = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'TB' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Gấp' },
];

const STATUSES: { value: AssignStatus; label: string }[] = [
  { value: 'pending', label: 'Chờ' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'completed', label: 'Xong' },
  { value: 'cancelled', label: 'Hủy' },
];

const SOURCE_OPTIONS: { value: TaskSourceType; label: string }[] = [
  { value: 'customer_request', label: 'Từ khách hàng' },
  { value: 'employee_error', label: 'Lỗi nhân viên' },
];

const ERROR_MODULES: { value: AssignModule; label: string }[] = [
  { value: 'crm', label: 'CRM' },
  { value: 'production', label: 'Xưởng' },
  { value: 'logistics', label: 'Lắp đặt' },
];

function statusIcon(status?: string | null): keyof typeof Ionicons.glyphMap {
  if (status === 'completed') return 'checkmark-circle';
  if (status === 'in_progress') return 'time';
  if (status === 'cancelled') return 'close-circle';
  return 'ellipse-outline';
}

function statusColor(status: string | null | undefined, colors: AppColors): string {
  if (status === 'completed') return colors.success;
  if (status === 'in_progress') return colors.primary;
  if (status === 'cancelled') return colors.textFaint;
  return colors.textMuted;
}

function moduleChipColor(mod: string, colors: AppColors): string {
  if (mod === 'production') return '#0D9488';
  if (mod === 'logistics') return '#EA580C';
  return colors.primary;
}

export default function ProjectSharedWorkspaceTab({
  dealId,
  companyId = null,
  sxCompanyId = null,
  vcCompanyId = null,
  defaultModule = 'production',
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const initialModule: ModuleTab = ['crm', 'production', 'logistics'].includes(defaultModule)
    ? defaultModule
    : 'all';

  const [moduleTab, setModuleTab] = useState<ModuleTab>(initialModule);
  const [members, setMembers] = useState<SharedWorkspaceMember[]>([]);
  const [assignments, setAssignments] = useState<SharedWorkspaceAssignment[]>([]);
  const [columns, setColumns] = useState<AssignmentColumn[]>([]);
  const [spawned, setSpawned] = useState<SpawnedDealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState<AssignPriority>('medium');
  const [status, setStatus] = useState<AssignStatus>('pending');
  const [columnId, setColumnId] = useState('');
  const [assignModule, setAssignModule] = useState<AssignModule>(
    initialModule === 'all' ? 'production' : initialModule,
  );
  const [taskSourceType, setTaskSourceType] = useState<TaskSourceType>('customer_request');
  const [employeeErrorModule, setEmployeeErrorModule] = useState<AssignModule>('crm');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const companyScope: CompanyScope = useMemo(
    () => ({ companyId, sxCompanyId, vcCompanyId }),
    [companyId, sxCompanyId, vcCompanyId],
  );

  const memberByUserId = useMemo(() => {
    const map = new Map<string, SharedWorkspaceMember>();
    for (const m of members) {
      if (m.user_id) map.set(String(m.user_id), m);
    }
    return map;
  }, [members]);

  const filteredAssignments = useMemo(
    () => assignments.filter((a) => assignmentBelongsToModule(a, moduleTab, memberByUserId)),
    [assignments, moduleTab, memberByUserId],
  );

  const assignmentCounts = useMemo(() => {
    const counts = { all: assignments.length, crm: 0, production: 0, logistics: 0 };
    for (const a of assignments) {
      for (const mod of ['crm', 'production', 'logistics'] as AssignModule[]) {
        if (assignmentBelongsToModule(a, mod, memberByUserId)) counts[mod] += 1;
      }
    }
    return counts;
  }, [assignments, memberByUserId]);

  const formModule: AssignModule = ['crm', 'production', 'logistics'].includes(assignModule)
    ? assignModule
    : 'production';

  const formMembers = useMemo(
    () => members.filter((m) => m.user_id && memberMatchesAssignPool(m, formModule, companyScope)),
    [members, formModule, companyScope],
  );

  const formCompanyId = companyIdForAssignModule(formModule, companyScope);

  const loadSeqRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!dealId) {
      setMembers([]);
      setAssignments([]);
      setSpawned([]);
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      const [mem, assigns, cols, spawnedRows] = await Promise.all([
        fetchSharedWorkspaceMembers(dealId),
        fetchLeadSharedAssignments(dealId),
        fetchAssignmentColumns().catch(() => [] as AssignmentColumn[]),
        fetchSpawnedAdditionalDeals(dealId).catch(() => [] as SpawnedDealItem[]),
      ]);
      if (seq !== loadSeqRef.current) return;
      setMembers(mem);
      setAssignments(assigns);
      setColumns(cols);
      setSpawned(spawnedRows);
      if (cols.length) {
        setColumnId((prev) => prev || String(cols[0].id));
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dealId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (['crm', 'production', 'logistics'].includes(defaultModule)) {
      setModuleTab(defaultModule);
    }
  }, [defaultModule, dealId]);

  const resetForm = useCallback(() => {
    setTitle('');
    setDesc('');
    setPriority('medium');
    setStatus('pending');
    setColumnId(columns[0] ? String(columns[0].id) : '');
    setMemberIds(new Set());
    setTaskSourceType('customer_request');
    setEmployeeErrorModule('crm');
    setAssignModule(moduleTab === 'all' ? 'production' : moduleTab);
    setDeadlineDate(null);
    setEditingId(null);
    setFormOpen(false);
    setShowDatePicker(false);
  }, [columns, moduleTab]);

  const openCreate = () => {
    resetForm();
    setAssignModule(moduleTab === 'all' ? 'production' : moduleTab);
    setFormOpen(true);
  };

  const openEdit = (a: SharedWorkspaceAssignment) => {
    const mod = String(a.assignment_module || '').toLowerCase();
    if (mod === 'crm' || mod === 'production' || mod === 'logistics') {
      setModuleTab(mod);
      setAssignModule(mod);
    } else {
      setAssignModule(moduleTab === 'all' ? 'production' : moduleTab);
    }
    setEditingId(a.id);
    setFormOpen(true);
    setTitle(a.title || '');
    setDesc(a.description || '');
    setPriority((['low', 'medium', 'high', 'urgent'].includes(String(a.priority))
      ? String(a.priority)
      : 'medium') as AssignPriority);
    setStatus((['pending', 'in_progress', 'completed', 'cancelled'].includes(String(a.status))
      ? String(a.status)
      : 'pending') as AssignStatus);
    setColumnId(a.column_id ? String(a.column_id) : (columns[0] ? String(columns[0].id) : ''));
    const src = String(a.task_source_type || '').toLowerCase();
    setTaskSourceType(src === 'employee_error' ? 'employee_error' : 'customer_request');
    const errMod = String(a.employee_error_module || '').toLowerCase();
    setEmployeeErrorModule(
      errMod === 'production' || errMod === 'logistics' || errMod === 'crm' ? errMod : 'crm',
    );
    const ids = (a.assignees?.length
      ? a.assignees.map((u) => u.id)
      : (a.assignee_id ? [a.assignee_id] : [])
    ).map(String).filter(Boolean);
    setMemberIds(new Set(ids));
    setDeadlineDate(a.deadline ? new Date(a.deadline) : null);
  };

  const toggleMember = (userId: string) => {
    const sid = String(userId);
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const selectAllFormMembers = () => {
    if (formMembers.length && formMembers.every((m) => memberIds.has(String(m.user_id)))) {
      setMemberIds(new Set());
      return;
    }
    setMemberIds(new Set(formMembers.map((m) => String(m.user_id)).filter(Boolean)));
  };

  const onDateChange = (_evt: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setDeadlineDate(date);
  };

  const submit = async () => {
    if (!dealId) return;
    if (!title.trim()) {
      Alert.alert('Thiếu tiêu đề', 'Nhập tiêu đề nhiệm vụ');
      return;
    }
    if (!memberIds.size) {
      Alert.alert('Thiếu người nhận', 'Chọn ít nhất một thành viên');
      return;
    }
    if (taskSourceType === 'employee_error' && !employeeErrorModule) {
      Alert.alert('Thiếu khối lỗi', 'Chọn khối phát sinh lỗi');
      return;
    }
    setSaving(true);
    try {
      const sourcePayload = {
        task_source_type: taskSourceType,
        employee_error_module: taskSourceType === 'employee_error' ? employeeErrorModule : null,
      };
      if (editingId) {
        await updateSharedAssignment(editingId, {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          status,
          column_id: columnId || null,
          deadline: deadlineDate ? deadlineDate.toISOString() : null,
          assignee_ids: [...memberIds],
          assignment_module: formModule,
          ...sourcePayload,
        });
      } else {
        await createLeadSharedAssignment(dealId, {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          column_id: columnId || null,
          deadline: deadlineDate ? deadlineDate.toISOString() : null,
          assignee_ids: [...memberIds],
          assignment_module: formModule,
          company_id: formCompanyId || undefined,
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

  const cycleStatus = async (a: SharedWorkspaceAssignment) => {
    const next = nextAssignStatus(a.status);
    const prev = assignments;
    setAssignments((list) => list.map((row) => (row.id === a.id ? { ...row, status: next } : row)));
    try {
      await updateSharedAssignment(a.id, { status: next });
    } catch (e) {
      setAssignments(prev);
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const remove = (a: SharedWorkspaceAssignment) => {
    Alert.alert('Xóa phân công', `Xóa «${a.title}»?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const prev = assignments;
            setAssignments((list) => list.filter((row) => row.id !== a.id));
            try {
              await deleteSharedAssignment(a.id);
            } catch (e) {
              setAssignments(prev);
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  if (!dealId) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="people-outline" size={36} color={colors.textFaint} />
        <Text style={styles.emptyTxt}>Cần deal CRM gắn dự án để dùng Không gian chung.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: Spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Không gian chung</Text>
          <Text style={styles.introSub}>
            Phân công giao chéo cho thành viên deal (CRM / SX / LD) — đồng bộ Giao việc trên web.
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.moduleRow}
          style={{ marginBottom: 12 }}
        >
          {MODULE_TABS.map((t) => {
            const active = moduleTab === t.id;
            const count = t.id === 'all'
              ? assignmentCounts.all
              : assignmentCounts[t.id];
            return (
              <TapHighlight
                key={t.id}
                style={[styles.moduleChip, active && styles.moduleChipOn]}
                onPress={() => setModuleTab(t.id)}
              >
                <Text style={[styles.moduleChipTxt, active && styles.moduleChipTxtOn]}>
                  {t.label} ({count})
                </Text>
              </TapHighlight>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Phân công</Text>
          <TapHighlight style={styles.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={16} color={colors.white} />
            <Text style={styles.addBtnTxt}>
              Thêm{moduleTab !== 'all' ? ` · ${assignmentModuleLabel(moduleTab)}` : ''}
            </Text>
          </TapHighlight>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <SpinningLoader color={colors.primary} size={28} label="Đang tải…" />
          </View>
        ) : error ? (
          <Text style={styles.errorTxt}>{error}</Text>
        ) : filteredAssignments.length === 0 ? (
          <View style={styles.dashEmpty}>
            <Text style={styles.dashEmptyTxt}>
              {moduleTab === 'all'
                ? 'Chưa có phân công. Bấm «Thêm» để giao việc từ Không gian chung.'
                : `Chưa có phân công khối ${assignmentModuleLabel(moduleTab)}.`}
            </Text>
          </View>
        ) : (
          filteredAssignments.map((a) => {
            const mod = String(a.assignment_module || '').toLowerCase();
            const srcType = String(a.task_source_type || '').toLowerCase();
            const srcLabel = taskSourceLabel(srcType);
            const errLabel = srcType === 'employee_error'
              ? errorModuleLabel(a.employee_error_module)
              : null;
            const col = columns.find((c) => String(c.id) === String(a.column_id));
            const assigneeNames = (a.assignees?.length
              ? a.assignees
              : (a.assignee ? [a.assignee] : [])
            ).map((u) => u.full_name).filter(Boolean).join(', ');
            const done = a.status === 'completed';
            return (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Pressable
                    onPress={() => void cycleStatus(a)}
                    hitSlop={8}
                    style={styles.statusBtn}
                    accessibilityLabel={`Trạng thái ${statusLabel(a.status)}`}
                  >
                    <Ionicons
                      name={statusIcon(a.status)}
                      size={22}
                      color={statusColor(a.status, colors)}
                    />
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.cardTitle, done && styles.cardTitleDone]} numberOfLines={2}>
                      {a.title}
                    </Text>
                    <View style={styles.badgeRow}>
                      {(mod === 'crm' || mod === 'production' || mod === 'logistics') ? (
                        <View style={[styles.badge, { backgroundColor: `${moduleChipColor(mod, colors)}22` }]}>
                          <Text style={[styles.badgeTxt, { color: moduleChipColor(mod, colors) }]}>
                            {assignmentModuleLabel(mod)}
                          </Text>
                        </View>
                      ) : null}
                      {srcLabel ? (
                        <View style={[
                          styles.badge,
                          { backgroundColor: srcType === 'employee_error' ? colors.dangerSoft : colors.primarySoft },
                        ]}>
                          <Text style={[
                            styles.badgeTxt,
                            { color: srcType === 'employee_error' ? colors.danger : colors.primary },
                          ]}>
                            {srcLabel}{errLabel ? ` · ${errLabel}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {a.crm_task_id ? (
                        <View style={[styles.badge, { backgroundColor: '#7C3AED22' }]}>
                          <Text style={[styles.badgeTxt, { color: '#7C3AED' }]}>Có CV</Text>
                        </View>
                      ) : null}
                      {a.priority ? (
                        <View style={[styles.badge, { backgroundColor: colors.cardAlt }]}>
                          <Text style={[styles.badgeTxt, { color: colors.textMuted }]}>
                            {priorityLabel(a.priority)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.metaLine} numberOfLines={2}>
                      {[
                        col?.name,
                        assigneeNames ? `👤 ${assigneeNames}` : null,
                        a.deadline ? `📅 ${formatAssignDeadline(a.deadline)}` : null,
                      ].filter(Boolean).join(' · ') || statusLabel(a.status)}
                    </Text>
                    {a.crm_task?.notes?.trim() ? (
                      <Text style={styles.notePreview} numberOfLines={2}>
                        💬 {a.crm_task.notes.trim()}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => openEdit(a)} hitSlop={8} style={styles.iconAction}>
                      <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => remove(a)} hitSlop={8} style={styles.iconAction}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={[styles.sectionHead, { marginTop: 20 }]}>
          <Text style={styles.sectionTitle}>Đơn hàng phát sinh</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillTxt}>{spawned.length}</Text>
          </View>
        </View>
        {spawned.length === 0 ? (
          <Text style={styles.spawnedEmpty}>
            Chưa có đơn hàng phát sinh từ deal này.
          </Text>
        ) : (
          spawned.map((row) => (
            <View key={row.id} style={styles.spawnedCard}>
              <Text style={styles.spawnedCode}>{row.code || '—'}</Text>
              <Text style={styles.spawnedTitle} numberOfLines={2}>{row.title || 'Không tên'}</Text>
              <Text style={styles.spawnedMeta}>
                {[
                  row.stage?.name,
                  row.created_at ? `Tạo: ${formatAssignDeadline(row.created_at)}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={formOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resetForm}
      >
        <View style={[styles.modalRoot, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8 }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>
              {editingId ? 'Sửa phân công' : 'Thêm phân công'}
            </Text>
            <Pressable onPress={resetForm} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLbl}>Tiêu đề *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ví dụ: Xác nhận kích thước khách"
              placeholderTextColor={colors.textFaint}
            />

            <Text style={styles.fieldLbl}>Mô tả</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Ghi chú thêm…"
              placeholderTextColor={colors.textFaint}
              multiline
            />

            <Text style={styles.fieldLbl}>Khối phân công</Text>
            <View style={styles.chipWrap}>
              {(['crm', 'production', 'logistics'] as AssignModule[]).map((m) => (
                <TapHighlight
                  key={m}
                  style={[styles.pickChip, assignModule === m && styles.pickChipOn]}
                  onPress={() => setAssignModule(m)}
                >
                  <Text style={[styles.pickChipTxt, assignModule === m && styles.pickChipTxtOn]}>
                    {assignmentModuleLabel(m)}
                  </Text>
                </TapHighlight>
              ))}
            </View>

            <Text style={styles.fieldLbl}>Loại nhiệm vụ</Text>
            <View style={styles.chipWrap}>
              {SOURCE_OPTIONS.map((o) => (
                <TapHighlight
                  key={o.value}
                  style={[styles.pickChip, taskSourceType === o.value && styles.pickChipOn]}
                  onPress={() => setTaskSourceType(o.value)}
                >
                  <Text style={[styles.pickChipTxt, taskSourceType === o.value && styles.pickChipTxtOn]}>
                    {o.label}
                  </Text>
                </TapHighlight>
              ))}
            </View>

            {taskSourceType === 'employee_error' ? (
              <>
                <Text style={styles.fieldLbl}>Khối phát sinh lỗi</Text>
                <View style={styles.chipWrap}>
                  {ERROR_MODULES.map((o) => (
                    <TapHighlight
                      key={o.value}
                      style={[styles.pickChip, employeeErrorModule === o.value && styles.pickChipOn]}
                      onPress={() => setEmployeeErrorModule(o.value)}
                    >
                      <Text style={[
                        styles.pickChipTxt,
                        employeeErrorModule === o.value && styles.pickChipTxtOn,
                      ]}>
                        {o.label}
                      </Text>
                    </TapHighlight>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.fieldLbl}>Ưu tiên</Text>
            <View style={styles.chipWrap}>
              {PRIORITIES.map((o) => (
                <TapHighlight
                  key={o.value}
                  style={[styles.pickChip, priority === o.value && styles.pickChipOn]}
                  onPress={() => setPriority(o.value)}
                >
                  <Text style={[styles.pickChipTxt, priority === o.value && styles.pickChipTxtOn]}>
                    {o.label}
                  </Text>
                </TapHighlight>
              ))}
            </View>

            {editingId ? (
              <>
                <Text style={styles.fieldLbl}>Trạng thái</Text>
                <View style={styles.chipWrap}>
                  {STATUSES.map((o) => (
                    <TapHighlight
                      key={o.value}
                      style={[styles.pickChip, status === o.value && styles.pickChipOn]}
                      onPress={() => setStatus(o.value)}
                    >
                      <Text style={[styles.pickChipTxt, status === o.value && styles.pickChipTxtOn]}>
                        {o.label}
                      </Text>
                    </TapHighlight>
                  ))}
                </View>
              </>
            ) : null}

            {columns.length ? (
              <>
                <Text style={styles.fieldLbl}>Cột giao việc</Text>
                <View style={styles.chipWrap}>
                  {columns.map((c) => (
                    <TapHighlight
                      key={c.id}
                      style={[styles.pickChip, columnId === c.id && styles.pickChipOn]}
                      onPress={() => setColumnId(c.id)}
                    >
                      <Text style={[styles.pickChipTxt, columnId === c.id && styles.pickChipTxtOn]}>
                        {c.name}
                      </Text>
                    </TapHighlight>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.fieldLbl}>Hạn</Text>
            <TapHighlight style={styles.deadlineBtn} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.deadlineTxt}>
                {deadlineDate ? formatAssignDeadline(deadlineDate.toISOString()) : 'Chọn hạn (tuỳ chọn)'}
              </Text>
              {deadlineDate ? (
                <Pressable
                  onPress={() => setDeadlineDate(null)}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </TapHighlight>
            {showDatePicker ? (
              <DateTimePicker
                value={deadlineDate || new Date()}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                locale="vi-VN"
              />
            ) : null}

            <View style={styles.assigneeHead}>
              <Text style={styles.fieldLbl}>
                Giao cho · {assignmentModuleLabel(formModule)} ({formMembers.length})
              </Text>
              <Pressable onPress={selectAllFormMembers} hitSlop={8}>
                <Text style={styles.selectAllTxt}>
                  {formMembers.length && formMembers.every((m) => memberIds.has(String(m.user_id)))
                    ? 'Bỏ chọn'
                    : 'Chọn tất cả'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.memberList}>
              {formMembers.map((m) => {
                const checked = memberIds.has(String(m.user_id));
                return (
                  <Pressable
                    key={m.user_id}
                    style={[styles.memberRow, checked && styles.memberRowOn]}
                    onPress={() => toggleMember(m.user_id)}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={checked ? colors.primary : colors.textFaint}
                    />
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.user?.full_name || m.user_id}
                    </Text>
                  </Pressable>
                );
              })}
              {!formMembers.length ? (
                <Text style={styles.memberEmpty}>
                  Không có NV khối {assignmentModuleLabel(formModule)}
                  {formCompanyId ? ' đúng công ty' : ''} trên deal
                </Text>
              ) : null}
            </View>

            <TapHighlight
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={() => { if (!saving) void submit(); }}
            >
              {saving ? (
                <SpinningLoader color="#FFF" size="small" />
              ) : (
                <Text style={styles.submitTxt}>
                  {editingId ? 'Lưu' : `Giao cho ${memberIds.size} NV`}
                </Text>
              )}
            </TapHighlight>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xl,
      gap: 10,
    },
    emptyTxt: { color: c.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 20 },
    introCard: {
      backgroundColor: c.primarySoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.primary + '33',
      padding: Spacing.md,
      marginTop: Spacing.md,
      marginBottom: 4,
    },
    introTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    introSub: { color: c.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    moduleRow: { gap: 8, paddingVertical: 4 },
    moduleChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.full,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: 34,
      justifyContent: 'center',
    },
    moduleChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    moduleChipTxt: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    moduleChipTxtOn: { color: c.white },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      marginTop: 4,
    },
    sectionTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#7C3AED',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.md,
      minHeight: 34,
    },
    addBtnTxt: { color: c.white, fontSize: 12, fontWeight: '800' },
    loadingBox: { paddingVertical: 32, alignItems: 'center' },
    errorTxt: { color: c.danger, textAlign: 'center', paddingVertical: 16 },
    dashEmpty: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: '#7C3AED55',
      borderRadius: Radii.lg,
      padding: Spacing.lg,
      backgroundColor: '#7C3AED12',
    },
    dashEmptyTxt: { color: c.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.md,
      marginBottom: 8,
    },
    cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    statusBtn: { paddingTop: 2 },
    cardTitle: { color: c.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    cardTitleDone: { textDecorationLine: 'line-through', color: c.textFaint },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeTxt: { fontSize: 10, fontWeight: '800' },
    metaLine: { color: c.textMuted, fontSize: 11, marginTop: 6, lineHeight: 15 },
    notePreview: { color: c.warning, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
    cardActions: { gap: 4 },
    iconAction: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    countPill: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: '#0D948822',
      alignItems: 'center',
      justifyContent: 'center',
    },
    countPillTxt: { color: '#0D9488', fontSize: 11, fontWeight: '800' },
    spawnedEmpty: { color: c.textFaint, fontSize: 12, marginBottom: 8 },
    spawnedCard: {
      backgroundColor: '#0D948812',
      borderWidth: 1,
      borderColor: '#0D948844',
      borderRadius: Radii.lg,
      padding: Spacing.md,
      marginBottom: 8,
    },
    spawnedCode: { color: '#0D9488', fontSize: 11, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    spawnedTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
    spawnedMeta: { color: c.textMuted, fontSize: 11, marginTop: 4 },
    modalRoot: { flex: 1, backgroundColor: c.bg },
    modalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
    fieldLbl: { color: c.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      color: c.text,
      fontSize: 14,
      minHeight: HIT_TARGET - 4,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pickChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pickChipOn: { backgroundColor: c.primarySoft, borderColor: c.primary },
    pickChipTxt: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    pickChipTxtOn: { color: c.primary },
    deadlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      minHeight: HIT_TARGET - 4,
    },
    deadlineTxt: { flex: 1, color: c.text, fontSize: 13 },
    assigneeHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    selectAllTxt: { color: c.primary, fontSize: 12, fontWeight: '700' },
    memberList: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radii.md,
      overflow: 'hidden',
      backgroundColor: c.card,
      maxHeight: 220,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    memberRowOn: { backgroundColor: c.primarySoft },
    memberName: { flex: 1, color: c.text, fontSize: 13, fontWeight: '600' },
    memberEmpty: { color: c.textFaint, fontSize: 12, textAlign: 'center', padding: 16 },
    submitBtn: {
      marginTop: 20,
      backgroundColor: '#7C3AED',
      borderRadius: Radii.md,
      minHeight: HIT_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitTxt: { color: c.white, fontSize: 15, fontWeight: '800' },
  });
}
