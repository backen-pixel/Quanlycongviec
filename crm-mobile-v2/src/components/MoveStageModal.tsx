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
  currentStageId?: string | null;
  /** lead = hint «Chuyển Deal»; deal = hint chọn module SX. */
  kind?: 'lead' | 'deal';
  onSelect: (stageId: string) => void;
  onClose: () => void;
};

export default function MoveStageModal({
  visible,
  stages,
  currentStageId,
  kind = 'deal',
  onSelect,
  onClose,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const options = stages.filter((s) => String(s.id) !== String(currentStageId || ''));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Chuyển sang cột</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
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
                    {item.isWon ? (
                      <Text style={styles.rowHint}>
                        {kind === 'lead' ? 'Cần Chuyển Deal' : 'Chọn công ty / phân loại SX'}
                      </Text>
                    ) : item.requiresDeadline ? (
                      <Text style={styles.rowHint}>Yêu cầu deadline</Text>
                    ) : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: color }]}>
                    <Ionicons name="arrow-forward" size={14} color={Colors.white} />
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

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    maxHeight: '75%',
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
  list: { maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    minHeight: 44,
  },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  rowHint: { color: Colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: '500' },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
