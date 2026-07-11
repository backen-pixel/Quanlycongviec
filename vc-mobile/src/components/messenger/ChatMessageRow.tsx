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
  isAudioMessage,
  isDocumentMessage,
  isImageMessage,
  isStickerContent,
  isVideoMessage,
  resolvePrimaryAttachment,
  stripStickerPrefix,
} from '../../lib/messengerMedia';
import { messageDisplayText, formatReplyPreview } from '../../lib/messengerPreview';
import { callLogDisplayText, isMessengerCallLogMessage } from '../../lib/messengerCallLog';
import { groupReactions } from '../../lib/messengerReactions';
import {
  formatMessageSeenLabel,
  getSeenByForMessage,
  senderAvatarUrl,
  senderDisplayName,
} from '../../lib/messengerReadReceipts';
import { senderNameColor } from '../../lib/messengerSenderColors';
import { avatarColorFromName, getMessengerColors } from '../../lib/messengerTheme';
import { promptMessengerFileActions } from '../../lib/messengerFileOpen';
import type { MessengerGroupMember } from '../../lib/messengerApi';
import type { MessengerMessage, MessengerReadReceipt } from '../../types/messenger';
import Avatar from '../Avatar';
import ChatAudioPlayer from './ChatAudioPlayer';
import MessengerFileCard from './MessengerFileCard';
import MentionMessageText from './MentionMessageText';

function fileCaptionText(content: string, attName?: string | null): string {
  const raw = content.trim();
  if (!raw) return '';
  if (raw.startsWith('📎')) {
    const stripped = raw.replace(/^📎\s*/, '').trim();
    if (!stripped || stripped === attName) return '';
    return stripped;
  }
  return raw;
}

const SW = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 56;

type Props = {
  item: MessengerMessage;
  mine: boolean;
  myId: string;
  timeStr: string;
  isLastMine?: boolean;
  replyParent?: MessengerMessage | null;
  onReply: (m: MessengerMessage) => void;
  onOpenActions: (m: MessengerMessage) => void;
  onToggleReaction: (m: MessengerMessage, emoji: string) => void;
  onJumpToReply?: (messageId: string) => void;
  onOpenImage?: (url: string) => void;
  isGroupChat?: boolean;
  groupMembers?: MessengerGroupMember[];
  readReceipts?: MessengerReadReceipt[];
  onShowSeen?: (message: MessengerMessage) => void;
  seenRevealed?: boolean;
  onTapMine?: (message: MessengerMessage) => void;
  showAvatar?: boolean;
  showSenderName?: boolean;
  showClusterDivider?: boolean;
  clusterTight?: boolean;
  showTimeInBubble?: boolean;
};

export default function ChatMessageRow({
  item,
  mine,
  myId,
  timeStr,
  isLastMine,
  replyParent,
  onReply,
  onOpenActions,
  onToggleReaction,
  onJumpToReply,
  onOpenImage,
  isGroupChat = false,
  groupMembers = [],
  readReceipts = [],
  onShowSeen,
  seenRevealed = false,
  onTapMine,
  showAvatar = false,
  showSenderName = false,
  showClusterDivider = false,
  clusterTight = false,
  showTimeInBubble = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const translateX = useRef(new Animated.Value(0)).current;
  const recalled = !!(item.is_recalled || item.recalled_at);
  const sticker = !recalled && isStickerContent(item.content);
  const stickerEmoji = sticker ? stripStickerPrefix(item.content) : '';
  const imageMsg = !recalled && isImageMessage(item);
  const videoMsg = !recalled && isVideoMessage(item);
  const audioMsg = !recalled && isAudioMessage(item);
  const docMsg = !recalled && isDocumentMessage(item);
  const att = resolvePrimaryAttachment(item);
  const mediaUrl = resolveMediaUrl(att.url);
  const displayText = messageDisplayText(item, myId);
  const isCallLog = !recalled && isMessengerCallLogMessage(item);
  const callLogText = isCallLog ? callLogDisplayText(item, myId) : '';
  const reactionGroups = useMemo(
    () => groupReactions(item.reactions, myId),
    [item.reactions, myId],
  );

  const senderName = senderDisplayName(item);
  const senderColor = senderNameColor(item.user_id, senderName);
  const groupIncoming = isGroupChat && !mine;
  const seenBy = useMemo(
    () => (mine ? getSeenByForMessage(item, readReceipts, myId, groupMembers) : []),
    [mine, item, readReceipts, myId, groupMembers],
  );
  const seenLabel = mine
    ? formatMessageSeenLabel(seenBy.length, !isGroupChat, !!isLastMine)
    : '';

  const openActions = () => {
    if (recalled || item.is_system) return;
    onOpenActions(item);
  };

  const tapMine = () => {
    if (mine) onTapMine?.(item);
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
          marginBottom: clusterTight ? 4 : 10,
          justifyContent: mine ? 'flex-end' : 'flex-start',
          alignItems: groupIncoming ? 'flex-start' : 'flex-end',
          gap: 8,
        },
        clusterDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginLeft: 42,
          marginRight: 16,
          marginBottom: 10,
          opacity: 0.85,
        },
        avatarSlot: { width: 34, flexShrink: 0 },
        col: { maxWidth: SW * 0.78, flexShrink: 1 },
        senderNameInBubble: {
          fontSize: 13,
          fontWeight: '800',
          marginBottom: 4,
        },
        senderNameMedia: {
          fontSize: 13,
          fontWeight: '800',
          marginBottom: 4,
          marginLeft: 2,
        },
        replyBlock: {
          flexDirection: 'row',
          gap: 8,
          marginBottom: 8,
          paddingRight: 4,
        },
        replyAccent: {
          width: 3,
          borderRadius: 2,
          alignSelf: 'stretch',
          minHeight: 28,
        },
        replyBody: { flex: 1, minWidth: 0 },
        replySenderName: { fontSize: 13, fontWeight: '800' },
        replyPreview: {
          fontSize: 12,
          color: mine ? 'rgba(255,255,255,0.78)' : colors.textMuted,
          marginTop: 2,
        },
        timeInBubble: {
          fontSize: 11,
          color: colors.textFaint,
          marginTop: 4,
          alignSelf: 'flex-start',
        },
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
        mediaBubble: { padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
        img: { width: SW * 0.62, height: SW * 0.62, borderRadius: 12 },
        imgCaption: {
          marginTop: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 4 : 18,
          borderBottomLeftRadius: mine ? 18 : 4,
          backgroundColor: mine ? mc.bubbleOut : mc.bubbleIn,
          borderWidth: mine ? 0 : 1,
          borderColor: mc.bubbleInBorder,
        },
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
        link: { color: mine ? '#BFDBFE' : mc.accent, textDecorationLine: 'underline' },
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
    [colors, isDark, mc, mine, clusterTight, groupIncoming],
  );

  const renderRichText = (text: string) => (
    <MentionMessageText
      content={text}
      style={styles.text}
      linkStyle={styles.link}
      mentionStyle={{ color: mc.accent, fontWeight: '800' }}
      mentionMineStyle={{ color: '#FDE68A', fontWeight: '800' }}
      mine={mine}
      members={groupMembers}
    />
  );

  const senderLabel = showSenderName && groupIncoming ? (
    <Text style={[styles.senderNameMedia, { color: senderColor }]} numberOfLines={1}>
      {senderName}
    </Text>
  ) : null;

  const senderLabelInBubble = showSenderName && groupIncoming ? (
    <Text style={[styles.senderNameInBubble, { color: senderColor }]} numberOfLines={1}>
      {senderName}
    </Text>
  ) : null;

  const timeInBubbleEl = groupIncoming && showTimeInBubble ? (
    <Text style={styles.timeInBubble}>{timeStr}</Text>
  ) : null;

  const replyQuote =
    item.reply_to && replyParent ? (
      <Pressable
        onPress={() => replyParent.id && onJumpToReply?.(replyParent.id)}
      >
        <View style={styles.replyBlock}>
          <View
            style={[
              styles.replyAccent,
              { backgroundColor: mine ? 'rgba(255,255,255,0.85)' : mc.accent },
            ]}
          />
          <View style={styles.replyBody}>
            <Text
              style={[styles.replySenderName, { color: mine ? '#FFF' : mc.accent }]}
              numberOfLines={1}
            >
              {senderDisplayName(replyParent)}
            </Text>
            <Text style={styles.replyPreview} numberOfLines={2}>
              {formatReplyPreview(replyParent)}
            </Text>
          </View>
        </View>
      </Pressable>
    ) : null;

  const bubbleContent = () => {
    if (sticker && stickerEmoji) {
      return (
        <View>
          {senderLabel}
          <Pressable style={styles.stickerWrap} onLongPress={openActions} delayLongPress={320}>
            <Text style={styles.stickerTxt}>{stickerEmoji}</Text>
          </Pressable>
          {timeInBubbleEl}
        </View>
      );
    }
    if (imageMsg && mediaUrl) {
      const caption = displayText && !displayText.startsWith('📷') ? displayText : '';
      return (
        <View>
          {senderLabel}
          {replyQuote}
          <Pressable
            onLongPress={openActions}
            delayLongPress={320}
            onPress={() => {
              if (mine) tapMine();
              onOpenImage?.(mediaUrl);
            }}
          >
            <Image source={{ uri: mediaUrl }} style={styles.img} resizeMode="cover" />
          </Pressable>
          {caption ? (
            <Pressable style={styles.imgCaption} onLongPress={openActions} delayLongPress={320}>
              {renderRichText(caption)}
              {timeInBubbleEl}
            </Pressable>
          ) : (
            timeInBubbleEl
          )}
        </View>
      );
    }
    if (audioMsg && mediaUrl) {
      return (
        <View>
          {senderLabel}
          {replyQuote}
          <ChatAudioPlayer
            url={mediaUrl}
            mine={mine}
            onLongPress={openActions}
            onSelect={mine ? tapMine : undefined}
            onMorePress={() => promptMessengerFileActions(mediaUrl, { name: att.name, mime: att.type })}
          />
          {timeInBubbleEl}
        </View>
      );
    }
    if (videoMsg && mediaUrl) {
      return (
        <View>
          {senderLabel}
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
          {timeInBubbleEl}
        </View>
      );
    }
    if (docMsg && mediaUrl) {
      const caption = fileCaptionText(String(item.content || ''), att.name);
      return (
        <View>
          {senderLabel}
          {replyQuote}
          <MessengerFileCard
            name={att.name}
            mime={att.type}
            size={att.size}
            url={mediaUrl}
            mine={mine}
            onLongPress={openActions}
          />
          {caption ? (
            <Pressable
              style={[styles.bubble, { marginTop: 6 }]}
              onLongPress={openActions}
              delayLongPress={320}
            >
              {renderRichText(caption)}
              {timeInBubbleEl}
            </Pressable>
          ) : (
            timeInBubbleEl
          )}
        </View>
      );
    }
    const textContent = audioMsg && mediaUrl && !displayText
      ? ''
      : docMsg && mediaUrl
        ? fileCaptionText(String(item.content || ''), att.name)
        : (displayText || '—');
    const isPlainPlaceholder = textContent === '—';
    return (
      <Pressable
        style={styles.bubble}
        onLongPress={openActions}
        delayLongPress={320}
        onPress={mine ? tapMine : undefined}
      >
        {senderLabelInBubble}
        {replyQuote}
        {isPlainPlaceholder ? (
          <Text style={styles.text}>{textContent}</Text>
        ) : (
          renderRichText(textContent)
        )}
        {timeInBubbleEl}
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
    <View>
      {showClusterDivider ? <View style={styles.clusterDivider} /> : null}
      <View style={styles.row}>
      {!mine && isGroupChat ? (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            <Avatar
              name={senderName}
              size={34}
              color={avatarColorFromName(senderName)}
              avatarUrl={senderAvatarUrl(item)}
            />
          ) : null}
        </View>
      ) : null}

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

        {!groupIncoming ? (
          <Pressable style={styles.meta} onPress={mine ? tapMine : undefined} disabled={!mine}>
            <Text style={styles.time}>{timeStr}</Text>
            {mine && seenRevealed ? (
              isGroupChat ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onShowSeen?.(item);
                  }}
                  hitSlop={6}
                >
                  <Text style={[styles.seen, seenBy.length > 0 && { fontWeight: '800' }]}>
                    {seenLabel || 'Đã gửi'}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.seen}>{seenLabel || 'Đã gửi'}</Text>
              )
            ) : null}
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
    </View>
  );
}
