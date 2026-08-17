import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  PRIORITY_LABEL,
  createCrmAssignment,
  fetchAssignmentColumns,
  fetchAssignmentLookups,
  type AssignmentLookupUser,
} from '../lib/sharedWorkspaceApi';
import { useTheme } from '../context/ThemeContext';
import { Radii, Spacing, type AppColors } from '../theme';

type Props = {
  visible: boolean;
  companyId?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

const PRIORITIES = [
  { value: 'low', label: PRIORITY_LABEL.low },
  { value: 'medium', label: PRIORITY_LABEL.medium },
  { value: 'high', label: PRIORITY_LABEL.high },
  { value: 'urgent', label: PRIORITY_LABEL.urgent },
];

export default function AssignWorkModal({ visible, companyId, onClose, onCreated }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

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

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDesc('');
    setDeadlineDate('');
    setDeadlineTime('17:00');
    setPriority('medium');
    setAssigneeIds(new Set());
    setUserQuery('');
    let cancelled = false;
    setLoadingMeta(true);
    void Promise.all([
      fetchAssignmentLookups(companyId),
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
  }, [visible, companyId]);

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
        company_id: companyId || undefined,
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
            <Text style={styles.title}>Giao việc Lắp đặt</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loadingMeta ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
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
                  <Text style={styles.emptyUsers}>Không có nhân viên trong công ty</Text>
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
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelTxt}>Huỷ</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={() => void submit()} disabled={saving || loadingMeta}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveTxt}>Giao việc</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
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
      maxHeight: '92%',
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
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { color: colors.text, fontSize: 17, fontWeight: '900' },
    label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 6 },
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
    userList: { gap: 6, marginTop: 8, marginBottom: 8 },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    userRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    userName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    userEmail: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
    emptyUsers: { color: colors.textFaint, fontSize: 13, fontWeight: '600', paddingVertical: 12 },
    footer: { flexDirection: 'row', gap: 10, marginTop: 12 },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 13,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelTxt: { color: colors.textMuted, fontWeight: '800' },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 13,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
    },
    saveTxt: { color: '#fff', fontWeight: '800' },
  });
}
