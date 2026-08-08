import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colorWithAlpha } from '../theme';

export type GlowActionVariant = 'project' | 'event';

type Props = {
  variant: GlowActionVariant;
  onPress: () => void;
  size?: number;
  /** Viền cắt thanh tab (màu nền tab bar). */
  cutoutColor?: string;
  /** Thu nhỏ halo khi đặt giữa tab bar. */
  compact?: boolean;
  accessibilityLabel?: string;
};

const VARIANTS: Record<
  GlowActionVariant,
  {
    label: string;
    a11y: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconSize: number;
    stops: readonly [string, string, string, string];
    glow: string;
    ring: string;
    shadow: string;
  }
> = {
  project: {
    label: 'Tạo dự án',
    a11y: 'Tạo dự án',
    icon: 'cube',
    iconSize: 22,
    stops: ['#FED7AA', '#FB923C', '#EA580C', '#9A3412'],
    glow: 'rgba(249,115,22,0.42)',
    ring: 'rgba(253,186,116,0.55)',
    shadow: '#EA580C',
  },
  event: {
    label: 'Sự kiện',
    a11y: 'Tạo sự kiện',
    icon: 'calendar',
    iconSize: 22,
    stops: ['#FEF3C7', '#FBBF24', '#F97316', '#C2410C'],
    glow: 'rgba(251,191,36,0.4)',
    ring: 'rgba(253,230,138,0.62)',
    shadow: '#F59E0B',
  },
};

/**
 * Nút tròn gradient — Tạo dự án / Tạo sự kiện.
 * Không pulse loop (tránh jank/pin khi 1000+ card + tab mounted).
 */
export default function GlowActionFab({
  variant,
  onPress,
  size = 64,
  cutoutColor,
  compact = false,
  accessibilityLabel,
}: Props) {
  const cfg = VARIANTS[variant];
  const press = useRef(new Animated.Value(1)).current;
  const styles = useMemo(
    () => makeStyles(size, compact, cfg.glow, cfg.ring, cfg.shadow, cfg.stops, cutoutColor),
    [size, compact, cfg.glow, cfg.ring, cfg.shadow, cfg.stops, cutoutColor],
  );

  const onPressIn = () => {
    Animated.spring(press, { toValue: 0.92, useNativeDriver: true, speed: 28, bounciness: 0 }).start();
  };
  const onPressOut = () => {
    Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.pressable}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || cfg.a11y}
    >
      <View pointerEvents="none" style={styles.glow} />
      <View pointerEvents="none" style={styles.ring} />
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <View style={styles.button}>
          <View pointerEvents="none" style={styles.gradMid} />
          <View pointerEvents="none" style={styles.gradLight} />
          <View pointerEvents="none" style={styles.gradHot} />
          <View pointerEvents="none" style={styles.shine} />
          <View pointerEvents="none" style={styles.shineEdge} />
          <Ionicons name={cfg.icon} size={cfg.iconSize} color="#FFFFFF" />
          <Text style={styles.label} numberOfLines={1}>
            {cfg.label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(
  size: number,
  compact: boolean,
  glowColor: string,
  ringColor: string,
  shadowColor: string,
  stops: readonly [string, string, string, string],
  cutoutColor?: string,
) {
  const pad = compact ? 14 : 22;
  const glowExtra = compact ? 8 : 14;
  const ringExtra = compact ? 6 : 10;
  return StyleSheet.create({
    pressable: {
      width: size + pad,
      height: size + pad,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glow: {
      position: 'absolute',
      width: size + glowExtra,
      height: size + glowExtra,
      borderRadius: (size + glowExtra) / 2,
      backgroundColor: glowColor,
    },
    ring: {
      position: 'absolute',
      width: size + ringExtra,
      height: size + ringExtra,
      borderRadius: (size + ringExtra) / 2,
      borderWidth: 2,
      borderColor: ringColor,
    },
    button: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: stops[3],
      borderWidth: cutoutColor ? 3 : 1.5,
      borderColor: cutoutColor || 'rgba(255,255,255,0.22)',
      gap: 2,
      paddingTop: 3,
      shadowColor,
      shadowOpacity: 0.45,
      shadowRadius: compact ? 8 : 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: compact ? 10 : 12,
    },
    gradMid: {
      position: 'absolute',
      top: -size * 0.12,
      left: -size * 0.08,
      width: size * 1.18,
      height: size * 0.78,
      borderRadius: size,
      backgroundColor: stops[2],
    },
    gradLight: {
      position: 'absolute',
      top: -size * 0.28,
      left: -size * 0.02,
      width: size * 1.05,
      height: size * 0.52,
      borderRadius: size,
      backgroundColor: stops[1],
    },
    gradHot: {
      position: 'absolute',
      top: -size * 0.36,
      left: size * 0.12,
      width: size * 0.72,
      height: size * 0.36,
      borderRadius: size,
      backgroundColor: colorWithAlpha(stops[0], 0.92),
    },
    shine: {
      position: 'absolute',
      top: 4,
      left: size * 0.18,
      right: size * 0.18,
      height: size * 0.32,
      borderRadius: size,
      backgroundColor: colorWithAlpha('#FFFFFF', 0.26),
    },
    shineEdge: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1.5,
      backgroundColor: colorWithAlpha('#FFFFFF', 0.42),
    },
    label: {
      color: '#FFFFFF',
      fontSize: compact ? 8 : 8.5,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 10,
      letterSpacing: 0.15,
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
  });
}
