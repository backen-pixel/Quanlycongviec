import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import TapHighlight from '../TapHighlight';
import { useTheme } from '../../context/ThemeContext';
import { MESSENGER_MAX_UPLOAD_MB, type PendingChatFile } from '../../lib/messengerMedia';
import { getMessengerColors } from '../../lib/messengerTheme';
import { Radii, Spacing } from '../../theme';

type Props = {
  draft: string;
  sending: boolean;
  pendingFiles: PendingChatFile[];
  emojiOpen: boolean;
  paddingBottom: number;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  onToggleEmoji: () => void;
  onAttach: () => void;
  onRemoveFile: (index: number) => void;
  onInputFocus?: () => void;
};

export default function ChatComposer({
  draft,
  sending,
  pendingFiles,
  emojiOpen,
  paddingBottom,
  onChangeDraft,
  onSend,
  onToggleEmoji,
  onAttach,
  onRemoveFile,
  onInputFocus,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const canSend = !sending && (draft.trim().length > 0 || pendingFiles.length > 0);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          paddingBottom,
        },
        pendingRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: Spacing.md,
          paddingTop: 8,
        },
        pendingChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.lg,
          backgroundColor: mc.accentSoft,
          maxWidth: '100%',
        },
        pendingTxt: { color: colors.text, fontSize: 12, flexShrink: 1 },
        bar: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          paddingHorizontal: Spacing.md,
          paddingTop: 10,
          paddingBottom: 10,
        },
        attachBtn: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
        },
        inputWrap: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: mc.inputBg,
          borderRadius: Radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 44,
          paddingLeft: 14,
          paddingRight: 4,
        },
        input: {
          flex: 1,
          color: colors.text,
          fontSize: 15,
          maxHeight: 100,
          paddingVertical: 10,
        },
        emojiBtn: {
          width: 36,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
        sendBtn: {
          width: 44,
          height: 44,
          borderRadius: Radii.full,
          backgroundColor: mc.accent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        sendBtnOff: { opacity: 0.45 },
        limitHint: {
          textAlign: 'center',
          color: colors.textFaint,
          fontSize: 10,
          paddingBottom: 4,
        },
      }),
    [colors, isDark, mc, paddingBottom],
  );

  return (
    <View style={styles.wrap}>
      {pendingFiles.length ? (
        <View style={styles.pendingRow}>
          {pendingFiles.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={styles.pendingChip}>
              <Ionicons name="document-attach" size={14} color={mc.accent} />
              <Text style={styles.pendingTxt} numberOfLines={1}>{f.name}</Text>
              <TapHighlight onPress={() => onRemoveFile(i)} hitSlop={6}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TapHighlight>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.bar}>
        <TapHighlight style={styles.attachBtn} onPress={onAttach} disabled={sending}>
          <Ionicons name="attach" size={24} color={colors.textMuted} />
        </TapHighlight>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Nhắn tin..."
            placeholderTextColor={colors.textFaint}
            value={draft}
            onChangeText={onChangeDraft}
            multiline
            editable={!sending}
            onFocus={() => {
              if (emojiOpen) onToggleEmoji();
              onInputFocus?.();
            }}
          />
          <TapHighlight style={styles.emojiBtn} onPress={onToggleEmoji}>
            <Ionicons
              name={emojiOpen ? 'happy' : 'happy-outline'}
              size={22}
              color={emojiOpen ? mc.accent : colors.textMuted}
            />
          </TapHighlight>
        </View>

        <TapHighlight
          style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
          onPress={onSend}
          disabled={!canSend}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFF" />
          )}
        </TapHighlight>
      </View>
      <Text style={styles.limitHint}>Tệp đính kèm tối đa {MESSENGER_MAX_UPLOAD_MB}MB</Text>
    </View>
  );
}
