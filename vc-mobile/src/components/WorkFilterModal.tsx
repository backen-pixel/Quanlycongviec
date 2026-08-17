import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PRIORITY_LABEL, STATUS_STAGE_LABEL } from '../lib/sharedWorkspaceApi';
import { useTheme } from '../context/ThemeContext';
import { Radii, type AppColors } from '../theme';

export type WorkBoardFilters = {
  status: string;
  priority: string;
  q: string;
};

export const EMPTY_WORK_FILTERS: WorkBoardFilters = {
  status: '',
  priority: '',
  q: '',
};

type Props = {
  visible: boolean;
  value: WorkBoardFilters;
  bottomInset?: number;
  onClose: () => void;
  onApply: (next: WorkBoardFilters) => void;
};

const STATUSES = ['', 'pending', 'in_progress', 'completed'] as const;
const PRIORITIES = ['', 'low', 'medium', 'high', 'urgent'] as const;

export default function WorkFilterModal({
  visible,
  value,
  bottomInset = 0,
  onClose,
  onApply,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [draft, setDraft] = useState<WorkBoardFilters>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Bộ lọc giao việc</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.label}>Tìm kiếm</Text>
          <TextInput
            value={draft.q}
            onChangeText={(q) => setDraft((p) => ({ ...p, q }))}
            placeholder="Tiêu đề, deal, người nhận…"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Trạng thái</Text>
          <View style={styles.chips}>
            {STATUSES.map((s) => {
              const active = draft.status === s;
              const label = s ? STATUS_STAGE_LABEL[s] || s : 'Tất cả';
              return (
                <Pressable
                  key={s || 'all'}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setDraft((p) => ({ ...p, status: s }))}
                >
                  <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Ưu tiên</Text>
          <View style={styles.chips}>
            {PRIORITIES.map((p) => {
              const active = draft.priority === p;
              const label = p ? PRIORITY_LABEL[p] || p : 'Tất cả';
              return (
                <Pressable
                  key={p || 'all'}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setDraft((prev) => ({ ...prev, priority: p }))}
                >
                  <Text style={[styles.chipTxt, active && { color: '#fff' }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              style={styles.resetBtn}
              onPress={() => setDraft({ ...EMPTY_WORK_FILTERS })}
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

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
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
    label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 8 },
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    footer: { flexDirection: 'row', gap: 10, marginTop: 18 },
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
