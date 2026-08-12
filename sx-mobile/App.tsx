import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootLoadingScreen, { BOOT_BG } from './src/components/BootLoadingScreen';
import BubbleOutboundCallHandler from './src/components/BubbleOutboundCallHandler';
import BubbleChatOverlayLauncher from './src/components/BubbleChatOverlayLauncher';
import OtaBlockingScreen from './src/components/OtaBlockingScreen';
import OtaSuccessNotice from './src/components/OtaSuccessNotice';
import PushNotificationBridge from './src/components/PushNotificationBridge';
import ShareIntentHandler, { ShareLoginHint } from './src/components/ShareIntentHandler';
import { CallScreen, IncomingCallBridge } from './src/calling';
import { CallProvider as MessengerCallProvider } from './src/context/CallContext';
import { FileActionsProvider } from './src/context/FileActionsContext';
import SystemBubbleSync from './src/components/SystemBubbleSync';
import UpdateGate from './src/components/UpdateGate';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MessengerProvider } from './src/context/MessengerContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import {
  getBubbleChatInitialNavState,
  isBubbleChatNavState,
} from './src/lib/bubbleNavInitialState';
import { hasPendingBubbleChat, peekPendingBubbleChatSync } from './src/lib/bubbleChatPending';
import { setupNotificationChannels } from './src/lib/notificationChannels';
import { checkAndApplyOtaUpdate } from './src/lib/otaUpdate';
import { navigationRef, resetToBubbleChat } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation/RootNavigator';

/** Khi app đang mở, socket đã hiện tray local — tắt banner FCM trùng để tránh 2 tiếng. */
const MUTE_FCM_FOREGROUND_TYPES = new Set([
  'comment_added',
  'messenger_chat',
  'workshop_new_deal',
  'project_assigned',
  'project_created',
  'crm_assignment_assigned',
  'crm_assignment_comment',
  'crm_assignment_overdue',
  'crm_assignment_due_soon',
  'crm_task_assigned',
  'crm_task_completed',
]);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data || {}) as Record<string, unknown>;
    const type = String(data.type || '');
    const muteFg =
      AppState.currentState === 'active'
      && (MUTE_FCM_FOREGROUND_TYPES.has(type) || type.startsWith('crm_assignment'));
    return {
      shouldShowBanner: !muteFg,
      shouldShowList: !muteFg,
      shouldPlaySound: !muteFg,
      shouldSetBadge: true,
    };
  },
});

if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;

function AppShell() {
  const { token, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const [otaPhase, setOtaPhase] = useState<'checking' | 'downloading' | 'none'>('checking');
  const bubbleInitialState = useMemo(() => getBubbleChatInitialNavState(), []);
  const [bubbleOverlayUi, setBubbleOverlayUi] = useState(
    () => isBubbleChatNavState(bubbleInitialState) || hasPendingBubbleChat(),
  );
  const [navReady, setNavReady] = useState(false);
  const bubbleBoot = bubbleOverlayUi || hasPendingBubbleChat();
  /** Giống CRM: giữ splash đến khi auth xong + navigation sẵn sàng. */
  const showBootSplash = loading || (!!token && !navReady);

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

  // Chỉ chặn UI khi đang TẢI bản OTA mới. Giai đoạn "checking" chạy nền.
  if (otaPhase === 'downloading') {
    return <OtaBlockingScreen phase={otaPhase} />;
  }

  if (loading) {
    return (
      <View style={[styles.root, bubbleBoot && styles.rootTransparent, { backgroundColor: BOOT_BG }]}>
        <BootLoadingScreen
          visible
          transparent={bubbleBoot}
          hint="Đang khôi phục phiên…"
        />
      </View>
    );
  }

  return (
    <View style={[
      styles.root,
      bubbleOverlayUi ? styles.rootTransparent : { backgroundColor: colors.bg },
    ]}>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        initialState={bubbleInitialState}
        onReady={() => setNavReady(true)}
      >
        <RootNavigator />
        <CallScreen />
        <IncomingCallBridge />
      </NavigationContainer>
      <SystemBubbleSync />
      <BubbleChatOverlayLauncher />
      <BubbleOutboundCallHandler />
      <PushNotificationBridge />
      <OtaSuccessNotice />
      <UpdateGate />
      <ShareIntentHandler enabled={!!token && !loading} />
      {!token && !loading ? <ShareLoginHint /> : null}
      <BootLoadingScreen
        visible={showBootSplash}
        transparent={bubbleBoot}
        hint={token ? 'Đang tải giao diện…' : 'Đang mở ứng dụng…'}
      />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootTransparent: { backgroundColor: 'transparent' },
  appRoot: { flex: 1, backgroundColor: BOOT_BG },
});

export default function App() {
  return (
    <View style={styles.appRoot}>
      <SafeAreaProvider style={styles.appRoot}>
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
                  <MessengerCallProvider>
                    <FileActionsProvider>
                      <AppShell />
                    </FileActionsProvider>
                  </MessengerCallProvider>
                </MessengerProvider>
              </NotificationProvider>
            </AuthProvider>
          </ThemeProvider>
        </ShareIntentProvider>
      </SafeAreaProvider>
    </View>
  );
}
