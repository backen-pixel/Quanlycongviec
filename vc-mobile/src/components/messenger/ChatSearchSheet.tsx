import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { messageDisplayText } from '../../lib/messengerPreview';
import { formatMessageTime } from '../../lib/messengerApi';
import { senderDisplayName } from '../../lib/messengerReadReceipts';
import { useTheme } from '../../context/ThemeContext';
import { Radii, Spacing } from '../../theme';
import type { MessengerMessage } from '../../types/messenger';

type Props = {
  visible: boolean;
  messages: MessengerMessage[];
  myUserId: string;
  onDismiss: () => void;
  onJumpTo: (messageId: string) => void;
};

export default function ChatSearchSheet({
  visible,
  messages,
  myUserId,
  onDismiss,
  onJumpTo,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => !m.is_system && !m.is_recalled && !m.recalled_at)
      .filter((m) => messageDisplayText(m, myUserId).toLowerCase().includes(q))
      .slice()
      .reverse()
      .slice(0, 50);
  }, [messages, myUserId, query]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.48)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 10,
          maxHeight: '85%',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        handle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: isDark ? '#475569' : colors.border,
          marginBottom: 10,
        },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: Spacing.lg,
          paddingBottom: 10,
        },
        searchWrap: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? colors.card : colors.cardAlt,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 15 },
        row: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
        rowName: { color: colors.primary, fontSize: 13, fontWeight: '700', flex: 1 },
        rowTime: { color: colors.textFaint, fontSize: 11 },
        rowBody: { color: colors.text, fontSize: 14, marginTop: 4 },
        empty: { padding: 24, alignItems: 'center' },
        emptyTxt: { color: colors.textMuted, fontSize: 14 },
        list: { paddingBottom: Math.max(insets.bottom, 12) },
      }),
    [colors, isDark, insets.bottom],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tin nhắn..."
                placeholderTextColor={colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={6}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={onDismiss} hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Huỷ</Text>
            </Pressable>
          </View>

          <FlatList
            style={styles.list}
            data={results}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              query.trim() ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTxt}>Không tìm thấy tin nhắn</Text>
                </View>
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTxt}>Nhập từ khóa để tìm</Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const mine = String(item.user_id) === String(myUserId);
              const body = messageDisplayText(item, myUserId);
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onDismiss();
                    onJumpTo(item.id);
                  }}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {mine ? 'Bạn' : senderDisplayName(item)}
                    </Text>
                    <Text style={styles.rowTime}>{formatMessageTime(item.created_at)}</Text>
                  </View>
                  <Text style={styles.rowBody} numberOfLines={2}>{body}</Text>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
