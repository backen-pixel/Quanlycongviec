import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { MESSENGER_MAX_UPLOAD_MB } from '../../lib/messengerMedia';
import { Radii, Spacing } from '../../theme';

export type AttachOption = 'gallery' | 'camera' | 'document';

type Props = {
  visible: boolean;
  onPick: (option: AttachOption) => void;
  onDismiss: () => void;
};

const OPTIONS: {
  id: AttachOption;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  tint: string;
  bg: string;
}[] = [
  {
    id: 'gallery',
    icon: 'images-outline',
    label: 'Thư viện',
    sub: 'Ảnh & video',
    tint: '#2563EB',
    bg: '#EFF6FF',
  },
  {
    id: 'camera',
    icon: 'camera-outline',
    label: 'Camera',
    sub: 'Chụp ảnh',
    tint: '#7C3AED',
    bg: '#F5F3FF',
  },
  {
    id: 'document',
    icon: 'document-outline',
    label: 'Tệp tin',
    sub: 'PDF, Word…',
    tint: '#059669',
    bg: '#ECFDF5',
  },
];

export default function AttachFileSheet({ visible, onPick, onDismiss }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.42)',
          zIndex: 30,
        },
        sheet: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 31,
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 14),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        handle: {
          alignSelf: 'center',
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginBottom: 12,
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        },
        title: { color: colors.text, fontSize: 16, fontWeight: '800' },
        hint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
        closeBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
        },
        grid: { flexDirection: 'row', gap: 10 },
        option: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 8,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? '#141820' : '#FAFAFA',
        },
        iconWrap: {
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        },
        optionLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
        optionSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
        footerHint: {
          textAlign: 'center',
          color: colors.textFaint,
          fontSize: 11,
          marginTop: 12,
        },
      }),
    [colors, isDark, insets.bottom],
  );

  if (!visible) return null;

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Đóng" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headRow}>
          <View>
            <Text style={styles.title}>Đính kèm</Text>
            <Text style={styles.hint}>Tối đa {MESSENGER_MAX_UPLOAD_MB}MB / tệp</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}
              onPress={() => {
                onDismiss();
                onPick(opt.id);
              }}
            >
              <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1E293B' : opt.bg }]}>
                <Ionicons name={opt.icon} size={24} color={opt.tint} />
              </View>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Text style={styles.optionSub}>{opt.sub}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footerHint}>Chạm bên ngoài để đóng</Text>
      </View>
    </>
  );
}
