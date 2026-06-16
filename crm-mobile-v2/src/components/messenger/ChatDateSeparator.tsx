import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { formatChatDateLabel } from '../../lib/messengerMedia';

export default function ChatDateSeparator({ date }: { date: string }) {
  const { colors, isDark } = useTheme();
  const label = formatChatDateLabel(date);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { alignSelf: 'center', marginVertical: 12 },
        txt: {
          fontSize: 11,
          color: colors.textMuted,
          fontWeight: '700',
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
          paddingHorizontal: 14,
          paddingVertical: 5,
          borderRadius: 999,
          overflow: 'hidden',
        },
      }),
    [colors, isDark],
  );

  if (!label) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.txt}>{label}</Text>
    </View>
  );
}
