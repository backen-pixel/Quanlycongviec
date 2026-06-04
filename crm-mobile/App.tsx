import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/context/AuthContext';
import { setupNotificationChannels } from './src/lib/notificationChannels';
import { setupIncomingCallNotificationCategories } from './src/lib/incomingCallNotifications';

// Hiện notification ngay cả khi app foreground (kể cả tin chat).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
import { CrmCompanyFilterProvider } from './src/context/CrmCompanyFilterContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { CallProvider } from './src/context/CallContext';
import CallOverlay from './src/components/call/CallOverlay';
import CallNotificationBridge from './src/components/call/CallNotificationBridge';
import PermissionBootstrap from './src/components/PermissionBootstrap';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import GlobalNotificationToast from './src/components/GlobalNotificationToast';
import ChatNotificationToast from './src/components/ChatNotificationToast';
import FloatingChatBubble from './src/components/FloatingChatBubble';
import SystemBubbleSync from './src/components/SystemBubbleSync';
import { CrmColors } from './src/theme/crmTheme';
import { useCrmAndroidSystemUi } from './src/lib/useCrmAndroidSystemUi';

const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: CrmColors.pageBg,
    card: CrmColors.white,
    text: CrmColors.gray900,
    border: CrmColors.gray200,
    primary: CrmColors.blue600,
  },
};

export default function App() {
  useCrmAndroidSystemUi();
  useEffect(() => {
    void setupNotificationChannels();
    void setupIncomingCallNotificationCategories();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CrmCompanyFilterProvider>
        <PermissionBootstrap />
        <NotificationProvider>
          <CallProvider>
          <NavigationContainer ref={navigationRef} theme={NavTheme}>
            {/* Nền full màn — tránh khe đen đáy (KeyboardAvoidingView/Android). */}
            <View style={{ flex: 1, backgroundColor: CrmColors.pageBg }}>
              {/* Android: chỉ dùng windowSoftInputMode=adjustResize — bọc KAV root hay làm keyboard che ô nhập */}
              {Platform.OS === 'ios' ? (
                <KeyboardAvoidingView
                  style={{ flex: 1, backgroundColor: CrmColors.pageBg }}
                  behavior="padding"
                  keyboardVerticalOffset={0}
                >
                  <RootNavigator />
                </KeyboardAvoidingView>
              ) : (
                <View style={{ flex: 1, backgroundColor: CrmColors.pageBg }}>
                  <RootNavigator />
                </View>
              )}
              <GlobalNotificationToast />
              <ChatNotificationToast />
              <SystemBubbleSync />
              <FloatingChatBubble />
              <CallOverlay />
              <CallNotificationBridge />
            </View>
            <StatusBar style="dark" />
          </NavigationContainer>
          </CallProvider>
        </NotificationProvider>
        </CrmCompanyFilterProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
