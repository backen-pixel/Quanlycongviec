import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreHomeScreen from '../screens/MoreHomeScreen';
import CrmEventsScreen from '../screens/CrmEventsScreen';
import FacebookInboxScreen from '../screens/FacebookInboxScreen';
import FacebookChatScreen from '../screens/FacebookChatScreen';
import AutoPipelineStatusScreen from '../screens/AutoPipelineStatusScreen';
import AccountScreen from '../screens/AccountScreen';
import type { MoreStackParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator<MoreStackParamList>();

export default function MoreStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="MoreHome"
      screenOptions={{
        headerStyle: {
          backgroundColor: CrmColors.white,
          borderBottomWidth: 1,
          borderBottomColor: CrmColors.tabBarBorder,
        } as never,
        headerTitleStyle: { fontWeight: '700', color: CrmColors.gray900, fontSize: 17 },
        headerTintColor: CrmColors.blue700,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="MoreHome" component={MoreHomeScreen} options={{ title: 'Menu' }} />
      <Stack.Screen name="CrmEvents" component={CrmEventsScreen} options={{ title: 'Sự kiện CRM' }} />
      <Stack.Screen name="FacebookInbox" component={FacebookInboxScreen} options={{ title: 'Facebook' }} />
      <Stack.Screen name="FacebookChat" component={FacebookChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen
        name="AutoPipelineStatus"
        component={AutoPipelineStatusScreen}
        options={{ title: 'Công cụ tự động' }}
      />
      <Stack.Screen name="AccountSettings" component={AccountScreen} options={{ title: 'Tài khoản' }} />
    </Stack.Navigator>
  );
}
