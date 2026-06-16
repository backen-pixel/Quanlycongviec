import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors, type ThemeColors } from '../theme';

type Props = {
  count: number;
  style?: StyleProp<ViewStyle>;
  /** Nhỏ hơn cho icon menu grid */
  size?: 'sm' | 'md';
};

export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export default function NotificationBadge({ count, style, size = 'md' }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors, size), [Colors, size]);
  const label = formatBadgeCount(count);
  if (!label) return null;

  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.txt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors, size: 'sm' | 'md') =>
  StyleSheet.create({
    badge: {
      position: 'absolute',
      minWidth: size === 'sm' ? 16 : 18,
      height: size === 'sm' ? 16 : 18,
      paddingHorizontal: size === 'sm' ? 4 : 5,
      borderRadius: 99,
      backgroundColor: Colors.red,
      borderWidth: 2,
      borderColor: Colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    txt: {
      color: '#fff',
      fontSize: size === 'sm' ? 9 : 10,
      fontWeight: '900',
      lineHeight: size === 'sm' ? 11 : 12,
    },
  });
