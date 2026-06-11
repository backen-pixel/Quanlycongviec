import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import ChatComposer from '../components/messenger/ChatComposer';
import AttachFileSheet, { type AttachOption } from '../components/messenger/AttachFileSheet';
import ChatDateSeparator from '../components/messenger/ChatDateSeparator';
import ChatHeader from '../components/messenger/ChatHeader';
import ChatMessageRow from '../components/messenger/ChatMessageRow';
import EmojiStickerPanel from '../components/messenger/EmojiStickerPanel';
import MessageActionSheet from '../components/messenger/MessageActionSheet';
import TapHighlight from '../components/TapHighlight';
import Toast, { type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import {
  fetchReadReceipts,
  formatMessageTime,
  recallMessengerMessage,
  toggleMessageReaction,
} from '../lib/messengerApi';
import { isMessengerCallLogMessage } from '../lib/messengerCallLog';
import {
  buildStickerContent,
  isSameDay,
  type PendingChatFile,
  validatePendingFiles,
} from '../lib/messengerMedia';
import { formatReplyPreview } from '../lib/messengerPreview';
import { mergeMessengerMessage } from '../lib/messengerReactions';
import { formatPresenceLabel, type UserPresence } from '../lib/messengerPresence';
import { canRecallMessage, shareMessengerMessage } from '../lib/messengerShare';
import { sendMessengerWithFiles } from '../lib/messengerUpload';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Spacing } from '../theme';
import type { MessengerMessage, MessengerReadReceipt } from '../types/messenger';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

export default function ChatDetailScreen({ navigation, route }: Props) {
  const { threadId, title } = route.params;
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const myUserId = user?.id || user?.userId || '';
  const insets = useSafeAreaInsets();
  const mc = getMessengerColors(colors, isDark);
  const {
    threads,
    loadMessages,
    sendText,
    subscribeGroupMessage,
    subscribeMessengerMeta,
    setActiveGroupId,
    getPeerPresence,
  } = useMessenger();

  const thread = threads.find((t) => t.id === threadId);
  const displayName = title || thread?.name || 'Chat';
  const avatarColor = thread?.avatarColor || avatarColorFromName(displayName);
  const isDirect = thread?.isDirect ?? !thread?.isGroup;

  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [readReceipts, setReadReceipts] = useState<MessengerReadReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingChatFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const [actionMsg, setActionMsg] = useState<MessengerMessage | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const initialScrollDone = useRef(false);

  const peerPresence: UserPresence | null = thread?.peerId
    ? getPeerPresence(thread.peerId)
    : null;
  const statusLabel = isDirect
    ? formatPresenceLabel(peerPresence)
    : 'Nhóm chat · realtime';

  const messageById = useMemo(() => {
    const m = new Map<string, MessengerMessage>();
    for (const msg of messages) m.set(msg.id, msg);
    return m;
  }, [messages]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.is_system || isMessengerCallLogMessage(m)),
    [messages],
  );

  const listData = useMemo(() => [...visibleMessages].reverse(), [visibleMessages]);

  const lastMineId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const m = visibleMessages[i]!;
      if (String(m.user_id) === String(myUserId)) return m.id;
    }
    return '';
  }, [visibleMessages, myUserId]);

  const lastMineSeenLabel = useMemo(() => {
    if (!lastMineId) return '';
    const msg = messageById.get(lastMineId);
    if (!msg?.created_at) return 'Đã gửi';
    const t = new Date(msg.created_at).getTime();
    const seenBy = readReceipts.filter((r) => {
      if (String(r.user_id) === String(myUserId)) return false;
      const rt = new Date(r.last_read_at).getTime();
      return Number.isFinite(rt) && rt >= t;
    });
    if (!seenBy.length) return 'Đã gửi';
    if (isDirect) return 'Đã xem';
    return `Đã xem · ${seenBy.length}`;
  }, [lastMineId, messageById, readReceipts, myUserId, isDirect]);

  const composerPadBottom = keyboardVisible ? 8 : Math.max(insets.bottom, 10);
  const headerBarHeight = Math.max(insets.top, 6) + 58;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const mergeIncoming = useCallback((incoming: MessengerMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === incoming.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = mergeMessengerMessage(prev[idx]!, incoming);
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  const refreshReceipts = useCallback(() => {
    void fetchReadReceipts(threadId)
      .then(setReadReceipts)
      .catch(() => {});
  }, [threadId]);

  useEffect(() => {
    setActiveGroupId(threadId);
    return () => setActiveGroupId(null);
  }, [threadId, setActiveGroupId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    initialScrollDone.current = false;
    void Promise.all([loadMessages(threadId), fetchReadReceipts(threadId)])
      .then(([rows, receipts]) => {
        if (cancelled) return;
        setMessages(rows);
        setReadReceipts(receipts);
      })
      .catch((e) => {
        if (!cancelled) setToast({ message: formatApiError(e), kind: 'error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, loadMessages]);

  useEffect(() => {
    return subscribeGroupMessage((groupId, message) => {
      if (String(groupId) !== String(threadId)) return;
      mergeIncoming(message);
      refreshReceipts();
    });
  }, [threadId, subscribeGroupMessage, mergeIncoming, refreshReceipts]);

  useEffect(() => {
    return subscribeMessengerMeta((evt) => {
      if (String(evt.groupId) !== String(threadId)) return;
      if (evt.type === 'read') {
        refreshReceipts();
        return;
      }
      if (evt.type === 'reaction' && evt.messageId && evt.reactions) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === evt.messageId ? { ...m, reactions: evt.reactions! } : m,
          ),
        );
      }
      if (evt.type === 'recall' && evt.message) {
        mergeIncoming(evt.message);
      }
    });
  }, [threadId, subscribeMessengerMeta, mergeIncoming]);

  const appendPendingFiles = useCallback((files: PendingChatFile[]) => {
    const err = validatePendingFiles(files);
    if (err) {
      setToast({ message: err, kind: 'error' });
      return;
    }
    setPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền', 'Cho phép truy cập thư viện ảnh.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.length) return;
    appendPendingFiles(
      res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `media_${Date.now()}_${i}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
        type: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: a.fileSize,
      })),
    );
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền camera', 'Bật Camera trong Cài đặt.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    appendPendingFiles([{
      uri: a.uri,
      name: a.fileName || `cam_${Date.now()}.jpg`,
      type: a.mimeType || 'image/jpeg',
      size: a.fileSize,
    }]);
  };

  const pickDocument = async () => {
    const pick = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (pick.canceled || !pick.assets?.length) return;
    appendPendingFiles(
      pick.assets.map((a) => ({
        uri: a.uri,
        name: a.name || 'file',
        type: a.mimeType || 'application/octet-stream',
        size: a.size,
      })),
    );
  };

  const onAttachPress = () => {
    Keyboard.dismiss();
    setEmojiOpen(false);
    setAttachOpen(true);
  };

  const onAttachPick = (option: AttachOption) => {
    if (option === 'gallery') void pickGallery();
    else if (option === 'camera') void pickCamera();
    else void pickDocument();
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if ((!text && !pendingFiles.length) || sending) return;

    const sizeErr = validatePendingFiles(pendingFiles);
    if (sizeErr) {
      setToast({ message: sizeErr, kind: 'error' });
      return;
    }

    setSending(true);
    const replyId = replyTo?.id || null;
    const filesToSend = [...pendingFiles];
    setDraft('');
    setReplyTo(null);
    setPendingFiles([]);
    setEmojiOpen(false);

    try {
      if (!filesToSend.length) {
        const sent = await sendText(threadId, text, replyId);
        mergeIncoming(sent);
      } else {
        const sent = await sendMessengerWithFiles(threadId, {
          content: text,
          replyTo: replyId,
          files: filesToSend,
        });
        mergeIncoming(sent);
      }
      refreshReceipts();
    } catch (e) {
      setDraft(text);
      setPendingFiles(filesToSend);
      setToast({ message: formatApiError(e), kind: 'error' });
    } finally {
      setSending(false);
    }
  };

  const sendSticker = async (emoji: string) => {
    if (sending) return;
    setEmojiOpen(false);
    setSending(true);
    try {
      const sent = await sendText(threadId, buildStickerContent(emoji), replyTo?.id || null);
      mergeIncoming(sent);
      setReplyTo(null);
      refreshReceipts();
    } catch (e) {
      setToast({ message: formatApiError(e), kind: 'error' });
    } finally {
      setSending(false);
    }
  };

  const onToggleReaction = useCallback(
    async (msg: MessengerMessage, emoji: string) => {
      try {
        const reactions = await toggleMessageReaction(threadId, msg.id, emoji);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, reactions } : m)),
        );
      } catch (e) {
        setToast({ message: formatApiError(e), kind: 'error' });
      }
    },
    [threadId],
  );

  const onRecall = useCallback(
    (msg: MessengerMessage) => {
      setActionMsg(null);
      Alert.alert('Thu hồi tin nhắn', 'Bạn có chắc muốn thu hồi tin này?', [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Thu hồi',
          style: 'destructive',
          onPress: () => {
            void recallMessengerMessage(threadId, msg.id)
              .then(mergeIncoming)
              .catch((e) => setToast({ message: formatApiError(e), kind: 'error' }));
          },
        },
      ]);
    },
    [threadId, mergeIncoming],
  );

  const openMessageActions = useCallback((msg: MessengerMessage) => {
    if (msg.is_system || msg.recalled_at || msg.is_recalled) return;
    setActionMsg(msg);
  }, []);

  const navigateForward = useCallback(
    (msg: MessengerMessage) => {
      setActionMsg(null);
      navigation.navigate('MessengerForward', {
        excludeGroupId: threadId,
        sourceTitle: displayName,
        messagesJson: JSON.stringify([msg]),
      });
    },
    [navigation, threadId, displayName],
  );

  const openDetails = useCallback(() => {
    navigation.navigate('ChatDetailInfo', {
      threadId,
      title: displayName,
      avatarColor,
      avatarUrl: thread?.avatarUrl || null,
      isDirect: !!isDirect,
      messagesJson: JSON.stringify(visibleMessages),
    });
  }, [navigation, threadId, displayName, avatarColor, thread?.avatarUrl, isDirect, visibleMessages]);

  const showDateForIndex = useCallback(
    (index: number, item: MessengerMessage) => {
      if (index === listData.length - 1) return true;
      const newer = listData[index - 1];
      return index > 0 && !!newer && !isSameDay(item.created_at, newer.created_at);
    },
    [listData],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        body: { flex: 1 },
        listWrap: { flex: 1 },
        list: { paddingHorizontal: Spacing.lg, paddingVertical: 12 },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        replyPreview: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.md,
          marginBottom: 6,
          padding: 10,
          borderRadius: 10,
          backgroundColor: mc.accentSoft,
          borderLeftWidth: 3,
          borderLeftColor: mc.accent,
        },
        replyPreviewTxt: { flex: 1, color: colors.textMuted, fontSize: 13 },
        swipeHint: {
          textAlign: 'center',
          color: colors.textFaint,
          fontSize: 11,
          paddingVertical: 6,
        },
      }),
    [colors, mc],
  );

  return (
    <View style={styles.root}>
      <ChatHeader
        threadId={threadId}
        displayName={displayName}
        avatarColor={avatarColor}
        avatarUrl={thread?.avatarUrl}
        statusLabel={statusLabel}
        online={peerPresence?.online}
        isDirect={isDirect}
        peerId={thread?.peerId}
        myUserId={myUserId}
        paddingTop={Math.max(insets.top, 6) + 4}
        onBack={() => navigation.goBack()}
        onOpenDetails={openDetails}
      />

      <KeyboardAvoidingView
        style={styles.body}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerBarHeight : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={mc.accent} />
          </View>
        ) : (
          <View style={styles.listWrap}>
            <Text style={styles.swipeHint}>Vuốt tin sang để trả lời · Nhấn giữ để tùy chọn</Text>
            <FlatList
              ref={listRef}
              inverted
              style={{ flex: 1 }}
              data={listData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item, index }) => {
              const mine = String(item.user_id) === String(myUserId);
              const replyParent = item.reply_to
                ? messageById.get(String(item.reply_to)) || item.reply_to_message
                : null;
              const showDate = showDateForIndex(index, item);
              return (
                <View>
                  {showDate ? <ChatDateSeparator date={String(item.created_at || '')} /> : null}
                  <ChatMessageRow
                    item={item}
                    mine={mine}
                    myId={String(myUserId)}
                    timeStr={formatMessageTime(item.created_at)}
                    isLastMine={item.id === lastMineId}
                    seenLabel={item.id === lastMineId ? lastMineSeenLabel : undefined}
                    replyParent={replyParent}
                    onReply={setReplyTo}
                    onOpenActions={openMessageActions}
                    onToggleReaction={onToggleReaction}
                  />
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Text style={{ color: colors.textFaint, textAlign: 'center' }}>Chưa có tin nhắn</Text>
              </View>
            }
            onContentSizeChange={() => {
              if (!initialScrollDone.current && listData.length) {
                initialScrollDone.current = true;
              }
            }}
          />
          </View>
        )}

        {replyTo ? (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPreviewTxt} numberOfLines={2}>
              Trả lời: {formatReplyPreview(replyTo)}
            </Text>
            <TapHighlight onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TapHighlight>
          </View>
        ) : null}

        <ChatComposer
          draft={draft}
          sending={sending}
          pendingFiles={pendingFiles}
          emojiOpen={emojiOpen}
          paddingBottom={composerPadBottom}
          onChangeDraft={setDraft}
          onSend={() => void sendMessage()}
          onToggleEmoji={() => {
            if (!emojiOpen) Keyboard.dismiss();
            setAttachOpen(false);
            setEmojiOpen((v) => !v);
          }}
          onAttach={onAttachPress}
          onRemoveFile={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
          onInputFocus={() => setAttachOpen(false)}
        />

        <EmojiStickerPanel
          open={emojiOpen}
          paddingBottom={composerPadBottom}
          onPickEmoji={(e) => setDraft((d) => `${d}${e}`)}
          onPickSticker={(e) => void sendSticker(e)}
          onClose={() => setEmojiOpen(false)}
        />
      </KeyboardAvoidingView>

      <Toast state={toast} />

      <AttachFileSheet
        visible={attachOpen}
        onDismiss={() => setAttachOpen(false)}
        onPick={onAttachPick}
      />

      {actionMsg ? (
        <MessageActionSheet
          onDismiss={() => setActionMsg(null)}
          onPick={(emoji) => {
            void onToggleReaction(actionMsg, emoji);
            setActionMsg(null);
          }}
          onReply={() => {
            setReplyTo(actionMsg);
            setActionMsg(null);
          }}
          onForward={() => navigateForward(actionMsg)}
          onShareExternal={() => {
            void shareMessengerMessage(actionMsg, displayName);
            setActionMsg(null);
          }}
          canRecall={canRecallMessage(actionMsg, String(myUserId))}
          onRecall={() => onRecall(actionMsg)}
        />
      ) : null}
    </View>
  );
}
