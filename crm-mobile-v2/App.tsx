import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreateMenuSheet from './src/components/CreateMenuSheet';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CreateMenuProvider } from './src/context/CreateMenuContext';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import LoginScreen from './src/screens/LoginScreen';
import { ThemeProvider, useColors, useTheme, type ThemeColors } from './src/theme';

function buildNavTheme(Colors: ThemeColors, mode: 'light' | 'dark'): Theme {
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: Colors.bg,
      card: Colors.bgElevated,
      text: Colors.text,
      border: Colors.border,
      primary: Colors.blue,
    },
  };
}

function Gate() {
  const { token, loading } = useAuth();
  const Colors = useColors();
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const navTheme = useMemo(() => buildNavTheme(Colors, mode), [Colors, mode]);

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

function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Gate />
          <UpdateGate />
          <ThemedStatusBar />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
  });
