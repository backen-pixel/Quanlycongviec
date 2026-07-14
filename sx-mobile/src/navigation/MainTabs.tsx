import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useMemo, useState } from 'react';
import { DeviceEventEmitter, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CreateDealModal from '../components/CreateDealModal';
import Toast, { type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import KanbanScreen from '../screens/KanbanScreen';
import MessagesScreen from '../screens/MessagesScreen';
import OverviewScreen from '../screens/OverviewScreen';
import PlannerScreen from '../screens/PlannerScreen';
import ProfileScreen, { SX_OPEN_CREATE_DEAL } from '../screens/ProfileScreen';
import WorkScreen from '../screens/WorkScreen';

export type MainTabParamList = {
  Overview: undefined;
  Kanban: undefined;
  Work: undefined;
  CreateDeal: undefined;
  Messages: undefined;
  Planner: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function CreateDealPlaceholder() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

export default function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadTotal: messageUnread } = useMessenger();
  const padBottom = Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + padBottom;

  const [dealOpen, setDealOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SX_OPEN_CREATE_DEAL, () => {
      setDealOpen(true);
    });
    return () => sub.remove();
  }, []);

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
          paddingBottom: 2,
        },
        fabTouchable: {
          top: -(FAB_SIZE / 2 - 4),
          alignItems: 'center',
          justifyContent: 'center',
        },
        fabCircle: {
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: colors.bgElevated,
          shadowColor: colors.primary,
          shadowOpacity: 0.45,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 12,
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
            tabBarLabel: 'Kanban',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="CreateDeal"
          component={CreateDealPlaceholder}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => (
              <View style={styles.fabTabSlot}>
                <TouchableOpacity
                  style={styles.fabTouchable}
                  onPress={() => setDealOpen(true)}
                  activeOpacity={0.88}
                >
                  <View style={styles.fabCircle}>
                    <Ionicons name="add" size={28} color={colors.white} />
                  </View>
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <Tab.Screen
          name="Work"
          component={WorkScreen}
          options={{
            tabBarLabel: 'Công việc',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'checkbox' : 'checkbox-outline'} size={22} color={color} />
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

      <CreateDealModal
        visible={dealOpen}
        user={user}
        onClose={() => setDealOpen(false)}
        onCreated={(msg) => showToast(msg)}
      />

      <Toast state={toast} />
    </>
  );
}

const FAB_SIZE = 52;
