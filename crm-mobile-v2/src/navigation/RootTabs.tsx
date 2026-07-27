import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { View } from 'react-native';
import CustomTabBar from '../components/CustomTabBar';
import { useColors } from '../theme';
import DeadlineScreen from '../screens/DeadlineScreen';
import MenuScreen from '../screens/MenuScreen';
import MessagesScreen from '../screens/MessagesScreen';
import PlannerScreen from '../screens/PlannerScreen';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

/** Slot giữa chỉ để giữ chỗ cho nút Tạo mới — không có màn hình thật. */
function EmptyCreate() {
  const Colors = useColors();
  return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
}

export default function RootTabs() {
  const Colors = useColors();
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.bg },
      }}
    >
      <Tab.Screen name="Kanban" component={PlannerScreen} />
      <Tab.Screen name="Deadline" component={DeadlineScreen} />
      <Tab.Screen
        name="CreatePlaceholder"
        component={EmptyCreate}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Menu" component={MenuScreen} />
    </Tab.Navigator>
  );
}
