import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateMenu } from '../context/CreateMenuContext';
import { navigate } from '../navigation/navigationRef';
import { Radii, useColors, type ThemeColors } from '../theme';

type ActionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  colors: readonly [string, string, ...string[]];
  delay: Animated.Value;
  onPress: () => void;
};

function ActionButton({ icon, label, sub, colors, delay, onPress }: ActionProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const translate = delay.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  return (
    <Animated.View style={{ opacity: delay, transform: [{ translateY: translate }] }}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionIcon}
        >
          <Ionicons name={icon} size={22} color="#FFFFFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionLabel}>{label}</Text>
          <Text style={styles.actionSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
      </Pressable>
    </Animated.View>
  );
}

export default function CreateMenuSheet() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { open, close } = useCreateMenu();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      Animated.stagger(60, [
        Animated.spring(a3, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.spring(a2, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.spring(a1, { toValue: 1, useNativeDriver: true, friction: 7 }),
      ]).start();
    } else {
      fade.setValue(0);
      a1.setValue(0);
      a2.setValue(0);
      a3.setValue(0);
    }
  }, [open, fade, a1, a2, a3]);

  if (!open) return null;

  const goEntity = (kind: 'lead' | 'deal') => {
    close();
    navigate('CreateEntity', { kind });
  };

  const goEvent = () => {
    close();
    navigate('Events', { openCreate: true });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]} />
      </Pressable>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 96 }]} pointerEvents="box-none">
        <Text style={styles.sheetTitle}>Tạo mới</Text>
        <ActionButton
          icon="person-add"
          label="Tạo Lead"
          sub="Khách hàng tiềm năng mới"
          colors={[Colors.blue, '#1E4FD6']}
          delay={a1}
          onPress={() => goEntity('lead')}
        />
        <ActionButton
          icon="pricetags"
          label="Tạo Deal"
          sub="Cơ hội bán hàng / báo giá"
          colors={[Colors.orange, Colors.orangeDeep]}
          delay={a2}
          onPress={() => goEntity('deal')}
        />
        <ActionButton
          icon="calendar"
          label="Tạo sự kiện"
          sub="Lịch hẹn / khảo sát / họp"
          colors={[Colors.cyan, '#0E7490']}
          delay={a3}
          onPress={goEvent}
        />
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(5,8,14,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 28,
    gap: 10,
  },
  sheetTitle: {
    color: Colors.textFaint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
    marginLeft: 4,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  actionSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
});
