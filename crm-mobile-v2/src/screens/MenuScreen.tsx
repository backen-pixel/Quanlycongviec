import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import NotificationBadge from '../components/NotificationBadge';
import { warmCrmHubPipelines } from '../api/crm';
import { useAuth } from '../context/AuthContext';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { currentVersionName } from '../lib/appUpdate';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ItemTarget = { kind: 'leads' | 'deals' };
type Item = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  target?: ItemTarget;
  action?: 'logout' | 'drive' | 'settings' | 'notifications' | 'events' | 'quotations' | 'orders' | 'products' | 'customers';
};

function buildSections(Colors: ThemeColors): { title: string; items: Item[] }[] {
  return [
    {
      title: 'Bán hàng',
      items: [
        { icon: 'people', label: 'Leads', color: Colors.blue, target: { kind: 'leads' } },
        { icon: 'pricetags', label: 'Deals', color: Colors.orange, target: { kind: 'deals' } },
        { icon: 'person-circle', label: 'Khách hàng', color: Colors.cyan, action: 'customers' },
        { icon: 'cube', label: 'Sản phẩm', color: Colors.green, action: 'products' },
        { icon: 'document-text', label: 'Báo giá', color: Colors.amber, action: 'quotations' },
        { icon: 'cart', label: 'Đơn hàng', color: Colors.purple, action: 'orders' },
      ],
    },
    {
      title: 'Công việc',
      items: [
        { icon: 'checkbox', label: 'Nhiệm vụ', color: Colors.blue },
        { icon: 'calendar', label: 'Sự kiện', color: Colors.cyan, action: 'events' },
        { icon: 'cloud-upload', label: 'Drive lưu trữ', color: Colors.purple, action: 'drive' },
        { icon: 'notifications', label: 'Thông báo', color: Colors.red, action: 'notifications' },
        { icon: 'stats-chart', label: 'Báo cáo', color: Colors.green },
      ],
    },
    {
      title: 'Hệ thống',
      items: [
        { icon: 'person-circle', label: 'Tài khoản', color: Colors.blue },
        { icon: 'phone-portrait', label: 'Thiết bị', color: Colors.purple },
        { icon: 'settings', label: 'Cài đặt', color: Colors.textMuted, action: 'settings' },
        { icon: 'log-out', label: 'Đăng xuất', color: Colors.red, action: 'logout' },
      ],
    },
  ];
}

export default function MenuScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const SECTIONS = useMemo(() => buildSections(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, logout } = useAuth();
  const displayName = user?.full_name || user?.fullName || user?.email || 'Người dùng';
  const unreadNotifCount = useUnreadNotificationCount();

  useFocusEffect(
    useCallback(() => {
      void warmCrmHubPipelines(user?.company_id || undefined);
    }, [user?.company_id]),
  );

  const onItem = (it: Item) => {
    if (it.action === 'logout') {
      void logout();
      return;
    }
    if (it.action === 'drive') {
      navigation.navigate('Drive');
      return;
    }
    if (it.action === 'settings') {
      navigation.navigate('Settings');
      return;
    }
    if (it.action === 'notifications') {
      navigation.navigate('Notifications');
      return;
    }
    if (it.action === 'events') {
      navigation.navigate('Events');
      return;
    }
    if (it.action === 'quotations') {
      navigation.navigate('Quotations');
      return;
    }
    if (it.action === 'orders') {
      navigation.navigate('Orders');
      return;
    }
    if (it.action === 'products') {
      navigation.navigate('Products');
      return;
    }
    if (it.action === 'customers') {
      navigation.navigate('Customers');
      return;
    }
    if (it.target) navigation.navigate('CrmHub', { initialMode: it.target.kind });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.h1}>Menu</Text>

      <View style={styles.profile}>
        <Avatar name={displayName} size={52} color={Colors.blue} />
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>
            {user?.role || 'Nhân viên'}{user?.email ? ` · ${user.email}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textFaint} />
      </View>

      {SECTIONS.map((sec) => (
        <View key={sec.title} style={{ marginTop: 18 }}>
          <Text style={styles.secTitle}>{sec.title}</Text>
          <View style={styles.grid}>
            {sec.items.map((it) => (
              <Pressable key={it.label} style={styles.tile} onPress={() => onItem(it)}>
                <View style={styles.tileIconWrap}>
                  <View style={[styles.tileIcon, { backgroundColor: it.color + '22' }]}>
                    <Ionicons name={it.icon} size={22} color={it.color} />
                  </View>
                  {it.action === 'notifications' ? (
                    <NotificationBadge count={unreadNotifCount} size="sm" style={styles.tileBadge} />
                  ) : null}
                </View>
                <Text style={styles.tileLabel}>{it.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.version}>CRM Mobile v{currentVersionName() || '?'}</Text>
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  h1: { color: Colors.text, fontSize: 28, fontWeight: '900', paddingHorizontal: 16 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileName: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  profileRole: { color: Colors.textMuted, fontSize: 12, marginTop: 3 },
  secTitle: {
    color: Colors.textFaint,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 0,
  },
  tile: { width: '25%', alignItems: 'center', paddingVertical: 10 },
  tileIconWrap: { position: 'relative' },
  tileIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: { top: -2, right: -4 },
  tileLabel: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '700', marginTop: 7, textAlign: 'center' },
  version: { color: Colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 24 },
});
