import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AndroidBackGuard from './src/components/AndroidBackGuard';
import BootSplash from './src/components/BootSplash';
import CreateMenuSheet from './src/components/CreateMenuSheet';
import BubbleChatOverlayLauncher from './src/components/BubbleChatOverlayLauncher';
import BubbleOutboundCallHandler from './src/components/BubbleOutboundCallHandler';
import SystemBubbleSync from './src/components/SystemBubbleSync';
import PermissionBootstrap from './src/components/PermissionBootstrap';
import DeadlineOverdueRunner from './src/components/DeadlineOverdueRunner';
import VoiceSyncRunner from './src/components/VoiceSyncRunner';
import VoiceShareHandler, { VoiceShareLoginHint } from './src/components/VoiceShareHandler';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { FileActionsProvider } from './src/context/FileActionsContext';
import { MediaPreviewProvider } from './src/context/MediaPreviewContext';
import { CallProvider } from './src/context/CallContext';
import { CreateMenuProvider } from './src/context/CreateMenuContext';
import { CrmRealtimeProvider } from './src/context/CrmRealtimeProvider';
import { MessengerProvider } from './src/context/MessengerContext';
import { MessengerRealtimeProvider } from './src/context/MessengerRealtimeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef, resetToBubbleChat } from './src/navigation/navigationRef';
import LoginScreen from './src/screens/LoginScreen';
import { ThemeProvider, useColors, useTheme, type ThemeColors } from './src/theme';
import { CALLING_ENABLED } from './src/config';
import {
  getBubbleChatInitialNavState,
  isBubbleChatNavState,
} from './src/lib/bubbleNavInitialState';
import { hasPendingBubbleChat, peekPendingBubbleChatSync } from './src/lib/bubbleChatPending';

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
  const bubbleInitialState = useMemo(() => getBubbleChatInitialNavState(), []);
  const [bubbleOverlayUi, setBubbleOverlayUi] = useState(
    () => isBubbleChatNavState(bubbleInitialState) || hasPendingBubbleChat(),
  );
  const [navReady, setNavReady] = useState(false);
  const bubbleBoot = bubbleOverlayUi || hasPendingBubbleChat();
  const showBootSplash = loading || (!!token && !navReady);

  useEffect(() => {
    if (!token || loading) return undefined;
    if (!hasPendingBubbleChat()) return undefined;

    const open = () => {
      const pending = peekPendingBubbleChatSync();
      if (!pending?.threadId || !navigationRef.isReady()) return;
      resetToBubbleChat(pending.threadId, pending.title);
    };

    if (navigationRef.isReady()) {
      open();
      return undefined;
    }

    const started = Date.now();
    const timer = setInterval(() => {
      if (navigationRef.isReady()) {
        clearInterval(timer);
        open();
      } else if (Date.now() - started > 15000) {
        clearInterval(timer);
      }
    }, 40);

    return () => clearInterval(timer);
  }, [token, loading]);

  useEffect(() => {
    if (!navigationRef.isReady()) return undefined;
    const sync = () => {
      const route = navigationRef.getCurrentRoute();
      setBubbleOverlayUi(route?.name === 'BubbleChat');
    };
    sync();
    return navigationRef.addListener('state', sync);
  }, [token, loading]);

  useEffect(() => {
    if (!token) setNavReady(false);
  }, [token]);

  if (!loading && !token) {
    return (
      <View style={styles.root}>
        <LoginScreen />
        <VoiceShareLoginHint />
      </View>
    );
  }

  if (loading || !token) {
    return (
      <View style={[styles.root, bubbleBoot && styles.rootTransparent]}>
        <BootSplash
          visible
          transparent={bubbleBoot}
          hint={loading ? 'Đang khôi phục phiên…' : 'Đang mở ứng dụng…'}
        />
      </View>
    );
  }

  return (
    <CreateMenuProvider>
      <MessengerRealtimeProvider>
        <CrmRealtimeProvider>
        <MessengerProvider>
          <CallProvider>
            <MediaPreviewProvider>
            <FileActionsProvider>
            <View style={[styles.root, bubbleOverlayUi && styles.rootTransparent]}>
              <NavigationContainer
                ref={navigationRef}
                theme={navTheme}
                initialState={bubbleInitialState}
                onReady={() => setNavReady(true)}
              >
                <RootNavigator />
                <AndroidBackGuard />
              </NavigationContainer>
              <CreateMenuSheet />
              <PermissionBootstrap />
              <SystemBubbleSync />
              <BubbleChatOverlayLauncher />
              {CALLING_ENABLED ? <BubbleOutboundCallHandler /> : null}
              <VoiceSyncRunner />
              <DeadlineOverdueRunner />
              <BootSplash
                visible={showBootSplash}
                transparent={bubbleBoot}
                hint="Đang tải giao diện…"
              />
            </View>
            </FileActionsProvider>
            </MediaPreviewProvider>
          </CallProvider>
        </MessengerProvider>
        </CrmRealtimeProvider>
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
    rootTransparent: { backgroundColor: 'transparent' },
  });
