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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import ImageLightbox from '../components/messenger/ImageLightbox';
import ChatComposer from '../components/messenger/ChatComposer';
import AttachFileSheet, { type AttachOption } from '../components/messenger/AttachFileSheet';
import ChatDateSeparator from '../components/messenger/ChatDateSeparator';
import ChatSearchSheet from '../components/messenger/ChatSearchSheet';
import ChatHeader from '../components/messenger/ChatHeader';
import ChatMessageRow from '../components/messenger/ChatMessageRow';
import EmojiStickerPanel from '../components/messenger/EmojiStickerPanel';
import MessageSeenSheet from '../components/messenger/MessageSeenSheet';
import MessageActionSheet from '../components/messenger/MessageActionSheet';
import TapHighlight from '../components/TapHighlight';
import Toast, { type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { useMessenger } from '../context/MessengerContext';
import { getAppSocket, subscribeAppSocket } from '../lib/appSocket';
import { useTheme } from '../context/ThemeContext';
import {
  fetchMessengerGroupDetail,
  fetchReadReceipts,
  formatMessageTime,
  recallMessengerMessage,
  toggleMessageReaction,
  type MessengerGroupMember,
} from '../lib/messengerApi';
import { getMessageClusterMeta } from '../lib/messengerMessageCluster';
import { isMessengerCallLogMessage } from '../lib/messengerCallLog';
import {
  buildStickerContent,
  isSameDay,
  type PendingChatFile,
  validatePendingFiles,
} from '../lib/messengerMedia';
import { formatReplyComposerLabel } from '../lib/messengerPreview';
import {
  applyMentionPickToDraft,
  buildMentionPickerItems,
  MESSENGER_MENTION_ALL_LABEL,
  resolveMentionIdsFromContent,
} from '../lib/messengerMentions';
import { getSeenByForMessage, senderDisplayName, type MessageViewer } from '../lib/messengerReadReceipts';
import { mergeMessengerMessage } from '../lib/messengerReactions';
import { formatChatHeaderPresenceLabel, type UserPresence } from '../lib/messengerPresence';
import { canRecallMessage, shareMessengerMessage } from '../lib/messengerShare';
import { setMessengerFileForwardContext } from '../lib/messengerFileForwardContext';
import { sendMessengerWithFiles } from '../lib/messengerUpload';
import { Overlay } from '../lib/floatingBubbleOverlay';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Spacing } from '../theme';
import type { MessengerMessage, MessengerReadReceipt } from '../types/messenger';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

type ActiveGroupCallInfo = {
  callId: string;
  groupId: string;
  groupName?: string;
  kind?: string;
  hostId?: string;
  hostName?: string;
};

export default function ChatDetailScreen({ navigation, route }: Props) {
  const { threadId, title, openSearch: openSearchParam, fromBubble } = route.params;
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
  const { joinGroupCall, status: callStatus } = useCall();
  const [activeGroupCall, setActiveGroupCall] = useState<ActiveGroupCallInfo | null>(null);

  const thread = threads.find((t) => t.id === threadId);
  const displayName = thread?.name || title || 'Chat';
  const avatarColor = thread?.avatarColor || avatarColorFromName(displayName);
  const isDirect = thread?.isDirect ?? !thread?.isGroup;

  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [readReceipts, setReadReceipts] = useState<MessengerReadReceipt[]>([]);
  const [groupMembers, setGroupMembers] = useState<MessengerGroupMember[]>([]);
  const [seenViewers, setSeenViewers] = useState<MessageViewer[]>([]);
  const [seenSheetOpen, setSeenSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftSel, setDraftSel] = useState({ start: 0, end: 0 });
  const [pendingFiles, setPendingFiles] = useState<PendingChatFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const [actionMsg, setActionMsg] = useState<MessengerMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [seenRevealedId, setSeenRevealedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const initialScrollDone = useRef(false);

  const peerPresence: UserPresence | null = thread?.peerId
    ? getPeerPresence(thread.peerId)
    : null;
  const statusLabel = isDirect
    ? formatChatHeaderPresenceLabel(peerPresence)
    : 'Nhóm chat · realtime';

  const isGroupChat = !isDirect;

  const mentionUi = useMemo(
    () => (isGroupChat
      ? buildMentionPickerItems(draft, draftSel.end, groupMembers, String(myUserId))
      : { open: false, start: 0, items: [] }),
    [draft, draftSel.end, groupMembers, isGroupChat, myUserId],
  );

  const handleReply = useCallback(
    (msg: MessengerMessage) => {
      setReplyTo(msg);
      if (!isGroupChat || String(msg.user_id) === String(myUserId)) return;
      const name = senderDisplayName(msg);
      const mention = `@${name} `;
      setDraft((prev) => {
        if (prev.includes(`@${name}`)) return prev;
        return prev.trim() ? prev : mention;
      });
      setDraftSel({ start: mention.length, end: mention.length });
    },
    [isGroupChat, myUserId],
  );

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

  const openSeenSheet = useCallback(
    (message: MessengerMessage) => {
      setSeenViewers(getSeenByForMessage(message, readReceipts, myUserId, groupMembers));
      setSeenSheetOpen(true);
    },
    [readReceipts, myUserId, groupMembers],
  );

  const handleTapMine = useCallback((message: MessengerMessage) => {
    setSeenRevealedId((prev) => (prev === message.id ? null : message.id));
    setSeenSheetOpen(false);
  }, []);

  useEffect(() => {
    setMessengerFileForwardContext({ excludeGroupId: threadId, sourceTitle: displayName });
    return () => setMessengerFileForwardContext(null);
  }, [threadId, displayName]);

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
    if (isDirect) return undefined;
    const bind = (socket: NonNullable<ReturnType<typeof getAppSocket>>) => {
      const onStarted = (info: ActiveGroupCallInfo) => {
        if (info?.groupId && String(info.groupId) === String(threadId)) {
          setActiveGroupCall(info);
        }
      };
      const onEnded = ({ groupId, callId }: { groupId?: string; callId?: string }) => {
        setActiveGroupCall((cur) => {
          if (!cur) return null;
          if (groupId && String(groupId) !== String(threadId)) return cur;
          if (callId && cur.callId !== callId) return cur;
          return null;
        });
      };
      socket.on('call:group_room_started', onStarted);
      socket.on('call:group_room_ended', onEnded);
      socket.emit('call:group_room_query', { groupId: threadId });
      return () => {
        socket.off('call:group_room_started', onStarted);
        socket.off('call:group_room_ended', onEnded);
      };
    };
    const socket = getAppSocket();
    let unbind = socket ? bind(socket) : undefined;
    const unsub = subscribeAppSocket((s) => {
      unbind?.();
      unbind = bind(s);
    });
    return () => {
      unbind?.();
      unsub();
    };
  }, [threadId, isDirect]);

  useEffect(() => {
    if (!openSearchParam) return;
    setSearchOpen(true);
    navigation.setParams({ openSearch: undefined });
  }, [openSearchParam, navigation]);

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
    if (isDirect) {
      setGroupMembers([]);
      return;
    }
    let cancelled = false;
    void fetchMessengerGroupDetail(threadId)
      .then((g) => {
        if (!cancelled) setGroupMembers(g.members);
      })
      .catch(() => {
        if (!cancelled) setGroupMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, isDirect]);

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
      if (evt.type === 'updated' && evt.name) {
        navigation.setParams({ title: evt.name });
      }
    });
  }, [threadId, subscribeMessengerMeta, mergeIncoming, navigation]);

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
      const mentionIds = isGroupChat
        ? resolveMentionIdsFromContent(text, groupMembers, { excludeUserId: myUserId })
        : [];
      const sendOpts = { replyTo: replyId, mentionUserIds: mentionIds.length ? mentionIds : undefined };

      if (!filesToSend.length) {
        const sent = await sendText(threadId, text, sendOpts);
        mergeIncoming(sent);
      } else {
        const sent = await sendMessengerWithFiles(threadId, {
          content: text,
          replyTo: replyId,
          mentionUserIds: mentionIds.length ? mentionIds : undefined,
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

  const sendVoiceMessage = async (file: PendingChatFile) => {
    if (sending) return;
    const sizeErr = validatePendingFiles([file]);
    if (sizeErr) {
      setToast({ message: sizeErr, kind: 'error' });
      return;
    }
    setSending(true);
    const replyId = replyTo?.id || null;
    try {
      const mentionIds = isGroupChat
        ? resolveMentionIdsFromContent('', groupMembers, { excludeUserId: myUserId })
        : [];
      const sent = await sendMessengerWithFiles(threadId, {
        content: '',
        replyTo: replyId,
        mentionUserIds: mentionIds.length ? mentionIds : undefined,
        files: [file],
      });
      mergeIncoming(sent);
      setReplyTo(null);
      refreshReceipts();
    } catch (e) {
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
      const mentionIds = isGroupChat
        ? resolveMentionIdsFromContent(buildStickerContent(emoji), groupMembers, { excludeUserId: myUserId })
        : [];
      const sent = await sendText(threadId, buildStickerContent(emoji), {
        replyTo: replyTo?.id || null,
        mentionUserIds: mentionIds.length ? mentionIds : undefined,
      });
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
      peerId: thread?.peerId || null,
      messagesJson: JSON.stringify(visibleMessages),
    });
  }, [navigation, threadId, displayName, avatarColor, thread?.avatarUrl, thread?.peerId, isDirect, visibleMessages]);

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const idx = listData.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      setHighlightId(messageId);
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setTimeout(() => setHighlightId(null), 1800);
    },
    [listData],
  );

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
        replyPreviewLabel: {
          color: mc.accent,
          fontSize: 12,
          fontWeight: '800',
        },
        replyPreviewTxt: { flex: 1, color: colors.textMuted, fontSize: 13 },
        mentionPanel: {
          marginHorizontal: Spacing.md,
          marginBottom: 6,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgElevated,
          maxHeight: 160,
          overflow: 'hidden',
        },
        mentionRow: {
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        mentionRowTxt: { color: colors.text, fontSize: 14, fontWeight: '600' },
        mentionAllTxt: { color: mc.accent, fontSize: 14, fontWeight: '800' },
        swipeHint: {
          textAlign: 'center',
          color: colors.textFaint,
          fontSize: 11,
          paddingVertical: 6,
        },
        groupCallBanner: {
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: mc.accentSoft,
          borderWidth: 1,
          borderColor: mc.accent,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        groupCallTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
        groupCallSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
        groupCallBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: mc.accent,
        },
        groupCallBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
        onBack={() => {
          if (fromBubble) {
            try {
              Overlay?.minimizeApp?.();
            } catch {
              navigation.goBack();
            }
            return;
          }
          navigation.goBack();
        }}
        onOpenDetails={openDetails}
      />

      {!isDirect && activeGroupCall && callStatus === 'idle' && (
        <View style={styles.groupCallBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupCallTitle}>
              Cuộc gọi {activeGroupCall.kind === 'video' ? 'video' : 'thoại'} đang diễn ra
            </Text>
            <Text style={styles.groupCallSub} numberOfLines={1}>
              {activeGroupCall.hostName ? `${activeGroupCall.hostName} đã bắt đầu` : 'Có cuộc gọi trong nhóm'}
            </Text>
          </View>
          <Pressable style={styles.groupCallBtn} onPress={() => joinGroupCall(activeGroupCall)}>
            <Text style={styles.groupCallBtnTxt}>Tham gia</Text>
          </Pressable>
        </View>
      )}

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
              const cluster = getMessageClusterMeta(item, listData, index, myUserId, isGroupChat);
              return (
                <View>
                  {showDate ? <ChatDateSeparator date={String(item.created_at || '')} /> : null}
                  <ChatMessageRow
                    item={item}
                    mine={mine}
                    myId={String(myUserId)}
                    timeStr={formatMessageTime(item.created_at)}
                    isLastMine={item.id === lastMineId}
                    replyParent={replyParent}
                    isGroupChat={isGroupChat}
                    groupMembers={groupMembers}
                    readReceipts={readReceipts}
                    onShowSeen={openSeenSheet}
                    seenRevealed={seenRevealedId === item.id}
                    onTapMine={handleTapMine}
                    showAvatar={cluster.showAvatar}
                    showSenderName={cluster.showSenderName}
                    showClusterDivider={cluster.showClusterDivider}
                    clusterTight={cluster.clusterTight}
                    showTimeInBubble={cluster.showTimeInBubble}
                    onReply={handleReply}
                    onOpenActions={openMessageActions}
                    onToggleReaction={onToggleReaction}
                    onOpenImage={setLightboxUrl}
                    onJumpToReply={jumpToMessage}
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
            <View style={{ flex: 1 }}>
              <Text style={styles.replyPreviewLabel}>Trả lời</Text>
              <Text style={styles.replyPreviewTxt} numberOfLines={2}>
                {formatReplyComposerLabel(replyTo)}
              </Text>
            </View>
            <TapHighlight onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TapHighlight>
          </View>
        ) : null}

        {mentionUi.open && !sending ? (
          <View style={styles.mentionPanel}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {mentionUi.items.map((item) => (
                <Pressable
                  key={item.key}
                  style={styles.mentionRow}
                  onPress={() => {
                    const { text, cursor } = applyMentionPickToDraft(
                      draft,
                      draftSel.end,
                      mentionUi.start,
                      item,
                    );
                    setDraft(text);
                    setDraftSel({ start: cursor, end: cursor });
                  }}
                >
                  <Text style={item.type === 'all' ? styles.mentionAllTxt : styles.mentionRowTxt}>
                    {item.type === 'all'
                      ? `@${MESSENGER_MENTION_ALL_LABEL}`
                      : `@${item.mem.name}`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <ChatComposer
          draft={draft}
          sending={sending}
          pendingFiles={pendingFiles}
          emojiOpen={emojiOpen}
          paddingBottom={composerPadBottom}
          onChangeDraft={setDraft}
          onSelectionChange={(start, end) => setDraftSel({ start, end })}
          placeholder={isGroupChat ? 'Nhắn tin… (@ nhắc tên)' : 'Nhắn tin...'}
          onSend={() => void sendMessage()}
          onToggleEmoji={() => {
            if (!emojiOpen) Keyboard.dismiss();
            setAttachOpen(false);
            setEmojiOpen((v) => !v);
          }}
          onAttach={onAttachPress}
          onRemoveFile={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
          onInputFocus={() => setAttachOpen(false)}
          onVoiceSend={(file) => sendVoiceMessage(file)}
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

      <ImageLightbox uri={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      <ChatSearchSheet
        visible={searchOpen}
        messages={visibleMessages}
        myUserId={String(myUserId)}
        onDismiss={() => setSearchOpen(false)}
        onJumpTo={jumpToMessage}
      />

      <MessageSeenSheet
        visible={seenSheetOpen}
        viewers={seenViewers}
        onDismiss={() => setSeenSheetOpen(false)}
      />

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
            handleReply(actionMsg);
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
