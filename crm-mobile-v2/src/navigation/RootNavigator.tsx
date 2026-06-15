import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import CreateEntityScreen from '../screens/CreateEntityScreen';
import CrmHubScreen from '../screens/CrmHubScreen';
import VoiceLocalRecordingsScreen from '../screens/VoiceLocalRecordingsScreen';
import RootTabs from './RootTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={RootTabs} />
      <Stack.Screen name="CrmHub" component={CrmHubScreen} />
      <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
      <Stack.Screen
        name="CreateEntity"
        component={CreateEntityScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="VoiceLocalRecordings" component={VoiceLocalRecordingsScreen} />
    </Stack.Navigator>
  );
}
