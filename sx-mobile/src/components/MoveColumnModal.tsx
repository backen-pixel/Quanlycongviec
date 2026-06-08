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
import { useTheme } from '../context/ThemeContext';
import { HIT_TARGET, Radii, Spacing, stageColor } from '../theme';
import type { KanbanStage } from '../types';

type Props = {
  visible: boolean;
  stages: KanbanStage[];
  currentStageId?: string | null;
  onSelect: (stageId: string) => void;
  onClose: () => void;
};

export default function MoveColumnModal({
  visible,
  stages,
  currentStageId,
  onSelect,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const options = stages.filter((s) => String(s.id) !== String(currentStageId || ''));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '75%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
        },
        handle: {
          width: 36, height: 4, borderRadius: 2,
          backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 4,
        },
        header: {
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: Spacing.lg, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        },
        title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
        closeBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        list: { maxHeight: 420 },
        row: {
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: Spacing.lg, paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          minHeight: HIT_TARGET,
        },
        rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
        rowText: { color: colors.text, fontSize: 14, fontWeight: '600' },
        badge: {
          width: 32, height: 32, borderRadius: 16,
          alignItems: 'center', justifyContent: 'center',
        },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Chuyển sang cột</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item, index }) => {
              const color = stageColor(item.color, index);
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.rowIcon}>{item.icon || '📋'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText} numberOfLines={2}>{item.name}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: color }]}>
                    <Ionicons name="arrow-forward" size={14} color={colors.white} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
