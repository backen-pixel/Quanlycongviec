import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import MessengerGroupChatScreen from './MessengerGroupChatScreen';
import { CrmColors } from '../theme/crmTheme';

type R = RouteProp<RootStackParamList, 'BubbleChat'>;

/**
 * Chat screen mở từ bubble overlay (root stack — không có bottom tab bar).
 * Back → moveTaskToBack (quay về app đang chạy), giống Zalo.
 * Nhúng MessengerGroupChatScreen qua props thay vì useRoute để tránh conflict params.
 */
export default function BubbleChatScreen() {
  const { params } = useRoute<R>();

  return (
    <View style={styles.root}>
      <MessengerGroupChatScreen
        overrideGroupId={params.groupId}
        overrideTitle={params.title}
        overrideFromBubble
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CrmColors.pageBg },
});
