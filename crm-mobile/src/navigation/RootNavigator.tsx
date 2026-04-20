import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
import BubbleChatScreen from '../screens/BubbleChatScreen';
import type { RootStackParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CrmColors.pageBg }}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={token ? 'app' : 'auth'}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: CrmColors.pageBg },
      }}
    >
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          {/* BubbleChat: mở chat từ bubble ngoài app — không có tab bar */}
          <Stack.Screen
            name="BubbleChat"
            component={BubbleChatScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
