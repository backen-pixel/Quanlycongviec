import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatReportRangeLabel,
  getReportRangeForPreset,
  REPORT_PERIOD_OPTIONS,
  shiftReportRange,
  type ReportPeriodPreset,
} from '../../lib/reportFormat';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  visible: boolean;
  preset: ReportPeriodPreset;
  from: string;
  to: string;
  onClose: () => void;
  onApply: (preset: ReportPeriodPreset, range: { from: string; to: string }) => void;
  bottomInset?: number;
};

export default function ReportFilterModal({
  visible,
  preset,
  from,
  to,
  onClose,
  onApply,
  bottomInset = 0,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const rangeLabel = formatReportRangeLabel(preset, from, to);

  const setPreset = (next: ReportPeriodPreset) => {
    onApply(next, getReportRangeForPreset(next));
  };

  const shift = (delta: number) => {
    onApply(preset, shiftReportRange(preset, from, to, delta));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Bộ lọc thời gian</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Kỳ báo cáo</Text>
          <View style={styles.presetGrid}>
            {REPORT_PERIOD_OPTIONS.map((opt) => {
              const active = preset === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => setPreset(opt.key)}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.datePicker}>
            <Pressable style={styles.dateArrowBtn} onPress={() => shift(-1)} hitSlop={6}>
              <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.dateBody}>
              <Ionicons name="calendar-outline" size={18} color={Colors.purple} />
              <Text style={styles.dateText} numberOfLines={1}>{rangeLabel}</Text>
            </View>
            <Pressable style={styles.dateArrowBtn} onPress={() => shift(1)} hitSlop={6}>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            style={styles.todayBtn}
            onPress={() => onApply(preset, getReportRangeForPreset(preset))}
          >
            <Ionicons name="today-outline" size={16} color={Colors.purple} />
            <Text style={styles.todayText}>Về kỳ hiện tại</Text>
          </Pressable>

          <Pressable style={styles.applyBtn} onPress={onClose}>
            <Text style={styles.applyText}>Xong</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Thanh ngày gọn dưới header — mũi tên điều hướng nhanh. */
export function ReportDateRangeBar({
  preset,
  from,
  to,
  onShift,
  onOpenFilter,
}: {
  preset: ReportPeriodPreset;
  from: string;
  to: string;
  onShift: (delta: number) => void;
  onOpenFilter?: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeBarStyles(Colors), [Colors]);
  const rangeLabel = formatReportRangeLabel(preset, from, to);

  return (
    <View style={styles.bar}>
      <Pressable style={styles.arrowBtn} onPress={() => onShift(-1)} hitSlop={6}>
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      </Pressable>
      <Pressable style={styles.body} onPress={onOpenFilter}>
        <Ionicons name="calendar-outline" size={16} color={Colors.purple} />
        <Text style={styles.label} numberOfLines={1}>{rangeLabel}</Text>
      </Pressable>
      <Pressable style={styles.arrowBtn} onPress={() => onShift(1)} hitSlop={6}>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  presetChipActive: {
    backgroundColor: 'rgba(168,85,247,0.16)',
    borderColor: Colors.purple,
  },
  presetText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  presetTextActive: {
    color: Colors.purple,
  },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radii.lg,
    paddingHorizontal: 8,
    height: 48,
    marginBottom: 10,
  },
  dateBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  dateText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  dateArrowBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.sm,
    backgroundColor: Colors.card,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 12,
  },
  todayText: {
    color: Colors.purple,
    fontSize: 13,
    fontWeight: '700',
  },
  applyBtn: {
    backgroundColor: Colors.purple,
    borderRadius: Radii.lg,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
});

const makeBarStyles = (Colors: ThemeColors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    paddingHorizontal: 6,
    height: 44,
    marginBottom: 10,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  label: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.sm,
    backgroundColor: Colors.surfaceSoft,
  },
});
