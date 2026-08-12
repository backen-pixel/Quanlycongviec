import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { CreateGradient, Shadow, useColors, type ThemeColors } from '../theme';

type Props = {
  onPress: () => void;
};

/**
 * Bong bóng «Tạo sự kiện» — nổi góc phải phía trên thanh tab (kiểu FAB Lead mới).
 */
export default function FloatingCreateButton({ onPress }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const glow = useRef(new Animated.Value(0)).current;

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

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={onPress} style={styles.pressable} hitSlop={8} accessibilityLabel="Tạo sự kiện">
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
          <Ionicons name="calendar" size={26} color="#FFFFFF" />
          <Text style={styles.innerLabel}>Tạo sự kiện</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const BTN = 68;

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
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
    width: BTN + 22,
    height: BTN + 22,
    borderRadius: (BTN + 22) / 2,
    backgroundColor: Colors.orangeGlow,
  },
  ring: {
    position: 'absolute',
    width: BTN + 10,
    height: BTN + 10,
    borderRadius: (BTN + 10) / 2,
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
    gap: 2,
    paddingTop: 2,
  },
  innerLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 11,
  },
});
