import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Linking,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MessengerAttachment, MessengerMessage } from '../../types/messenger';
import { CrmColors } from '../../theme/crmTheme';
import { formatReplyPreview } from '../../lib/messengerPreview';
import { groupReactions } from '../../lib/messengerReactions';

const { width: SW } = Dimensions.get('window');
const SWIPE_THRESHOLD = 56;

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Props = {
  item: MessengerMessage;
  mine: boolean;
  myId: string;
  isDirectChat: boolean;
  showName: boolean;
  timeStr: string;
  bubbleMe: string;
  bubbleMeDark: string;
  bubbleOther: string;
  bubbleOtherBorder: string;
  mediaUrl: (u?: string | null) => string | null;
  avatarColor: (name: string) => string;
  initials: (name: string) => string;
  isAudioMsg: (m: MessengerMessage) => boolean;
  isEmojiOnly: (t: string) => boolean;
  renderAudio: (url: string) => React.ReactNode;
  isLastMine: boolean;
  lastMineSeenLabel: string;
  lastMineSeenCount: number;
  onReply: (m: MessengerMessage) => void;
  onOpenActions: (m: MessengerMessage) => void;
  onToggleReaction: (m: MessengerMessage, emoji: string) => void;
  replyParent?: MessengerMessage | null;
};

export function ChatMessageRow({
  item,
  mine,
  myId,
  isDirectChat,
  showName,
  timeStr,
  bubbleMe,
  bubbleMeDark,
  bubbleOther,
  bubbleOtherBorder,
  mediaUrl,
  avatarColor,
  initials,
  isAudioMsg,
  isEmojiOnly,
  renderAudio,
  isLastMine,
  lastMineSeenLabel,
  lastMineSeenCount,
  onReply,
  onOpenActions,
  onToggleReaction,
  replyParent,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const name = item.user?.full_name || '?';
  const isBot = !!item.user?.is_bot;
  const recalled = !!(item.recalled_at || item.is_recalled);
  const atts = Array.isArray(item.attachments) ? item.attachments : [];
  const imgUrl = item.attachment_url ? mediaUrl(item.attachment_url) : null;
  const isImg =
    item.message_type === 'image' ||
    (item.attachment_mime || '').startsWith('image/') ||
    (imgUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(imgUrl));
  const text = item.content || '';
  const stickerMode =
    !recalled && !!text && !imgUrl && atts.length === 0 && !isAudioMsg(item) && isEmojiOnly(text);

  const reactionGroups = useMemo(
    () => groupReactions(item.reactions, myId),
    [item.reactions, myId],
  );

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

  const recalledLabel = mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';

  return (
    <View style={[s.row, mine && s.rowMine]}>
      {!mine ? (
        isBot ? (
          <View style={[s.avatar, s.avatarBot]}>
            <Text style={s.avatarTxt}>🤖</Text>
          </View>
        ) : (
          <View style={[s.avatar, { backgroundColor: avatarColor(name) }]}>
            <Text style={s.avatarTxt}>{initials(name)}</Text>
          </View>
        )
      ) : (
        <View style={s.avatarSpace} />
      )}

      <Animated.View
        style={[
          { maxWidth: SW * 0.78, alignItems: mine ? 'flex-end' : 'flex-start', minWidth: isAudioMsg(item) ? 220 : 0 },
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        {showName ? (
          <Text style={s.msgName}>
            {name}
            {isBot ? '  · BOT' : ''}
          </Text>
        ) : null}

        {recalled ? (
          <Pressable
            style={[s.recalledBubble, mine ? s.recalledMine : s.recalledOther]}
            onLongPress={() => onOpenActions(item)}
          >
            <Ionicons name="arrow-undo-outline" size={14} color={CrmColors.gray500} />
            <Text style={s.recalledTxt}>{recalledLabel}</Text>
          </Pressable>
        ) : stickerMode ? (
          <Pressable style={s.stickerWrap} onLongPress={() => onOpenActions(item)}>
            <Text style={s.stickerTxt}>{text}</Text>
            <Text style={s.stickerTime}>{timeStr}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[s.bubble, mine ? { backgroundColor: bubbleMe, borderColor: bubbleMeDark } : { backgroundColor: bubbleOther, borderColor: bubbleOtherBorder }]}
            onLongPress={() => onOpenActions(item)}
          >
            {item.reply_to && replyParent ? (
              <View style={[s.replyBar, { borderLeftColor: mine ? '#fff' : bubbleMe }]}>
                <Text style={[s.replyTxt, mine && s.replyTxtMine]} numberOfLines={2}>
                  ↩ {formatReplyPreview(replyParent)}
                </Text>
              </View>
            ) : null}

            {isAudioMsg(item) && imgUrl ? renderAudio(imgUrl) : null}
            {item.content ? (
              <Text style={[s.bubbleTxt, mine && s.bubbleTxtMine]}>{item.content}</Text>
            ) : null}

            {!isAudioMsg(item) && imgUrl && isImg ? (
              <TouchableOpacity onPress={() => void Linking.openURL(imgUrl)}>
                <Image source={{ uri: imgUrl }} style={s.imgAtt} resizeMode="cover" />
              </TouchableOpacity>
            ) : !isAudioMsg(item) && imgUrl && !isImg ? (
              <TouchableOpacity onPress={() => void Linking.openURL(imgUrl)}>
                <Text style={[s.fileLink, mine && s.fileLinkMine]}>
                  📎 {item.attachment_name || 'Tệp'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {atts.map((a: MessengerAttachment, i: number) => {
              const u = mediaUrl(a.url);
              const im = (a.type || '').startsWith('image/') && u;
              return im ? (
                <TouchableOpacity key={i} onPress={() => u && void Linking.openURL(u)}>
                  <Image source={{ uri: u! }} style={s.imgAtt} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity key={i} onPress={() => u && void Linking.openURL(u)}>
                  <Text style={[s.fileLink, mine && s.fileLinkMine]}>📎 {a.name || 'Tệp'}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={[s.bubbleTime, mine && s.bubbleTimeMine]}>{timeStr}</Text>
          </Pressable>
        )}

        {reactionGroups.length ? (
          <View style={[s.reactionRow, mine && s.reactionRowMine]}>
            {reactionGroups.map((r) => (
              <TouchableOpacity
                key={r.emoji}
                style={[s.reactionPill, r.mine && s.reactionPillMine]}
                onPress={() => onToggleReaction(item, r.emoji)}
                activeOpacity={0.7}
              >
                <Text style={s.reactionEmoji} allowFontScaling={false}>{r.emoji}</Text>
                {r.count > 1 ? <Text style={s.reactionCount}>{r.count}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mine && isLastMine && lastMineSeenLabel ? (
          <View style={s.readRow}>
            <Ionicons
              name={lastMineSeenCount > 0 ? 'checkmark-done' : 'checkmark'}
              size={13}
              color={lastMineSeenCount > 0 ? bubbleMe : CrmColors.gray500}
            />
            <Text style={[s.readTxt, lastMineSeenCount > 0 && { color: bubbleMe, fontWeight: '700' }]}>
              {lastMineSeenLabel}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end', paddingHorizontal: 6 },
  rowMine: { flexDirection: 'row-reverse', paddingRight: 2 },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4, flexShrink: 0 },
  avatarBot: { backgroundColor: '#EEF2FF' },
  avatarTxt: { fontSize: 11, fontWeight: '800', color: '#fff' },
  avatarSpace: { width: 0 },
  msgName: { fontSize: 11, color: CrmColors.gray500, fontWeight: '700', marginBottom: 2, marginLeft: 4 },
  stickerWrap: { paddingVertical: 4, paddingHorizontal: 2 },
  stickerTxt: { fontSize: 44, lineHeight: 52, textAlign: 'center' },
  stickerTime: { fontSize: 10, color: CrmColors.gray400, textAlign: 'center', marginTop: 2 },
  bubble: {
    borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, maxWidth: '100%',
    borderWidth: 1,
  },
  bubbleTxt: { fontSize: 15, color: '#0F172A', lineHeight: 22 },
  bubbleTxtMine: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 4, alignSelf: 'flex-end', fontWeight: '600' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  replyBar: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, opacity: 0.9 },
  replyBarMine: { borderLeftColor: '#fff' },
  replyTxt: { fontSize: 12, color: CrmColors.gray600, fontStyle: 'italic' },
  replyTxtMine: { color: 'rgba(255,255,255,0.85)' },
  imgAtt: { width: 200, height: 150, borderRadius: 10, marginTop: 4 },
  fileLink: { fontSize: 14, color: CrmColors.blue700, marginTop: 4, textDecorationLine: 'underline' },
  fileLinkMine: { color: '#E0E7FF' },
  recalledBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  recalledMine: { backgroundColor: 'rgba(108,92,231,0.12)', borderColor: 'rgba(108,92,231,0.2)' },
  recalledOther: { backgroundColor: '#F3F4F6' },
  recalledTxt: { fontSize: 13, color: CrmColors.gray500, fontStyle: 'italic' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 6 },
  reactionRowMine: { marginLeft: 0, marginRight: 6, justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  reactionPillMine: { borderColor: '#C4B5FD', backgroundColor: '#F5F3FF' },
  reactionEmoji: { fontSize: 18, lineHeight: 22, minWidth: 20, textAlign: 'center' },
  reactionCount: { fontSize: 10, fontWeight: '700', color: CrmColors.gray700 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, paddingHorizontal: 2 },
  readTxt: { fontSize: 11, color: CrmColors.gray500, fontWeight: '600' },
});

/** Thanh chọn nhanh cảm xúc khi long-press tin nhắn. */
export function ReactionPickerBar({
  onPick,
  onReply,
  onRecall,
  canRecall,
  onShare,
  onCopy,
  onCopyImage,
  onDownload,
  showCopyImage,
  showDownload,
}: {
  onPick: (emoji: string) => void;
  onReply: () => void;
  onRecall?: () => void;
  canRecall?: boolean;
  onShare?: () => void;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onDownload?: () => void;
  showCopyImage?: boolean;
  showDownload?: boolean;
}) {
  return (
    <View style={bar.wrap}>
      <View style={bar.emojiRow}>
        {QUICK_REACTIONS.map((e) => (
          <TouchableOpacity key={e} style={bar.emojiBtn} onPress={() => onPick(e)} activeOpacity={0.7}>
            <Text style={bar.emojiTxt}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={bar.actionsWrap}>
        <View style={bar.actions}>
          <TouchableOpacity style={bar.actBtn} onPress={onReply}>
            <Ionicons name="arrow-undo" size={16} color={CrmColors.gray700} />
            <Text style={bar.actTxt}>Trả lời</Text>
          </TouchableOpacity>
          {onShare ? (
            <TouchableOpacity style={bar.actBtn} onPress={onShare}>
              <Ionicons name="share-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Chia sẻ</Text>
            </TouchableOpacity>
          ) : null}
          {onCopy ? (
            <TouchableOpacity style={bar.actBtn} onPress={onCopy}>
              <Ionicons name="copy-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Sao chép</Text>
            </TouchableOpacity>
          ) : null}
          {showCopyImage && onCopyImage ? (
            <TouchableOpacity style={bar.actBtn} onPress={onCopyImage}>
              <Ionicons name="image-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Copy ảnh</Text>
            </TouchableOpacity>
          ) : null}
          {showDownload && onDownload ? (
            <TouchableOpacity style={bar.actBtn} onPress={onDownload}>
              <Ionicons name="download-outline" size={16} color={CrmColors.blue600} />
              <Text style={[bar.actTxt, { color: CrmColors.blue600 }]}>Tải xuống</Text>
            </TouchableOpacity>
          ) : null}
          {canRecall && onRecall ? (
            <TouchableOpacity style={bar.actBtn} onPress={onRecall}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={[bar.actTxt, { color: '#DC2626' }]}>Thu hồi</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  emojiBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  emojiTxt: { fontSize: 22 },
  actionsWrap: { maxHeight: 88 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingBottom: 4 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10 },
  actTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray700 },
});
