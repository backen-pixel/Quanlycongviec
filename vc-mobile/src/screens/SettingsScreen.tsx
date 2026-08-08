import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TapHighlight from '../components/TapHighlight';
import { useTheme } from '../context/ThemeContext';
import { clearFloatingBubbleHidden } from '../lib/floatingChatBubbleStorage';
import {
  canDrawOverlays,
  ensureOverlayPermissionInteractive,
  isBubbleOverlaySupported,
  startSystemBubbleOverlay,
} from '../lib/floatingBubbleOverlay';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { HIT_TARGET, Radii, Spacing } from '../theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, mode, isDark, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const themeOptions: { mode: 'dark' | 'light'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: 'dark', label: 'Tối', icon: 'moon-outline' },
    { mode: 'light', label: 'Sáng', icon: 'sunny-outline' },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TapHighlight
          key={`back-${mode}`}
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Cài đặt</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Giao diện</Text>
        <View style={styles.themeRow}>
          {themeOptions.map((opt) => {
            const active = mode === opt.mode;
            return (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.themeBtn, active && styles.themeBtnActive]}
                onPress={() => setMode(opt.mode)}
                activeOpacity={0.85}
              >
                <Ionicons name={opt.icon} size={18} color={active ? colors.primary : colors.textMuted} />
                <Text style={[styles.themeBtnText, active && styles.themeBtnTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Hệ thống</Text>
        <View style={styles.settingsCard}>
          <SettingsRow
            icon="chatbubble-ellipses-outline"
            label="Hiện lại bong bóng chat"
            colors={colors}
            onPress={() => {
              void clearFloatingBubbleHidden();
            }}
          />
          {isBubbleOverlaySupported() ? (
            <SettingsRow
              icon="layers-outline"
              label="Bong bóng ngoài app"
              colors={colors}
              onPress={() => {
                void (async () => {
                  const ok = await canDrawOverlays();
                  if (ok) {
                    await startSystemBubbleOverlay();
                    return;
                  }
                  await ensureOverlayPermissionInteractive({
                    title: 'Bong bóng ngoài app',
                    message:
                      'Bật quyền "Hiển thị trên các ứng dụng khác" để bong bóng chat xuất hiện khi bạn dùng app khác.',
                  });
                })();
              }}
            />
          ) : null}
          <SettingsRow
            icon="cloud-download-outline"
            label="Cập nhật ứng dụng"
            colors={colors}
            last
            onPress={() => navigation.navigate('UpdateFromServer')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  onPress,
  colors,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        stylesRow.row,
        {
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textMuted} />
      <Text
        style={{
          flex: 1,
          color: danger ? colors.danger : colors.text,
          fontSize: 14,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

const stylesRow = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const backBg = isDark ? colors.bgElevated : '#FFFFFF';
  const backBorder = isDark ? colors.borderStrong : colors.border;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    backBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: backBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: backBorder,
    },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 12,
      marginTop: 4,
    },
    themeRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    themeBtn: {
      flex: 1,
      minHeight: HIT_TARGET,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.card : '#FFFFFF',
    },
    themeBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    themeBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
    themeBtnTextActive: { color: colors.primary },
    settingsCard: {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.lg,
    },
  });
}
