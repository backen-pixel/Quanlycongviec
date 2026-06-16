import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import ChatDetailInfoScreen from '../screens/ChatDetailInfoScreen';
import CreateGroupChatScreen from '../screens/CreateGroupChatScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import MessengerForwardScreen from '../screens/MessengerForwardScreen';
import CreateEntityScreen from '../screens/CreateEntityScreen';
import CrmHubScreen from '../screens/CrmHubScreen';
import DriveScreen from '../screens/DriveScreen';
import EventsScreen from '../screens/EventsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OrdersScreen from '../screens/OrdersScreen';
import CustomersScreen from '../screens/CustomersScreen';
import TasksScreen from '../screens/TasksScreen';
import AccountScreen from '../screens/AccountScreen';
import DevicesScreen from '../screens/DevicesScreen';
import ProductsScreen from '../screens/ProductsScreen';
import QuotationsScreen from '../screens/QuotationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
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
        name="MessengerForward"
        component={MessengerForwardScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="ChatDetailInfo" component={ChatDetailInfoScreen} />
      <Stack.Screen name="CreateGroupChat" component={CreateGroupChatScreen} />
      <Stack.Screen
        name="CreateEntity"
        component={CreateEntityScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="VoiceLocalRecordings" component={VoiceLocalRecordingsScreen} />
      <Stack.Screen name="Drive" component={DriveScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="Quotations" component={QuotationsScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="Tasks" component={TasksScreen} />
      <Stack.Screen name="Account" component={AccountScreen} />
      <Stack.Screen name="Devices" component={DevicesScreen} />
    </Stack.Navigator>
  );
}
