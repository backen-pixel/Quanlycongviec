import React, { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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

/**
 * Badge số thông báo.
 * Không dùng adjustsFontSizeToFit — trên Samsung/Android (A07…) nó co chữ «99+»
 * xuống gần như không đọc được và lệch trong pill.
 */
export default function NotificationBadge({ count, style, size = 'md' }: Props) {
  const Colors = useColors();
  const label = formatBadgeCount(count);
  const styles = useMemo(
    () => makeStyles(Colors, size, label?.length || 1),
    [Colors, size, label],
  );
  if (!label) return null;

  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.txt} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors, size: 'sm' | 'md', chars: number) => {
  const sm = size === 'sm';
  const h = sm ? 18 : 20;
  const wide = chars >= 3;
  return StyleSheet.create({
    badge: {
      position: 'absolute',
      minWidth: wide ? (sm ? 26 : 28) : h,
      height: h,
      paddingHorizontal: wide ? 6 : 4,
      borderRadius: h / 2,
      backgroundColor: Colors.red,
      // Viền mỏng — border 2px trên badge 16px từng làm vùng chữ quá hẹp → Samsung co font.
      borderWidth: StyleSheet.hairlineWidth > 0 ? 1.5 : 1,
      borderColor: Colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      overflow: 'hidden',
    },
    txt: {
      color: '#fff',
      fontSize: sm ? 10 : 11,
      fontWeight: '800',
      includeFontPadding: false,
      textAlign: 'center',
      ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null),
    },
  });
};
