import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { resolveMediaUrl } from '../../lib/messengerApi';
import {
  isImageMessage,
  isStickerContent,
  isVideoMessage,
  resolvePrimaryAttachment,
  stripStickerPrefix,
} from '../../lib/messengerMedia';
import { messageDisplayText, formatReplyPreview } from '../../lib/messengerPreview';
import { callLogDisplayText, isMessengerCallLogMessage } from '../../lib/messengerCallLog';
import { groupReactions } from '../../lib/messengerReactions';
import { getMessengerColors } from '../../lib/messengerTheme';
import type { MessengerMessage } from '../../types/messenger';

const SW = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 56;

type Props = {
  item: MessengerMessage;
  mine: boolean;
  myId: string;
  timeStr: string;
  isLastMine?: boolean;
  seenLabel?: string;
  replyParent?: MessengerMessage | null;
  onReply: (m: MessengerMessage) => void;
  onOpenActions: (m: MessengerMessage) => void;
  onToggleReaction: (m: MessengerMessage, emoji: string) => void;
  onJumpToReply?: (messageId: string) => void;
};

export default function ChatMessageRow({
  item,
  mine,
  myId,
  timeStr,
  isLastMine,
  seenLabel,
  replyParent,
  onReply,
  onOpenActions,
  onToggleReaction,
  onJumpToReply,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const translateX = useRef(new Animated.Value(0)).current;
  const recalled = !!(item.is_recalled || item.recalled_at);
  const sticker = !recalled && isStickerContent(item.content);
  const stickerEmoji = sticker ? stripStickerPrefix(item.content) : '';
  const imageMsg = !recalled && isImageMessage(item);
  const videoMsg = !recalled && isVideoMessage(item);
  const att = resolvePrimaryAttachment(item);
  const mediaUrl = resolveMediaUrl(att.url);
  const displayText = messageDisplayText(item, myId);
  const isCallLog = !recalled && isMessengerCallLogMessage(item);
  const callLogText = isCallLog ? callLogDisplayText(item, myId) : '';
  const reactionGroups = useMemo(
    () => groupReactions(item.reactions, myId),
    [item.reactions, myId],
  );

  const openActions = () => {
    if (recalled || item.is_system) return;
    onOpenActions(item);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !recalled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const dx = mine ? Math.min(0, g.dx) : Math.max(0, g.dx);
        translateX.setValue(dx);
      },
      onPanResponderRelease: (_, g) => {
        const triggered = mine ? g.dx < -SWIPE_THRESHOLD : g.dx > SWIPE_THRESHOLD;
        if (triggered) onReply(item);
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          marginBottom: 10,
          justifyContent: mine ? 'flex-end' : 'flex-start',
        },
        col: { maxWidth: SW * 0.82 },
        replyBar: {
          borderLeftWidth: 3,
          paddingLeft: 8,
          marginBottom: 6,
          opacity: 0.92,
        },
        replyTxt: { color: mine ? 'rgba(255,255,255,0.85)' : colors.textMuted, fontSize: 12 },
        bubble: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 4 : 18,
          borderBottomLeftRadius: mine ? 18 : 4,
          backgroundColor: mine ? mc.bubbleOut : mc.bubbleIn,
          borderWidth: mine ? 0 : 1,
          borderColor: mc.bubbleInBorder,
          overflow: 'hidden',
        },
        mediaBubble: { padding: 4 },
        img: { width: SW * 0.62, height: SW * 0.62, borderRadius: 14, backgroundColor: isDark ? '#111' : '#E2E8F0' },
        videoWrap: {
          width: SW * 0.62,
          height: SW * 0.42,
          borderRadius: 14,
          backgroundColor: isDark ? '#111' : '#CBD5E1',
          alignItems: 'center',
          justifyContent: 'center',
        },
        fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        fileName: { color: mine ? '#FFF' : colors.text, fontSize: 14, flexShrink: 1 },
        stickerWrap: { paddingVertical: 2, paddingHorizontal: 4 },
        stickerTxt: { fontSize: 48, lineHeight: 56, textAlign: 'center' },
        recalledBubble: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 14,
          backgroundColor: isDark ? '#252830' : '#F1F5F9',
          borderWidth: 1,
          borderColor: colors.border,
        },
        recalledTxt: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
        text: { color: mine ? '#FFFFFF' : colors.text, fontSize: 15, lineHeight: 21 },
        meta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 4,
          alignSelf: mine ? 'flex-end' : 'flex-start',
          flexWrap: 'wrap',
        },
        time: { color: colors.textFaint, fontSize: 11 },
        seen: { color: mc.accent, fontSize: 11, fontWeight: '600' },
        reactionRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 4,
          alignSelf: mine ? 'flex-end' : 'flex-start',
        },
        reactionPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: isDark ? '#1A1F28' : '#EEF2FF',
          borderWidth: 1,
          borderColor: colors.border,
        },
        reactionPillMine: { borderColor: mc.accent },
        reactionEmoji: { fontSize: 13 },
        reactionCount: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
        callLogRow: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 12 },
        callLogPill: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 4,
          maxWidth: '95%',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: isDark ? '#064E3B33' : '#ECFDF5',
          borderWidth: 1,
          borderColor: isDark ? '#065F4633' : '#A7F3D0',
        },
        callLogText: { color: isDark ? '#6EE7B7' : '#047857', fontSize: 12, fontWeight: '600' },
        callLogTime: { color: isDark ? '#34D399' : '#10B981', fontSize: 11 },
      }),
    [colors, isDark, mc, mine],
  );

  const replyQuote =
    item.reply_to && replyParent ? (
      <Pressable
        style={[styles.replyBar, { borderLeftColor: mine ? '#fff' : mc.accent }]}
        onPress={() => replyParent.id && onJumpToReply?.(replyParent.id)}
      >
        <Text style={styles.replyTxt} numberOfLines={2}>
          ↩ {formatReplyPreview(replyParent)}
        </Text>
      </Pressable>
    ) : null;

  const bubbleContent = () => {
    if (sticker && stickerEmoji) {
      return (
        <Pressable style={styles.stickerWrap} onLongPress={openActions} delayLongPress={320}>
          <Text style={styles.stickerTxt}>{stickerEmoji}</Text>
        </Pressable>
      );
    }
    if (imageMsg && mediaUrl) {
      return (
        <Pressable
          style={[styles.bubble, styles.mediaBubble]}
          onLongPress={openActions}
          delayLongPress={320}
          onPress={() => void Linking.openURL(mediaUrl)}
        >
          {replyQuote}
          <Image source={{ uri: mediaUrl }} style={styles.img} resizeMode="cover" />
          {displayText && !displayText.startsWith('📷') ? (
            <Text style={[styles.text, { marginTop: 6 }]}>{displayText}</Text>
          ) : null}
        </Pressable>
      );
    }
    if (videoMsg && mediaUrl) {
      return (
        <Pressable
          style={[styles.bubble, styles.mediaBubble]}
          onLongPress={openActions}
          delayLongPress={320}
          onPress={() => void Linking.openURL(mediaUrl)}
        >
          {replyQuote}
          <View style={styles.videoWrap}>
            <Ionicons name="play-circle" size={48} color={mine ? '#FFF' : mc.accent} />
            <Text style={{ color: mine ? '#FFF' : colors.textMuted, fontSize: 12, marginTop: 4 }}>
              {att.name || 'Video'}
            </Text>
          </View>
        </Pressable>
      );
    }
    if (mediaUrl && att.name && !displayText) {
      return (
        <Pressable
          style={styles.bubble}
          onLongPress={openActions}
          delayLongPress={320}
          onPress={() => void Linking.openURL(mediaUrl)}
        >
          {replyQuote}
          <View style={styles.fileRow}>
            <Ionicons name="document-attach" size={18} color={mine ? '#FFF' : mc.accent} />
            <Text style={styles.fileName} numberOfLines={2}>{att.name}</Text>
          </View>
        </Pressable>
      );
    }
    return (
      <Pressable style={styles.bubble} onLongPress={openActions} delayLongPress={320}>
        {replyQuote}
        <Text style={styles.text}>{displayText || '—'}</Text>
      </Pressable>
    );
  };

  if (isCallLog) {
    return (
      <View style={styles.callLogRow}>
        <View style={styles.callLogPill}>
          <Ionicons name="call" size={12} color={isDark ? '#6EE7B7' : '#047857'} />
          <Text style={styles.callLogText}>{callLogText}</Text>
          <Text style={styles.callLogTime}> · {timeStr}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.col, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {recalled ? (
          <Pressable style={styles.recalledBubble}>
            <Ionicons name="arrow-undo-outline" size={14} color={colors.textMuted} />
            <Text style={styles.recalledTxt}>
              {mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi'}
            </Text>
          </Pressable>
        ) : (
          bubbleContent()
        )}

        {reactionGroups.length > 0 ? (
          <View style={styles.reactionRow}>
            {reactionGroups.map((r) => (
              <Pressable
                key={r.emoji}
                style={[styles.reactionPill, r.mine && styles.reactionPillMine]}
                onPress={() => onToggleReaction(item, r.emoji)}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 ? <Text style={styles.reactionCount}>{r.count}</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.meta}>
          <Text style={styles.time}>{timeStr}</Text>
          {mine && isLastMine ? (
            seenLabel ? (
              <Text style={styles.seen}>{seenLabel}</Text>
            ) : (
              <Ionicons name="checkmark" size={14} color={colors.textFaint} />
            )
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}
