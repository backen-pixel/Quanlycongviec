import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Overlay } from '../lib/floatingBubbleOverlay';
import { consumeBubbleChatPendingAfterMount } from '../components/BubbleChatOverlayLauncher';
import { useTheme } from '../context/ThemeContext';

type BubbleProps = NativeStackScreenProps<RootStackParamList, 'BubbleChat'>;
type ChatProps = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

/** Vùng trên cùng để bong bóng overlay vẫn hiện (status bar + bubble ~58dp + lề). */
const BUBBLE_STRIP_EXTRA = 58 + 10;

/**
 * Chat mở từ bong bóng — full ChatDetailScreen trên nền trong suốt (không “nhảy” vào tab app).
 */
export default function BubbleChatScreen({ navigation, route }: BubbleProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { threadId, title } = route.params;
  const topGap = insets.top + BUBBLE_STRIP_EXTRA;

  const chatRoute: ChatProps['route'] = {
    key: route.key,
    name: 'ChatDetail',
    params: { threadId, title, fromBubble: true },
  };

  useEffect(() => {
    consumeBubbleChatPendingAfterMount();
  }, []);

  const minimize = useCallback(() => {
    try {
      Overlay?.minimizeApp?.();
    } catch {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        style={[styles.backdrop, { height: topGap }]}
        onPress={minimize}
        accessibilityRole="button"
        accessibilityLabel="Thu nhỏ chat"
      />
      <Pressable style={styles.scrim} onPress={minimize} accessibilityLabel="Đóng chat" />
      <View style={[styles.sheet, { marginTop: topGap, backgroundColor: colors.bg }]}>
        <ChatDetailScreen
          navigation={navigation as unknown as ChatProps['navigation']}
          route={chatRoute}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 0,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    zIndex: 1,
  },
});
