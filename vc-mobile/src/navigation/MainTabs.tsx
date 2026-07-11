import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CreateDealModal from '../components/CreateDealModal';
import Toast, { type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import KanbanScreen from '../screens/KanbanScreen';
import PlannerScreen from '../screens/PlannerScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkScreen from '../screens/WorkScreen';

export type MainTabParamList = {
  Kanban: undefined;
  Work: undefined;
  CreateDeal: undefined;
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
  const padBottom = Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + padBottom;

  const [dealOpen, setDealOpen] = useState(false);
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
          name="Work"
          component={WorkScreen}
          options={{
            tabBarLabel: 'Công việc',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} size={22} color={color} />
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
          name="Planner"
          component={PlannerScreen}
          options={{
            tabBarLabel: 'Planner',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarLabel: 'Tôi',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            ),
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
