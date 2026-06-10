import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PushNotificationBridge from './src/components/PushNotificationBridge';
import CallNotificationBridge from './src/components/call/CallNotificationBridge';
import CallOverlay from './src/components/call/CallOverlay';
import SystemBubbleSync from './src/components/SystemBubbleSync';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider } from './src/context/AuthContext';
import { CallProvider } from './src/context/CallContext';
import { MessengerProvider } from './src/context/MessengerContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { setupNotificationChannels } from './src/lib/notificationChannels';
import { checkAndApplyOtaUpdate } from './src/lib/otaUpdate';
import { navigationRef } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation/RootNavigator';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;

function AppShell() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    void setupNotificationChannels();
    void checkAndApplyOtaUpdate();
  }, []);

  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        background: colors.bg,
        card: colors.bgElevated,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
      },
    }),
    [colors, isDark],
  );

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <RootNavigator />
      <CallOverlay />
      <CallNotificationBridge />
      <SystemBubbleSync />
      <PushNotificationBridge />
      <UpdateGate />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <MessengerProvider>
              <CallProvider>
                <AppShell />
              </CallProvider>
            </MessengerProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
