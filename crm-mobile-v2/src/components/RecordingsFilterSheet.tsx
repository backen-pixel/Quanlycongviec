import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_RECORDING_FILTERS,
  type RecordingFilters,
  type RecordingLinkFilter,
} from '../lib/recordingsFilters';
import { Radii, useColors, type ThemeColors } from '../theme';

type Props = {
  visible: boolean;
  filters: RecordingFilters;
  counts: { all: number; unlinked: number; linked: number };
  onApply: (filters: RecordingFilters) => void;
  onClose: () => void;
};

const LINK_OPTS: { value: RecordingLinkFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'all', label: 'Tất cả', icon: 'albums-outline' },
  { value: 'unlinked', label: 'Chưa gắn CRM', icon: 'alert-circle-outline' },
  { value: 'linked', label: 'Đã gắn CRM', icon: 'link-outline' },
];

function ChipRow({
  options,
  value,
  onChange,
  counts,
}: {
  options: typeof LINK_OPTS;
  value: RecordingLinkFilter;
  onChange: (v: RecordingLinkFilter) => void;
  counts: { all: number; unlinked: number; linked: number };
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = value === opt.value;
        const count = counts[opt.value];
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.miniChip, active && styles.miniChipActive]}
            onPress={() => onChange(opt.value)}
          >
            <Ionicons name={opt.icon} size={14} color={active ? Colors.blue : Colors.textMuted} />
            <Text style={[styles.miniChipTxt, active && { color: Colors.blue }]}>{opt.label}</Text>
            <Text style={[styles.miniChipCount, active && { color: Colors.blue }]}>{count}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function RecordingsFilterSheet({ visible, filters, counts, onApply, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const reset = () => {
    const next = { ...DEFAULT_RECORDING_FILTERS, searchField: draft.searchField };
    setDraft(next);
    onApply(next);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Lọc ghi âm</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Ghép CRM</Text>
            <ChipRow
              options={LINK_OPTS}
              value={draft.link}
              onChange={(link) => setDraft((p) => ({ ...p, link }))}
              counts={counts}
            />
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetTxt}>Xóa lọc</Text>
            </Pressable>
            <Pressable style={styles.applyBtn} onPress={apply}>
              <Text style={styles.applyTxt}>Áp dụng</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  sectionTitle: {
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipWrap: { gap: 8, marginBottom: 8 },
  miniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  miniChipActive: {
    borderColor: Colors.blue,
    backgroundColor: Colors.blueSoft,
  },
  miniChipTxt: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700' },
  miniChipCount: { color: Colors.textMuted, fontSize: 14, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  resetBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetTxt: { color: Colors.textMuted, fontWeight: '800' },
  applyBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.blue,
  },
  applyTxt: { color: Colors.white, fontWeight: '800' },
});
