import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MessengerGroupListScreen from '../screens/MessengerGroupListScreen';
import MessengerGroupChatScreen from '../screens/MessengerGroupChatScreen';
import MessengerComposeScreen from '../screens/MessengerComposeScreen';
import MessengerAddMembersScreen from '../screens/MessengerAddMembersScreen';
import MessengerForwardScreen from '../screens/MessengerForwardScreen';
import type { MessengerStackParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator<MessengerStackParamList>();

/**
 * Stack riêng cho tab "Tin nhắn" trên bottom tab bar.
 * Các màn hình messenger được khai báo trùng tên với MoreStack
 * (LeadMessengerPanel, SystemBubbleSync, notification deep-link… vẫn dùng
 * `MoreTab/MessengerGroupChat`). Tab "Tin nhắn" dùng stack riêng để khi
 * user bấm vào tab, icon được highlight đúng (thay vì lia sang MoreTab).
 */
export default function MessengerStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="MessengerGroupList"
      screenOptions={{
        contentStyle: { backgroundColor: CrmColors.pageBg },
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
        name="MessengerGroupList"
        component={MessengerGroupListScreen}
        options={{ title: 'Tin nhắn' }}
      />
      <Stack.Screen
        name="MessengerGroupChat"
        component={MessengerGroupChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MessengerCompose"
        component={MessengerComposeScreen}
        options={{ title: 'Tạo chat' }}
      />
      <Stack.Screen
        name="MessengerAddMembers"
        component={MessengerAddMembersScreen}
        options={{ title: 'Thêm thành viên' }}
      />
      <Stack.Screen
        name="MessengerForward"
        component={MessengerForwardScreen}
        options={{ title: 'Chuyển tiếp tin' }}
      />
    </Stack.Navigator>
  );
}
