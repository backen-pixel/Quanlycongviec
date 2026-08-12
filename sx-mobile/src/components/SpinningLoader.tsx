import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  color: string;
  /** Số px, hoặc 'small' (18) / 'large' (36). Mặc định 24. */
  size?: number | 'small' | 'large';
  label?: string;
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
};

function resolveSize(size?: number | 'small' | 'large'): number {
  if (size === 'small') return 18;
  if (size === 'large') return 36;
  if (typeof size === 'number' && size > 0) return size;
  return 24;
}

/**
 * Vòng tròn xoay (View + native driver) — ổn định trên Android New Arch.
 * Không dùng Ionicons: glyph Text thường không animate transform.
 */
export default function SpinningLoader({ color, size, label, labelColor, style }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const dim = resolveSize(size);
  const border = Math.max(2, Math.round(dim / 8));

  useEffect(() => {
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 750,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      style={[styles.wrap, label ? styles.withLabel : null, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label || 'Đang tải'}
    >
      <Animated.View
        collapsable={false}
        style={[
          {
            width: dim,
            height: dim,
            borderRadius: dim / 2,
            borderWidth: border,
            borderColor: `${color}33`,
            borderTopColor: color,
            borderRightColor: `${color}99`,
            transform: [{ rotate }],
          },
        ]}
      />
      {label ? (
        <Text style={[styles.label, { color: labelColor || color }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  withLabel: { gap: 12, paddingVertical: 20 },
  label: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
});
