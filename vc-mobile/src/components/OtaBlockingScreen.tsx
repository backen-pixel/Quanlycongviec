import SpinningLoader from './SpinningLoader';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Spacing } from '../theme';

type Props = {
  phase: 'checking' | 'downloading';
};

export default function OtaBlockingScreen({ phase }: Props) {
  const { colors, isDark } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: 'center',
          alignItems: 'center',
          padding: Spacing.lg,
        },
        title: { marginTop: 16, fontSize: 18, fontWeight: '800', color: colors.text },
        sub: { marginTop: 8, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
      }),
    [colors],
  );

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SpinningLoader size="large" color={colors.primary} />
      <Text style={styles.title}>Cập nhật bắt buộc</Text>
      <Text style={styles.sub}>
        {phase === 'checking' ? 'Đang kiểm tra bản mới…' : 'Đang tải bản cập nhật…'}
      </Text>
    </View>
  );
}
