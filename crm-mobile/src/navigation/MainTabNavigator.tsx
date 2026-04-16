import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import CrmStackNavigator from './CrmStackNavigator';
import VoiceStackNavigator from './VoiceStackNavigator';
import MoreStackNavigator from './MoreStackNavigator';
import NotificationsScreen from '../screens/NotificationsScreen';
import { useNotifications } from '../context/NotificationContext';
import type { MainTabParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const padBottom = Math.max(insets.bottom, 8);
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: CrmColors.tabActive,
        tabBarInactiveTintColor: CrmColors.tabInactive,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 56 + padBottom,
            paddingBottom: padBottom,
            paddingTop: 6,
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="CrmTab"
        component={CrmStackNavigator}
        options={{
          title: 'Khách hàng',
          tabBarLabel: 'CRM',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'briefcase' : 'briefcase-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="VoiceTab"
        component={VoiceStackNavigator}
        options={{
          title: 'Ghi âm',
          tabBarLabel: 'Ghi âm',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'mic' : 'mic-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          title: 'Thông báo',
          tabBarLabel: 'Thông báo',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStackNavigator}
        options={{
          title: 'Menu',
          tabBarLabel: 'Menu',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: CrmColors.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: CrmColors.tabBarBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 8 },
    }),
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  badge: {
    backgroundColor: '#EF4444',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    minWidth: 18,
    maxHeight: 18,
    lineHeight: 16,
  },
});
