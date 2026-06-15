import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
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
import { Radii, Spacing, stageColor, useColors, type ThemeColors } from '../theme';
import type { CrmPipelineStage } from '../types';

type Props = {
  visible: boolean;
  stages: CrmPipelineStage[];
  activeStageId?: string | null;
  countByStageId?: Record<string, number>;
  onSelect: (stageId: string) => void;
  onClose: () => void;
};

export default function ColumnPickerModal({
  visible,
  stages,
  activeStageId,
  countByStageId = {},
  onSelect,
  onClose,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Chọn cột</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={stages}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item, index }) => {
              const color = stageColor(item.color, index);
              const active = String(item.id) === String(activeStageId || '');
              const count = countByStageId[item.id];
              const countLabel = count === undefined ? '—' : String(count);
              return (
                <TouchableOpacity
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.rowIcon}>{item.icon || '📋'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                  <View style={[styles.countBadge, { backgroundColor: color + '33', borderColor: color }]}>
                    <Text style={[styles.countText, { color }]}>{countLabel}</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color={color} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { flex: 1, color: Colors.text, fontSize: 16, fontWeight: '800' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 480 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    minHeight: 52,
  },
  rowActive: { backgroundColor: Colors.blueSoft },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  rowTextActive: { color: Colors.blue, fontWeight: '800' },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 12, fontWeight: '800' },
});
