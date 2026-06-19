import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import ChatDetailScreen from './ChatDetailScreen';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type BubbleProps = NativeStackScreenProps<RootStackParamList, 'BubbleChat'>;
type ChatProps = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

/**
 * Chat mở từ bong bóng overlay — không qua tab bar.
 * Back → thu nhỏ app (giống Zalo), quay lại app đang dùng trước đó.
 */
export default function BubbleChatScreen({ navigation, route }: BubbleProps) {
  const { colors } = useTheme();
  const { threadId, title } = route.params;
  const chatRoute: ChatProps['route'] = {
    key: route.key,
    name: 'ChatDetail',
    params: { threadId, title, fromBubble: true },
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ChatDetailScreen
        navigation={navigation as unknown as ChatProps['navigation']}
        route={chatRoute}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
