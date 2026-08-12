import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import RootTabs from './RootTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Stack screens dùng getComponent — chỉ nạp JS khi điều hướng tới,
 * giảm parse/eval lúc cold start (Overview paint sớm hơn).
 */
export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={RootTabs} />
      <Stack.Screen
        name="Planner"
        getComponent={() => require('../screens/MyDealsScreen').default}
      />
      <Stack.Screen
        name="CrmHub"
        getComponent={() => require('../screens/CrmHubScreen').default}
      />
      <Stack.Screen
        name="LeadDealDetail"
        getComponent={() => require('../screens/LeadDealDetailScreen').default}
      />
      <Stack.Screen
        name="ChatDetail"
        getComponent={() => require('../screens/ChatDetailScreen').default}
      />
      <Stack.Screen
        name="BubbleChat"
        getComponent={() => require('../screens/BubbleChatScreen').default}
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="MessengerForward"
        getComponent={() => require('../screens/MessengerForwardScreen').default}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="ChatDetailInfo"
        getComponent={() => require('../screens/ChatDetailInfoScreen').default}
      />
      <Stack.Screen
        name="CreateGroupChat"
        getComponent={() => require('../screens/CreateGroupChatScreen').default}
      />
      <Stack.Screen
        name="CreateEntity"
        getComponent={() => require('../screens/CreateEntityScreen').default}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Recordings"
        getComponent={() => require('../screens/RecordingsScreen').default}
      />
      <Stack.Screen
        name="VoiceLocalRecordings"
        getComponent={() => require('../screens/VoiceLocalRecordingsScreen').default}
      />
      <Stack.Screen
        name="Drive"
        getComponent={() => require('../screens/DriveScreen').default}
      />
      <Stack.Screen
        name="Settings"
        getComponent={() => require('../screens/SettingsScreen').default}
      />
      <Stack.Screen
        name="Menu"
        getComponent={() => require('../screens/MenuScreen').default}
      />
      <Stack.Screen
        name="Notifications"
        getComponent={() => require('../screens/NotificationsScreen').default}
      />
      <Stack.Screen
        name="Events"
        getComponent={() => require('../screens/EventsScreen').default}
      />
      <Stack.Screen
        name="Leaves"
        getComponent={() => require('../screens/LeavesScreen').default}
      />
      <Stack.Screen
        name="Quotations"
        getComponent={() => require('../screens/QuotationsScreen').default}
      />
      <Stack.Screen
        name="Orders"
        getComponent={() => require('../screens/OrdersScreen').default}
      />
      <Stack.Screen
        name="Products"
        getComponent={() => require('../screens/ProductsScreen').default}
      />
      <Stack.Screen
        name="Customers"
        getComponent={() => require('../screens/CustomersScreen').default}
      />
      <Stack.Screen
        name="Tasks"
        getComponent={() => require('../screens/TasksScreen').default}
      />
      <Stack.Screen
        name="Account"
        getComponent={() => require('../screens/AccountScreen').default}
      />
      <Stack.Screen
        name="Devices"
        getComponent={() => require('../screens/DevicesScreen').default}
      />
      <Stack.Screen
        name="QrScan"
        getComponent={() => require('../screens/QrScanScreen').default}
      />
      <Stack.Screen
        name="EmployeeReport"
        getComponent={() => require('../screens/EmployeeReportScreen').default}
      />
      <Stack.Screen
        name="EmployeeReportDetail"
        getComponent={() => require('../screens/EmployeeReportDetailScreen').default}
      />
    </Stack.Navigator>
  );
}
