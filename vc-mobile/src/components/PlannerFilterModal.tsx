import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { HIT_TARGET, Radii, Spacing } from '../theme';

export type FilterOption = { id: string; label: string };

export type PlannerFilterDimension = 'region' | 'person' | 'stage' | 'type';

type Props = {
  visible: boolean;
  onClose: () => void;
  options: Record<PlannerFilterDimension, FilterOption[]>;
  values: Record<PlannerFilterDimension, string>;
  onChange: (dimension: PlannerFilterDimension, id: string) => void;
  onClear: () => void;
};

const DIMENSIONS: { key: PlannerFilterDimension; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'region', label: 'Khu vực', icon: 'location-outline' },
  { key: 'person', label: 'Nhân viên', icon: 'person-outline' },
  { key: 'stage', label: 'Giai đoạn', icon: 'flag-outline' },
  { key: 'type', label: 'Phân loại', icon: 'layers-outline' },
];

export default function PlannerFilterModal({
  visible,
  onClose,
  options,
  values,
  onChange,
  onClear,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'menu' | PlannerFilterDimension>('menu');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '78%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
        },
        handle: {
          width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong,
          alignSelf: 'center', marginTop: 10, marginBottom: 4,
        },
        header: {
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: Spacing.lg, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        },
        headerBack: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
        closeBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        row: {
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: Spacing.lg, paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          minHeight: HIT_TARGET,
        },
        rowLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', width: 84 },
        rowValue: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
        rowValueMuted: { flex: 1, color: colors.textFaint, fontSize: 14, fontWeight: '600' },
        optionRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg, paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          minHeight: HIT_TARGET,
        },
        optionActive: { backgroundColor: colors.primarySoft },
        optionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600', marginRight: 8 },
        optionTextActive: { color: colors.primary, fontWeight: '800' },
        footer: {
          flexDirection: 'row', gap: 10,
          paddingHorizontal: Spacing.lg, paddingTop: 12,
        },
        clearBtn: {
          flex: 1, height: 46, borderRadius: Radii.md,
          borderWidth: 1, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
        },
        clearText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
        applyBtn: {
          flex: 1, height: 46, borderRadius: Radii.md, backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
        },
        applyText: { color: colors.white, fontSize: 14, fontWeight: '800' },
        list: { maxHeight: 420 },
      }),
    [colors],
  );

  const close = () => {
    setView('menu');
    onClose();
  };

  const labelFor = (dim: PlannerFilterDimension): string => {
    const cur = values[dim];
    if (!cur) return 'Tất cả';
    return options[dim].find((o) => o.id === cur)?.label || 'Tất cả';
  };

  const activeDim = view === 'menu' ? null : view;
  const activeMeta = DIMENSIONS.find((d) => d.key === activeDim);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />

          {view === 'menu' ? (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Bộ lọc</Text>
                <TouchableOpacity onPress={close} hitSlop={8} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {DIMENSIONS.map((d) => {
                const active = !!values[d.key];
                return (
                  <Pressable key={d.key} style={styles.row} onPress={() => setView(d.key)}>
                    <Ionicons name={d.icon} size={18} color={active ? colors.primary : colors.textMuted} />
                    <Text style={styles.rowLabel}>{d.label}</Text>
                    <Text style={active ? styles.rowValue : styles.rowValueMuted} numberOfLines={1}>
                      {labelFor(d.key)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  </Pressable>
                );
              })}

              <View style={styles.footer}>
                <Pressable style={styles.clearBtn} onPress={onClear}>
                  <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.clearText}>Xóa lọc</Text>
                </Pressable>
                <Pressable style={styles.applyBtn} onPress={close}>
                  <Text style={styles.applyText}>Xong</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <TouchableOpacity onPress={() => setView('menu')} hitSlop={8} style={styles.headerBack}>
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>{activeMeta?.label}</Text>
                <TouchableOpacity onPress={close} hitSlop={8} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={activeDim ? options[activeDim] : []}
                keyExtractor={(item) => item.id || '__all__'}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = activeDim ? values[activeDim] === item.id : false;
                  return (
                    <TouchableOpacity
                      style={[styles.optionRow, active && styles.optionActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (activeDim) onChange(activeDim, item.id);
                        setView('menu');
                      }}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={2}>
                        {item.label}
                      </Text>
                      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
