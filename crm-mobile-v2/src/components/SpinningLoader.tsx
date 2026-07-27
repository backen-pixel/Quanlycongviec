import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  size?: number;
  color: string;
  /** 'small' ≈ 18, 'large' ≈ 28 — ghi đè `size` nếu truyền. */
  variant?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
};

/**
 * Icon tải xoay tròn (Ionicons refresh) — dùng thay/cùng ActivityIndicator
 * khi cần visual rõ ràng hơn trên Android/dark theme.
 */
export default function SpinningLoader({ size, color, variant = 'small', style }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const px = size ?? (variant === 'large' ? 28 : 18);

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
