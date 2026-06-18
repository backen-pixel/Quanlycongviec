import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OtaBlockingScreen from './src/components/OtaBlockingScreen';
import OtaSuccessNotice from './src/components/OtaSuccessNotice';
import PushNotificationBridge from './src/components/PushNotificationBridge';
import ShareIntentHandler, { ShareLoginHint } from './src/components/ShareIntentHandler';
import { CallProvider, CallScreen, IncomingCallBridge } from './src/calling';
import SystemBubbleSync from './src/components/SystemBubbleSync';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider, useAuth } from './src/context/AuthContext';
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
  const { token, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const [otaPhase, setOtaPhase] = useState<'checking' | 'downloading' | 'none'>('checking');

  useEffect(() => {
    void setupNotificationChannels();
    void (async () => {
      setOtaPhase('checking');
      const applied = await checkAndApplyOtaUpdate({
        onFetching: () => setOtaPhase('downloading'),
      });
      if (!applied) setOtaPhase('none');
    })();
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

  if (otaPhase === 'checking' || otaPhase === 'downloading') {
    return <OtaBlockingScreen phase={otaPhase} />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <RootNavigator />
      <CallScreen />
      <IncomingCallBridge />
      <SystemBubbleSync />
      <PushNotificationBridge />
      <OtaSuccessNotice />
      <UpdateGate />
      <ShareIntentHandler enabled={!!token && !loading} />
      {!token && !loading ? <ShareLoginHint /> : null}
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationContainer>
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
            <NotificationProvider>
              <MessengerProvider>
                <CallProvider>
                  <AppShell />
                </CallProvider>
              </MessengerProvider>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}
