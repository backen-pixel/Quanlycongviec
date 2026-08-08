import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EventFormModal from '../components/events/EventFormModal';
import GlowActionFab from '../components/GlowActionFab';
import Toast, { type ToastState } from '../components/Toast';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import KanbanScreen from '../screens/KanbanScreen';
import MessagesScreen from '../screens/MessagesScreen';
import OverviewScreen from '../screens/OverviewScreen';
import PlannerScreen from '../screens/PlannerScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkScreen from '../screens/WorkScreen';
import type { VcKpiFocusKey } from '../lib/vcBoardKpis';

export type MainTabParamList = {
  /** Trang tổng quan VC/LĐ (tab chính). */
  Overview: undefined;
  /** focusKpi: từ card Tổng quan → nhảy cột (Kanban) / lọc cột (List) / lọc quá hạn. */
  Kanban: { focusKpi?: VcKpiFocusKey } | undefined;
  /** Slot FAB giữa tab — mở tạo sự kiện. */
  CreateEvent: undefined;
  Messages: undefined;
  Menu: undefined;
  /** Danh sách công việc — mở từ Tổng quan / Menu (ẩn khỏi tab bar). */
  Work: undefined;
  Planner: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function CreateEventPlaceholder() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

export default function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadTotal: messageUnread } = useMessenger();
  const padBottom = Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + padBottom;

  const [eventOpen, setEventOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tabBar: {
          backgroundColor: colors.bgElevated,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          ...Platform.select({ android: { elevation: 12 } }),
        },
        tabLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
        fabTabSlot: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 0,
        },
        fabLift: {
          top: -22,
          alignItems: 'center',
          justifyContent: 'center',
        },
        badge: {
          position: 'absolute',
          top: -4,
          right: -10,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 3,
        },
        badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
      }),
    [colors],
  );

  const showToast = (msg: string) => {
    setToast({ message: msg, kind: 'success' });
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <Tab.Navigator
        initialRouteName="Overview"
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: padBottom }],
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tab.Screen
          name="Overview"
          component={OverviewScreen}
          options={{
            tabBarLabel: 'Tổng quan',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Kanban"
          component={KanbanScreen}
          options={{
            tabBarLabel: 'Dự án',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="CreateEvent"
          component={CreateEventPlaceholder}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => (
              <View style={styles.fabTabSlot}>
                <View style={styles.fabLift}>
                  <GlowActionFab
                    variant="event"
                    compact
                    size={58}
                    cutoutColor={colors.bgElevated}
                    onPress={() => setEventOpen(true)}
                  />
                </View>
              </View>
            ),
          }}
        />
        <Tab.Screen
          name="Messages"
          component={MessagesScreen}
          options={{
            tabBarLabel: 'Tin nhắn',
            tabBarIcon: ({ color, focused }) => (
              <View>
                <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
                {messageUnread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{messageUnread > 99 ? '99+' : messageUnread}</Text>
                  </View>
                ) : null}
              </View>
            ),
          }}
        />
        <Tab.Screen
          name="Menu"
          component={ProfileScreen}
          options={{
            tabBarLabel: 'Menu',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'menu' : 'menu-outline'} size={22} color={color} />
            ),
          }}
        />
        {/* Ẩn — mở từ Tổng quan / Menu / deep-link */}
        <Tab.Screen
          name="Work"
          component={WorkScreen}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none', width: 0, height: 0 },
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none', width: 0, height: 0 },
          }}
        />
        <Tab.Screen
          name="Planner"
          component={PlannerScreen}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none', width: 0, height: 0 },
          }}
        />
      </Tab.Navigator>

      <EventFormModal
        visible={eventOpen}
        onClose={() => setEventOpen(false)}
        onSaved={() => {
          setEventOpen(false);
          showToast('Đã tạo sự kiện');
        }}
      />

      <Toast state={toast} />
    </>
  );
}
