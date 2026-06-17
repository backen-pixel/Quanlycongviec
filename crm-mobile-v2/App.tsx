import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreateMenuSheet from './src/components/CreateMenuSheet';
import PermissionBootstrap from './src/components/PermissionBootstrap';
import VoiceSyncRunner from './src/components/VoiceSyncRunner';
import VoiceShareHandler, { VoiceShareLoginHint } from './src/components/VoiceShareHandler';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { FileActionsProvider } from './src/context/FileActionsContext';
import { CallProvider } from './src/context/CallContext';
import { CreateMenuProvider } from './src/context/CreateMenuContext';
import { MessengerProvider } from './src/context/MessengerContext';
import { MessengerRealtimeProvider } from './src/context/MessengerRealtimeContext';
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
        <VoiceShareLoginHint />
      </View>
    );
  }

  return (
    <CreateMenuProvider>
      <MessengerRealtimeProvider>
        <MessengerProvider>
          <CallProvider>
            <FileActionsProvider>
            <View style={styles.root}>
              <NavigationContainer ref={navigationRef} theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
              <CreateMenuSheet />
              <PermissionBootstrap />
              <VoiceSyncRunner />
            </View>
            </FileActionsProvider>
          </CallProvider>
        </MessengerProvider>
      </MessengerRealtimeProvider>
    </CreateMenuProvider>
  );
}

function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />;
}

function AppBody() {
  const { token, loading } = useAuth();
  return (
    <>
      <Gate />
      <VoiceShareHandler enabled={!!token && !loading} />
      <UpdateGate />
      <ThemedStatusBar />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ShareIntentProvider
        options={{
          resetOnBackground: false,
          disabled: Platform.OS !== 'android',
        }}
      >
        <ThemeProvider>
          <AuthProvider>
            <AppBody />
          </AuthProvider>
        </ThemeProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
  });
