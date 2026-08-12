import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import SpinningLoader from './SpinningLoader';
import { useColors, type ThemeColors } from '../theme';

type Props = {
  visible: boolean;
  /** Bubble overlay boot — không phủ opaque. */
  transparent?: boolean;
  hint?: string;
};

/**
 * Lớp phủ lúc cold start / chờ auth + navigation sẵn sàng.
 * Tránh màn đen trống trước khi tab đầu tiên paint.
 */
export default function BootSplash({ visible, transparent, hint }: Props) {
  const Colors = useColors();
  const styles = makeStyles(Colors);
  if (!visible) return null;
  if (transparent) {
    return <View pointerEvents="none" style={styles.transparent} />;
  }
  return (
    <View style={styles.root} pointerEvents="auto">
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
      <SpinningLoader color={Colors.blue} size="large" style={styles.spinner} />
      <Text style={styles.title}>CRM Mobile</Text>
      <Text style={styles.hint}>{hint || 'Đang mở ứng dụng…'}</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
      elevation: 1000,
      backgroundColor: Colors.bg,
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
      color: Colors.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    hint: {
      marginTop: 8,
      color: Colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
  });
