import Ionicons from '@expo/vector-icons/Ionicons';
import * as Application from 'expo-application';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import CommentNotificationsModal from '../components/CommentNotificationsModal';
import ProjectCommentModal from '../components/ProjectCommentModal';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import { fetchCompanies, fetchProductionProject, type CompanyOption } from '../lib/logisticsApi';
import { isSystemAdmin } from '../lib/productionFilters';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import type { MainTabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { Radii, Spacing, colorWithAlpha } from '../theme';
import type { ProductionProject } from '../types';

function roleLabel(user: { role?: string | null; company_id?: string | null } | null): string {
  if (!user?.role) return 'Nhân viên';
  if (isSystemAdmin(user)) return 'Quản trị hệ thống';
  if (user.role === 'admin') return 'Quản trị viên';
  if (user.role === 'sales_admin') return 'Sales Admin';
  if (user.role === 'production_admin') return 'Quản trị VC';
  if (user.role === 'production_staff') return 'Nhân viên VC';
  return String(user.role);
}

type MgmtItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

type QuickItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user, logout } = useAuth();
  const { colors, isDark, mode } = useTheme();
  const { unreadCount, refreshUnread } = useNotifications();
  const { unreadTotal: messageUnread } = useMessenger();
  const { openOverdueProjects } = useRootNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [commentProject, setCommentProject] = useState<ProductionProject | null>(null);

  useEffect(() => {
    void fetchCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  const name = user?.full_name || user?.fullName || user?.email || 'Người dùng';
  const roleText = roleLabel(user);
  const companyName = useMemo(() => {
    if (!user?.company_id) return isSystemAdmin(user) ? 'Toàn hệ thống' : 'Chưa gán công ty';
    return companies.find((c) => String(c.id) === String(user.company_id))?.name || 'Đã gán công ty';
  }, [user, companies]);

  const openNotifs = useCallback(async () => {
    void ensureNotificationPermission();
    setNotifOpen(true);
    void refreshUnread();
  }, [refreshUnread]);

  const openCommentForProjectId = useCallback(async (projectId: string) => {
    try {
      const proj = await fetchProductionProject(projectId);
      setCommentProject(proj);
    } catch {
      setCommentProject({ id: projectId, code: '', name: 'Dự án' } as ProductionProject);
    }
  }, []);

  const openSettings = useCallback(() => {
    rootNav.navigate('Settings');
  }, [rootNav]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Đăng xuất', 'Bạn chắc chắn muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  const mgmtItems: MgmtItem[] = [
    {
      key: 'overview',
      label: 'Tổng quan',
      icon: 'home',
      color: '#EA580C',
      onPress: () => tabNav.navigate('Overview'),
    },
    {
      key: 'orders',
      label: 'Dự án',
      icon: 'grid',
      color: '#F97316',
      onPress: () => tabNav.navigate('Kanban'),
    },
    {
      key: 'prod',
      label: 'Công việc',
      icon: 'checkbox',
      color: '#22C55E',
      onPress: () => tabNav.navigate('Work'),
    },
    {
      key: 'leaves',
      label: 'Lịch nghỉ',
      icon: 'calendar-outline',
      color: '#A855F7',
      onPress: () => rootNav.navigate('Leaves'),
    },
    {
      key: 'events',
      label: 'Sự kiện',
      icon: 'calendar',
      color: '#06B6D4',
      onPress: () => rootNav.navigate('Events'),
    },
    {
      key: 'stock',
      label: 'Quá hạn',
      icon: 'alert-circle',
      color: '#F97316',
      onPress: openOverdueProjects,
    },
    {
      key: 'customers',
      label: 'Tin nhắn',
      icon: 'chatbubbles',
      color: '#8B5CF6',
      onPress: () => tabNav.navigate('Messages'),
    },
    {
      key: 'staff',
      label: 'Planner',
      icon: 'map',
      color: '#0EA5E9',
      onPress: () => tabNav.navigate('Planner'),
    },
    {
      key: 'settings',
      label: 'Cài đặt',
      icon: 'settings',
      color: '#EAB308',
      onPress: openSettings,
    },
    {
      key: 'report',
      label: 'Báo cáo',
      icon: 'bar-chart',
      color: '#3B82F6',
      onPress: () => Alert.alert('Báo cáo', 'Module báo cáo chi tiết sẽ sớm có trên app.'),
    },
  ];

  const quickItems: QuickItem[] = [
    {
      key: 'qr',
      label: 'Quét mã QR',
      icon: 'qr-code',
      color: '#8B5CF6',
      onPress: () => Alert.alert('Quét mã QR', 'Tính năng quét mã sắp có trên app.'),
    },
    {
      key: 'camera',
      label: 'Chụp ảnh',
      icon: 'camera',
      color: '#F97316',
      onPress: () => Alert.alert('Chụp ảnh', 'Dùng tab Tin nhắn hoặc chi tiết dự án để gửi ảnh.'),
    },
    {
      key: 'note',
      label: 'Ghi chú',
      icon: 'create',
      color: '#3B82F6',
      onPress: () => Alert.alert('Ghi chú', 'Đang cập nhật'),
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TapHighlight
            key={`menu-back-${mode}`}
            style={styles.iconBtn}
            onPress={() => tabNav.navigate('Overview')}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TapHighlight>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Menu</Text>
            <Text style={styles.headerSub}>Xin chào, quản lý vận chuyển lắp đặt của bạn 👋</Text>
          </View>
          <TapHighlight style={styles.iconBtn} onPress={() => void openNotifs()} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </TapHighlight>
          <TapHighlight style={styles.iconBtn} onPress={openSettings} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TapHighlight>
        </View>

        <View style={styles.userCard}>
          <View style={styles.userTop}>
            <Avatar name={name} avatarUrl={user?.avatar} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.userName} numberOfLines={1}>{name}</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{roleText}</Text>
                </View>
              </View>
              <Text style={styles.userEmail} numberOfLines={1}>{user?.email || '—'}</Text>
            </View>
          </View>
          <View style={styles.userMetaRow}>
            <View style={styles.userMetaItem}>
              <Text style={styles.userMetaLabel}>Công ty</Text>
              <Text style={styles.userMetaValue} numberOfLines={2}>{companyName}</Text>
            </View>
            <View style={styles.userMetaDivider} />
            <View style={styles.userMetaItem}>
              <Text style={styles.userMetaLabel}>Vai trò</Text>
              <Text style={styles.userMetaValue} numberOfLines={2}>{roleText}</Text>
            </View>
            <View style={styles.userMetaDivider} />
            <View style={styles.userMetaItem}>
              <Text style={styles.userMetaLabel}>Phiên bản</Text>
              <Text style={[styles.userMetaValue, { color: colors.success }]}>
                v{Application.nativeApplicationVersion}
              </Text>
              <Text style={styles.userMetaHint}>build {Application.nativeBuildVersion}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quản lý vận chuyển</Text>
        <View style={styles.mgmtGrid}>
          {mgmtItems.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.mgmtCard}
              activeOpacity={0.88}
              onPress={item.onPress}
            >
              <View style={[styles.mgmtIcon, { backgroundColor: colorWithAlpha(item.color, 0.18) }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
                {item.key === 'customers' && messageUnread > 0 ? (
                  <View style={styles.mgmtBadge}>
                    <Text style={styles.badgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.mgmtLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Công cụ nhanh</Text>
        <View style={styles.quickRow}>
          {quickItems.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.quickCard}
              activeOpacity={0.88}
              onPress={item.onPress}
            >
              <View style={[styles.quickIcon, { backgroundColor: colorWithAlpha(item.color, 0.2) }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.88}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>

      <CommentNotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenProject={(pid) => {
          setNotifOpen(false);
          void openCommentForProjectId(pid);
        }}
      />
      <ProjectCommentModal
        visible={!!commentProject}
        project={commentProject}
        onClose={() => setCommentProject(null)}
        onPosted={() => {}}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const iconBtnBg = isDark ? colors.bgElevated : '#FFFFFF';
  const iconBtnBorder = isDark ? colors.borderStrong : colors.border;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: Spacing.lg,
    },
    headerTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
    headerSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: iconBtnBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: iconBtnBorder,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    userCard: {
      backgroundColor: colors.card,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    userTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    userName: { color: colors.text, fontSize: 17, fontWeight: '800', maxWidth: '70%' },
    rolePill: {
      backgroundColor: colorWithAlpha(colors.primary, 0.2),
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.full,
    },
    rolePillText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
    userEmail: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
    userMetaRow: {
      flexDirection: 'row',
      marginTop: Spacing.lg,
      paddingTop: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    userMetaItem: { flex: 1, paddingHorizontal: 4 },
    userMetaDivider: { width: 1, backgroundColor: colors.border },
    userMetaLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600', marginBottom: 4 },
    userMetaValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
    userMetaHint: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 12,
      marginTop: 4,
    },
    mgmtGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: Spacing.lg,
    },
    mgmtCard: {
      width: '23%',
      flexGrow: 1,
      minWidth: '22%',
      maxWidth: '24%',
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 6,
      alignItems: 'center',
      gap: 8,
    },
    mgmtIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mgmtBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    mgmtLabel: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 14,
    },
    quickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: Spacing.lg,
    },
    quickCard: {
      width: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    quickIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
    logoutBtn: {
      marginTop: Spacing.sm,
      marginBottom: Spacing.md,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(colors.danger, 0.35),
      backgroundColor: colorWithAlpha(colors.danger, isDark ? 0.14 : 0.08),
      paddingVertical: 14,
      paddingHorizontal: Spacing.md,
    },
    logoutText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  });
}
