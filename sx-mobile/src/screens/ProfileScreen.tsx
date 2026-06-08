import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { API_ORIGIN } from '../config';
import { HIT_TARGET, Radii, Spacing, type ThemeMode } from '../theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
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
      </View>

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
