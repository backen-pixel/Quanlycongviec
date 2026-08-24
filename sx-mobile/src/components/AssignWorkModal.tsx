import SpinningLoader from './SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import FilterPickerModal, { type FilterOption } from './FilterPickerModal';
import {
  PRIORITY_LABEL,
  createCrmAssignment,
  fetchAssignmentColumns,
  fetchAssignmentLookups,
  fetchDealPicker,
  fetchSharedWorkspaceMembers,
  uploadAssignmentReqFiles,
  type AssignmentColumn,
  type AssignmentLookupUser,
  type DealPickerItem,
} from '../lib/sharedWorkspaceApi';
import type { CompanyOption } from '../lib/productionApi';
import { useTheme } from '../context/ThemeContext';
import { Radii, Spacing, type AppColors } from '../theme';

type Props = {
  visible: boolean;
  companyId?: string | null;
  isAdmin?: boolean;
  companies?: CompanyOption[];
  sharedWorkspaceMode?: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type PendingFile = {
  key: string;
  uri: string;
  name: string;
  mime: string;
};

const PRIORITIES = [
  { value: 'low', label: PRIORITY_LABEL.low },
  { value: 'medium', label: PRIORITY_LABEL.medium },
  { value: 'high', label: PRIORITY_LABEL.high },
  { value: 'urgent', label: PRIORITY_LABEL.urgent },
];

const STATUSES = [
  { value: 'pending', label: 'Chưa làm' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'completed', label: 'Xong' },
  { value: 'cancelled', label: 'Hủy' },
];

const DEAL_PAGE_SIZE = 10;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDeadlineLabel(d: Date | null): string {
  if (!d) return 'dd/mm/yyyy --:--';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function AssignWorkModal({
  visible,
  companyId,
  isAdmin = false,
  companies = [],
  sharedWorkspaceMode = false,
  onClose,
  onCreated,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const listTextColor = isDark ? '#F8FAFC' : colors.text;

  const [formCompanyId, setFormCompanyId] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [users, setUsers] = useState<AssignmentLookupUser[]>([]);
  const [columns, setColumns] = useState<AssignmentColumn[]>([]);
  const [columnId, setColumnId] = useState('');
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('pending');
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set());
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [membersOnly, setMembersOnly] = useState(true);
  const [leadMemberIds, setLeadMemberIds] = useState<Set<string> | null>(null);

  const [dealAssigneeFilter, setDealAssigneeFilter] = useState('');
  const [dealAssigneePickerOpen, setDealAssigneePickerOpen] = useState(false);
  const [dealAssigneeSearch, setDealAssigneeSearch] = useState('');

  const [dealQuery, setDealQuery] = useState('');
  const [dealPool, setDealPool] = useState<DealPickerItem[]>([]);
  const [dealPage, setDealPage] = useState(1);
  const [dealLoading, setDealLoading] = useState(false);
  const [dealPickerOpen, setDealPickerOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealPickerItem | null>(null);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDesc('');
    setPriority('medium');
    setStatus('pending');
    setDeadlineDate(null);
    setShowDeadlinePicker(false);
    setAssigneeIds(new Set());
    setUserQuery('');
    setDealQuery('');
    setDealPool([]);
    setDealPage(1);
    setSelectedDeal(null);
    setMembersOnly(true);
    setLeadMemberIds(null);
    setDealAssigneeFilter('');
    setDealAssigneeSearch('');
    setFormCompanyId(companyId ? String(companyId) : '');
    setColumnId('');
    setScheduleEnabled(false);
    setScheduledStart(null);
    setPendingFiles([]);
    setAssigneePickerOpen(false);
    setDealPickerOpen(false);
  }, [visible, companyId]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingMeta(true);
    void Promise.all([
      fetchAssignmentLookups(formCompanyId || null),
      fetchAssignmentColumns().catch(() => [] as AssignmentColumn[]),
    ])
      .then(([lookups, cols]) => {
        if (cancelled) return;
        setUsers(lookups.users);
        setColumns(cols);
        if (cols[0]?.id) setColumnId((prev) => prev || String(cols[0].id));
      })
      .catch((e) => {
        if (!cancelled) Alert.alert('Lỗi', formatApiError(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, formCompanyId]);

  useEffect(() => {
    if (!visible || !dealPickerOpen || selectedDeal) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setDealLoading(true);
      setDealPage(1);
      void fetchDealPicker({
        q: dealQuery,
        companyId: formCompanyId || null,
        assigneeId: dealAssigneeFilter || null,
        limit: 50,
        forModule: 'production',
      })
        .then((rows) => {
          if (!cancelled) setDealPool(rows);
        })
        .catch(() => {
          if (!cancelled) setDealPool([]);
        })
        .finally(() => {
          if (!cancelled) setDealLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [visible, dealPickerOpen, dealQuery, formCompanyId, dealAssigneeFilter, selectedDeal]);

  useEffect(() => {
    if (!visible || !selectedDeal?.id) {
      setLeadMemberIds(null);
      return;
    }
    let cancelled = false;
    void fetchSharedWorkspaceMembers(selectedDeal.id)
      .then((mem) => {
        if (cancelled) return;
        const ids = new Set(mem.map((m) => String(m.user_id)).filter(Boolean));
        setLeadMemberIds(ids);
        if (membersOnly && ids.size) {
          setAssigneeIds(new Set(ids));
        }
      })
      .catch(() => {
        if (!cancelled) setLeadMemberIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [visible, selectedDeal?.id, membersOnly]);

  const companyOptions: FilterOption[] = useMemo(() => {
    const opts: FilterOption[] = [{ id: '', label: 'Tất cả công ty module này' }];
    for (const c of companies) {
      opts.push({ id: String(c.id), label: c.name || String(c.id) });
    }
    return opts;
  }, [companies]);

  const selectedCompanyLabel = useMemo(() => {
    if (!formCompanyId) return 'Tất cả công ty module này';
    return companyOptions.find((o) => o.id === formCompanyId)?.label || 'Công ty';
  }, [formCompanyId, companyOptions]);

  const columnOptions: FilterOption[] = useMemo(
    () => [
      { id: '', label: 'Chưa phân loại' },
      ...columns.map((c) => ({ id: String(c.id), label: c.name })),
    ],
    [columns],
  );

  const selectedColumnLabel = useMemo(() => {
    if (!columnId) return 'Chưa phân loại';
    return columnOptions.find((o) => o.id === columnId)?.label || 'Cột';
  }, [columnId, columnOptions]);

  const dealAssigneeOptions: FilterOption[] = useMemo(() => {
    const q = dealAssigneeSearch.trim().toLowerCase();
    const opts: FilterOption[] = [{ id: '', label: 'Tất cả nhân viên' }];
    for (const u of users) {
      const name = String(u.full_name || u.email || u.id);
      if (q && !name.toLowerCase().includes(q) && !String(u.email || '').toLowerCase().includes(q)) {
        continue;
      }
      opts.push({ id: String(u.id), label: name });
    }
    if (dealAssigneeFilter && !opts.some((o) => o.id === dealAssigneeFilter)) {
      const u = users.find((x) => String(x.id) === dealAssigneeFilter);
      opts.push({
        id: dealAssigneeFilter,
        label: u?.full_name || u?.email || dealAssigneeFilter,
      });
    }
    return opts;
  }, [users, dealAssigneeSearch, dealAssigneeFilter]);

  const dealAssigneeLabel = useMemo(() => {
    if (!dealAssigneeFilter) return 'Tất cả nhân viên';
    return dealAssigneeOptions.find((o) => o.id === dealAssigneeFilter)?.label || 'NV đã chọn';
  }, [dealAssigneeFilter, dealAssigneeOptions]);

  const dealTotalPages = Math.max(1, Math.ceil(dealPool.length / DEAL_PAGE_SIZE));
  const pagedDeals = useMemo(() => {
    const start = (dealPage - 1) * DEAL_PAGE_SIZE;
    return dealPool.slice(start, start + DEAL_PAGE_SIZE);
  }, [dealPool, dealPage]);

  useEffect(() => {
    if (dealPage > dealTotalPages) setDealPage(dealTotalPages);
  }, [dealPage, dealTotalPages]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (membersOnly && leadMemberIds) {
        if (!leadMemberIds.has(String(u.id))) return false;
      }
      if (!q) return true;
      const name = String(u.full_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, userQuery, membersOnly, leadMemberIds]);

  const selectedAssignees = useMemo(
    () => users.filter((u) => assigneeIds.has(u.id)),
    [users, assigneeIds],
  );

  const toggleUser = (id: string) => {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const clearAssignees = () => setAssigneeIds(new Set());

  const onDeadlineChange = (_e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDeadlinePicker(false);
    if (date) setDeadlineDate(date);
  };

  const onScheduleChange = (_e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowSchedulePicker(false);
    if (date) setScheduledStart(date);
  };

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền ảnh', 'Cho phép truy cập thư viện để đính file.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (res.canceled || !res.assets?.length) return;
    const next = res.assets.map((a, i) => ({
      key: `${Date.now()}_${i}_${a.uri}`,
      uri: a.uri,
      name: a.fileName || `anh_${Date.now()}_${i}.jpg`,
      mime: a.mimeType || 'image/jpeg',
    }));
    setPendingFiles((prev) => [...prev, ...next].slice(0, 20));
  };

  const pickDocuments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const next = res.assets.map((a, i) => ({
        key: `${Date.now()}_doc_${i}_${a.uri}`,
        uri: a.uri,
        name: a.name || `file_${i}`,
        mime: a.mimeType || 'application/octet-stream',
      }));
      setPendingFiles((prev) => [...prev, ...next].slice(0, 20));
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('Thiếu tiêu đề', 'Nhập tiêu đề giao việc');
      return;
    }
    if (sharedWorkspaceMode && !selectedDeal?.id) {
      Alert.alert('Thiếu deal', 'Không gian chung bắt buộc gắn deal / dự án');
      return;
    }
    if (!assigneeIds.size) {
      Alert.alert('Thiếu người nhận', 'Chọn ít nhất một nhân viên');
      return;
    }
    if (scheduleEnabled && !scheduledStart) {
      Alert.alert('Thiếu lịch', 'Chọn thời gian bắt đầu khi giao theo lịch');
      return;
    }
    setSaving(true);
    try {
      const created = await createCrmAssignment({
        title: title.trim(),
        description: desc.trim() || null,
        priority,
        status,
        deadline: deadlineDate ? deadlineDate.toISOString() : null,
        assignee_ids: [...assigneeIds],
        column_id: columnId || null,
        company_id: formCompanyId || companyId || undefined,
        lead_id: selectedDeal?.id || undefined,
        assignment_module: 'production',
        task_source_type: 'customer_request',
        schedule_enabled: scheduleEnabled,
        scheduled_start: scheduleEnabled && scheduledStart
          ? scheduledStart.toISOString()
          : null,
      });
      const targetId = created.id || created.scheduleId;
      if (pendingFiles.length && targetId) {
        try {
          await uploadAssignmentReqFiles(targetId, pendingFiles, {
            schedule: !created.id && !!created.scheduleId,
          });
        } catch {
          Alert.alert(
            'Cảnh báo',
            'Đã giao việc nhưng chưa tải hết file yêu cầu — mở lại nhiệm vụ để bổ sung.',
          );
        }
      }
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const dealFieldLabel = sharedWorkspaceMode
    ? 'Dự án / Deal SX *'
    : 'Dự án / Deal SX (tuỳ chọn)';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {sharedWorkspaceMode ? 'Giao việc KG chung' : 'Giao việc Sản xuất'}
              </Text>
              <Text style={styles.sub}>
                {sharedWorkspaceMode
                  ? 'Bắt buộc gắn deal — người nhận thấy ở tab Không gian chung.'
                  : 'Có thể gắn deal (tuỳ chọn). Chọn công ty để lọc deal & nhân viên SX.'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loadingMeta && users.length === 0 ? (
            <SpinningLoader color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {/* 1. Gắn dự án / deal */}
              <View style={[styles.card, sharedWorkspaceMode && styles.cardTeal]}>
                <Text style={styles.section}>1. Gắn dự án / deal{sharedWorkspaceMode ? ' *' : ''}</Text>

                {isAdmin ? (
                  <>
                    <Text style={styles.label}>Công ty</Text>
                    <Pressable style={styles.pickerBtn} onPress={() => setCompanyPickerOpen(true)}>
                      <Ionicons name="business-outline" size={16} color={colors.primary} />
                      <Text style={styles.pickerBtnTxt} numberOfLines={1}>{selectedCompanyLabel}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </Pressable>
                  </>
                ) : null}

                <Text style={styles.label}>Nhân viên phụ trách deal</Text>
                <Pressable style={styles.pickerBtn} onPress={() => setDealAssigneePickerOpen(true)}>
                  <Ionicons name="search-outline" size={16} color={colors.primary} />
                  <Text style={styles.pickerBtnTxt} numberOfLines={1}>{dealAssigneeLabel}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>
                <Text style={styles.hint}>
                  {dealAssigneeFilter
                    ? `Đang lọc deal của ${dealAssigneeLabel}`
                    : 'Chọn NV để chỉ hiện deal đang phụ trách.'}
                </Text>

                <Text style={styles.label}>{dealFieldLabel}</Text>
                {selectedDeal ? (
                  <View style={styles.selectedDeal}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.dealCode} numberOfLines={1}>
                        {selectedDeal.code || selectedDeal.id.slice(0, 8)}
                      </Text>
                      <Text style={styles.selectedDealTxt} numberOfLines={2}>
                        {selectedDeal.title || selectedDeal.project?.name || 'Deal'}
                      </Text>
                      {selectedDeal.project?.code ? (
                        <Text style={styles.projectHint} numberOfLines={1}>
                          Dự án: {selectedDeal.project.code}
                          {selectedDeal.project.name ? ` — ${selectedDeal.project.name}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => {
                        setSelectedDeal(null);
                        setDealPage(1);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.pickerBtn} onPress={() => setDealPickerOpen(true)}>
                    <Ionicons name="briefcase-outline" size={16} color={colors.primary} />
                    <Text style={[styles.pickerBtnTxt, { color: colors.textMuted }]} numberOfLines={1}>
                      Chọn dự án / deal SX (tuỳ chọn)
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {/* 2. Việc cần làm */}
              <View style={styles.card}>
                <Text style={styles.section}>2. Việc cần làm</Text>
                <Text style={styles.label}>Tiêu đề *</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="VD: Lắp đặt tủ bếp — kiểm tra hiện trường"
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                />
                <Text style={styles.label}>Mô tả (tuỳ chọn)</Text>
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="Ghi chú ngắn cho người nhận việc…"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                  multiline
                />
              </View>

              {/* 3. Cột · ưu tiên · hạn */}
              <View style={styles.card}>
                <Text style={styles.section}>3. Cột · ưu tiên · hạn</Text>
                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Cột Kanban</Text>
                    <Pressable style={styles.pickerBtn} onPress={() => setColumnPickerOpen(true)}>
                      <Text style={styles.pickerBtnTxt} numberOfLines={1}>{selectedColumnLabel}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Ưu tiên</Text>
                    <View style={styles.chipRow}>
                      {PRIORITIES.map((p) => {
                        const active = priority === p.value;
                        return (
                          <Pressable
                            key={p.value}
                            style={[styles.chipSm, active && styles.chipActive]}
                            onPress={() => setPriority(p.value)}
                          >
                            <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{p.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Trạng thái</Text>
                    <View style={styles.chipRow}>
                      {STATUSES.filter((s) => s.value === 'pending' || s.value === 'in_progress').map((s) => {
                        const active = status === s.value;
                        return (
                          <Pressable
                            key={s.value}
                            style={[styles.chipSm, active && styles.chipActive]}
                            onPress={() => setStatus(s.value)}
                          >
                            <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{s.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Deadline</Text>
                    <Pressable style={styles.pickerBtn} onPress={() => setShowDeadlinePicker(true)}>
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={styles.pickerBtnTxt} numberOfLines={1}>
                        {formatDeadlineLabel(deadlineDate)}
                      </Text>
                      {deadlineDate ? (
                        <Pressable onPress={() => setDeadlineDate(null)} hitSlop={8}>
                          <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  </View>
                </View>
                {showDeadlinePicker ? (
                  <DateTimePicker
                    value={deadlineDate || new Date()}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDeadlineChange}
                    locale="vi-VN"
                  />
                ) : null}

                <Pressable
                  style={[styles.scheduleBox, scheduleEnabled && styles.scheduleBoxOn]}
                  onPress={() => {
                    setScheduleEnabled((v) => {
                      const next = !v;
                      if (next && !scheduledStart) setScheduledStart(new Date());
                      return next;
                    });
                  }}
                >
                  <Ionicons
                    name={scheduleEnabled ? 'checkbox' : 'square-outline'}
                    size={18}
                    color="#7C3AED"
                  />
                  <Ionicons name="calendar-outline" size={16} color="#7C3AED" />
                  <Text style={styles.scheduleTxt}>Giao việc theo lịch</Text>
                </Pressable>
                {scheduleEnabled ? (
                  <>
                    <Text style={styles.label}>Thời gian bắt đầu *</Text>
                    <Pressable style={styles.pickerBtn} onPress={() => setShowSchedulePicker(true)}>
                      <Ionicons name="time-outline" size={16} color="#7C3AED" />
                      <Text style={styles.pickerBtnTxt} numberOfLines={1}>
                        {formatDeadlineLabel(scheduledStart)}
                      </Text>
                    </Pressable>
                    {showSchedulePicker ? (
                      <DateTimePicker
                        value={scheduledStart || new Date()}
                        mode="datetime"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={onScheduleChange}
                        locale="vi-VN"
                      />
                    ) : null}
                  </>
                ) : null}
              </View>

              {/* Người nhận — gọn */}
              <View style={styles.card}>
                <View style={styles.assigneeHead}>
                  <Text style={styles.section}>Người nhận * ({assigneeIds.size})</Text>
                  <Pressable style={styles.pickPeopleBtn} onPress={() => setAssigneePickerOpen(true)}>
                    <Ionicons name="people-outline" size={15} color="#fff" />
                    <Text style={styles.pickPeopleTxt}>Chọn NV</Text>
                  </Pressable>
                </View>
                {selectedDeal ? (
                  <Pressable
                    style={styles.membersToggle}
                    onPress={() => setMembersOnly((v) => !v)}
                  >
                    <Ionicons
                      name={membersOnly ? 'checkbox' : 'square-outline'}
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={styles.membersToggleTxt}>Chỉ thành viên dự án/deal</Text>
                  </Pressable>
                ) : null}
                {selectedAssignees.length === 0 ? (
                  <Text style={styles.emptyAssignees}>Chưa chọn — bấm «Chọn NV»</Text>
                ) : (
                  <View style={styles.chipWrap}>
                    {selectedAssignees.slice(0, 6).map((u) => (
                      <Pressable
                        key={u.id}
                        style={styles.assigneeChip}
                        onPress={() => toggleUser(u.id)}
                      >
                        <Text style={styles.assigneeChipTxt} numberOfLines={1}>
                          {u.full_name || u.email || u.id}
                        </Text>
                        <Ionicons name="close" size={12} color={colors.primary} />
                      </Pressable>
                    ))}
                    {selectedAssignees.length > 6 ? (
                      <View style={styles.assigneeChipMore}>
                        <Text style={styles.assigneeChipMoreTxt}>
                          +{selectedAssignees.length - 6}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>

              {/* File yêu cầu */}
              <View style={styles.card}>
                <View style={styles.assigneeHead}>
                  <Text style={styles.section}>File yêu cầu công việc ({pendingFiles.length})</Text>
                </View>
                <Text style={styles.hint}>
                  File / hình / video hướng dẫn. Tải lên kèm lúc tạo nhiệm vụ.
                </Text>
                <View style={styles.fileBtnRow}>
                  <Pressable style={styles.fileBtnPrimary} onPress={() => { void pickDocuments(); }}>
                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                    <Text style={styles.fileBtnPrimaryTxt}>Thêm file</Text>
                  </Pressable>
                  <Pressable style={styles.fileBtnOutline} onPress={() => { void pickImages(); }}>
                    <Ionicons name="image-outline" size={16} color={colors.primary} />
                    <Text style={styles.fileBtnOutlineTxt}>Thêm ảnh</Text>
                  </Pressable>
                </View>
                {pendingFiles.length ? (
                  <View style={styles.fileList}>
                    {pendingFiles.map((f) => (
                      <View key={f.key} style={styles.fileRow}>
                        <Ionicons name="document-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                        <Pressable
                          onPress={() => setPendingFiles((prev) => prev.filter((x) => x.key !== f.key))}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={16} color={colors.textFaint} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={{ height: 16 }} />
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerHint}>
              {assigneeIds.size ? `${assigneeIds.size} người sẽ nhận việc` : 'Chưa chọn người nhận'}
            </Text>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelTxt}>Huỷ</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={() => void submit()} disabled={saving || loadingMeta}>
              {saving ? (
                <SpinningLoader color="#fff" />
              ) : (
                <Text style={styles.saveTxt}>
                  {scheduleEnabled
                    ? `Lên lịch (${assigneeIds.size} NV)`
                    : `Giao cho ${assigneeIds.size} NV`}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Deal picker sheet */}
      <Modal visible={dealPickerOpen} animationType="slide" transparent onRequestClose={() => setDealPickerOpen(false)}>
        <View style={styles.subBackdrop}>
          <View style={[styles.subSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.subHead}>
              <Text style={styles.subTitle}>Chọn dự án / deal SX</Text>
              <Pressable onPress={() => setDealPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <TextInput
              value={dealQuery}
              onChangeText={setDealQuery}
              placeholder="Tìm theo mã TB, mã deal, tên…"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoFocus
            />
            {dealLoading ? (
              <SpinningLoader color={colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                {pagedDeals.length === 0 ? (
                  <Text style={styles.emptyAssignees}>
                    {dealQuery.trim() || dealAssigneeFilter ? 'Không tìm thấy deal' : 'Gõ để tìm deal / dự án'}
                  </Text>
                ) : (
                  pagedDeals.map((d) => (
                    <Pressable
                      key={d.id}
                      style={styles.dealRow}
                      onPress={() => {
                        setSelectedDeal(d);
                        setDealPickerOpen(false);
                        setMembersOnly(true);
                      }}
                    >
                      <Text style={[styles.dealCode, { color: colors.primary }]} numberOfLines={1}>
                        {d.code || d.id.slice(0, 8)}
                      </Text>
                      <Text style={[styles.dealTitle, { color: listTextColor }]} numberOfLines={2}>
                        {d.title || d.project?.name || 'Deal'}
                      </Text>
                    </Pressable>
                  ))
                )}
                {dealPool.length > DEAL_PAGE_SIZE ? (
                  <View style={styles.pager}>
                    <Pressable
                      style={[styles.pagerBtn, dealPage <= 1 && styles.pagerBtnDisabled]}
                      disabled={dealPage <= 1}
                      onPress={() => setDealPage((p) => Math.max(1, p - 1))}
                    >
                      <Text style={styles.pagerTxt}>Trước</Text>
                    </Pressable>
                    <Text style={styles.pagerMeta}>{dealPage}/{dealTotalPages}</Text>
                    <Pressable
                      style={[styles.pagerBtn, dealPage >= dealTotalPages && styles.pagerBtnDisabled]}
                      disabled={dealPage >= dealTotalPages}
                      onPress={() => setDealPage((p) => Math.min(dealTotalPages, p + 1))}
                    >
                      <Text style={styles.pagerTxt}>Sau</Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Compact assignee picker */}
      <Modal visible={assigneePickerOpen} animationType="slide" transparent onRequestClose={() => setAssigneePickerOpen(false)}>
        <View style={styles.subBackdrop}>
          <View style={[styles.subSheet, { paddingBottom: insets.bottom + 12, maxHeight: '70%' }]}>
            <View style={styles.subHead}>
              <Text style={[styles.subTitle, { color: listTextColor }]}>
                Chọn người nhận ({assigneeIds.size})
              </Text>
              <Pressable onPress={() => setAssigneePickerOpen(false)} hitSlop={8}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              </Pressable>
            </View>
            <TextInput
              value={userQuery}
              onChangeText={setUserQuery}
              placeholder="Tìm tên NV…"
              placeholderTextColor={isDark ? '#94A3B8' : colors.textFaint}
              style={[styles.input, { color: listTextColor }]}
              autoFocus
            />
            <View style={styles.assigneeActions}>
              <Pressable onPress={selectAllFiltered}>
                <Text style={styles.linkTxt}>Chọn tất cả ({filteredUsers.length})</Text>
              </Pressable>
              <Pressable onPress={clearAssignees}>
                <Text style={styles.linkMuted}>Bỏ chọn</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flexGrow: 0, maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {filteredUsers.length === 0 ? (
                <Text style={styles.emptyAssignees}>Không có NV phù hợp</Text>
              ) : (
                filteredUsers.map((u) => {
                  const active = assigneeIds.has(u.id);
                  return (
                    <Pressable
                      key={u.id}
                      style={[styles.userRowCompact, active && styles.userRowActive]}
                      onPress={() => toggleUser(u.id)}
                    >
                      <Ionicons
                        name={active ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={active ? colors.primary : colors.textMuted}
                      />
                      <Text style={[styles.userRowCompactTxt, { color: listTextColor }]} numberOfLines={1}>
                        {u.full_name || u.email || u.id}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable style={styles.doneBtn} onPress={() => setAssigneePickerOpen(false)}>
              <Text style={styles.doneBtnTxt}>Xong · {assigneeIds.size} NV</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Chọn công ty"
        options={companyOptions}
        selectedId={formCompanyId}
        onSelect={(id) => {
          setFormCompanyId(id);
          setAssigneeIds(new Set());
          setSelectedDeal(null);
          setDealPage(1);
          setDealAssigneeFilter('');
        }}
        onClose={() => setCompanyPickerOpen(false)}
      />

      <FilterPickerModal
        visible={dealAssigneePickerOpen}
        title="NV phụ trách deal"
        options={dealAssigneeOptions}
        selectedId={dealAssigneeFilter}
        searchable
        searchPlaceholder="Tìm tên NV để lọc deal…"
        onSearchChange={setDealAssigneeSearch}
        onSelect={(id) => {
          setDealAssigneeFilter(id);
          setSelectedDeal(null);
          setDealPage(1);
        }}
        onClose={() => {
          setDealAssigneePickerOpen(false);
          setDealAssigneeSearch('');
        }}
      />

      <FilterPickerModal
        visible={columnPickerOpen}
        title="Cột Kanban"
        options={columnOptions}
        selectedId={columnId}
        onSelect={setColumnId}
        onClose={() => setColumnPickerOpen(false)}
      />
    </Modal>
  );
}

function makeStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: Spacing.lg,
      paddingTop: 10,
      height: '94%',
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginBottom: 10,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 8,
      gap: 8,
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '900' },
    sub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 16 },
    scroll: { flex: 1, minHeight: 0 },
    scrollContent: { paddingBottom: 8, gap: 10 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      padding: 12,
    },
    cardTeal: {
      borderColor: isDark ? '#134E4A' : '#5EEAD4',
      backgroundColor: isDark ? '#0F1F1E' : '#F0FDFA',
    },
    section: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 10, marginBottom: 6 },
    hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 4, lineHeight: 15 },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.cardAlt : colors.bgElevated,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    pickerBtnTxt: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.cardAlt : colors.bgElevated,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    row2: { flexDirection: 'row', gap: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chipSm: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.cardAlt : colors.bgElevated,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
    selectedDeal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: isDark ? '#134E4A' : '#5EEAD4',
      backgroundColor: isDark ? '#0F2926' : '#CCFBF1',
      borderRadius: Radii.md,
      padding: 10,
    },
    selectedDealTxt: { color: colors.text, fontSize: 13, fontWeight: '700' },
    projectHint: {
      color: isDark ? '#5EEAD4' : '#0F766E',
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    dealCode: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    dealTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
    dealRow: {
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    scheduleBox: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: isDark ? '#4C1D95' : '#DDD6FE',
      backgroundColor: isDark ? '#1E1433' : '#F5F3FF',
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    scheduleBoxOn: {
      borderColor: isDark ? '#7C3AED' : '#A78BFA',
      backgroundColor: isDark ? '#2E1065' : '#EDE9FE',
    },
    scheduleTxt: { color: isDark ? '#C4B5FD' : '#5B21B6', fontSize: 13, fontWeight: '800' },
    assigneeHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    pickPeopleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: Radii.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    pickPeopleTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
    membersToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    membersToggleTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    emptyAssignees: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: 12,
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    assigneeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '48%',
      backgroundColor: colors.primarySoft,
      borderRadius: Radii.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    assigneeChipTxt: { color: isDark ? '#93C5FD' : colors.primary, fontSize: 12, fontWeight: '700', maxWidth: 120 },
    assigneeChipMore: {
      backgroundColor: colors.border,
      borderRadius: Radii.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    assigneeChipMoreTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
    fileBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    fileBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    fileBtnPrimaryTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
    fileBtnOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: colors.bgElevated,
    },
    fileBtnOutlineTxt: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    fileList: { marginTop: 8, gap: 4 },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    fileName: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '600' },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footerHint: { flex: 1, color: colors.textFaint, fontSize: 11, fontWeight: '600' },
    cancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    cancelTxt: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
      minWidth: 120,
      alignItems: 'center',
    },
    saveTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
    subBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    subSheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: Spacing.lg,
      paddingTop: 12,
      height: '80%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    subHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    subTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
    assigneeActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
      marginBottom: 6,
    },
    linkTxt: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    linkMuted: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    userRowCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    userRowActive: { backgroundColor: colors.primarySoft },
    userRowCompactTxt: {
      flex: 1,
      color: isDark ? '#F8FAFC' : colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    doneBtn: {
      marginTop: 10,
      backgroundColor: colors.primary,
      borderRadius: Radii.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    doneBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    pagerBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerTxt: { color: colors.text, fontSize: 12, fontWeight: '700' },
    pagerMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  });
}
