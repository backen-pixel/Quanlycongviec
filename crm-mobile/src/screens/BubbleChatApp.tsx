/**
 * Root component cho BubbleChatActivity (Android Bubbles API).
 * Render độc lập — không có tab bar, không có full app navigation.
 * Đăng ký tên "BubbleChatApp" trong index.ts.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, NativeModules, Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import MessengerGroupChatScreen from './MessengerGroupChatScreen';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator();

function BubbleChatContent() {
  const [groupId, setGroupId] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setReady(true);
      return;
    }
    const mod = NativeModules.FloatingBubbleOverlay as
      | { consumePendingGroup?: () => Promise<string | null> }
      | undefined;
    mod
      ?.consumePendingGroup?.()
      .then((gid) => {
        if (gid) setGroupId(gid);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="BubbleChatMain">
          {() => (
            <MessengerGroupChatScreen
              overrideGroupId={groupId}
              overrideFromBubble
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function BubbleChatApp() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <BubbleChatContent />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: CrmColors.pageBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
