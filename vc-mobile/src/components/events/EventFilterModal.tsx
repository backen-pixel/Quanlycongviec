import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  EVENT_MODULE_OPTIONS,
  EVENT_STATUS_META,
  type EventStatus,
  type EventType,
} from '../../api/events';
import { useTheme } from '../../context/ThemeContext';
import type { CompanyOption } from '../../lib/logisticsApi';
import { Radii, type AppColors } from '../../theme';

export type EventFilters = {
  status: EventStatus | '';
  type: string;
  module: string;
  companyId: string;
  userId: string;
};

export const EMPTY_EVENT_FILTERS: EventFilters = {
  status: '',
  type: '',
  module: 'logistics',
  companyId: '',
  userId: '',
};

export type EventFilterEmployee = { id: string; full_name?: string | null; email?: string | null };

type Props = {
  visible: boolean;
  value: EventFilters;
  eventTypes: EventType[];
  companies?: CompanyOption[];
  employees?: EventFilterEmployee[];
  /** Admin hệ thống: chọn công ty. NV: chỉ hiện công ty của họ (không đổi). */
  showCompanyPicker?: boolean;
  companyLockedLabel?: string;
  bottomInset?: number;
  onClose: () => void;
  onApply: (next: EventFilters) => void;
};

export default function EventFilterModal({
  visible,
  value,
  eventTypes,
  companies = [],
  employees = [],
  showCompanyPicker = false,
  companyLockedLabel,
  bottomInset = 0,
  onClose,
  onApply,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [draft, setDraft] = useState<EventFilters>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const set = <K extends keyof EventFilters>(key: K, v: EventFilters[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: v };
      if (key === 'companyId') next.userId = '';
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Bộ lọc sự kiện</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.section}>Công ty</Text>
            {showCompanyPicker ? (
              <View style={styles.chipWrap}>
                <Chip
                  label="Tất cả công ty"
                  active={!draft.companyId}
                  onPress={() => set('companyId', '')}
                  styles={styles}
                />
                {companies.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={draft.companyId === c.id}
                    onPress={() => set('companyId', c.id)}
                    styles={styles}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.lockedBox}>
                <Ionicons name="business-outline" size={16} color={colors.primary} />
                <Text style={styles.lockedTxt} numberOfLines={2}>
                  {companyLockedLabel || 'Công ty của bạn'}
                </Text>
              </View>
            )}

            <Text style={styles.section}>Khối</Text>
            <View style={styles.chipWrap}>
              {EVENT_MODULE_OPTIONS.map((m) => (
                <Chip
                  key={m.value || 'all'}
                  label={`${m.emoji} ${m.label}`}
                  active={draft.module === m.value}
                  onPress={() => set('module', m.value)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Loại</Text>
            <View style={styles.chipWrap}>
              <Chip label="Tất cả loại" active={!draft.type} onPress={() => set('type', '')} styles={styles} />
              {eventTypes.map((t) => (
                <Chip
                  key={t.slug}
                  label={`${t.icon} ${t.name}`}
                  active={draft.type === t.slug}
                  onPress={() => set('type', t.slug)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Trạng thái</Text>
            <View style={styles.chipWrap}>
              <Chip label="Tất cả" active={!draft.status} onPress={() => set('status', '')} styles={styles} />
              {(Object.keys(EVENT_STATUS_META) as EventStatus[]).map((s) => (
                <Chip
                  key={s}
                  label={EVENT_STATUS_META[s].label}
                  active={draft.status === s}
                  onPress={() => set('status', s)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Người tạo / phụ trách</Text>
            <View style={styles.chipWrap}>
              <Chip label="Tất cả" active={!draft.userId} onPress={() => set('userId', '')} styles={styles} />
              {employees.map((u) => (
                <Chip
                  key={u.id}
                  label={u.full_name || u.email || u.id}
                  active={draft.userId === u.id}
                  onPress={() => set('userId', u.id)}
                  styles={styles}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.resetBtn}
              onPress={() =>
                setDraft({
                  ...EMPTY_EVENT_FILTERS,
                  companyId: showCompanyPicker ? '' : value.companyId,
                  module: 'logistics',
                })
              }
            >
              <Text style={styles.resetTxt}>Xóa lọc</Text>
            </Pressable>
            <Pressable
              style={styles.applyBtn}
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            >
              <Text style={styles.applyTxt}>Áp dụng</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      maxHeight: '88%',
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
    section: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 14, marginBottom: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      maxWidth: '100%',
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    lockedBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.primarySoft,
    },
    lockedTxt: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
    footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
    resetBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resetTxt: { color: colors.textMuted, fontWeight: '800' },
    applyBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
    },
    applyTxt: { color: '#fff', fontWeight: '800' },
  });
}
