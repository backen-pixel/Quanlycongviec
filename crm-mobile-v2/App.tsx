import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreateMenuSheet from './src/components/CreateMenuSheet';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CreateMenuProvider } from './src/context/CreateMenuContext';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import LoginScreen from './src/screens/LoginScreen';
import { Colors } from './src/theme';

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.bg,
    card: Colors.bgElevated,
    text: Colors.text,
    border: Colors.border,
    primary: Colors.blue,
  },
};

function Gate() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.blue} size="large" />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.root}>
        <LoginScreen />
      </View>
    );
  }

  return (
    <CreateMenuProvider>
      <View style={styles.root}>
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        <CreateMenuSheet />
      </View>
    </CreateMenuProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
        <UpdateGate />
        <StatusBar style="light" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
});
