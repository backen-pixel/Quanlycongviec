import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Radii, Spacing } from '../theme';

export type ToastKind = 'success' | 'error' | 'info';

export type ToastState = { message: string; kind: ToastKind } | null;

export default function Toast({ state }: { state: ToastState }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  const kindColor = useMemo(
    () => ({
      success: colors.success,
      error: colors.danger,
      info: colors.primary,
    }),
    [colors],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          position: 'absolute',
          left: Spacing.lg,
          right: Spacing.lg,
          bottom: 96,
          alignItems: 'center',
        },
        toast: {
          maxWidth: 520,
          width: '100%',
          backgroundColor: colors.cardAlt,
          borderRadius: Radii.md,
          borderLeftWidth: 4,
          paddingVertical: 12,
          paddingHorizontal: 14,
          shadowColor: colors.shadow,
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
        text: { color: colors.text, fontSize: 13, fontWeight: '600' },
      }),
    [colors],
  );

  useEffect(() => {
    if (state) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [state, opacity, translateY]);

  if (!state) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
    >
      <View style={[styles.toast, { borderLeftColor: kindColor[state.kind] }]}>
        <Text style={styles.text}>{state.message}</Text>
      </View>
    </Animated.View>
  );
}
