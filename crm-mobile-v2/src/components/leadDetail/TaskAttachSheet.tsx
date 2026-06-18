import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';

export type TaskAttachOption = 'gallery' | 'camera' | 'video' | 'document';

type Props = {
  visible: boolean;
  onPick: (option: TaskAttachOption) => void;
  onDismiss: () => void;
};

const OPTIONS: {
  id: TaskAttachOption;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
}[] = [
  { id: 'gallery', icon: 'images-outline', label: 'Thư viện', sub: 'Ảnh & video' },
  { id: 'camera', icon: 'camera-outline', label: 'Chụp ảnh', sub: 'Camera' },
  { id: 'video', icon: 'videocam-outline', label: 'Quay video', sub: 'Camera' },
  { id: 'document', icon: 'document-outline', label: 'Tệp tin', sub: 'PDF, Word…' },
];

export default function TaskAttachSheet({ visible, onPick, onDismiss }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Đính kèm minh chứng</Text>
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt.id}
            style={styles.row}
            onPress={() => {
              onDismiss();
              onPick(opt.id);
            }}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={opt.icon} size={22} color={Colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{opt.label}</Text>
              <Text style={styles.rowSub}>{opt.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: C.bgElevated,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: C.borderSoft,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: 12,
    },
    title: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.borderSoft,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: { fontSize: 15, fontWeight: '600', color: C.text },
    rowSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  });
}
