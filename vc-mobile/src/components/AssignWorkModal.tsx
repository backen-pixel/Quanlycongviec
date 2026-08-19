import SpinningLoader from './SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  type AssignmentLookupUser,
  type DealPickerItem,
} from '../lib/sharedWorkspaceApi';
import type { CompanyOption } from '../lib/logisticsApi';
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

const PRIORITIES = [
  { value: 'low', label: PRIORITY_LABEL.low },
  { value: 'medium', label: PRIORITY_LABEL.medium },
  { value: 'high', label: PRIORITY_LABEL.high },
  { value: 'urgent', label: PRIORITY_LABEL.urgent },
];

const DEAL_PAGE_SIZE = 8;

export default function AssignWorkModal({
  visible,
  companyId,
  isAdmin = false,
  companies = [],
  sharedWorkspaceMode = false,
  onClose,
  onCreated,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [formCompanyId, setFormCompanyId] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [users, setUsers] = useState<AssignmentLookupUser[]>([]);
  const [columnId, setColumnId] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('17:00');
  const [priority, setPriority] = useState('medium');
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set());
  const [userQuery, setUserQuery] = useState('');
  const [dealQuery, setDealQuery] = useState('');
  const [dealPool, setDealPool] = useState<DealPickerItem[]>([]);
  const [dealPage, setDealPage] = useState(1);
  const [dealLoading, setDealLoading] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealPickerItem | null>(null);
  const [membersOnly, setMembersOnly] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDesc('');
    setDeadlineDate('');
    setDeadlineTime('17:00');
    setPriority('medium');
    setAssigneeIds(new Set());
    setUserQuery('');
    setDealQuery('');
    setDealPool([]);
    setDealPage(1);
    setSelectedDeal(null);
    setMembersOnly(true);
    setFormCompanyId(companyId ? String(companyId) : '');
    setColumnId('');
  }, [visible, companyId]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingMeta(true);
    void Promise.all([
      fetchAssignmentLookups(formCompanyId || null),
      fetchAssignmentColumns().catch(() => []),
    ])
      .then(([lookups, cols]) => {
        if (cancelled) return;
        setUsers(lookups.users);
        if (cols[0]?.id) setColumnId(String(cols[0].id));
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
    if (!visible || selectedDeal) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setDealLoading(true);
      setDealPage(1);
      void fetchDealPicker({
        q: dealQuery,
        companyId: formCompanyId || null,
        limit: 50,
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
  }, [visible, dealQuery, formCompanyId, selectedDeal]);

  useEffect(() => {
    if (!visible || !selectedDeal?.id || !membersOnly) return;
    let cancelled = false;
    void fetchSharedWorkspaceMembers(selectedDeal.id)
      .then((mem) => {
        if (cancelled) return;
        const ids = mem.map((m) => String(m.user_id)).filter(Boolean);
        if (ids.length) setAssigneeIds(new Set(ids));
      })
      .catch(() => {});
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
    if (!q) return users;
    return users.filter((u) => {
      const name = String(u.full_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, userQuery]);

  const toggleUser = (id: string) => {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    let deadlineIso: string | null = null;
    if (deadlineDate.trim()) {
      const local = `${deadlineDate.trim()}T${deadlineTime.trim() || '17:00'}`;
      const d = new Date(local);
      if (Number.isNaN(d.getTime())) {
        Alert.alert('Ngày không hợp lệ', 'Dùng yyyy-mm-dd và HH:mm');
        return;
      }
      deadlineIso = d.toISOString();
    }
    setSaving(true);
    try {
      await createCrmAssignment({
        title: title.trim(),
        description: desc.trim() || null,
        priority,
        deadline: deadlineIso,
        assignee_ids: [...assigneeIds],
        column_id: columnId || null,
        company_id: formCompanyId || companyId || undefined,
        lead_id: selectedDeal?.id || undefined,
        assignment_module: 'logistics',
        task_source_type: 'customer_request',
      });
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {sharedWorkspaceMode ? 'Giao việc KG chung' : 'Giao việc Lắp đặt'}
              </Text>
              <Text style={styles.sub}>
                {sharedWorkspaceMode
                  ? 'Bắt buộc gắn deal — người nhận thấy ở tab Không gian chung.'
                  : 'Có thể gắn deal (tuỳ chọn). Chọn công ty để lọc deal & nhân viên.'}
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
              <Text style={styles.section}>1. Gắn dự án / deal{sharedWorkspaceMode ? ' *' : ''}</Text>

              {isAdmin ? (
                <>
                  <Text style={styles.label}>Công ty</Text>
                  <Pressable style={styles.pickerBtn} onPress={() => setCompanyPickerOpen(true)}>
                    <Ionicons name="business-outline" size={16} color={colors.primary} />
                    <Text style={styles.pickerBtnTxt} numberOfLines={1}>{selectedCompanyLabel}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </Pressable>
                  <Text style={styles.hint}>Chọn công ty trước để danh sách deal & NV gọn hơn.</Text>
                </>
              ) : null}

              <Text style={styles.label}>
                {sharedWorkspaceMode ? 'Deal / dự án Lắp đặt *' : 'Deal / dự án Lắp đặt (tuỳ chọn)'}
              </Text>

              {selectedDeal ? (
                <View style={styles.selectedDeal}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.dealCode} numberOfLines={1}>
                      {selectedDeal.code || selectedDeal.id.slice(0, 8)}
                    </Text>
                    <Text style={styles.selectedDealTxt} numberOfLines={2}>
                      {selectedDeal.title || selectedDeal.project?.name || 'Deal'}
                    </Text>
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
                <>
                  <TextInput
                    value={dealQuery}
                    onChangeText={setDealQuery}
                    placeholder="Tìm deal theo mã TB, mã deal, tên…"
                    placeholderTextColor={colors.textFaint}
                    style={styles.input}
                  />
                  {dealLoading ? (
                    <SpinningLoader color={colors.primary} style={{ marginVertical: 10 }} />
                  ) : (
                    <View style={styles.dealList}>
                      {pagedDeals.length === 0 ? (
                        <Text style={styles.emptyUsers}>
                          {dealQuery.trim().length >= 1
                            ? 'Không tìm thấy deal'
                            : 'Gõ để tìm deal / dự án'}
                        </Text>
                      ) : (
                        pagedDeals.map((d) => (
                          <Pressable
                            key={d.id}
                            style={styles.dealRow}
                            onPress={() => setSelectedDeal(d)}
                          >
                            <Text style={styles.dealCode} numberOfLines={1}>
                              {d.code || d.id.slice(0, 8)}
                            </Text>
                            <Text style={styles.dealTitle} numberOfLines={2}>
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
                            <Ionicons name="chevron-back" size={16} color={colors.text} />
                            <Text style={styles.pagerTxt}>Trước</Text>
                          </Pressable>
                          <Text style={styles.pagerMeta}>
                            {dealPage}/{dealTotalPages} · {dealPool.length} deal
                          </Text>
                          <Pressable
                            style={[styles.pagerBtn, dealPage >= dealTotalPages && styles.pagerBtnDisabled]}
                            disabled={dealPage >= dealTotalPages}
                            onPress={() => setDealPage((p) => Math.min(dealTotalPages, p + 1))}
                          >
                            <Text style={styles.pagerTxt}>Sau</Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.text} />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  )}
                </>
              )}

              {selectedDeal ? (
                <Pressable
                  style={styles.membersToggle}
                  onPress={() => setMembersOnly((v) => !v)}
                >
                  <Ionicons
                    name={membersOnly ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.membersToggleTxt}>
                    Prefill thành viên deal khi chọn deal
                  </Text>
                </Pressable>
              ) : null}

              <Text style={styles.section}>2. Việc cần làm</Text>

              <Text style={styles.label}>Tiêu đề *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="VD: Giao hàng / lắp đặt…"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
              />

              <Text style={styles.label}>Mô tả</Text>
              <TextInput
                value={desc}
                onChangeText={setDesc}
                placeholder="Chi tiết (tuỳ chọn)"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                multiline
              />

              <Text style={styles.label}>Ưu tiên</Text>
              <View style={styles.chipRow}>
                {PRIORITIES.map((p) => {
                  const active = priority === p.value;
                  return (
                    <Pressable
                      key={p.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setPriority(p.value)}
                    >
                      <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Hạn (yyyy-mm-dd)</Text>
              <View style={styles.row2}>
                <TextInput
                  value={deadlineDate}
                  onChangeText={setDeadlineDate}
                  placeholder="2026-08-20"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={deadlineTime}
                  onChangeText={setDeadlineTime}
                  placeholder="17:00"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { width: 90 }]}
                />
              </View>

              <Text style={styles.label}>Người nhận * ({assigneeIds.size})</Text>
              <TextInput
                value={userQuery}
                onChangeText={setUserQuery}
                placeholder="Tìm nhân viên…"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
              />
              <View style={styles.userList}>
                {filteredUsers.length === 0 ? (
                  <Text style={styles.emptyUsers}>Không có nhân viên trong phạm vi công ty</Text>
                ) : (
                  filteredUsers.map((u) => {
                    const active = assigneeIds.has(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        style={[styles.userRow, active && styles.userRowActive]}
                        onPress={() => toggleUser(u.id)}
                      >
                        <Ionicons
                          name={active ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={active ? colors.primary : colors.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userName} numberOfLines={1}>
                            {u.full_name || u.email || u.id}
                          </Text>
                          {u.email ? (
                            <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelTxt}>Huỷ</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={() => void submit()} disabled={saving || loadingMeta}>
              {saving ? (
                <SpinningLoader color="#fff" />
              ) : (
                <Text style={styles.saveTxt}>Giao việc</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

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
        }}
        onClose={() => setCompanyPickerOpen(false)}
      />
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: Spacing.lg,
      paddingTop: 10,
      height: '92%',
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
    scrollContent: { paddingBottom: 16 },
    section: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 14,
      marginBottom: 4,
    },
    label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 6 },
    hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 4 },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    pickerBtnTxt: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    row2: { flexDirection: 'row', gap: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    selectedDeal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: Radii.md,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      overflow: 'hidden',
    },
    selectedDealTxt: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
    dealList: {
      marginTop: 8,
      gap: 6,
      overflow: 'hidden',
    },
    dealRow: {
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
    },
    dealCode: { color: colors.primary, fontSize: 11, fontWeight: '800' },
    dealTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      gap: 8,
    },
    pagerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerTxt: { color: colors.text, fontSize: 12, fontWeight: '700' },
    pagerMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    membersToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    membersToggleTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700', flex: 1 },
    userList: { marginTop: 8, gap: 6 },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    userRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    userName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    userEmail: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 2 },
    emptyUsers: { color: colors.textFaint, fontSize: 13, fontWeight: '600', paddingVertical: 8 },
    footer: { flexDirection: 'row', gap: 10, marginTop: 8, paddingTop: 8 },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelTxt: { color: colors.textMuted, fontWeight: '800' },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
    },
    saveTxt: { color: '#fff', fontWeight: '800' },
  });
}
