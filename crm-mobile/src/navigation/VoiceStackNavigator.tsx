import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import VoiceRecordingsScreen from '../screens/VoiceRecordingsScreen';
import type { VoiceStackParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator<VoiceStackParamList>();

export default function VoiceStackNavigator() {
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
        name="VoiceRecordingsList"
        component={VoiceRecordingsScreen}
        options={{ title: 'Ghi âm CRM' }}
      />
    </Stack.Navigator>
  );
}
