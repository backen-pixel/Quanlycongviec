/**
 * Bộ lọc Công việc — khớp web Giao việc Lắp đặt: công ty, NV, trạng thái, ưu tiên.
 * Chip chỉ sửa bản nháp; Áp dụng mới commit.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { useTheme } from '../context/ThemeContext';
import { fetchEmployeesByCompanyForMembers, type CrmEmployeeOption } from '../lib/leadMembersApi';
import { colorWithAlpha, HIT_TARGET, Radii, Spacing } from '../theme';
import type { FilterPickOption } from './ProductionFilterSheet';

export type WorkListStatus = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';

export type WorkFilterValues = {
  companyId: string;
  assigneeId: string;
  status: WorkListStatus;
  priority: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onReset: () => void;
  onApply: (next: WorkFilterValues) => void;
  canPickScope: boolean;
  companyOptions: FilterPickOption[];
  companyId: string;
  ownCompanyId: string;
  userId: string;
  assigneeId: string;
  status: WorkListStatus;
  priority: string;
  ownCompanyLabel?: string;
};

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      {active ? (
        <Ionicons name="checkmark" size={12} color={colors.white} style={chipStyles.chipIcon} />
      ) : null}
      <Text
        style={[
          chipStyles.chipText,
          { color: active ? colors.white : colors.text },
          active && chipStyles.chipTextActive,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const STATUS_CHIPS: { id: WorkListStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chưa làm' },
  { id: 'in_progress', label: 'Đang làm' },
  { id: 'completed', label: 'Đã làm' },
  { id: 'overdue', label: 'Quá hạn' },
];

const PRIORITY_CHIPS: { id: string; label: string }[] = [
  { id: '', label: 'Tất cả ưu tiên' },
  { id: 'urgent', label: 'Gấp' },
  { id: 'high', label: 'Cao' },
  { id: 'medium', label: 'TB' },
  { id: 'low', label: 'Thấp' },
];

export default function WorkFilterSheet({
  visible,
  onClose,
  onReset,
  onApply,
  canPickScope,
  companyOptions,
  companyId,
  ownCompanyId,
  userId,
  assigneeId,
  status,
  priority,
  ownCompanyLabel,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState<CrmEmployeeOption[]>([]);
  const [draft, setDraft] = useState<WorkFilterValues>({
    companyId,
    assigneeId,
    status,
    priority,
  });

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setDraft({ companyId, assigneeId, status, priority });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const employeeCompanyId = canPickScope ? (draft.companyId || ownCompanyId) : ownCompanyId;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    if (!employeeCompanyId || !canPickScope) {
      setEmployees([]);
      return undefined;
    }
    void fetchEmployeesByCompanyForMembers(employeeCompanyId)
      .then((rows) => {
        if (!cancelled) setEmployees(rows);
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, employeeCompanyId, canPickScope]);

  const assigneeOptions = useMemo(() => {
    const opts: FilterPickOption[] = [];
    if (canPickScope) opts.push({ id: '', label: 'Tất cả NV' });
    if (userId) opts.push({ id: userId, label: 'Của tôi' });
    for (const e of employees) {
      if (String(e.id) === String(userId)) continue;
      opts.push({ id: String(e.id), label: e.full_name || String(e.id) });
    }
    return opts;
  }, [canPickScope, userId, employees]);

  const filterOptions = (opts: FilterPickOption[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return opts;
    return opts.filter((o) => o.label.toLowerCase().includes(q));
  };

  const themed = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '78%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
          overflow: 'hidden',
        },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colorWithAlpha(colors.primary, 0.06),
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          alignSelf: 'center',
          marginBottom: 10,
        },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
        iconWrap: {
          width: 32,
          height: 32,
          borderRadius: Radii.md,
          backgroundColor: colorWithAlpha(colors.primary, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        },
        resetBtn: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.full,
          backgroundColor: colorWithAlpha(colors.primary, 0.1),
        },
        resetText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
        closeBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        searchBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.md,
          marginBottom: 4,
          paddingHorizontal: 12,
          height: 38,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 13 },
        sectionLabel: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.sm,
          marginBottom: 6,
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
          color: colors.textMuted,
          textTransform: 'uppercase',
        },
        readOnly: {
          marginHorizontal: Spacing.lg,
          marginBottom: Spacing.sm,
          padding: Spacing.md,
          borderRadius: Radii.md,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.2),
        },
        readOnlyText: { color: colors.text, fontSize: 13, fontWeight: '600' },
        chipWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        applyBtn: {
          height: 44,
          borderRadius: Radii.md,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        applyText: { color: colors.white, fontSize: 14, fontWeight: '800' },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={themed.backdrop} onPress={onClose}>
        <Pressable
          style={[themed.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => {}}
        >
          <View style={themed.header}>
            <View style={themed.handle} />
            <View style={themed.titleRow}>
              <View style={themed.iconWrap}>
                <Ionicons name="options-outline" size={18} color={colors.primary} />
              </View>
              <Text style={themed.title}>Bộ lọc công việc</Text>
              <TouchableOpacity onPress={onReset} style={themed.resetBtn}>
                <Text style={themed.resetText}>Xóa lọc</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={themed.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={themed.searchBox}>
              <Ionicons name="search-outline" size={16} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm công ty / nhân viên…"
                placeholderTextColor={colors.textFaint}
                style={themed.searchInput}
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={themed.sectionLabel}>Công ty</Text>
            {canPickScope ? (
              <View style={themed.chipWrap}>
                {filterOptions(companyOptions).map((opt) => (
                  <Chip
                    key={`co-${opt.id || 'all'}`}
                    label={opt.label}
                    active={draft.companyId === opt.id}
                    onPress={() => setDraft((d) => ({
                      ...d,
                      companyId: opt.id,
                      assigneeId: canPickScope && opt.id !== d.companyId ? '' : d.assigneeId,
                    }))}
                  />
                ))}
              </View>
            ) : (
              <View style={themed.readOnly}>
                <Text style={themed.readOnlyText}>{ownCompanyLabel || 'Công ty tôi'}</Text>
              </View>
            )}

            <Text style={themed.sectionLabel}>Nhân viên</Text>
            {canPickScope ? (
              <View style={themed.chipWrap}>
                {filterOptions(assigneeOptions).map((opt) => (
                  <Chip
                    key={`as-${opt.id || 'all'}`}
                    label={opt.label}
                    active={draft.assigneeId === opt.id}
                    onPress={() => setDraft((d) => ({ ...d, assigneeId: opt.id }))}
                  />
                ))}
              </View>
            ) : (
              <View style={themed.readOnly}>
                <Text style={themed.readOnlyText}>Của tôi</Text>
              </View>
            )}

            <Text style={themed.sectionLabel}>Trạng thái</Text>
            <View style={themed.chipWrap}>
              {STATUS_CHIPS.map((opt) => (
                <Chip
                  key={`st-${opt.id}`}
                  label={opt.label}
                  active={draft.status === opt.id}
                  onPress={() => setDraft((d) => ({ ...d, status: opt.id }))}
                />
              ))}
            </View>

            <Text style={themed.sectionLabel}>Ưu tiên</Text>
            <View style={themed.chipWrap}>
              {PRIORITY_CHIPS.map((opt) => (
                <Chip
                  key={`pr-${opt.id || 'all'}`}
                  label={opt.label}
                  active={draft.priority === opt.id}
                  onPress={() => setDraft((d) => ({ ...d, priority: opt.id }))}
                />
              ))}
            </View>
          </ScrollView>

          <View style={themed.footer}>
            <TouchableOpacity
              style={themed.applyBtn}
              onPress={() => onApply(draft)}
              activeOpacity={0.85}
            >
              <Text style={themed.applyText}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipIcon: { marginRight: 4 },
  chipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chipTextActive: { fontWeight: '800' },
});
