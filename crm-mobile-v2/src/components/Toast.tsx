import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Radii, Spacing, useColors, type ThemeColors } from '../theme';

export type ToastKind = 'success' | 'error' | 'info';

export type ToastState = { message: string; kind: ToastKind } | null;

export default function Toast({ state }: { state: ToastState }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  const kindColor = useMemo(
    () => ({
      success: Colors.green,
      error: Colors.red,
      info: Colors.blue,
    }),
    [Colors],
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

const makeStyles = (Colors: ThemeColors) =>
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
      backgroundColor: Colors.cardAlt,
      borderRadius: Radii.md,
      borderLeftWidth: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
      elevation: 6,
    },
    text: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  });
