import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import SpinningLoader from './SpinningLoader';
import { Spacing } from '../theme';
import { BOOT_BG } from './BootLoadingScreen';

type Props = {
  phase: 'checking' | 'downloading';
};

/** OTA bắt buộc — cùng layout boot (logo + spinner + chữ trên nền splash). */
export default function OtaBlockingScreen({ phase }: Props) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image
        source={require('../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <SpinningLoader color="#60A5FA" size="large" style={styles.spinner} />
      <Text style={styles.title}>Cập nhật bắt buộc</Text>
      <Text style={styles.hint}>
        {phase === 'checking' ? 'Đang kiểm tra bản mới…' : 'Đang tải bản cập nhật…'}
      </Text>
      <Text style={styles.hint}>Vui lòng giữ kết nối mạng, app sẽ tự mở lại.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BOOT_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  logo: { width: 96, height: 96, marginBottom: 20 },
  spinner: { marginBottom: 14 },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
