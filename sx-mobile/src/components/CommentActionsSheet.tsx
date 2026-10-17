import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { colorWithAlpha, Radii, Spacing } from '../theme';
import SpinningLoader from './SpinningLoader';

type Props = {
  visible: boolean;
  /** Trích nội dung bình luận (hiện 2 dòng để người dùng biết đang thao tác bình luận nào). */
  preview: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Đang xoá — khoá nút, hiện vòng quay. */
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/**
 * Bảng thao tác một bình luận: «Sửa» (chỉ tác giả) / «Xóa» (tác giả hoặc admin). Xoá có bước xác nhận ngay trong bảng
 * (nêu rõ hậu quả) thay vì hộp thoại hệ thống.
 */
export default function CommentActionsSheet({
  visible,
  preview,
  canEdit,
  canDelete,
  busy = false,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);

  // Mỗi lần mở lại luôn bắt đầu ở danh sách thao tác, không dính bước xác nhận cũ.
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible]);

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
        handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
        previewBox: {
          borderRadius: Radii.lg,
          backgroundColor: colors.cardAlt,
          paddingVertical: 10,
          paddingHorizontal: 14,
          marginBottom: 8,
        },
        previewTxt: { color: colors.textMuted, fontSize: 13.5, lineHeight: 19 },
        row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
        rowIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
        rowTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        cancelBtn: {
          marginTop: 12,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        cancelTxt: { color: colors.text, fontSize: 15, fontWeight: '700' },
        confirmIcon: {
          alignSelf: 'center',
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colorWithAlpha(colors.danger, 0.12),
          marginBottom: 12,
        },
        confirmTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
        confirmSub: { color: colors.textMuted, fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: 6, marginBottom: 14 },
        btnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
        btnGhost: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        btnDanger: {
          flex: 1.4,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.danger,
        },
        btnDangerTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
      }),
    [colors, insets.bottom],
  );

  const shortPreview = preview.trim() || 'Bình luận có đính kèm';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
      <Pressable style={styles.backdrop} onPress={() => { if (!busy) onClose(); }}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {confirming ? (
            <>
              <View style={styles.confirmIcon}>
                <Ionicons name="trash" size={26} color={colors.danger} />
              </View>
              <Text style={styles.confirmTitle}>Xóa bình luận này?</Text>
              <View style={styles.previewBox}>
                <Text style={styles.previewTxt} numberOfLines={3}>{shortPreview}</Text>
              </View>
              <Text style={styles.confirmSub}>Bình luận sẽ biến mất khỏi luồng bình luận của dự án, mọi người đều không còn thấy.</Text>
              <View style={styles.btnRow}>
                <Pressable style={styles.btnGhost} onPress={() => setConfirming(false)} disabled={busy}>
                  <Text style={styles.cancelTxt}>Giữ lại</Text>
                </Pressable>
                <Pressable style={[styles.btnDanger, busy && { opacity: 0.7 }]} onPress={onDelete} disabled={busy}>
                  {busy ? <SpinningLoader size="small" color="#FFFFFF" /> : <Text style={styles.btnDangerTxt}>Xóa</Text>}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.previewBox}>
                <Text style={styles.previewTxt} numberOfLines={2}>{shortPreview}</Text>
              </View>
              {canEdit ? (
                <Pressable style={styles.row} onPress={onEdit}>
                  <View style={[styles.rowIcon, { backgroundColor: colorWithAlpha(colors.primary, 0.12) }]}>
                    <Ionicons name="create-outline" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.rowTitle}>Sửa bình luận</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
              {canEdit && canDelete ? <View style={styles.divider} /> : null}
              {canDelete ? (
                <Pressable style={styles.row} onPress={() => setConfirming(true)}>
                  <View style={[styles.rowIcon, { backgroundColor: colorWithAlpha(colors.danger, 0.12) }]}>
                    <Ionicons name="trash-outline" size={22} color={colors.danger} />
                  </View>
                  <Text style={[styles.rowTitle, { color: colors.danger }]}>Xóa bình luận</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
              <Pressable style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelTxt}>Đóng</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
