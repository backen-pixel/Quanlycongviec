import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import ChatDetailInfoScreen from '../screens/ChatDetailInfoScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import MessengerForwardScreen from '../screens/MessengerForwardScreen';
import CreateGroupChatScreen from '../screens/CreateGroupChatScreen';
import ShareToChatScreen from '../screens/ShareToChatScreen';
import BubbleChatScreen from '../screens/BubbleChatScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import UpdateFromServerScreen from '../screens/UpdateFromServerScreen';
import OverdueProjectsScreen from '../screens/OverdueProjectsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LeavesScreen from '../screens/LeavesScreen';
import EventsScreen from '../screens/EventsScreen';
import MainTabs, { type MainTabParamList } from './MainTabs';

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ProjectDetail: {
    projectId: string;
    focusTaskId?: string | null;
    initialTab?: 'tasks' | 'shared-workspace' | 'comments' | 'documents' | 'drive' | 'info' | 'team' | 'schedule' | null;
  };
  OverdueProjects: undefined;
  Settings: undefined;
  Leaves: undefined;
  Events: undefined;
  Messages: { tab?: 'chats' | 'calls' } | undefined;
  ChatDetail: {
    threadId: string;
    title: string;
    peerId?: string | null;
    openSearch?: boolean;
    fromBubble?: boolean;
  };
  BubbleChat: { threadId: string; title: string };
  CreateGroupChat: {
    preselectedUserIds?: string[];
    suggestedName?: string;
  };
  MessengerForward: {
    excludeGroupId: string;
    sourceTitle: string;
    messagesJson: string;
  };
  ChatDetailInfo: {
    threadId: string;
    title: string;
    avatarColor?: string;
    avatarUrl?: string | null;
    isDirect?: boolean;
    peerId?: string | null;
    messagesJson: string;
  };
  UpdateFromServer: undefined;
  ShareToChat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { token, loading } = useAuth();
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.bg } }),
    [colors.bg],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator key={token ? 'app' : 'auth'} screenOptions={screenOptions}>
      {token ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="ProjectDetail"
            component={ProjectDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="OverdueProjects"
            component={OverdueProjectsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Messages"
            component={MessagesScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="ChatDetail"
            component={ChatDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="BubbleChat"
            component={BubbleChatScreen}
            options={{
              presentation: 'transparentModal',
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="MessengerForward"
            component={MessengerForwardScreen}
            options={{ animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="ChatDetailInfo"
            component={ChatDetailInfoScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="CreateGroupChat"
            component={CreateGroupChatScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="UpdateFromServer"
            component={UpdateFromServerScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Leaves"
            component={LeavesScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Events"
            component={EventsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="ShareToChat"
            component={ShareToChatScreen}
            options={{ animation: 'slide_from_bottom' }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
