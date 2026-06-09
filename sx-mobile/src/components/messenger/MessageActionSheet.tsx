import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { QUICK_REACTIONS } from '../../lib/messengerReactions';
import { getMessengerColors } from '../../lib/messengerTheme';
import { Radii, Spacing } from '../../theme';

type Props = {
  onPick: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onShareExternal?: () => void;
  onRecall?: () => void;
  canRecall?: boolean;
  onDismiss: () => void;
};

export default function MessageActionSheet({
  onPick,
  onReply,
  onForward,
  onShareExternal,
  onRecall,
  canRecall,
  onDismiss,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          zIndex: 20,
        },
        sheet: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 21,
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingHorizontal: Spacing.lg,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
        title: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
        dismissBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 4,
          paddingHorizontal: 8,
        },
        dismissTxt: { color: colors.text, fontSize: 13, fontWeight: '700' },
        emojiRow: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          marginBottom: 14,
        },
        emojiBtn: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: mc.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        emojiTxt: { fontSize: 24 },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'center',
        },
        actBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
        },
        actTxt: { color: colors.text, fontSize: 13, fontWeight: '700' },
        actTxtDanger: { color: '#DC2626' },
      }),
    [colors, isDark, mc, insets.bottom],
  );

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={styles.sheet}>
        <View style={styles.headRow}>
          <Text style={styles.title}>TÙY CHỌN TIN NHẮN</Text>
          <Pressable style={styles.dismissBtn} onPress={onDismiss} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
            <Text style={styles.dismissTxt}>Đóng</Text>
          </Pressable>
        </View>

        <View style={styles.emojiRow}>
          {QUICK_REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              style={styles.emojiBtn}
              onPress={() => onPick(emoji)}
              hitSlop={4}
            >
              <Text style={styles.emojiTxt}>{emoji}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actBtn} onPress={onReply}>
            <Ionicons name="arrow-undo" size={16} color={colors.text} />
            <Text style={styles.actTxt}>Trả lời</Text>
          </Pressable>
          <Pressable style={styles.actBtn} onPress={onForward}>
            <Ionicons name="people-outline" size={16} color={colors.text} />
            <Text style={styles.actTxt}>Gửi thành viên</Text>
          </Pressable>
          {onShareExternal ? (
            <Pressable style={styles.actBtn} onPress={onShareExternal}>
              <Ionicons name="share-outline" size={16} color={colors.text} />
              <Text style={styles.actTxt}>Chia sẻ ra ngoài</Text>
            </Pressable>
          ) : null}
          {canRecall && onRecall ? (
            <Pressable style={styles.actBtn} onPress={onRecall}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={[styles.actTxt, styles.actTxtDanger]}>Thu hồi</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );
}
