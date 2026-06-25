import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../Avatar';
import { useTheme } from '../../context/ThemeContext';
import { formatReadTime, type MessageViewer } from '../../lib/messengerReadReceipts';
import { avatarColorFromName, getMessengerColors } from '../../lib/messengerTheme';
import { Radii, Spacing } from '../../theme';

type Props = {
  visible: boolean;
  viewers: MessageViewer[];
  onDismiss: () => void;
};

export default function MessageSeenSheet({ visible, viewers, onDismiss }: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
        },
        sheet: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          paddingBottom: Math.max(insets.bottom, 16),
          maxHeight: '70%',
        },
        handle: {
          alignSelf: 'center',
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginTop: 10,
          marginBottom: 8,
        },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        title: { color: colors.text, fontSize: 16, fontWeight: '800' },
        sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        closeBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
        },
        rowBody: { flex: 1, minWidth: 0 },
        rowName: { color: colors.text, fontSize: 15, fontWeight: '700' },
        rowTime: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        empty: {
          textAlign: 'center',
          color: colors.textFaint,
          paddingVertical: 32,
          paddingHorizontal: 24,
        },
      }),
    [colors, isDark, insets.bottom],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <View>
            <Text style={styles.title}>Đã xem tin nhắn</Text>
            <Text style={styles.sub}>
              {viewers.length ? `${viewers.length} người` : 'Chưa ai xem'}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {viewers.length === 0 ? (
          <Text style={styles.empty}>Tin nhắn chưa được ai trong nhóm xem.</Text>
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Avatar
                  name={item.name}
                  size={40}
                  color={avatarColorFromName(item.name)}
                  avatarUrl={item.avatar}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowTime}>Xem lúc {formatReadTime(item.readAt)}</Text>
                </View>
                <Ionicons name="checkmark-done" size={18} color={mc.accent} />
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
