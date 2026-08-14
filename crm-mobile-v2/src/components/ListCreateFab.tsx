import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePulseGlow } from '../hooks/usePulseGlow';
import { CreateGradient, Shadow, useColors, type ThemeColors } from '../theme';

type Props = {
  kind: 'lead' | 'deal' | 'menu';
  onPress: () => void;
  bottom?: number;
};

const LEAD_GRADIENT = ['#60A5FA', '#2F6BFF', '#1D4ED8'] as const;
const DEAL_GRADIENT = ['#FBBF24', '#F97316', '#EA580C'] as const;

/**
 * FAB tạo nhanh — Lead / Deal / menu chung (Lead + Deal + Sự kiện).
 */
export default function ListCreateFab({ kind, onPress, bottom = 88 }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const glow = usePulseGlow(kind);

  const isLead = kind === 'lead';
  const isDeal = kind === 'deal';
  const gradient = isLead ? LEAD_GRADIENT : isDeal ? DEAL_GRADIENT : CreateGradient;
  const glowColor = isLead
    ? 'rgba(47,107,255,0.45)'
    : isDeal
      ? Colors.orangeGlow
      : 'rgba(249,115,22,0.42)';
  const ringColor = isLead
    ? 'rgba(96,165,250,0.55)'
    : isDeal
      ? 'rgba(251,191,36,0.55)'
      : 'rgba(251,191,36,0.55)';
  const iconName = isLead ? 'person-add' : isDeal ? 'pricetags' : 'add';
  const label = isLead ? 'Tạo Lead' : isDeal ? 'Tạo Deal' : 'Tạo mới';
  const a11y = isLead ? 'Tạo Lead' : isDeal ? 'Tạo Deal' : 'Tạo Lead, Deal hoặc sự kiện';

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.68] });

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={styles.pressable}
        hitSlop={8}
        accessibilityLabel={a11y}
      >
        <Animated.View
          style={[
            styles.glow,
            { backgroundColor: glowColor, transform: [{ scale: glowScale }], opacity: glowOpacity },
          ]}
        />
        <View style={[styles.ring, { borderColor: ringColor }]} />
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, Shadow.fab]}
        >
          <Ionicons name={iconName} size={kind === 'menu' ? 26 : 22} color="#FFFFFF" />
          <Text style={styles.innerLabel}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const BTN = 64;

const makeStyles = (_Colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      right: 10,
      zIndex: 20,
      alignItems: 'center',
      width: BTN + 28,
    },
    pressable: {
      width: BTN + 28,
      height: BTN + 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glow: {
      position: 'absolute',
      width: BTN + 20,
      height: BTN + 20,
      borderRadius: (BTN + 20) / 2,
    },
    ring: {
      position: 'absolute',
      width: BTN + 10,
      height: BTN + 10,
      borderRadius: (BTN + 10) / 2,
      borderWidth: 2,
    },
    button: {
      width: BTN,
      height: BTN,
      borderRadius: BTN / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.2)',
      gap: 2,
      paddingTop: 2,
    },
    innerLabel: {
      color: '#FFFFFF',
      fontSize: 8.5,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 10,
    },
  });
