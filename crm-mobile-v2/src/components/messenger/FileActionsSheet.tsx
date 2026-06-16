import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  openMessengerAttachment,
  saveMessengerAttachment,
  type FileActionTarget,
} from '../../lib/messengerFileOpen';
import { getMessengerFileForwardContext } from '../../lib/messengerFileForwardContext';
import { buildForwardMessageFromAttachment } from '../../lib/messengerForward';
import { navigate } from '../../navigation/navigationRef';
import { getFileTypeDescription, getFileTypeMeta, isAudioMimeOrName } from '../../lib/messengerMedia';
import { useTheme } from '../../theme';
import { Radii, Spacing } from '../../theme';

type Props = {
  visible: boolean;
  file: FileActionTarget | null;
  onDismiss: () => void;
};

type ActionRow = {
  key: 'open' | 'download' | 'shareInApp' | 'shareExternal';
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  iconBg: string;
  title: string;
  sub: string;
  onPress: () => void;
};

async function shareExternalAttachment(file: FileActionTarget): Promise<void> {
  const name = file.name?.trim() || 'Tệp đính kèm';
  await Share.share({
    message: `${name}\n${file.url}`,
    title: name,
  });
}

function shareInAppAttachment(file: FileActionTarget): void {
  const ctx = getMessengerFileForwardContext();
  const msg = buildForwardMessageFromAttachment(file.url, {
    name: file.name,
    mime: file.mime,
    sourceTitle: ctx?.sourceTitle,
  });
  navigate('MessengerForward', {
    excludeGroupId: ctx?.excludeGroupId || '',
    sourceTitle: ctx?.sourceTitle || 'Chat',
    messagesJson: JSON.stringify([msg]),
  });
}

export default function FileActionsSheet({ visible, file, onDismiss }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const fileName = file?.name?.trim() || 'Tệp đính kèm';
  const typeLabel = getFileTypeDescription(file?.name, file?.mime);
  const fileMeta = getFileTypeMeta(file?.name, file?.mime || '');
  const isAudio = isAudioMimeOrName(file?.mime, file?.name);

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
        fileHead: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 14,
          marginBottom: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        fileBadge: {
          width: 44,
          height: 44,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fileBadgeLetter: { color: '#fff', fontSize: 18, fontWeight: '900' },
        fileHeadBody: { flex: 1, minWidth: 0 },
        fileName: {
          color: colors.text,
          fontSize: 15,
          fontWeight: '800',
          lineHeight: 20,
        },
        fileType: {
          color: colors.textMuted,
          fontSize: 13,
          marginTop: 3,
        },
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

  if (!file) return null;

  const run = (fn: () => Promise<void> | void) => {
    onDismiss();
    void Promise.resolve(fn()).catch(() => {});
  };

  const actions: ActionRow[] = [
    {
      key: 'open',
      icon: isAudio ? 'play-outline' : 'open-outline',
      tint: '#2563EB',
      iconBg: isDark ? '#1E3A5F' : '#EFF6FF',
      title: isAudio ? 'Phát' : 'Mở',
      sub: isAudio ? 'Nghe tin nhắn thoại' : 'Xem nội dung file',
      onPress: () => run(() => openMessengerAttachment(file.url, file)),
    },
    {
      key: 'download',
      icon: 'download-outline',
      tint: '#059669',
      iconBg: isDark ? '#064E3B' : '#ECFDF5',
      title: 'Tải về',
      sub: 'Lưu vào thiết bị',
      onPress: () => run(() => saveMessengerAttachment(file.url, file)),
    },
    {
      key: 'shareInApp',
      icon: 'people-outline',
      tint: '#2563EB',
      iconBg: isDark ? '#1E3A5F' : '#EFF6FF',
      title: 'Gửi trong app',
      sub: 'Chia sẻ tới hội thoại khác',
      onPress: () => run(() => shareInAppAttachment(file)),
    },
    {
      key: 'shareExternal',
      icon: 'share-social-outline',
      tint: '#7C3AED',
      iconBg: isDark ? '#4C1D95' : '#F5F3FF',
      title: 'Chia sẻ ra ngoài',
      sub: 'Gửi qua ứng dụng khác',
      onPress: () => run(() => shareExternalAttachment(file)),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.fileHead}>
            <View style={[styles.fileBadge, { backgroundColor: fileMeta.bg }]}>
              <Text style={styles.fileBadgeLetter}>{fileMeta.letter}</Text>
            </View>
            <View style={styles.fileHeadBody}>
              <Text style={styles.fileName} numberOfLines={2}>{fileName}</Text>
              <Text style={styles.fileType}>{typeLabel}</Text>
            </View>
          </View>

          {actions.slice(0, 2).map((act) => (
            <Pressable key={act.key} style={styles.actionRow} onPress={act.onPress}>
              <View style={[styles.actionIconWrap, { backgroundColor: act.iconBg }]}>
                <Ionicons name={act.icon} size={22} color={act.tint} />
              </View>
              <View style={styles.actionBody}>
                <Text style={styles.actionTitle}>{act.title}</Text>
                <Text style={styles.actionSub}>{act.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}

          <View style={styles.divider} />

          {actions.slice(2).map((act) => (
            <Pressable key={act.key} style={styles.actionRow} onPress={act.onPress}>
              <View style={[styles.actionIconWrap, { backgroundColor: act.iconBg }]}>
                <Ionicons name={act.icon} size={22} color={act.tint} />
              </View>
              <View style={styles.actionBody}>
                <Text style={styles.actionTitle}>{act.title}</Text>
                <Text style={styles.actionSub}>{act.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}

          <Pressable style={styles.cancelBtn} onPress={onDismiss}>
            <Text style={styles.cancelTxt}>Huỷ</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
