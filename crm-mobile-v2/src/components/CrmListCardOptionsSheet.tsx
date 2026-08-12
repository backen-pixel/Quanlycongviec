import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { CrmKanbanItem } from '../types';

export type CrmListCardMenuAction = 'deadline' | 'interacted' | 'comments';

type Props = {
  visible: boolean;
  item: CrmKanbanItem | null;
  onAction: (action: CrmListCardMenuAction) => void;
  onClose: () => void;
};

export default function CrmListCardOptionsSheet({ visible, item, onAction, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  if (!item) return null;

  const hasDeadline = !!item.dueIso;
  const isInteracted = !!item.isInteracted;

  const rows: {
    key: CrmListCardMenuAction;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }[] = [
    {
      key: 'deadline',
      label: hasDeadline ? 'Sửa deadline' : 'Đặt deadline',
      icon: 'alarm-outline',
      color: Colors.orange,
    },
    {
      key: 'interacted',
      label: isInteracted ? 'Bỏ «đã tương tác»' : 'Đã tương tác',
      icon: isInteracted ? 'checkmark-circle' : 'checkmark-circle-outline',
      color: Colors.blue,
    },
    {
      key: 'comments',
      label: 'Bình luận',
      icon: 'chatbubbles-outline',
      color: Colors.purple,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={1}>
            {item.code} · {item.title}
          </Text>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                onClose();
                onAction(row.key);
              }}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${row.color}22` }]}>
                <Ionicons name={row.icon} size={20} color={row.color} />
              </View>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textFaint} />
            </Pressable>
          ))}
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
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 4,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 10,
  },
  title: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: Radii.md,
  },
  rowPressed: { backgroundColor: Colors.surfaceSoft },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '700' },
});
