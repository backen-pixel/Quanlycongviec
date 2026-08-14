import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus, useWentOffline } from '../context/NetworkStatusContext';
import { useColors, type ThemeColors } from '../theme';

/**
 * Thanh cố định khi mất mạng + nhấn mạnh lần đầu vừa mất kết nối.
 */
export default function OfflineBanner() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const wentOffline = useWentOffline();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!wentOffline) {
      pulse.setValue(1);
      return undefined;
    }
    const anim = Animated.sequence([
      Animated.timing(pulse, { toValue: 1.04, duration: 180, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1.03, duration: 160, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [wentOffline, pulse]);

  if (isOnline) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { paddingTop: Math.max(insets.top, 6) },
        { transform: [{ scale: pulse }] },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.inner}>
        <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
        <Text style={styles.txt}>
          {wentOffline
            ? 'Mất kết nối mạng — dữ liệu có thể chưa cập nhật'
            : 'Không có kết nối mạng — đang dùng dữ liệu đã tải'}
        </Text>
      </View>
    </Animated.View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: Colors.amber,
      zIndex: 1000,
      elevation: 8,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 8,
      paddingTop: 4,
    },
    txt: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
      flexShrink: 1,
    },
  });
