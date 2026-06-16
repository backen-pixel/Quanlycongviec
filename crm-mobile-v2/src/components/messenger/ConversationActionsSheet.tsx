import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../Avatar';
import { useTheme } from '../../theme';
import { avatarColorFromName } from '../../lib/messengerTheme';
import { Radii, Spacing } from '../../theme';
import type { MessengerThread } from '../../types/messenger';

type ActionKey = 'createGroup' | 'delete';

type Props = {
  visible: boolean;
  thread: MessengerThread | null;
  onDismiss: () => void;
  onAction: (action: ActionKey, thread: MessengerThread) => void;
};

export default function ConversationActionsSheet({
  visible,
  thread,
  onDismiss,
  onAction,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

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
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        handle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: isDark ? '#475569' : colors.border,
          marginBottom: 14,
        },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 14,
          marginBottom: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        headBody: { flex: 1, minWidth: 0 },
        headName: { color: colors.text, fontSize: 16, fontWeight: '800' },
        headSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
        actionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 13,
        },
        actionIconWrap: {
          width: 42,
          height: 42,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionBody: { flex: 1, minWidth: 0 },
        actionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
        actionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginVertical: 4,
        },
        cancelBtn: {
          marginTop: 12,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
        },
        cancelTxt: { color: colors.text, fontSize: 15, fontWeight: '700' },
      }),
    [colors, isDark, insets.bottom],
  );

  if (!thread) return null;

  const isDirect = thread.isDirect ?? !thread.isGroup;
  const color = thread.avatarColor || avatarColorFromName(thread.name);

  const actions: Array<{
    key: ActionKey;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    iconBg: string;
    title: string;
    sub: string;
    hidden?: boolean;
  }> = [
    {
      key: 'createGroup',
      icon: 'people-outline',
      tint: '#2563EB',
      iconBg: isDark ? '#1E3A5F' : '#EFF6FF',
      title: 'Tạo nhóm chat với người này',
      sub: 'Thêm thành viên khác vào nhóm mới',
      hidden: !isDirect,
    },
    {
      key: 'delete',
      icon: 'trash-outline',
      tint: '#DC2626',
      iconBg: isDark ? '#450A0A' : '#FEF2F2',
      title: 'Xóa cuộc hội thoại',
      sub: 'Ẩn khỏi danh sách tin nhắn',
    },
  ].filter((a) => !a.hidden) as Array<{
    key: ActionKey;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    iconBg: string;
    title: string;
    sub: string;
  }>;

  const run = (key: ActionKey) => {
    onDismiss();
    onAction(key, thread);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.head}>
            <Avatar name={thread.name} size={44} color={color} avatarUrl={thread.avatarUrl} />
            <View style={styles.headBody}>
              <Text style={styles.headName} numberOfLines={1}>{thread.name}</Text>
              <Text style={styles.headSub} numberOfLines={1}>
                {isDirect ? 'Chat trực tiếp' : 'Nhóm chat'}
              </Text>
            </View>
          </View>

          {actions.map((act, idx) => (
            <React.Fragment key={act.key}>
              {idx > 0 ? <View style={styles.divider} /> : null}
              <Pressable style={styles.actionRow} onPress={() => run(act.key)}>
                <View style={[styles.actionIconWrap, { backgroundColor: act.iconBg }]}>
                  <Ionicons name={act.icon} size={22} color={act.tint} />
                </View>
                <View style={styles.actionBody}>
                  <Text style={styles.actionTitle}>{act.title}</Text>
                  <Text style={styles.actionSub}>{act.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            </React.Fragment>
          ))}

          <Pressable style={styles.cancelBtn} onPress={onDismiss}>
            <Text style={styles.cancelTxt}>Huỷ</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
