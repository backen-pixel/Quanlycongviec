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
import {
  collectAttachments,
  isFileOnlyMessengerMessage,
  isImageOnlyMessengerMessage,
  normalizeForwardDisplayContent,
} from '../../lib/messengerMessageActions';
import { MessengerFileCard } from './MessengerFileCard';

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
  mentionedMe?: boolean;
  selectMode?: boolean;
  msgSelected?: boolean;
  onToggleSelect?: () => void;
};

const TEXT_TOKEN_RE = /(@(?:tất\s*cả|[^\s\n@]+))/gi;

function renderMessageText(content: string, mine: boolean) {
  const display = normalizeForwardDisplayContent(content);
  const parts = display.split(TEXT_TOKEN_RE);
  return (
    <Text style={[s.bubbleTxt, mine && s.bubbleTxtMine]}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('@')) {
          return (
            <Text
              key={`${i}-${part}`}
              style={mine ? s.mentionMine : s.mentionOther}
            >
              {part}
            </Text>
          );
        }
        return <Text key={`${i}-t`}>{part}</Text>;
      })}
    </Text>
  );
}

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
  mentionedMe = false,
  selectMode = false,
  msgSelected = false,
  onToggleSelect,
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
  const fileOnly = !recalled && isFileOnlyMessengerMessage(item);
  const imageOnly = !recalled && isImageOnlyMessengerMessage(item);
  const stickerMode =
    !recalled && !!text && !imgUrl && atts.length === 0 && !isAudioMsg(item) && isEmojiOnly(text);
  const forwardHeader = /^↪ Chia sẻ/i.test(String(text || '').trim());

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

  const openActions = () => {
    if (selectMode && onToggleSelect) onToggleSelect();
    else onOpenActions(item);
  };

  return (
    <View style={[s.row, mine && s.rowMine]}>
      {selectMode ? (
        <TouchableOpacity style={s.selectBox} onPress={onToggleSelect} hitSlop={8}>
          <Ionicons
            name={msgSelected ? 'checkbox' : 'ellipse-outline'}
            size={22}
            color={msgSelected ? '#6C5CE7' : CrmColors.gray400}
          />
        </TouchableOpacity>
      ) : null}
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
          <View style={s.nameRow}>
            <Text style={s.msgName}>
              {name}
              {isBot ? '  · BOT' : ''}
            </Text>
            {mentionedMe ? (
              <View style={s.mentionBadge}>
                <Text style={s.mentionBadgeTxt}>@ bạn</Text>
              </View>
            ) : null}
          </View>
        ) : mentionedMe ? (
          <View style={[s.mentionBadge, { marginBottom: 4, marginLeft: 4 }]}>
            <Text style={s.mentionBadgeTxt}>@ bạn</Text>
          </View>
        ) : null}

        {recalled ? (
          <Pressable
            style={[s.recalledBubble, mine ? s.recalledMine : s.recalledOther]}
            onLongPress={openActions}
          >
            <Ionicons name="arrow-undo-outline" size={14} color={CrmColors.gray500} />
            <Text style={s.recalledTxt}>{recalledLabel}</Text>
          </Pressable>
        ) : stickerMode ? (
          <Pressable style={s.stickerWrap} onLongPress={openActions}>
            <Text style={s.stickerTxt}>{text}</Text>
            <Text style={s.stickerTime}>{timeStr}</Text>
          </Pressable>
        ) : imageOnly && imgUrl ? (
          <Pressable onLongPress={openActions}>
            <TouchableOpacity onPress={() => void Linking.openURL(imgUrl)}>
              <Image
                source={{ uri: imgUrl }}
                style={[s.imgAttBare, mine && s.imgAttBareMine]}
                resizeMode="cover"
              />
            </TouchableOpacity>
            <Text style={[s.bareTime, mine && s.bareTimeMine]}>{timeStr}</Text>
          </Pressable>
        ) : fileOnly ? (
          <Pressable onLongPress={openActions}>
            {item.reply_to && replyParent ? (
              <View style={[s.replyBarBare, { borderLeftColor: bubbleMe }]}>
                <Text style={s.replyTxt} numberOfLines={2}>
                  ↩ {formatReplyPreview(replyParent)}
                </Text>
              </View>
            ) : null}
            <MessengerFileCard
              name={item.attachment_name || collectAttachments(item)[0]?.name || undefined}
              mime={item.attachment_mime || collectAttachments(item)[0]?.type || undefined}
              size={item.attachment_size ?? undefined}
              url={mediaUrl(collectAttachments(item)[0]?.url || item.attachment_url)}
              mine={mine}
            />
            <Text style={[s.bareTime, mine && s.bareTimeMine]}>{timeStr}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[s.bubble, mine ? { backgroundColor: bubbleMe, borderColor: bubbleMeDark } : { backgroundColor: bubbleOther, borderColor: bubbleOtherBorder }]}
            onLongPress={openActions}
          >
            {item.reply_to && replyParent ? (
              <View style={[s.replyBar, { borderLeftColor: mine ? '#fff' : bubbleMe }]}>
                <Text style={[s.replyTxt, mine && s.replyTxtMine]} numberOfLines={2}>
                  ↩ {formatReplyPreview(replyParent)}
                </Text>
              </View>
            ) : null}

            {forwardHeader ? (
              <Text style={[s.forwardHdr, mine && s.forwardHdrMine]} numberOfLines={2}>
                {text.split('\n')[0]}
              </Text>
            ) : null}

            {isAudioMsg(item) && imgUrl ? renderAudio(imgUrl) : null}
            {item.content && !forwardHeader
              ? renderMessageText(item.content, mine)
              : item.content && forwardHeader
                ? renderMessageText(text.split('\n').slice(1).join('\n'), mine)
                : null}

            {!isAudioMsg(item) && imgUrl && isImg && !imageOnly ? (
              <TouchableOpacity onPress={() => void Linking.openURL(imgUrl)}>
                <Image source={{ uri: imgUrl }} style={s.imgAtt} resizeMode="cover" />
              </TouchableOpacity>
            ) : !isAudioMsg(item) && imgUrl && !isImg && !fileOnly ? (
              <MessengerFileCard
                name={item.attachment_name || undefined}
                mime={item.attachment_mime || undefined}
                size={item.attachment_size ?? undefined}
                url={imgUrl}
                mine={mine}
              />
            ) : null}

            {atts.map((a: MessengerAttachment, i: number) => {
              const u = mediaUrl(a.url);
              const im = (a.type || '').startsWith('image/') && u;
              if (imageOnly || fileOnly) return null;
              return im ? (
                <TouchableOpacity key={i} onPress={() => u && void Linking.openURL(u)}>
                  <Image source={{ uri: u! }} style={s.imgAtt} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <MessengerFileCard
                  key={i}
                  name={a.name || undefined}
                  mime={a.type || undefined}
                  size={a.size ?? undefined}
                  url={u}
                  mine={mine}
                />
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
  selectBox: { marginRight: 4, marginBottom: 4, justifyContent: 'flex-end' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, marginLeft: 4, flexWrap: 'wrap' },
  msgName: { fontSize: 11, color: CrmColors.gray500, fontWeight: '700' },
  mentionBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  mentionBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#92400E' },
  mentionMine: { fontWeight: '800', color: '#FDE68A' },
  mentionOther: { fontWeight: '800', color: '#B45309', backgroundColor: '#FEF3C7' },
  forwardHdr: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6 },
  forwardHdrMine: { color: 'rgba(255,255,255,0.9)' },
  imgAttBare: { width: 220, height: 220, borderRadius: 16, marginTop: 2 },
  imgAttBareMine: { alignSelf: 'flex-end' },
  bareTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 4, marginLeft: 4, fontWeight: '600' },
  bareTimeMine: { alignSelf: 'flex-end', marginRight: 4, color: 'rgba(255,255,255,0.65)' },
  replyBarBare: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, maxWidth: 260 },
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
  onForwardInApp,
  onCopy,
  onCopyImage,
  onDownload,
  onSelectMultiple,
  onHideForMe,
  showCopyImage,
  showDownload,
}: {
  onPick: (emoji: string) => void;
  onReply: () => void;
  onRecall?: () => void;
  canRecall?: boolean;
  onShare?: () => void;
  onForwardInApp?: () => void;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onDownload?: () => void;
  onSelectMultiple?: () => void;
  onHideForMe?: () => void;
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
          {onForwardInApp ? (
            <TouchableOpacity style={bar.actBtn} onPress={onForwardInApp}>
              <Ionicons name="arrow-redo-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Chuyển tiếp</Text>
            </TouchableOpacity>
          ) : null}
          {onShare ? (
            <TouchableOpacity style={bar.actBtn} onPress={onShare}>
              <Ionicons name="share-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Chia sẻ</Text>
            </TouchableOpacity>
          ) : null}
          {onSelectMultiple ? (
            <TouchableOpacity style={bar.actBtn} onPress={onSelectMultiple}>
              <Ionicons name="checkbox-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Chọn nhiều</Text>
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
          {onHideForMe ? (
            <TouchableOpacity style={bar.actBtn} onPress={onHideForMe}>
              <Ionicons name="eye-off-outline" size={16} color={CrmColors.gray700} />
              <Text style={bar.actTxt}>Ẩn với tôi</Text>
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
