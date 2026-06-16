import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatFileSize,
  getFileTypeMeta,
} from '../../lib/messengerMedia';
import { promptMessengerFileActions } from '../../lib/messengerFileOpen';
import { getMessengerColors } from '../../lib/messengerTheme';
import { LightColors, useTheme } from '../../theme';

type Props = {
  name?: string | null;
  mime?: string | null;
  size?: number;
  url: string;
  mine?: boolean;
  onLongPress?: () => void;
};

export default function MessengerFileCard({
  name,
  mime,
  size,
  url,
  mine = false,
  onLongPress,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const fileMeta = getFileTypeMeta(name, mime || '');
  const sizeLabel = formatFileSize(size);
  const displayName = (name || '').trim() || 'Tệp đính kèm';
  const cardBg = mine ? '#FFFFFF' : isDark ? colors.card : '#FFFFFF';
  const onLightBg = cardBg === '#FFFFFF';

  const styles = useMemo(() => {
    const ink = onLightBg
      ? { primary: LightColors.text, muted: LightColors.textMuted, faint: LightColors.textFaint }
      : { primary: colors.text, muted: colors.textMuted, faint: colors.textFaint };

    return StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 11,
          borderRadius: 14,
          borderWidth: 1,
          minWidth: 228,
          maxWidth: 280,
          backgroundColor: cardBg,
          borderColor: mine ? (isDark ? '#93C5FD' : '#BFDBFE') : colors.border,
        },
        badge: {
          width: 42,
          height: 42,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
        badgeLetter: { color: '#fff', fontSize: 18, fontWeight: '900' },
        meta: { flex: 1, minWidth: 0 },
        typeLabel: {
          fontSize: 11,
          fontWeight: '800',
          color: mine ? mc.accent : ink.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        },
        fileName: {
          fontSize: 13,
          fontWeight: '700',
          color: ink.primary,
          marginTop: 2,
        },
        size: { fontSize: 11, color: ink.faint, marginTop: 3 },
        action: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: mine ? mc.accentSoft : isDark ? '#1A1F28' : '#F1F5F9',
        },
      });
  }, [cardBg, colors, isDark, mc, mine, onLightBg]);

  const actionIconColor = mine ? mc.accent : onLightBg ? LightColors.textMuted : colors.textMuted;

  return (
    <Pressable
      style={styles.card}
      onPress={() => promptMessengerFileActions(url, { name, mime })}
      onLongPress={onLongPress}
      delayLongPress={320}
    >
      <View style={[styles.badge, { backgroundColor: fileMeta.bg }]}>
        <Text style={styles.badgeLetter}>{fileMeta.letter}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.typeLabel}>{fileMeta.label}</Text>
        <Text style={styles.fileName} numberOfLines={2}>{displayName}</Text>
        {sizeLabel ? <Text style={styles.size}>{sizeLabel}</Text> : null}
      </View>
      <View style={styles.action}>
        <Ionicons name="ellipsis-horizontal" size={18} color={actionIconColor} />
      </View>
    </Pressable>
  );
}
