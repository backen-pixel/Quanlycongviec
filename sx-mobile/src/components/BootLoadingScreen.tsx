import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import SpinningLoader from './SpinningLoader';

/** Nền splash native — boot luôn khớp splash, không phụ thuộc light/dark theme. */
export const BOOT_BG = '#00071F';
const BOOT_TITLE = '#F8FAFC';
const BOOT_HINT = '#94A3B8';
const BOOT_ACCENT = '#60A5FA';

type Props = {
  /** false → ẩn overlay (giống CRM BootSplash). */
  visible?: boolean;
  /** Bubble overlay boot — không phủ opaque. */
  transparent?: boolean;
  /** Dòng trạng thái dưới tên app. */
  hint?: string;
  /** @deprecated dùng hint */
  label?: string;
};

/**
 * Lớp phủ cold start — layout giống CRM:
 * logo + spinner + tên app + hint.
 * Nền luôn = splash (#00071F) để nối liền native splash (tránh màn đen trống).
 */
export default function BootLoadingScreen({
  visible = true,
  transparent = false,
  hint,
  label,
}: Props) {
  const statusText = hint || label || 'Đang mở ứng dụng…';

  if (!visible) return null;
  if (transparent) {
    return <View pointerEvents="none" style={styles.transparent} />;
  }

  return (
    <View style={styles.root} pointerEvents="auto">
      <StatusBar style="light" />
      <Image
        source={require('../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Quản lý sản xuất"
      />
      <SpinningLoader color={BOOT_ACCENT} size="large" style={styles.spinner} />
      <Text style={styles.title}>Quản lý sản xuất</Text>
      <Text style={styles.hint}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: BOOT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  transparent: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  logo: { width: 96, height: 96, marginBottom: 20 },
  spinner: { marginBottom: 14 },
  title: {
    color: BOOT_TITLE,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    color: BOOT_HINT,
    fontSize: 13,
    textAlign: 'center',
  },
});
