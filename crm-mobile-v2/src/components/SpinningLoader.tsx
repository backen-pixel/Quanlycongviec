import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** Số px, hoặc 'small' / 'large' (tương thích ActivityIndicator). */
  size?: number | 'small' | 'large';
  color?: string;
  /** 'small' ≈ 18, 'large' ≈ 28 — dùng khi không truyền size số. */
  variant?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_COLOR = '#2F6BFF';

function resolvePx(size: Props['size'], variant: Props['variant']): number {
  if (typeof size === 'number' && Number.isFinite(size)) return size;
  if (size === 'large' || variant === 'large') return 28;
  return 18;
}

/**
 * Icon tải xoay tròn thống nhất toàn app (Ionicons reload-outline).
 */
export default function SpinningLoader({
  size,
  color = DEFAULT_COLOR,
  variant = 'small',
  style,
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const px = resolvePx(size, variant);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar">
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name="reload-outline" size={px} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
