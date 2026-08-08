import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  addLeadMembers,
  DEAL_MEMBER_ROLES,
  fetchCrmCompaniesForMembers,
  fetchEmployeesByCompanyForMembers,
  type CompanyOption,
  type CrmEmployeeOption,
  type DealMemberRole,
} from '../../lib/leadMembersApi';
import FilterPickerModal from '../FilterPickerModal';
import TapHighlight from '../TapHighlight';
import { HIT_TARGET, Radii, Spacing, type AppColors } from '../../theme';

type PendingMember = { user_id: string; role: DealMemberRole; name: string };

type Props = {
  visible: boolean;
  dealId: string;
  existingMemberIds: Set<string>;
  /** Ưu tiên chọn sẵn công ty VC/LĐ của dự án */
  preferredCompanyId?: string | null;
  onClose: () => void;
  onAdded: () => void;
};

function normalize(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export default function AddDealMembersSheet({
  visible,
  dealId,
  existingMemberIds,
  preferredCompanyId,
  onClose,
  onAdded,
}: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isSysAdmin = user?.role === 'admin' && !user?.company_id;

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [employees, setEmployees] = useState<CrmEmployeeOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [search, setSearch] = useState('');
  const [defaultRole, setDefaultRole] = useState<DealMemberRole>('member');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);

  const showCompanyPicker = companies.length > 1 || isSysAdmin;

  const resetState = useCallback(() => {
    setSearch('');
    setDefaultRole('member');
    setCheckedIds(new Set());
    setPending([]);
    setError('');
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    resetState();
    setLoadingCompanies(true);
    void fetchCrmCompaniesForMembers()
      .then((list) => {
        setCompanies(list);
        const preferred = preferredCompanyId ? String(preferredCompanyId) : '';
        const userCo = user?.company_id ? String(user.company_id) : '';
        const initial =
          preferred && list.some((c) => c.id === preferred)
            ? preferred
            : userCo && list.some((c) => c.id === userCo)
              ? userCo
              : list.length === 1
                ? list[0].id
                : '';
        setCompanyId(initial);
      })
      .catch(() => setCompanies([]))
      .finally(() => setLoadingCompanies(false));
  }, [visible, user?.company_id, preferredCompanyId, resetState]);

  useEffect(() => {
    if (!visible || !companyId) {
      setEmployees([]);
      return;
    }
    setLoadingEmployees(true);
    setCheckedIds(new Set());
    void fetchEmployeesByCompanyForMembers(companyId)
      .then(setEmployees)
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, [visible, companyId]);

  const blockedIds = useMemo(() => {
    const s = new Set(existingMemberIds);
    for (const p of pending) s.add(p.user_id);
    return s;
  }, [existingMemberIds, pending]);

  const pickableEmployees = useMemo(() => {
    const q = normalize(search.trim());
    return employees.filter((e) => {
      if (blockedIds.has(e.id)) return false;
      if (!q) return true;
      const name = normalize(e.full_name || '');
      const email = normalize(e.email || '');
      return name.includes(q) || email.includes(q);
    });
  }, [employees, blockedIds, search]);

  const toggleCheck = (emp: CrmEmployeeOption) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emp.id)) next.delete(emp.id);
      else next.add(emp.id);
      return next;
    });
  };

  const addCheckedToPending = () => {
    if (!checkedIds.size) return;
    const toAdd: PendingMember[] = [];
    for (const id of checkedIds) {
      const emp = employees.find((e) => e.id === id);
      if (!emp || blockedIds.has(id)) continue;
      toAdd.push({
        user_id: id,
        role: defaultRole,
        name: emp.full_name || emp.email || 'NV',
      });
    }
    if (!toAdd.length) return;
    setPending((prev) => [...prev, ...toAdd]);
    setCheckedIds(new Set());
  };

  const removePending = (userId: string) => {
    setPending((prev) => prev.filter((p) => p.user_id !== userId));
  };

  const updatePendingRole = (userId: string, role: DealMemberRole) => {
    setPending((prev) => prev.map((p) => (p.user_id === userId ? { ...p, role } : p)));
  };

  const selectAllPickable = () => {
    setCheckedIds(new Set(pickableEmployees.map((e) => e.id)));
  };

  const handleSubmit = async () => {
    if (!pending.length) return;
    setSubmitting(true);
    setError('');
    try {
      await addLeadMembers(
        dealId,
        pending.map((p) => ({ user_id: p.user_id, role: p.role })),
      );
      onAdded();
      onClose();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCompanyLabel =
    companies.find((c) => c.id === companyId)?.name || 'Chọn công ty';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Thêm thành viên deal</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {showCompanyPicker ? (
              <View style={styles.block}>
                <Text style={styles.label}>Công ty VC/LĐ</Text>
                <TapHighlight onPress={() => setCompanyPickerOpen(true)}>
                  <View style={styles.pickerRow}>
                    <Ionicons name="business-outline" size={16} color={colors.primary} />
                    <Text style={styles.pickerTxt} numberOfLines={1}>
                      {loadingCompanies ? 'Đang tải…' : selectedCompanyLabel}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </View>
                </TapHighlight>
                {isSysAdmin && !companyId ? (
                  <Text style={styles.hint}>Chọn công ty lắp đặt lắp đặt để xem nhân viên</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.label}>Quyền mặc định</Text>
              <View style={styles.roleRow}>
                {DEAL_MEMBER_ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => setDefaultRole(r.value)}
                    style={[
                      styles.roleChip,
                      defaultRole === r.value && styles.roleChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleChipTxt,
                        defaultRole === r.value && styles.roleChipTxtActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.block}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Tìm tên hoặc email…"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <View style={styles.toolbar}>
                <Text style={styles.meta}>
                  {pickableEmployees.length} NV khả dụng
                  {checkedIds.size ? ` · đã chọn ${checkedIds.size}` : ''}
                </Text>
                <View style={styles.toolbarBtns}>
                  <TouchableOpacity onPress={selectAllPickable} disabled={!pickableEmployees.length}>
                    <Text style={[styles.linkBtn, !pickableEmployees.length && styles.linkDisabled]}>
                      Chọn tất cả
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCheckedIds(new Set())} disabled={!checkedIds.size}>
                    <Text style={[styles.linkBtn, !checkedIds.size && styles.linkDisabled]}>Bỏ chọn</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.listBox}>
              {!companyId && showCompanyPicker ? (
                <Text style={styles.emptyTxt}>Chọn công ty trước</Text>
              ) : loadingEmployees ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
              ) : pickableEmployees.length === 0 ? (
                <Text style={styles.emptyTxt}>
                  {employees.length === 0
                    ? 'Công ty chưa có nhân viên VC/LĐ'
                    : 'Không còn NV phù hợp (đã là thành viên hoặc đã chọn)'}
                </Text>
              ) : (
                <FlatList
                  data={pickableEmployees}
                  keyExtractor={(e) => e.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const checked = checkedIds.has(item.id);
                    return (
                      <TouchableOpacity
                        style={styles.empRow}
                        onPress={() => toggleCheck(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={checked ? colors.primary : colors.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.empName}>{item.full_name || 'Nhân viên'}</Text>
                          {item.email ? <Text style={styles.empEmail}>{item.email}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>

            {checkedIds.size > 0 ? (
              <TouchableOpacity style={styles.addQueueBtn} onPress={addCheckedToPending}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.addQueueTxt}>Thêm {checkedIds.size} người vào danh sách</Text>
              </TouchableOpacity>
            ) : null}

            {pending.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.label}>Sẽ thêm ({pending.length})</Text>
                {pending.map((p) => (
                  <View key={p.user_id} style={styles.pendingRow}>
                    <Text style={styles.pendingName} numberOfLines={1}>{p.name}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pendingRoles}>
                      {DEAL_MEMBER_ROLES.map((r) => (
                        <TouchableOpacity
                          key={r.value}
                          onPress={() => updatePendingRole(p.user_id, r.value)}
                          style={[
                            styles.miniRole,
                            p.role === r.value && styles.miniRoleActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.miniRoleTxt,
                              p.role === r.value && styles.miniRoleTxtActive,
                            ]}
                          >
                            {r.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => removePending(p.user_id)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            {error ? <Text style={styles.errorTxt}>{error}</Text> : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.submitBtn, (!pending.length || submitting) && styles.submitDisabled]}
            onPress={() => void handleSubmit()}
            disabled={!pending.length || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitTxt}>
                Thêm {pending.length || ''} thành viên
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FilterPickerModal
        visible={companyPickerOpen}
        title="Chọn công ty VC/LĐ"
        options={companies.map((c) => ({ id: c.id, label: c.name }))}
        selectedId={companyId}
        onSelect={(id) => {
          setCompanyId(id);
          setCompanyPickerOpen(false);
        }}
        onClose={() => setCompanyPickerOpen(false)}
      />
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      maxHeight: '92%',
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      borderWidth: 1,
      borderColor: c.border,
      borderBottomWidth: 0,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
      alignSelf: 'center',
      marginTop: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: { flex: 1, fontSize: 17, fontWeight: '800', color: c.text },
    closeBtn: {
      width: HIT_TARGET,
      height: HIT_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { paddingHorizontal: Spacing.lg, maxHeight: 520 },
    block: { marginTop: 14 },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    pickerTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    hint: { fontSize: 12, color: c.warning, marginTop: 6 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roleChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    roleChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    roleChipTxt: { fontSize: 12, fontWeight: '600', color: c.text },
    roleChipTxtActive: { color: c.white },
    searchInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.card,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    meta: { fontSize: 11, color: c.textMuted, flex: 1 },
    toolbarBtns: { flexDirection: 'row', gap: 12 },
    linkBtn: { fontSize: 11, fontWeight: '700', color: c.primary },
    linkDisabled: { opacity: 0.4 },
    listBox: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radii.md,
      backgroundColor: c.card,
      maxHeight: 220,
      overflow: 'hidden',
    },
    emptyTxt: { textAlign: 'center', padding: 20, fontSize: 13, color: c.textMuted },
    empRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    empName: { fontSize: 14, fontWeight: '700', color: c.text },
    empEmail: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    addQueueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: c.primarySoft,
    },
    addQueueTxt: { fontSize: 13, fontWeight: '700', color: c.primary },
    pendingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      padding: 10,
      borderRadius: Radii.md,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    pendingName: { width: 90, fontSize: 13, fontWeight: '700', color: c.text },
    pendingRoles: { flex: 1 },
    miniRole: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radii.sm,
      marginRight: 6,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    miniRoleActive: { backgroundColor: c.primary, borderColor: c.primary },
    miniRoleTxt: { fontSize: 10, fontWeight: '600', color: c.textMuted },
    miniRoleTxtActive: { color: c.white },
    errorTxt: { color: c.danger, fontSize: 13, marginTop: 10, marginBottom: 4 },
    submitBtn: {
      marginHorizontal: Spacing.lg,
      marginTop: 8,
      marginBottom: 4,
      backgroundColor: c.primary,
      borderRadius: Radii.lg,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitDisabled: { opacity: 0.45 },
    submitTxt: { color: c.white, fontSize: 15, fontWeight: '800' },
  });
}
