import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import PermissionBootstrap from './src/components/PermissionBootstrap';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import GlobalNotificationToast from './src/components/GlobalNotificationToast';
import FloatingChatBubble from './src/components/FloatingChatBubble';
import { CrmColors } from './src/theme/crmTheme';

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
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PermissionBootstrap />
        <NotificationProvider>
          <NavigationContainer ref={navigationRef} theme={NavTheme}>
            <View style={{ flex: 1 }}>
              <RootNavigator />
              <GlobalNotificationToast />
              <FloatingChatBubble />
            </View>
            <StatusBar style="dark" />
          </NavigationContainer>
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
