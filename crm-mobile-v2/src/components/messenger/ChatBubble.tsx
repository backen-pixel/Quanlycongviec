import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { getMessengerColors } from '../../lib/messengerTheme';
import type { ChatMessage } from '../../types/messenger';

type Props = {
  message: ChatMessage;
};

export default function ChatBubble({ message }: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          marginBottom: 10,
          justifyContent: message.mine ? 'flex-end' : 'flex-start',
        },
        col: { maxWidth: '82%' },
        bubble: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 18,
          borderBottomRightRadius: message.mine ? 4 : 18,
          borderBottomLeftRadius: message.mine ? 18 : 4,
          backgroundColor: message.mine ? mc.bubbleOut : mc.bubbleIn,
          borderWidth: message.mine ? 0 : 1,
          borderColor: mc.bubbleInBorder,
        },
        text: {
          color: message.mine ? '#FFFFFF' : colors.text,
          fontSize: 15,
          lineHeight: 21,
        },
        meta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 4,
          alignSelf: message.mine ? 'flex-end' : 'flex-start',
        },
        time: { color: colors.textFaint, fontSize: 11 },
      }),
    [colors, mc, message.mine],
  );

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <View style={styles.bubble}>
          <Text style={styles.text}>{message.text}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.time}>{message.time}</Text>
          {message.mine && message.read ? (
            <Ionicons name="checkmark-done" size={14} color={mc.accent} />
          ) : null}
        </View>
      </View>
    </View>
  );
}
