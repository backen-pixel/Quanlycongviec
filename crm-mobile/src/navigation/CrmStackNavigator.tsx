import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LeadListScreen from '../screens/LeadListScreen';
import LeadDetailScreen from '../screens/LeadDetailScreen';
import type { CrmStackParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator<CrmStackParamList>();

export default function CrmStackNavigator() {
  return (
    <Stack.Navigator
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
      <Stack.Screen
        name="LeadList"
        component={LeadListScreen}
        options={{
          title: 'CRM',
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
