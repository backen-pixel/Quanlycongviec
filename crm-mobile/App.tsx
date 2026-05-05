import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { CrmCompanyFilterProvider } from './src/context/CrmCompanyFilterContext';
import { NotificationProvider } from './src/context/NotificationContext';
import PermissionBootstrap from './src/components/PermissionBootstrap';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import GlobalNotificationToast from './src/components/GlobalNotificationToast';
import ChatNotificationToast from './src/components/ChatNotificationToast';
import FloatingChatBubble from './src/components/FloatingChatBubble';
import SystemBubbleSync from './src/components/SystemBubbleSync';
import { CrmColors } from './src/theme/crmTheme';
import { useCrmAndroidSystemUi } from './src/lib/useCrmAndroidSystemUi';
import { setupNotificationChannels } from './src/lib/appPermissions';

// Khởi tạo channels ngay khi module load (trước khi App render)
void setupNotificationChannels();

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

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CrmCompanyFilterProvider>
        <PermissionBootstrap />
        <NotificationProvider>
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
            </View>
            <StatusBar style="dark" />
          </NavigationContainer>
        </NotificationProvider>
        </CrmCompanyFilterProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
