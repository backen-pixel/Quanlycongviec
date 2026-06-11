import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import ChatDetailInfoScreen from '../screens/ChatDetailInfoScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import MessengerForwardScreen from '../screens/MessengerForwardScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import UpdateFromServerScreen from '../screens/UpdateFromServerScreen';
import MainTabs from './MainTabs';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  ProjectDetail: { projectId: string };
  Messages: { tab?: 'chats' | 'calls' } | undefined;
  ChatDetail: { threadId: string; title: string };
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
    messagesJson: string;
  };
  UpdateFromServer: undefined;
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
            name="UpdateFromServer"
            component={UpdateFromServerScreen}
            options={{ animation: 'slide_from_right' }}
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
