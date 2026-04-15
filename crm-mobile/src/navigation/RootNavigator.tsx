import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
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
      }}
    >
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      )}
    </Stack.Navigator>
  );
}
