import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { enableScreens } from 'react-native-screens';
import CustomTabBar from '../components/CustomTabBar';
import OverviewScreen from '../screens/OverviewScreen';
import { useColors } from '../theme';
import type { TabParamList } from './types';

enableScreens(true);

const Tab = createBottomTabNavigator<TabParamList>();

export default function RootTabs() {
  const Colors = useColors();

  return (
    <Tab.Navigator
      initialRouteName="Overview"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.bg },
        freezeOnBlur: true,
        lazy: true,
      }}
      detachInactiveScreens
    >
      <Tab.Screen name="Overview" component={OverviewScreen} />
      <Tab.Screen
        name="Lead"
        getComponent={() => require('../screens/LeadTabScreen').default}
      />
      <Tab.Screen
        name="Deal"
        getComponent={() => require('../screens/DealTabScreen').default}
      />
      <Tab.Screen
        name="Deadline"
        getComponent={() => require('../screens/DeadlineScreen').default}
      />
      <Tab.Screen
        name="Messages"
        getComponent={() => require('../screens/MessagesScreen').default}
      />
    </Tab.Navigator>
  );
}
