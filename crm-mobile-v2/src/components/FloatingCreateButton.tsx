import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, CreateGradient, Shadow } from '../theme';

type Props = {
  open: boolean;
  onPress: () => void;
};

/**
 * Nút "Tạo mới" nổi ở giữa thanh tab:
 * - Nền gradient cam cháy đa sắc
 * - Vòng phát sáng (glow) bao quanh
 * - Nhô cao khỏi thanh menu, có label "Tạo mới"
 * - Bấm xoay dấu + thành ×
 */
export default function FloatingCreateButton({ open, onPress }: Props) {
  const rotate = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotate, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, rotate]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={onPress} style={styles.pressable} hitSlop={10}>
        <Animated.View
          style={[
            styles.glow,
            { transform: [{ scale: glowScale }], opacity: glowOpacity },
          ]}
        />
        <View style={styles.ring} />
        <LinearGradient
          colors={CreateGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, Shadow.fab]}
        >
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name="add" size={34} color="#FFFFFF" />
          </Animated.View>
        </LinearGradient>
      </Pressable>
      <Text style={styles.label}>{open ? 'Đóng' : 'Tạo mới'}</Text>
    </View>
  );
}

const BTN = 60;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 88,
  },
  pressable: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
  glow: {
    position: 'absolute',
    width: BTN + 26,
    height: BTN + 26,
    borderRadius: (BTN + 26) / 2,
    backgroundColor: Colors.orangeGlow,
  },
  ring: {
    position: 'absolute',
    width: BTN + 12,
    height: BTN + 12,
    borderRadius: (BTN + 12) / 2,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.55)',
  },
  button: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  label: {
    color: Colors.orange,
    fontSize: 11,
    fontWeight: '800',
    marginTop: -4,
  },
});
