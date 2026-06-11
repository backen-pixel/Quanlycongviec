import Ionicons from '@expo/vector-icons/Ionicons';
import * as Application from 'expo-application';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { clearFloatingBubbleHidden } from '../lib/floatingChatBubbleStorage';
import {
  canDrawOverlays,
  ensureOverlayPermissionInteractive,
  isBubbleOverlaySupported,
  startSystemBubbleOverlay,
} from '../lib/floatingBubbleOverlay';
import { API_ORIGIN } from '../config';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { HIT_TARGET, Radii, Spacing, type ThemeMode } from '../theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();
  const { colors, mode, setMode } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
        title: { color: colors.text, fontSize: 20, fontWeight: '800' },
        profileCard: {
          margin: Spacing.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          padding: Spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        },
        avatar: {
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarText: { color: colors.white, fontSize: 18, fontWeight: '800' },
        name: { color: colors.text, fontSize: 17, fontWeight: '800' },
        email: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
        role: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 4 },
        infoCard: {
          marginHorizontal: Spacing.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          paddingHorizontal: Spacing.md,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
        rowValue: { color: colors.text, fontSize: 13, fontWeight: '600', maxWidth: '55%' },
        themeCard: {
          marginHorizontal: Spacing.md,
          marginTop: Spacing.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          padding: Spacing.md,
        },
        sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 10 },
        themeRow: { flexDirection: 'row', gap: 10 },
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
          backgroundColor: colors.cardAlt,
        },
        themeBtnActive: {
          borderColor: colors.primary,
          backgroundColor: colors.primarySoft,
        },
        themeBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
        themeBtnTextActive: { color: colors.primary },
        logoutBtn: {
          margin: Spacing.md,
          minHeight: HIT_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
          borderRadius: Radii.md,
        },
        logoutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
        bubbleBtn: {
          marginHorizontal: Spacing.md,
          marginTop: Spacing.md,
          minHeight: HIT_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.primary,
          borderRadius: Radii.md,
        },
        bubbleBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
        updateBtn: {
          marginHorizontal: Spacing.md,
          marginTop: Spacing.md,
          minHeight: HIT_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: Spacing.md,
        },
        updateBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
        updateBtnTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
        updateBtnSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
      }),
    [colors],
  );

  const name = user?.full_name || user?.fullName || user?.email || 'Người dùng';
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const confirmLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn chắc chắn muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const themeOptions: { mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: 'dark', label: 'Tối', icon: 'moon-outline' },
    { mode: 'light', label: 'Sáng', icon: 'sunny-outline' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tài khoản</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email || ''}</Text>
          {user?.role ? <Text style={styles.role}>{user.role}</Text> : null}
        </View>
      </View>

      <View style={styles.infoCard}>
        <Row colors={colors} styles={styles} icon="business-outline" label="Công ty" value={user?.company_id ? 'Đã gán' : 'Chưa gán'} />
        <Row colors={colors} styles={styles} icon="server-outline" label="Máy chủ" value={API_ORIGIN.replace(/^https?:\/\//, '')} />
        <Row
          colors={colors}
          styles={styles}
          icon="phone-portrait-outline"
          label="Phiên bản"
          value={`v${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`}
        />
      </View>

      <TouchableOpacity
        style={styles.updateBtn}
        onPress={() => navigation.navigate('UpdateFromServer')}
        activeOpacity={0.85}
      >
        <View style={styles.updateBtnLeft}>
          <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.updateBtnTitle}>Cập nhật ứng dụng</Text>
            <Text style={styles.updateBtnSub}>Kiểm tra OTA và APK từ server</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.themeCard}>
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
      </View>

      <TouchableOpacity
        style={styles.bubbleBtn}
        onPress={() => {
          void clearFloatingBubbleHidden();
          Alert.alert('Bong bóng chat', 'Đã bật lại bong bóng chat trên màn hình.');
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
        <Text style={styles.bubbleBtnText}>Hiện lại bong bóng chat</Text>
      </TouchableOpacity>

      {isBubbleOverlaySupported() ? (
        <TouchableOpacity
          style={styles.bubbleBtn}
          onPress={() => {
            void (async () => {
              const ok = await canDrawOverlays();
              if (ok) {
                await startSystemBubbleOverlay();
                Alert.alert('Bong bóng ngoài app', 'Đã bật bong bóng chat trên màn hình hệ thống.');
                return;
              }
              await ensureOverlayPermissionInteractive({
                title: 'Bong bóng ngoài app',
                message:
                  'Bật quyền "Hiển thị trên các ứng dụng khác" để bong bóng chat xuất hiện khi bạn dùng app khác (giống Zalo/Messenger).',
              });
            })();
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="layers-outline" size={18} color={colors.primary} />
          <Text style={styles.bubbleBtnText}>Bong bóng ngoài app (overlay)</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}
