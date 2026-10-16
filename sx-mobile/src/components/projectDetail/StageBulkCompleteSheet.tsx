import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { colorWithAlpha, Radii, Spacing } from '../../theme';

type Props = {
  visible: boolean;
  /** Tên nhóm / giai đoạn (đã viết hoa ở nơi gọi nếu cần). */
  label: string;
  /** Màu nhận diện của nhóm (thanh bên trái ở danh sách). */
  tone: string;
  /** Số việc CHƯA xong sẽ bị chuyển sang «Hoàn thành». */
  openCount: number;
  /** Tổng số việc trong nhóm. */
  totalCount: number;
  onDismiss: () => void;
  onConfirm: () => void;
};

/** Bảng xác nhận «Hoàn thành tất cả việc trong nhóm» — thay hộp thoại hệ thống, nêu rõ phạm vi và hậu quả. */
export default function StageBulkCompleteSheet({
  visible,
  label,
  tone,
  openCount,
  totalCount,
  onDismiss,
  onConfirm,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 14),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        handle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginBottom: 16,
        },
        iconWrap: {
          alignSelf: 'center',
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colorWithAlpha(colors.success, 0.14),
        },
        title: {
          color: colors.text,
          fontSize: 18,
          fontWeight: '800',
          textAlign: 'center',
          marginTop: 12,
        },
        groupChip: {
          alignSelf: 'center',
          marginTop: 10,
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colorWithAlpha(tone, 0.12),
        },
        groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tone },
        groupTxt: { flexShrink: 1, color: tone, fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
        infoBox: {
          marginTop: 16,
          borderRadius: Radii.lg,
          backgroundColor: colors.cardAlt,
          paddingVertical: 12,
          paddingHorizontal: 14,
        },
        infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
        infoTxt: { flex: 1, color: colors.textMuted, fontSize: 13.5, lineHeight: 19 },
        infoStrong: { color: colors.text, fontWeight: '800' },
        btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
        cancelBtn: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        cancelTxt: { color: colors.text, fontSize: 15, fontWeight: '700' },
        okBtn: {
          flex: 1.6,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.success,
        },
        okTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
      }),
    [colors, insets.bottom, tone],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark-done" size={28} color={colors.success} />
          </View>
          <Text style={styles.title}>Hoàn thành tất cả việc?</Text>
          <View style={styles.groupChip}>
            <View style={styles.groupDot} />
            <Text style={styles.groupTxt} numberOfLines={1}>{label}</Text>
          </View>
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="list-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
              <Text style={styles.infoTxt}>
                <Text style={styles.infoStrong}>{openCount} việc chưa xong</Text>
                {totalCount > openCount ? ` (trên tổng ${totalCount} việc của nhóm)` : ''}
                {' '}sẽ được chuyển sang «Hoàn thành». Việc đã xong giữ nguyên.
              </Text>
            </View>
          </View>
          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={onDismiss}>
              <Text style={styles.cancelTxt}>Huỷ</Text>
            </Pressable>
            <Pressable style={styles.okBtn} onPress={onConfirm}>
              <Text style={styles.okTxt}>Hoàn thành {openCount} việc</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
