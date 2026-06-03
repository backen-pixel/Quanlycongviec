import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { io, type Socket } from 'socket.io-client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, getStoredToken, postMultipart } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupDetail, MessengerMessage, MessengerReadReceipt } from '../types/messenger';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { chatDebugClear, chatDebugLog, chatDebugSnapshot, chatDebugSubscribe } from '../lib/chatDebug';
import { useNotifications } from '../context/NotificationContext';
import {
  ensureOverlayPermissionInteractive,
  hideBubbleForConversation,
  minimizeApp,
  showBubbleForConversation,
} from '../lib/floatingBubbleOverlay';
import { ChatMessageRow, ReactionPickerBar } from '../components/chat/ChatMessageRow';
import { formatReplyPreview } from '../lib/messengerPreview';

const { width: SW } = Dimensions.get('window');
/** Tone Messenger-Violet — nền sáng, bubble mình tím-xanh, bubble người khác trắng. */
const CHAT_BG = '#F2F4F8';
const BUBBLE_ME = '#6C5CE7';
const BUBBLE_ME_DARK = '#5848D2';
const BUBBLE_OTHER = '#FFFFFF';
const BUBBLE_OTHER_BORDER = '#E5E7EB';

/** Câu trả lời nhanh — chips trên composer, tap để chèn vào ô soạn. */
const QUICK_REPLIES: { icon: keyof typeof Ionicons.glyphMap | null; text: string }[] = [
  { icon: 'flash', text: 'Đã nhận' },
  { icon: null, text: 'Sẽ phản hồi sau' },
  { icon: null, text: 'Cần thêm info?' },
];

/** Regex unicode pictographic — phát hiện tin nhắn chỉ gồm emoji. */
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const NON_EMOJI_RE = /[\p{L}\p{N}_]/u;
function isEmojiOnly(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.length > 12) return false;
  if (NON_EMOJI_RE.test(t)) return false;
  return EMOJI_RE.test(t);
}

/* ─── helpers ─────────────────────────────────────────────────── */
function mediaUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (u.startsWith('http')) return u;
  return `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`;
}

function isSameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  const aa = String(a || '');
  const bb = String(b || '');
  if (!aa || !bb) return false;
  return aa.slice(0, 10) === bb.slice(0, 10);
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function initials(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(name: string): string {
  const COLORS = ['#0068FF', '#FF5B5B', '#FF9F1C', '#2EC4B6', '#8338EC', '#E040FB'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function isAudioMsg(m: MessengerMessage): boolean {
  return m.message_type === 'voice' || (m.attachment_mime || '').startsWith('audio/');
}
function isImageMsg(m: MessengerMessage): boolean {
  if (m.message_type === 'image') return true;
  if ((m.attachment_mime || '').startsWith('image/')) return true;
  const u = mediaUrl(m.attachment_url);
  if (u && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) return true;
  return (Array.isArray(m.attachments) ? m.attachments : []).some((a) => {
    if ((a.type || '').startsWith('image/')) return true;
    const au = mediaUrl(a.url);
    return !!au && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(au);
  });
}

/**
 * Trả về URL ảnh đầu tiên của 1 message (ưu tiên attachment_url, sau đó tới
 * attachments[]). Dùng cho preview ảnh trong sheet thông tin nhóm.
 */
function firstImageUrl(m: MessengerMessage): string | null {
  const u1 = mediaUrl(m.attachment_url);
  if (u1 && (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u1) || (m.attachment_mime || '').startsWith('image/') || m.message_type === 'image')) {
    return u1;
  }
  const list = Array.isArray(m.attachments) ? m.attachments : [];
  for (const a of list) {
    const au = mediaUrl(a.url);
    if (au && ((a.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(au))) {
      return au;
    }
  }
  return null;
}

/* ─── AudioPlayer mini-component ──────────────────────────────── */
function AudioPlayer({ url, mine }: { url: string; mine: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);

  useEffect(
    () => () => {
      soundRef.current?.unloadAsync().catch(() => {});
    },
    [],
  );

  const toggle = async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (st) => {
            if (!st.isLoaded) return;
            setPlaying(st.isPlaying);
            setDur(st.durationMillis ?? 0);
            setPos(st.positionMillis);
            if (st.didJustFinish) {
              setPlaying(false);
              setPos(0);
            }
          },
        );
        soundRef.current = sound;
        setPlaying(true);
      } else {
        const st = await soundRef.current.getStatusAsync();
        if (st.isLoaded && st.isPlaying) {
          await soundRef.current.pauseAsync();
        } else {
          await soundRef.current.playAsync();
        }
      }
    } catch {
      Alert.alert('Lỗi', 'Không phát được âm thanh');
    }
  };

  const pct = dur > 0 ? pos / dur : 0;

  return (
    <TouchableOpacity
      style={[s.audioPlayer, mine && s.audioPlayerMine]}
      onPress={() => void toggle()}
      activeOpacity={0.8}
    >
      <Text style={[s.audioPlayBtn, mine && s.audioPlayBtnMine]}>{playing ? '⏸' : '▶'}</Text>
      <View style={s.audioTrack}>
        <View style={[s.audioFill, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
        {[4, 10, 6, 14, 9, 6, 12, 8, 5, 11, 7, 4, 9, 6].map((h, i) => (
          <View
            key={i}
            style={[
              s.audioBar,
              {
                height: h,
                backgroundColor:
                  i / 14 <= pct
                    ? mine
                      ? '#fff'
                      : BUBBLE_ME
                    : mine
                      ? 'rgba(255,255,255,0.35)'
                      : '#C8D0E0',
              },
            ]}
          />
        ))}
      </View>
      <Text style={[s.audioDur, mine && s.audioDurMine]}>
        {playing ? fmtSecs(pos / 1000) : fmtSecs(dur / 1000)}
      </Text>
    </TouchableOpacity>
  );
}

/* ─── types ────────────────────────────────────────────────────── */
type R = RouteProp<MoreStackParamList, 'MessengerGroupChat'>;
type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerGroupChat'>;
type InfoTab = 'members' | 'images' | 'files' | 'audio';
type RecState = 'idle' | 'recording' | 'done';

interface Props {
  overrideGroupId?: string;
  overrideTitle?: string;
  /** Đánh dấu screen được mở từ bong bóng (Bubbles/overlay) — Back sẽ moveTaskToBack thay vì pop. */
  overrideFromBubble?: boolean;
}

/* ─── main screen ─────────────────────────────────────────────── */
export default function MessengerGroupChatScreen({
  overrideGroupId,
  overrideTitle,
}: Props = {}) {
  const routeResult = useRoute<R>();
  const params = overrideGroupId
    ? { groupId: overrideGroupId, title: overrideTitle, isDirect: false }
    : routeResult.params;
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const insets = useSafeAreaInsets();
  const { refreshUnread } = useNotifications();

  const { groupId, title: titleParam, isDirect: isDirectParam } = params;

  const [group, setGroup] = useState<MessengerGroupDetail | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<InfoTab>('members');
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugText, setDebugText] = useState('');

  // Rename group modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Emoji picker panel
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Long-press → reaction / reply / recall bar
  const [actionMsg, setActionMsg] = useState<MessengerMessage | null>(null);

  // Pinned (sync với /messenger/pins)
  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  // Read receipts của các thành viên trong group (Đã xem / Đã gửi)
  const [readReceipts, setReadReceipts] = useState<MessengerReadReceipt[]>([]);

  // Voice recording
  const [recState, setRecState] = useState<RecState>('idle');
  const [recDur, setRecDur] = useState(0);
  const recRef = useRef<Audio.Recording | null>(null);
  const recUri = useRef<string | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const isAtBottom = useRef(true);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
    isAtBottom.current = isCloseToBottom;
  };

  const isDirectChat = !!(group?.is_direct ?? isDirectParam);

  /** Đối tác trong chat 1-1 — null cho group chat. */
  const peerMember = useMemo(() => {
    if (!isDirectChat || !Array.isArray(group?.members)) return null;
    return group!.members!.find((m) => String(m.user_id) !== myId) || null;
  }, [isDirectChat, group, myId]);

  /**
   * Tên hiển thị trên header chat:
   *  • Chat 1-1: lấy biệt danh (nếu user tự đặt) → fallback `full_name` của
   *    thành viên KHÔNG phải mình. Cuối cùng mới fallback `group.name`
   *    (vốn có prefix "Trò chuyện: …" backend tự sinh — dài và xấu).
   *  • Group chat: dùng `group.name`.
   */
  const [peerNickname, setPeerNickname] = useState<string | null>(null);
  useEffect(() => {
    if (!isDirectChat || !peerMember?.user_id) { setPeerNickname(null); return; }
    void AsyncStorage.getItem(`messenger.nick.${peerMember.user_id}`).then(setPeerNickname).catch(() => {});
  }, [isDirectChat, peerMember?.user_id]);

  const displayTitle = useMemo(() => {
    if (isDirectChat) {
      const nm = peerNickname?.trim() || peerMember?.user?.full_name?.trim();
      if (nm) return nm;
    }
    return group?.name || titleParam || 'Chat nhóm';
  }, [isDirectChat, peerNickname, peerMember, group, titleParam]);

  /** Avatar URL dùng cho header / sheet — peer cho 1-1, group.avatar cho nhóm. */
  const displayAvatarUrl = useMemo(() => {
    if (isDirectChat) return peerMember?.user?.avatar ? mediaUrl(peerMember.user.avatar) : null;
    return group?.avatar ? mediaUrl(group.avatar) : null;
  }, [isDirectChat, peerMember, group]);

  /* ── debug log ─────────────────────────────────────── */
  useEffect(() => {
    const upd = () => {
      const rows = chatDebugSnapshot();
      setDebugText(
        rows.map((r) => `${r.at} [${r.scope}] ${r.message}`).join('\n'),
      );
    };
    upd();
    return chatDebugSubscribe(upd);
  }, []);


  /* ── load ──────────────────────────────────────────── */
  const loadReceipts = useCallback(async () => {
    try {
      const r = await api.get<MessengerReadReceipt[]>(`/messenger/groups/${groupId}/read-receipts`);
      setReadReceipts(Array.isArray(r.data) ? r.data : []);
    } catch {
      /* không critical, bỏ qua */
    }
  }, [groupId]);

  const loadPinned = useCallback(async () => {
    try {
      const r = await api.get<{ group_ids?: string[] }>('/messenger/pins').catch(() => ({ data: { group_ids: [] } }));
      const ids = new Set((r.data?.group_ids || []).map(String));
      setPinned(ids.has(String(groupId)));
    } catch {
      setPinned(false);
    }
  }, [groupId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      chatDebugLog('messenger', 'GET group+chat', { groupId });
      const [gRes, mRes] = await Promise.all([
        api.get<MessengerGroupDetail>(`/messenger/groups/${groupId}`),
        api.get<MessengerMessage[]>(`/messenger/groups/${groupId}/chat`),
      ]);
      setGroup(gRes.data);
      const rows = Array.isArray(mRes.data) ? mRes.data : [];
      setMessages(rows);
      seenIds.current = new Set(rows.map((r) => String(r.id)));
      void loadReceipts();
      void loadPinned();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tải được');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, loadReceipts, loadPinned]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
      // PATCH read trước → backend cũng đánh dấu các notification thuộc nhóm này
      // là đã đọc → refreshUnread() sau đó sẽ lấy số chính xác cho badge tab.
      void (async () => {
        try { await api.patch(`/messenger/groups/${groupId}/read`); } catch { /* */ }
        void refreshUnread();
      })();
      // Khi user đang xem chat này → ẩn bong bóng của chính nhóm (nếu đang nổi)
      // để khỏi đè nội dung. Bubble sẽ tự xuất hiện lại khi user nhấn nút
      // "Thu nhỏ" hoặc khi có tin mới mà app đang ở nền.
      hideBubbleForConversation(groupId);
    }, [refreshUnread, loadAll, groupId]),
  );

  /**
   * Thu nhỏ chat thành bong bóng nổi trên màn hình ngoài app:
   *  1) Kiểm tra quyền `SYSTEM_ALERT_WINDOW`. Nếu chưa có → hỏi user mở
   *     Cài đặt (ensureOverlayPermissionInteractive xử lý alert + intent).
   *  2) Bật bubble cho group hiện hành (avatar = chữ cái đầu tên nhóm).
   *  3) Đẩy app về nền — UX giống Messenger "Nhỏ thành chat head".
   */
  /** Toggle ghim hội thoại — đồng bộ với /messenger/pins (dùng chung với list). */
  const togglePin = useCallback(async () => {
    if (pinBusy) return;
    const next = !pinned;
    setPinBusy(true);
    setPinned(next);
    try {
      await api.put(`/messenger/pins/${groupId}`, { pinned: next });
    } catch (e: unknown) {
      setPinned(!next);
      Alert.alert(
        'Lỗi',
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Không cập nhật được trạng thái ghim',
      );
    } finally {
      setPinBusy(false);
    }
  }, [pinBusy, pinned, groupId]);

  /** Mở modal đổi tên / biệt danh. */
  const openRename = useCallback(() => {
    if (isDirectChat) {
      setRenameDraft(peerNickname || peerMember?.user?.full_name || '');
    } else {
      setRenameDraft(group?.name || displayTitle);
    }
    setRenameOpen(true);
  }, [isDirectChat, peerNickname, peerMember, group?.name, displayTitle]);

  const submitRename = useCallback(async () => {
    const v = renameDraft.trim();
    if (!v) {
      Alert.alert('Lỗi', 'Tên không được để trống');
      return;
    }
    // Chat 1-1 → lưu biệt danh local trong AsyncStorage (không gọi backend)
    if (isDirectChat && peerMember?.user_id) {
      setRenaming(true);
      try {
        await AsyncStorage.setItem(`messenger.nick.${peerMember.user_id}`, v);
        setPeerNickname(v);
        setRenameOpen(false);
      } finally {
        setRenaming(false);
      }
      return;
    }
    if (v === group?.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await api.patch(`/messenger/groups/${groupId}`, { name: v });
      setGroup((prev) => (prev ? { ...prev, name: v } : prev));
      setRenameOpen(false);
    } catch (e: unknown) {
      Alert.alert(
        'Lỗi',
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Không đổi được tên nhóm',
      );
    } finally {
      setRenaming(false);
    }
  }, [renameDraft, groupId, group?.name, isDirectChat, peerMember]);

  /** Upload avatar mới cho nhóm — chỉ leader/deputy. Cho 1-1 thì không cần
   *  (avatar lấy trực tiếp từ user của peer). */
  const onChangeGroupAvatar = useCallback(async () => {
    if (isDirectChat) {
      Alert.alert('Chat 1–1', 'Avatar lấy từ tài khoản đối tác, không đổi được tại đây.');
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const asset = res.assets[0];
      const form = new FormData();
      // @ts-expect-error RN FormData
      form.append('file', { uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.mimeType || 'image/jpeg' });
      const r = await api.patch<{ avatar?: string }>(`/messenger/groups/${groupId}/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = r.data?.avatar || null;
      setGroup((prev) => (prev ? { ...prev, avatar: url } : prev));
    } catch (e: unknown) {
      Alert.alert(
        'Lỗi',
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Không đổi được avatar',
      );
    }
  }, [groupId, isDirectChat]);

  const onMinimizeToBubble = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('iOS', 'Bong bóng nổi chỉ hỗ trợ trên Android.');
      return;
    }
    const ok = await ensureOverlayPermissionInteractive({
      title: 'Cấp quyền hiện bong bóng',
      message:
        'Để hiện bong bóng chat ngoài app (giống Messenger), TuBep CRM cần quyền "Hiển thị trên các ứng dụng khác". Mở Cài đặt để bật ngay?',
    });
    if (!ok) return;
    showBubbleForConversation({
      groupId,
      title: displayTitle,
      letter: displayTitle.trim().slice(0, 1).toUpperCase() || '?',
    });
    setTimeout(() => minimizeApp(), 80);
  }, [groupId, displayTitle]);

  useEffect(() => { listRef.current?.scrollToEnd({ animated: true }); }, [messages.length]);
  /** Khi xuất hiện reply chip / pending files / quick replies → layout list co lại;
   *  ép scrollToEnd để tin cuối luôn nhìn thấy. */
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, [replyTo, pendingFiles.length, recState]);
  useEffect(() => { navigation.setOptions({ title: displayTitle }); }, [navigation, displayTitle]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => show.remove();
  }, []);

  const messageById = useMemo(() => {
    const m = new Map<string, MessengerMessage>();
    for (const msg of messages) m.set(String(msg.id), msg);
    return m;
  }, [messages]);

  const toggleReaction = useCallback(
    async (msg: MessengerMessage, emoji: string) => {
      try {
        const r = await api.put<{ reactions?: MessengerMessage['reactions'] }>(
          `/messenger/groups/${groupId}/chat/${msg.id}/reaction`,
          { emoji },
        );
        const rx = r.data?.reactions || [];
        setMessages((prev) =>
          prev.map((m) => (String(m.id) === String(msg.id) ? { ...m, reactions: rx } : m)),
        );
      } catch (e: unknown) {
        Alert.alert(
          'Lỗi',
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Không gửi được cảm xúc',
        );
      }
    },
    [groupId],
  );

  const recallMessage = useCallback(
    async (msg: MessengerMessage) => {
      Alert.alert('Thu hồi tin nhắn', 'Bạn có chắc muốn thu hồi tin này?', [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Thu hồi',
          style: 'destructive',
          onPress: async () => {
            try {
              const r = await api.post<MessengerMessage>(
                `/messenger/groups/${groupId}/chat/${msg.id}/recall`,
              );
              setMessages((prev) =>
                prev.map((m) => (String(m.id) === String(msg.id) ? { ...m, ...r.data } : m)),
              );
              setActionMsg(null);
            } catch (e: unknown) {
              Alert.alert(
                'Lỗi',
                (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                  'Không thu hồi được',
              );
            }
          },
        },
      ]);
    },
    [groupId],
  );

  const openMessageActions = useCallback((msg: MessengerMessage) => {
    if (msg.is_system || msg.recalled_at || msg.is_recalled) return;
    setActionMsg(msg);
    setEmojiOpen(false);
    setMediaOpen(false);
  }, []);

  const canRecallMessage = useCallback(
    (msg: MessengerMessage) => {
      if (String(msg.user_id) !== myId || msg.recalled_at || msg.is_recalled || msg.is_system) return false;
      const t = msg.created_at ? new Date(msg.created_at).getTime() : 0;
      return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
    },
    [myId],
  );

  /* ── socket ────────────────────────────────────────── */
  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    const onConnect = () => socket?.emit('join:messenger_group', groupId);
    (async () => {
      const token = await getStoredToken();
      if (!token || cancelled) return;
      socket = io(API_ORIGIN, { auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1500 });
      socket.on('connect', onConnect);
      if (socket.connected) onConnect();
      socket.on('messenger_group:chat', (msg: MessengerMessage) => {
        if (!msg?.id) return;
        if (String(msg.group_id || '') !== String(groupId)) return;
        const id = String(msg.id);
        setMessages((prev) => {
          if (seenIds.current.has(id)) {
            const i = prev.findIndex((p) => String(p.id) === id);
            if (i >= 0) { const n = [...prev]; n[i] = msg; return n; }
            return prev;
          }
          seenIds.current.add(id);
          return [...prev, msg];
        });
      });
      socket.on('messenger_group:members', () => void loadAll());
      // Khi 1 thành viên đọc tin → cập nhật read receipts ngay (Đã xem)
      socket.on(
        'messenger_group:read',
        (ev: { group_id?: string; user_id?: string; last_read_at?: string }) => {
          if (String(ev?.group_id || '') !== String(groupId)) return;
          if (!ev?.user_id || !ev?.last_read_at) return;
          setReadReceipts((prev) => {
            const idx = prev.findIndex((r) => String(r.user_id) === String(ev.user_id));
            const next: MessengerReadReceipt = { user_id: String(ev.user_id), last_read_at: String(ev.last_read_at) };
            if (idx < 0) return [...prev, next];
            const copy = [...prev]; copy[idx] = next; return copy;
          });
        },
      );
      // Khi nhóm được cập nhật (đổi tên / avatar) → reload group detail
      socket.on('messenger_group:updated', (ev: { group_id?: string; name?: string }) => {
        if (String(ev?.group_id || '') !== String(groupId)) return;
        setGroup((prev) => (prev ? { ...prev, ...(ev.name ? { name: ev.name } : {}) } : prev));
      });
      socket.on(
        'messenger_group:reaction',
        (ev: { group_id?: string; message_id?: string; reactions?: MessengerMessage['reactions'] }) => {
          if (String(ev?.group_id || '') !== String(groupId) || !ev?.message_id) return;
          setMessages((prev) =>
            prev.map((m) =>
              String(m.id) === String(ev.message_id) ? { ...m, reactions: ev.reactions || [] } : m,
            ),
          );
        },
      );
    })();
    return () => {
      cancelled = true;
      try { socket?.off('connect', onConnect); } catch { /* */ }
      try { socket?.emit('leave:messenger_group', groupId); } catch { /* */ }
      socket?.disconnect();
    };
  }, [groupId, loadAll]);

  /* ── send ──────────────────────────────────────────── */
  const appendMsg = useCallback((msg: MessengerMessage) => {
    if (!msg?.id) return;
    const id = String(msg.id);
    if (seenIds.current.has(id)) return;
    seenIds.current.add(id);
    setMessages((prev) => [...prev, msg]);
  }, []);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) return;
    setSending(true);
    try {
      if (!pendingFiles.length) {
        const body: { content: string; reply_to?: string } = { content: text };
        if (replyTo?.id) body.reply_to = String(replyTo.id);
        const { data } = await api.post<MessengerMessage>(
          `/messenger/groups/${groupId}/chat`,
          body,
          { timeout: 120000, headers: { 'Content-Type': 'application/json' } },
        );
        setDraft(''); setPendingFiles([]); setReplyTo(null);
        appendMsg(data);
        return;
      }
      const form = new FormData();
      form.append('content', text);
      if (replyTo?.id) form.append('reply_to', String(replyTo.id));
      pendingFiles.forEach((f, i) => {
        const safeName = (f.name || '').trim() || `file_${Date.now()}_${i}.bin`;
        form.append('files', { uri: f.uri, name: safeName, type: f.type || 'application/octet-stream' } as unknown as Blob);
      });
      chatDebugLog('messenger', 'POST chat (files)', { groupId, count: pendingFiles.length });
      const { data } = await postMultipart<MessengerMessage>(`/messenger/groups/${groupId}/chat`, form, { timeoutMs: 120000 });
      setDraft(''); setPendingFiles([]); setReplyTo(null);
      appendMsg(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      Alert.alert('Lỗi gửi', err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Thất bại');
    } finally {
      setSending(false);
    }
  };

  /* ── media pickers ─────────────────────────────────── */
  const pickGallery = async () => {
    setMediaOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Cần quyền', 'Cho phép truy cập ảnh.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.85 });
    if (res.canceled || !res.assets?.length) return;
    setPendingFiles((p) => [...p, ...res.assets.map((a, i) => ({ uri: a.uri, name: a.fileName || `img_${Date.now()}_${i}.jpg`, type: a.mimeType || 'image/jpeg' }))]);
  };

  const takePhoto = async () => {
    setMediaOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Cần quyền camera', 'Bật Camera trong Cài đặt.'); return; }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    setPendingFiles((p) => [...p, { uri: a.uri, name: `cam_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' }]);
  };

  const pickFile = async () => {
    setMediaOpen(false);
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (pick.canceled || !pick.assets?.length) return;
    setPendingFiles((p) => [...p, ...pick.assets.map((a) => ({ uri: a.uri, name: a.name || 'file', type: a.mimeType || 'application/octet-stream' }))]);
  };

  /* ── voice recording ───────────────────────────────── */
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Cần quyền micro', 'Bật quyền micro trong Cài đặt.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = recording;
      recUri.current = null;
      setRecState('recording');
      setRecDur(0);
      recTimer.current = setInterval(() => setRecDur((d) => d + 1), 1000);
    } catch {
      Alert.alert('Lỗi', 'Không thể ghi âm');
    }
  };

  const stopRecording = async () => {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    try {
      const rec = recRef.current;
      if (!rec) { setRecState('idle'); return; }
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (uri) {
        recUri.current = uri;
        setRecState('done');
      } else {
        setRecState('idle');
      }
    } catch {
      setRecState('idle');
    }
  };

  const cancelRecording = async () => {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    try { await recRef.current?.stopAndUnloadAsync(); } catch { /* */ }
    recRef.current = null;
    recUri.current = null;
    setRecState('idle');
    setRecDur(0);
  };

  const sendVoice = async () => {
    const uri = recUri.current;
    if (!uri) { setRecState('idle'); return; }
    const fname = `voice_${Date.now()}.m4a`;
    setPendingFiles([{ uri, name: fname, type: 'audio/m4a' }]);
    recUri.current = null;
    setRecState('idle');
    setRecDur(0);
    // trigger send immediately
    setSending(true);
    try {
      const form = new FormData();
      form.append('content', '');
      form.append('files', { uri, name: fname, type: 'audio/m4a' } as unknown as Blob);
      const { data } = await postMultipart<MessengerMessage>(`/messenger/groups/${groupId}/chat`, form, { timeoutMs: 60000 });
      appendMsg(data);
      setPendingFiles([]);
    } catch {
      Alert.alert('Lỗi', 'Gửi ghi âm thất bại');
      setPendingFiles([]);
    } finally {
      setSending(false);
    }
  };

  /* ── leave group ───────────────────────────────────── */
  const leaveGroup = () => {
    Alert.alert('Rời nhóm', 'Bạn sẽ không còn nhận tin từ nhóm này.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Rời nhóm', style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/messenger/groups/${groupId}/leave`, {});
            setInfoOpen(false);
            navigation.goBack();
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không rời được');
          }
        },
      },
    ]);
  };

  /* ── media extracted from messages ────────────────── */
  const sharedImages = useMemo(() => messages.filter(isImageMsg), [messages]);
  const sharedFiles = useMemo(
    () => messages.filter((m) => !isImageMsg(m) && !isAudioMsg(m) && (m.attachment_url || (Array.isArray(m.attachments) ? m.attachments : []).length > 0)),
    [messages],
  );
  const sharedAudio = useMemo(() => messages.filter(isAudioMsg), [messages]);

  /** ID tin nhắn cuối cùng do MÌNH gửi — dùng để gắn dòng "Đã gửi / Đã xem". */
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.is_system && String(m.user_id) === myId) return String(m.id);
    }
    return '';
  }, [messages, myId]);

  /**
   * Tính trạng thái đọc cho tin cuối của mình:
   *  • Đã xem bởi N người: receipts có last_read_at ≥ created_at của tin và
   *    user_id khác myId.
   *  • Nếu chưa ai đọc → "Đã gửi".
   */
  const lastMineSeen = useMemo(() => {
    if (!lastMineId) return null;
    const msg = messages.find((m) => String(m.id) === lastMineId);
    if (!msg?.created_at) return null;
    const t = new Date(msg.created_at).getTime();
    if (!Number.isFinite(t)) return null;
    const seenBy = readReceipts.filter((r) => {
      if (String(r.user_id) === myId) return false;
      const rt = new Date(r.last_read_at).getTime();
      return Number.isFinite(rt) && rt >= t;
    });
    return { count: seenBy.length, seenBy };
  }, [lastMineId, messages, readReceipts, myId]);

  /** Tìm tên người đã xem (rút gọn): "Đã xem · An, Bình" / "Đã xem bởi 5 người". */
  const lastMineSeenLabel = useMemo(() => {
    if (!lastMineSeen) return '';
    if (lastMineSeen.count === 0) return 'Đã gửi';
    const names = lastMineSeen.seenBy.map((r) => {
      const mem = group?.members?.find((m) => String(m.user_id) === String(r.user_id));
      return mem?.user?.full_name || '';
    }).filter(Boolean);
    if (isDirectChat || lastMineSeen.count <= 2) {
      return names.length ? `Đã xem · ${names.join(', ')}` : `Đã xem`;
    }
    return `Đã xem bởi ${lastMineSeen.count} người`;
  }, [lastMineSeen, group?.members, isDirectChat]);

  /* ── render message ────────────────────────────────── */
  const renderMsg = useCallback(
    ({ item, index }: { item: MessengerMessage; index: number }) => {
      const mine = String(item.user_id) === myId;
      const prev = messages[index - 1];
      const showDate = !prev || !isSameDay(prev.created_at, item.created_at);

      if (item.is_system) {
        return (
          <View>
            {showDate && <DateSep date={String(item.created_at || '')} />}
            <View style={s.sysWrap}>
              <Text style={s.sysTxt}>{item.content || '—'}</Text>
            </View>
          </View>
        );
      }

      const isBot = !!item.user?.is_bot;
      const timeStr = (() => {
        const d = item.created_at ? new Date(item.created_at) : null;
        if (!d || Number.isNaN(d.getTime())) return formatDateTime(item.created_at);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })();

      const replyParent = item.reply_to ? messageById.get(String(item.reply_to)) || null : null;

      return (
        <View>
          {showDate && <DateSep date={String(item.created_at || '')} />}
          <ChatMessageRow
            item={item}
            mine={mine}
            myId={myId}
            isDirectChat={isDirectChat}
            showName={!mine && (!isDirectChat || isBot)}
            timeStr={timeStr}
            bubbleMe={BUBBLE_ME}
            bubbleMeDark={BUBBLE_ME_DARK}
            bubbleOther={BUBBLE_OTHER}
            bubbleOtherBorder={BUBBLE_OTHER_BORDER}
            mediaUrl={mediaUrl}
            avatarColor={avatarColor}
            initials={initials}
            isAudioMsg={isAudioMsg}
            isEmojiOnly={isEmojiOnly}
            renderAudio={(url) => <AudioPlayer url={url} mine={mine} />}
            isLastMine={mine && String(item.id) === lastMineId}
            lastMineSeenLabel={lastMineSeenLabel}
            lastMineSeenCount={lastMineSeen?.count ?? 0}
            onReply={setReplyTo}
            onOpenActions={openMessageActions}
            onToggleReaction={toggleReaction}
            replyParent={replyParent}
          />
        </View>
      );
    },
    [
      myId,
      isDirectChat,
      messages,
      messageById,
      lastMineId,
      lastMineSeen,
      lastMineSeenLabel,
      openMessageActions,
      toggleReaction,
    ],
  );

  const replyLabel = useMemo(() => {
    if (!replyTo) return '';
    return formatReplyPreview(replyTo);
  }, [replyTo]);

  if (loading && messages.length === 0) {
    return <View style={s.center}><ActivityIndicator color={BUBBLE_ME} size="large" /></View>;
  }

  const composerPadBottom =
    Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 4);

  const headerBarHeight = Math.max(insets.top, 6) + 8 + 52;

  return (
    <View style={s.flex}>
      {/* Header info bar — cố định, không co theo bàn phím */}
      <View style={[s.headerBar, { paddingTop: Math.max(insets.top, 6) + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.headerBackBtn}
          hitSlop={8}
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={22} color={CrmColors.gray800} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.headerLeft}
          onPress={() => { setInfoOpen(true); setInfoTab('members'); }}
          activeOpacity={0.85}
        >
          <View style={s.headerAvatarWrap}>
            {displayAvatarUrl ? (
              <Image source={{ uri: displayAvatarUrl }} style={[s.headerAvatar, { backgroundColor: avatarColor(displayTitle) }]} />
            ) : (
              <View style={[s.headerAvatar, { backgroundColor: avatarColor(displayTitle) }]}>
                <Text style={s.headerAvatarTxt}>{initials(displayTitle)}</Text>
              </View>
            )}
            <View style={s.headerStatusDot} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.headerName} numberOfLines={1}>{displayTitle}</Text>
            <View style={s.headerSubRow}>
              <View style={s.headerSubDot} />
              <Text style={s.headerSub} numberOfLines={1}>
                {isDirectChat ? 'Đang hoạt động' : `${group?.members?.length ?? 0} thành viên`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={s.headerActions}>
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Gọi thoại', 'Tính năng cuộc gọi đang được hoàn thiện.', [{ text: 'OK' }])
            }
            style={s.headerActionBtn}
            hitSlop={6}
            accessibilityLabel="Gọi thoại"
          >
            <Ionicons name="call" size={18} color={CrmColors.gray800} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setInfoOpen(true); setInfoTab('members'); }}
            style={s.headerActionBtn}
            hitSlop={6}
            accessibilityLabel="Tuỳ chọn nhóm"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={CrmColors.gray800} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerBarHeight : 0}
      >
      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderMsg}
        style={s.msgList}
        contentContainerStyle={s.msgPad}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (isAtBottom.current) {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
      />

      {/* Reaction / reply / recall bar (long-press tin nhắn) */}
      {actionMsg && recState === 'idle' ? (
        <ReactionPickerBar
          onPick={(emoji) => {
            void toggleReaction(actionMsg, emoji);
            setActionMsg(null);
          }}
          onReply={() => {
            setReplyTo(actionMsg);
            setActionMsg(null);
          }}
          canRecall={canRecallMessage(actionMsg)}
          onRecall={
            canRecallMessage(actionMsg)
              ? () => void recallMessage(actionMsg)
              : undefined
          }
        />
      ) : null}

      {/* Reply chip */}
      {replyTo ? (
        <View style={s.replyChip}>
          <View style={s.replyChipBar} />
          <View style={{ flex: 1 }}>
            <Text style={s.replyChipLabel}>Trả lời tin nhắn</Text>
            <Text style={s.replyChipTxt} numberOfLines={1}>{replyLabel}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={CrmColors.gray500} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Pending files */}
      {pendingFiles.length > 0 ? (
        <ScrollView
          horizontal
          style={s.pendingRow}
          contentContainerStyle={{ padding: 8, gap: 8 }}
          showsHorizontalScrollIndicator={false}
        >
          {pendingFiles.map((f, i) => {
            const isImg = f.type.startsWith('image/');
            return (
              <View key={i} style={s.pendingThumb}>
                {isImg ? (
                  <Image source={{ uri: f.uri }} style={s.pendingImg} />
                ) : (
                  <View style={s.pendingFile}>
                    <Text style={s.pendingFileIcon}>{f.type.startsWith('audio/') ? '🎵' : '📎'}</Text>
                    <Text style={s.pendingFileName} numberOfLines={1}>{f.name}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.pendingDel}
                  onPress={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Recording UI */}
      {recState === 'recording' ? (
        <View style={s.recBar}>
          <View style={s.recDot} />
          <Text style={s.recDurTxt}>Đang ghi âm…  {fmtSecs(recDur)}</Text>
          <TouchableOpacity style={s.recCancel} onPress={() => void cancelRecording()}>
            <Text style={s.recCancelTxt}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.recStop} onPress={() => void stopRecording()}>
            <Ionicons name="stop" size={14} color="#fff" />
            <Text style={s.recStopTxt}>Dừng</Text>
          </TouchableOpacity>
        </View>
      ) : recState === 'done' ? (
        <View style={[s.recBar, s.recBarDone]}>
          <Ionicons name="musical-notes" size={16} color="#0ea5a4" />
          <Text style={[s.recDurTxt, s.recDurTxtDone]}>Đã ghi {fmtSecs(recDur)} giây</Text>
          <TouchableOpacity style={s.recCancel} onPress={() => void cancelRecording()}>
            <Text style={s.recCancelTxt}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.recStop, { backgroundColor: BUBBLE_ME }]} onPress={() => void sendVoice()}>
            <Ionicons name="send" size={13} color="#fff" />
            <Text style={s.recStopTxt}>Gửi</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Quick replies — chips chèn nhanh vào ô soạn */}
      {recState === 'idle' && !replyTo && pendingFiles.length === 0 ? (
        <View style={s.quickWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.quickRow}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_REPLIES.map((q) => (
              <TouchableOpacity
                key={q.text}
                style={s.quickChip}
                activeOpacity={0.85}
                onPress={() => setDraft((d) => (d ? `${d} ${q.text}` : q.text))}
              >
                {q.icon ? <Ionicons name={q.icon} size={12} color={BUBBLE_ME} /> : null}
                <Text style={s.quickChipTxt} numberOfLines={1}>
                  {q.text}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Composer */}
      {recState === 'idle' ? (
        <View style={[s.composer, { paddingBottom: composerPadBottom }]}>
          <TouchableOpacity
            style={[s.composerIcon, mediaOpen && s.composerIconOn]}
            onPress={() => setMediaOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={mediaOpen ? 'close' : 'add'}
              size={22}
              color={mediaOpen ? '#fff' : CrmColors.gray700}
            />
          </TouchableOpacity>

          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Tin nhắn…"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={8000}
              onFocus={() => {
                setEmojiOpen(false);
                setMediaOpen(false);
                setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
              }}
            />
            <TouchableOpacity
              style={s.inputEmojiBtn}
              activeOpacity={0.7}
              onPress={() => { setEmojiOpen((v) => !v); setMediaOpen(false); }}
              accessibilityLabel="Chèn emoji"
            >
              <Ionicons
                name={emojiOpen ? 'happy' : 'happy-outline'}
                size={20}
                color={emojiOpen ? BUBBLE_ME : CrmColors.gray500}
              />
            </TouchableOpacity>
          </View>

          {draft.trim() || pendingFiles.length > 0 ? (
            <TouchableOpacity
              style={[s.sendBtn, sending && s.sendBtnOff]}
              onPress={() => void sendMessage()}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.composerIcon}
              onPress={() => void startRecording()}
              activeOpacity={0.7}
            >
              <Ionicons name="mic" size={20} color={BUBBLE_ME} />
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Emoji picker panel — bảng emoji/sticker theo nhóm */}
      {emojiOpen && recState === 'idle' ? (
        <EmojiPicker
          onPick={(e) => setDraft((d) => `${d}${e}`)}
          onClose={() => setEmojiOpen(false)}
          paddingBottom={composerPadBottom + 6}
        />
      ) : null}

      {/* Media panel */}
      {mediaOpen && recState === 'idle' ? (
        <View style={[s.mediaPanel, { paddingBottom: composerPadBottom + 6 }]}>
          <TouchableOpacity style={s.mediaBtn} onPress={() => void pickGallery()} activeOpacity={0.85}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#2563EB' }]}>
              <Ionicons name="images" size={22} color="#fff" />
            </View>
            <Text style={s.mediaBtnTxt}>Thư viện</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => void takePhoto()} activeOpacity={0.85}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="camera" size={22} color="#fff" />
            </View>
            <Text style={s.mediaBtnTxt}>Máy ảnh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => void pickFile()} activeOpacity={0.85}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="document-attach" size={22} color="#fff" />
            </View>
            <Text style={s.mediaBtnTxt}>Tệp tin</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.mediaBtn}
            onPress={() => { setMediaOpen(false); void startRecording(); }}
            activeOpacity={0.85}
          >
            <View style={[s.mediaIconWrap, { backgroundColor: '#0EA5A4' }]}>
              <Ionicons name="mic" size={22} color="#fff" />
            </View>
            <Text style={s.mediaBtnTxt}>Ghi âm</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </KeyboardAvoidingView>

      {/* ── Group Info Modal (Messenger-style) ── */}
      <GroupInfoSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        displayTitle={displayTitle}
        displayAvatarUrl={displayAvatarUrl}
        isDirectChat={isDirectChat}
        group={group}
        myId={myId}
        sharedImages={sharedImages}
        sharedFiles={sharedFiles}
        sharedAudio={sharedAudio}
        infoTab={infoTab}
        setInfoTab={setInfoTab}
        pinned={pinned}
        onTogglePin={() => void togglePin()}
        onAddMembers={() => { setInfoOpen(false); navigation.navigate('MessengerAddMembers', { groupId }); }}
        onLeave={leaveGroup}
        onRename={() => { setInfoOpen(false); openRename(); }}
        onChangeAvatar={onChangeGroupAvatar}
        onCall={() => Alert.alert('Gọi thoại', 'Tính năng cuộc gọi đang được hoàn thiện.', [{ text: 'OK' }])}
        onMinimizeToBubble={onMinimizeToBubble}
        onOpenDebug={() => { setInfoOpen(false); setDebugOpen(true); }}
      />

      {/* Modal đổi tên nhóm */}
      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable style={s.renameBg} onPress={() => setRenameOpen(false)}>
          <Pressable style={s.renameCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.renameTitle}>
              {isDirectChat ? 'Đặt biệt danh' : 'Đổi tên nhóm'}
            </Text>
            <Text style={s.renameSub}>
              {isDirectChat
                ? 'Biệt danh chỉ hiển thị trên thiết bị này, người kia không thấy.'
                : 'Chỉ trưởng / phó nhóm mới được đổi tên.'}
            </Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder={isDirectChat ? 'Biệt danh hiển thị' : 'Tên nhóm mới'}
              placeholderTextColor={CrmColors.gray400}
              style={s.renameInput}
              maxLength={120}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void submitRename()}
            />
            <View style={s.renameActions}>
              <TouchableOpacity
                style={[s.renameBtn, s.renameBtnGhost]}
                onPress={() => setRenameOpen(false)}
                disabled={renaming}
              >
                <Text style={s.renameBtnGhostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.renameBtn, s.renameBtnPrimary, renaming && s.renameBtnOff]}
                onPress={() => void submitRename()}
                disabled={renaming}
              >
                {renaming ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.renameBtnPrimaryTxt}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Debug modal */}
      <Modal visible={debugOpen} transparent animationType="fade" onRequestClose={() => setDebugOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setDebugOpen(false)}>
          <Pressable style={s.debugSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.debugHead}>
              <Text style={s.debugTitle}>Log</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => { chatDebugClear(); setDebugText(''); }}>
                  <Text style={s.debugBtn}>Xóa</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDebugOpen(false)}>
                  <Text style={s.debugBtn}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </View>
            <FlatList
              data={debugText ? debugText.split('\n') : ['Chưa có log.']}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => <Text style={s.debugMono}>{item}</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ─── Group info sheet (Messenger-style) ───────────────────────── */

interface GroupInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  displayTitle: string;
  displayAvatarUrl: string | null;
  isDirectChat: boolean;
  group: MessengerGroupDetail | null;
  myId: string;
  sharedImages: MessengerMessage[];
  sharedFiles: MessengerMessage[];
  sharedAudio: MessengerMessage[];
  infoTab: InfoTab;
  setInfoTab: (t: InfoTab) => void;
  pinned: boolean;
  onTogglePin: () => void;
  onAddMembers: () => void;
  onLeave: () => void;
  onRename: () => void;
  onChangeAvatar: () => void;
  onCall: () => void;
  onMinimizeToBubble: () => Promise<void> | void;
  onOpenDebug: () => void;
}

/**
 * Sheet thông tin nhóm — bố cục giống Messenger:
 *  • Khi chưa chọn "Xem tất cả": cuộn 1 trang chứa avatar lớn + các SECTION
 *    (Thành viên · Phương tiện · File · Ghi âm) — mỗi section có preview
 *    nhỏ và nút "Xem tất cả".
 *  • Khi tap "Xem tất cả" của 1 section: chuyển sang chế độ list đầy đủ, có
 *    nút back về trang chính.
 */
function GroupInfoSheet({
  visible,
  onClose,
  displayTitle,
  displayAvatarUrl,
  isDirectChat,
  group,
  myId,
  sharedImages,
  sharedFiles,
  sharedAudio,
  infoTab,
  setInfoTab,
  pinned,
  onTogglePin,
  onAddMembers,
  onLeave,
  onRename,
  onChangeAvatar,
  onCall,
  onMinimizeToBubble,
  onOpenDebug,
}: GroupInfoSheetProps) {
  const [mode, setMode] = useState<'home' | InfoTab>('home');
  const [notifOn, setNotifOn] = useState(true);

  useEffect(() => {
    if (visible) setMode('home');
  }, [visible]);

  const previewImages = sharedImages.slice(-4).reverse();
  const previewFiles = sharedFiles.slice(-3).reverse();
  const previewAudio = sharedAudio.slice(-3).reverse();
  const members = group?.members ?? [];
  const remainingImages = Math.max(0, sharedImages.length - 4);

  /** Lấy icon + màu theo extension file. */
  const fileMeta = (name?: string | null): { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string } => {
    const ext = (name || '').toLowerCase().split('.').pop() || '';
    if (['pdf'].includes(ext)) return { icon: 'document-text', color: '#DC2626', bg: '#FEF2F2' };
    if (['doc', 'docx'].includes(ext)) return { icon: 'document', color: '#2563EB', bg: '#EFF6FF' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'grid', color: '#16A34A', bg: '#F0FDF4' };
    if (['ppt', 'pptx'].includes(ext)) return { icon: 'easel', color: '#EA580C', bg: '#FFF7ED' };
    if (['zip', 'rar', '7z'].includes(ext)) return { icon: 'archive', color: '#7C3AED', bg: '#F5F3FF' };
    return { icon: 'document-attach', color: CrmColors.gray700, bg: '#F3F4F6' };
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalBg} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Sub-page header (chỉ hiện khi đang ở list đầy đủ) */}
          {mode !== 'home' ? (
            <View style={s.subHeader}>
              <TouchableOpacity onPress={() => setMode('home')} hitSlop={8} style={s.subBack}>
                <Ionicons name="chevron-back" size={22} color={CrmColors.gray800} />
              </TouchableOpacity>
              <Text style={s.subTitle}>
                {mode === 'members'
                  ? `Thành viên · ${members.length}`
                  : mode === 'images'
                    ? `Phương tiện · ${sharedImages.length}`
                    : mode === 'files'
                      ? `File · ${sharedFiles.length}`
                      : `Ghi âm · ${sharedAudio.length}`}
              </Text>
              <View style={{ width: 28 }} />
            </View>
          ) : (
            <View style={s.grabHandle} />
          )}

          {/* ── Trang chính ─────────────────────────── */}
          {mode === 'home' ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.infoScroll}>
              {/* Card header: avatar + tên + sub + nút sửa */}
              <View style={s.infoHeaderCard}>
                <TouchableOpacity
                  onPress={isDirectChat ? undefined : onChangeAvatar}
                  activeOpacity={isDirectChat ? 1 : 0.7}
                  accessibilityLabel={isDirectChat ? 'Avatar đối tác' : 'Đổi avatar nhóm'}
                >
                  {displayAvatarUrl ? (
                    <Image source={{ uri: displayAvatarUrl }} style={[s.infoHeaderAvatar, { backgroundColor: avatarColor(displayTitle) }]} />
                  ) : (
                    <View style={[s.infoHeaderAvatar, { backgroundColor: avatarColor(displayTitle) }]}>
                      <Text style={s.infoHeaderAvatarTxt}>{initials(displayTitle)}</Text>
                    </View>
                  )}
                  <View style={s.infoHeaderDot} />
                  {!isDirectChat ? (
                    <View style={s.infoHeaderCameraBtn}>
                      <Ionicons name="camera" size={11} color="#FFFFFF" />
                    </View>
                  ) : null}
                </TouchableOpacity>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.infoHeaderName} numberOfLines={1}>{displayTitle}</Text>
                  <View style={s.infoHeaderSubRow}>
                    {!isDirectChat ? (
                      <>
                        <Text style={s.infoHeaderSub}>{members.length} thành viên</Text>
                        <Text style={s.infoHeaderSubDot}>·</Text>
                      </>
                    ) : null}
                    <View style={s.infoHeaderOnlineDot} />
                    <Text style={s.infoHeaderSub}>Đang hoạt động</Text>
                  </View>
                </View>
                {/* Nút "Đổi tên" — group: đổi tên nhóm, 1-1: đặt biệt danh */}
                <TouchableOpacity
                  style={s.infoHeaderEditBtn}
                  onPress={onRename}
                  hitSlop={8}
                  accessibilityLabel={isDirectChat ? 'Đặt biệt danh' : 'Đổi tên nhóm'}
                >
                  <Ionicons name="pencil" size={16} color={CrmColors.gray700} />
                </TouchableOpacity>
              </View>

              {/* Quick actions row — bỏ "Rời" với chat 1-1 (không hợp ngữ cảnh) */}
              <View style={s.quickActionsRow}>
                <QuickAction icon="call" label="Gọi" tint="#3B82F6" bg="#EFF6FF" onPress={onCall} />
                <QuickAction
                  icon={notifOn ? 'notifications' : 'notifications-off'}
                  label={notifOn ? 'Tắt TB' : 'Bật TB'}
                  tint="#F59E0B"
                  bg="#FFFBEB"
                  onPress={() => setNotifOn((v) => !v)}
                />
                <QuickAction
                  icon={pinned ? 'pin' : 'pin-outline'}
                  label={pinned ? 'Đã ghim' : 'Ghim'}
                  tint={pinned ? '#FFFFFF' : '#10B981'}
                  bg={pinned ? '#10B981' : '#ECFDF5'}
                  labelColor={pinned ? '#047857' : undefined}
                  onPress={onTogglePin}
                />
                {!isDirectChat ? (
                  <QuickAction
                    icon="exit-outline"
                    label="Rời"
                    tint="#EF4444"
                    bg="#FEF2F2"
                    onPress={onLeave}
                  />
                ) : null}
              </View>

              {/* ẢNH & VIDEO */}
              <View style={s.infoSectionCard}>
                <View style={s.infoSectionHeadX}>
                  <View style={s.infoSectionHeadL}>
                    <Ionicons name="images" size={16} color="#8B5CF6" />
                    <Text style={s.infoSectionTitleX}>ẢNH & VIDEO</Text>
                  </View>
                </View>
                {previewImages.length === 0 ? (
                  <Text style={s.infoEmpty}>Chưa có ảnh nào được chia sẻ.</Text>
                ) : (
                  <View style={s.mediaGridX}>
                    {previewImages.map((it, idx) => {
                      const u = firstImageUrl(it);
                      if (!u) return null;
                      const isLast = idx === previewImages.length - 1 && remainingImages > 0;
                      return (
                        <TouchableOpacity
                          key={String(it.id)}
                          style={s.mediaGridCellX}
                          onPress={() => {
                            if (isLast) { setInfoTab('images'); setMode('images'); }
                            else void Linking.openURL(u);
                          }}
                        >
                          <Image source={{ uri: u }} style={s.mediaGridImgX} />
                          {isLast ? (
                            <View style={s.mediaGridOverlay}>
                              <Text style={s.mediaGridOverlayTxt}>+{remainingImages}</Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {sharedImages.length > 0 ? (
                  <TouchableOpacity
                    style={s.viewAllBtn}
                    onPress={() => { setInfoTab('images'); setMode('images'); }}
                  >
                    <Ionicons name="grid-outline" size={14} color={CrmColors.gray700} />
                    <Text style={s.viewAllTxt}>Xem tất cả {sharedImages.length} ảnh</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* TỆP ĐÍNH KÈM */}
              <View style={s.infoSectionCard}>
                <View style={s.infoSectionHeadX}>
                  <View style={s.infoSectionHeadL}>
                    <Ionicons name="document-attach" size={16} color="#8B5CF6" />
                    <Text style={s.infoSectionTitleX}>TỆP ĐÍNH KÈM</Text>
                  </View>
                  {sharedFiles.length > 0 ? (
                    <TouchableOpacity onPress={() => { setInfoTab('files'); setMode('files'); }}>
                      <Text style={s.infoSectionMore}>Xem tất cả</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {previewFiles.length === 0 ? (
                  <Text style={s.infoEmpty}>Chưa có file nào được chia sẻ.</Text>
                ) : (
                  previewFiles.map((it, idx) => {
                    const u = mediaUrl(it.attachment_url);
                    const meta = fileMeta(it.attachment_name);
                    const showDivider = idx < previewFiles.length - 1;
                    return (
                      <TouchableOpacity
                        key={String(it.id)}
                        style={[s.fileItemX, showDivider && s.fileItemDivider]}
                        onPress={() => u && void Linking.openURL(u)}
                      >
                        <View style={[s.fileIconBoxX, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={20} color={meta.color} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.fileItemNameX} numberOfLines={1}>
                            {it.attachment_name || 'Tệp đính kèm'}
                          </Text>
                          <Text style={s.fileItemMetaX} numberOfLines={1}>
                            {(it.user?.full_name || '?') + ' · ' + formatDateTime(it.created_at)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          hitSlop={8}
                          onPress={() => u && void Linking.openURL(u)}
                          style={s.fileDownloadBtn}
                        >
                          <Ionicons name="download-outline" size={18} color={CrmColors.blue600} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              {/* THÀNH VIÊN */}
              {!isDirectChat ? (
                <View style={s.infoSectionCard}>
                  <View style={s.infoSectionHeadX}>
                    <View style={s.infoSectionHeadL}>
                      <Ionicons name="people" size={16} color="#8B5CF6" />
                      <Text style={s.infoSectionTitleX}>
                        THÀNH VIÊN ({members.length})
                      </Text>
                    </View>
                    {members.length > 3 ? (
                      <TouchableOpacity onPress={() => { setInfoTab('members'); setMode('members'); }}>
                        <Text style={s.infoSectionMore}>Xem tất cả</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {members.slice(0, 3).map((m, idx) => {
                    const nm = m.user?.full_name || String(m.user_id);
                    const showDivider = idx < Math.min(2, members.length - 1);
                    return (
                      <View key={String(m.user_id)} style={[s.memberRowX, showDivider && s.fileItemDivider]}>
                        <View style={[s.memberAvatarX, { backgroundColor: avatarColor(nm) }]}>
                          <Text style={s.memberAvatarXTxt}>{initials(nm)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.memberNameX} numberOfLines={1}>{nm}</Text>
                          <Text style={s.memberStatusX} numberOfLines={1}>Đang hoạt động</Text>
                        </View>
                        <View style={[s.memberRoleBadge, m.role === 'admin' && s.memberRoleBadgeAdmin]}>
                          <Text style={[s.memberRoleTxt, m.role === 'admin' && s.memberRoleTxtAdmin]}>
                            {m.role === 'admin' ? 'Admin' : 'Thành viên'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  <TouchableOpacity style={s.addMemberBtn} onPress={onAddMembers}>
                    <View style={s.addMemberIcon}>
                      <Ionicons name="person-add" size={16} color={CrmColors.blue600} />
                    </View>
                    <Text style={s.addMemberTxt}>Thêm thành viên</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* CÀI ĐẶT NHÓM */}
              <View style={s.infoSectionCard}>
                <View style={s.infoSectionHeadX}>
                  <View style={s.infoSectionHeadL}>
                    <Ionicons name="settings-sharp" size={16} color="#8B5CF6" />
                    <Text style={s.infoSectionTitleX}>CÀI ĐẶT NHÓM</Text>
                  </View>
                </View>

                <SettingsRow
                  icon="notifications-outline"
                  iconBg="#EFF6FF"
                  iconColor="#3B82F6"
                  label="Thông báo"
                  type="switch"
                  switchValue={notifOn}
                  onSwitchChange={setNotifOn}
                  divider
                />
                <SettingsRow
                  icon="pin-outline"
                  iconBg="#ECFDF5"
                  iconColor="#10B981"
                  label={pinned ? 'Đã ghim hội thoại' : 'Ghim hội thoại'}
                  type="switch"
                  switchValue={pinned}
                  onSwitchChange={() => onTogglePin()}
                  divider
                />
                {Platform.OS === 'android' ? (
                  <SettingsRow
                    icon="ellipse-outline"
                    iconBg="#F5F3FF"
                    iconColor="#8B5CF6"
                    label="Thu nhỏ thành bong bóng"
                    type="link"
                    onPress={() => void onMinimizeToBubble()}
                    divider
                  />
                ) : null}
                <SettingsRow
                  icon="bug-outline"
                  iconBg="#F3F4F6"
                  iconColor={CrmColors.gray700}
                  label="Log debug"
                  type="link"
                  onPress={onOpenDebug}
                />
              </View>

              <View style={{ height: 16 }} />
            </ScrollView>
          ) : null}

          {/* ── List đầy đủ Thành viên ───────────────── */}
          {mode === 'members' ? (
            <FlatList
              data={members}
              keyExtractor={(m) => String(m.user_id)}
              renderItem={({ item }) => (
                <View style={s.memberRow}>
                  <View
                    style={[
                      s.memberAvatar,
                      { backgroundColor: avatarColor(item.user?.full_name || String(item.user_id)) },
                    ]}
                  >
                    <Text style={s.memberAvatarTxt}>
                      {initials(item.user?.full_name || String(item.user_id))}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>
                      {item.user?.full_name || String(item.user_id)}
                    </Text>
                    {item.role ? (
                      <Text style={s.memberRole}>
                        {item.role === 'admin' ? '⭐ Admin' : 'Thành viên'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có thành viên</Text>}
            />
          ) : null}

          {/* ── Grid ảnh đầy đủ ────────────────────── */}
          {mode === 'images' ? (
            <FlatList
              data={sharedImages.slice().reverse()}
              keyExtractor={(m) => String(m.id)}
              numColumns={3}
              contentContainerStyle={{ gap: 2, padding: 2 }}
              renderItem={({ item }) => {
                const u = firstImageUrl(item);
                return u ? (
                  <TouchableOpacity onPress={() => void Linking.openURL(u)} style={s.fullImgCell}>
                    <Image source={{ uri: u }} style={s.fullImg} />
                  </TouchableOpacity>
                ) : null;
              }}
              ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có ảnh nào</Text>}
            />
          ) : null}

          {/* ── List file đầy đủ ───────────────────── */}
          {mode === 'files' ? (
            <FlatList
              data={sharedFiles.slice().reverse()}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item }) => {
                const u = mediaUrl(item.attachment_url);
                return (
                  <TouchableOpacity
                    style={s.fileItem}
                    onPress={() => u && void Linking.openURL(u)}
                  >
                    <View style={s.fileIconBox}>
                      <Ionicons name="document-text" size={20} color={CrmColors.blue600} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fileItemName} numberOfLines={1}>
                        {item.attachment_name || 'Tệp đính kèm'}
                      </Text>
                      <Text style={s.fileItemMeta}>
                        {(item.user?.full_name || '?') + ' · ' + formatDateTime(item.created_at)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={CrmColors.gray400} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có file nào</Text>}
            />
          ) : null}

          {/* ── List ghi âm đầy đủ ─────────────────── */}
          {mode === 'audio' ? (
            <FlatList
              data={sharedAudio.slice().reverse()}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item }) => {
                const u = mediaUrl(item.attachment_url);
                return u ? (
                  <View style={s.audioItem}>
                    <AudioPlayer url={u} mine={false} />
                    <Text style={s.audioItemMeta}>
                      {(item.user?.full_name || '?') + ' · ' + formatDateTime(item.created_at)}
                    </Text>
                  </View>
                ) : null;
              }}
              ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có ghi âm nào</Text>}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ─── Emoji picker (Messenger/TikTok-style) ────────────────────── */

type EmojiCategory = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  list: string[];
};

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: 'smileys',
    label: 'Mặt cười',
    icon: 'happy-outline',
    list: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
      '🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒',
      '🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁',
      '☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣',
      '😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻',
    ],
  },
  {
    key: 'gestures',
    label: 'Tay & người',
    icon: 'hand-left-outline',
    list: [
      '👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇',
      '☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪',
      '🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸',
    ],
  },
  {
    key: 'hearts',
    label: 'Trái tim',
    icon: 'heart-outline',
    list: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','♥️','💌','💋','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','💭',
    ],
  },
  {
    key: 'fun',
    label: 'Vui nhộn',
    icon: 'sparkles-outline',
    list: [
      '🎉','🎊','🥂','🍻','🎂','🍰','🧁','🍩','🍪','🍫','🍬','🍭','🍦','🍧','🍨','🍮',
      '🎁','🎈','🎀','🎗️','🎟️','🎫','🎖️','🏆','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾',
      '🎯','🎰','🎲','🧩','🎮','🕹️','🎬','🎤','🎧','🎵','🎶','🎼','🎷','🎸','🎻','🥁',
    ],
  },
  {
    key: 'work',
    label: 'Công việc',
    icon: 'briefcase-outline',
    list: [
      '💼','📁','📂','🗂️','📅','📆','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️',
      '✅','❌','⚠️','🚀','💡','🔥','⭐','🌟','✨','💯','🎯','📞','☎️','📱','💻','🖥️',
      '⌨️','🖱️','💾','📧','✉️','📨','📩','📤','📥','📭','📬','📦','✏️','🖊️','🖋️','📝',
    ],
  },
];

function EmojiPicker({
  onPick,
  onClose,
  paddingBottom,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
  paddingBottom: number;
}) {
  const [cat, setCat] = useState<string>(EMOJI_CATEGORIES[0].key);
  const current = EMOJI_CATEGORIES.find((c) => c.key === cat) || EMOJI_CATEGORIES[0];
  return (
    <View style={[s.emojiPanel, { paddingBottom }]}>
      <View style={s.emojiHead}>
        <Text style={s.emojiHeadTitle}>{current.label}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8} style={s.emojiCloseBtn}>
          <Ionicons name="chevron-down" size={18} color={CrmColors.gray500} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={current.list}
        numColumns={8}
        keyExtractor={(item, idx) => `${current.key}-${idx}-${item}`}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.emojiCell} onPress={() => onPick(item)} activeOpacity={0.6}>
            <Text style={s.emojiTxt}>{item}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={s.emojiGrid}
        showsVerticalScrollIndicator={false}
      />
      <View style={s.emojiTabBar}>
        {EMOJI_CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[s.emojiTabBtn, cat === c.key && s.emojiTabBtnOn]}
            onPress={() => setCat(c.key)}
          >
            <Ionicons
              name={c.icon}
              size={20}
              color={cat === c.key ? BUBBLE_ME : CrmColors.gray500}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* ─── Quick action button (Gọi / Tắt TB / Ghim / Rời) ─────────── */
function QuickAction({
  icon,
  label,
  tint,
  bg,
  labelColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  bg: string;
  labelColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.quickActBtn} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.quickActIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={[s.quickActLabel, labelColor ? { color: labelColor } : null]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ─── Settings row (toggle / link) ─────────────────────────────── */
function SettingsRow({
  icon,
  iconBg,
  iconColor,
  label,
  type,
  switchValue,
  onSwitchChange,
  onPress,
  divider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  type: 'switch' | 'link';
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  onPress?: () => void;
  divider?: boolean;
}) {
  const inner = (
    <View style={[s.settingsRow, divider && s.fileItemDivider]}>
      <View style={[s.settingsIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={s.settingsLabel}>{label}</Text>
      {type === 'switch' ? (
        <Switch
          value={!!switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: '#E5E7EB', true: BUBBLE_ME }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
      )}
    </View>
  );
  return type === 'link' ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>
  ) : inner;
}

/* ─── Date separator ───────────────────────────────────────────── */
function DateSep({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  let label: string;
  if (d.toDateString() === today.toDateString()) {
    label = 'Hôm nay';
  } else {
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) {
      label = 'Hôm qua';
    } else {
      label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return (
    <View style={s.dateSep}>
      <Text style={s.dateSepTxt}>{label}</Text>
    </View>
  );
}

/* ─── styles ───────────────────────────────────────────────────── */
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CHAT_BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CHAT_BG },

  // Header
  headerBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 10, paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray200,
    gap: 4,
  },
  headerBackBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, paddingLeft: 6 },
  headerAvatarWrap: { width: 38, height: 38, position: 'relative' },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  headerStatusDot: {
    position: 'absolute', right: -1, bottom: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff',
  },
  headerName: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSubDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  headerSub: { fontSize: 11, color: CrmColors.gray500, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  headerActionBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },

  // Messages
  msgList: { flex: 1 },
  msgPad: { padding: 10, paddingBottom: 8 },

  // Date separator
  dateSep: { alignSelf: 'center', marginVertical: 12 },
  dateSepTxt: {
    fontSize: 11, color: CrmColors.gray600, fontWeight: '700',
    backgroundColor: 'rgba(15,23,42,0.05)',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },

  // System message
  sysWrap: { alignSelf: 'center', marginVertical: 4 },
  sysTxt: { fontSize: 12, color: CrmColors.gray500, textAlign: 'center', fontStyle: 'italic' },

  // Message rows
  row: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end', paddingHorizontal: 6 },
  /** Tin của mình: đảo chiều flex, kéo sát phải bằng padding âm bên phải
   *  (avatar trống chỉ chiếm 6dp thay vì 30dp như avatar người khác). */
  rowMine: { flexDirection: 'row-reverse', paddingRight: 2 },

  // Avatar
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4, flexShrink: 0 },
  avatarBot: { backgroundColor: '#6366F1' },
  avatarTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  avatarSpace: { width: 0 },

  msgName: { fontSize: 11, fontWeight: '700', color: CrmColors.gray600, marginBottom: 2, marginLeft: 2 },

  // Bubbles
  bubble: {
    borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, maxWidth: '100%',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
    elevation: 1,
  },
  bubbleOther: {
    backgroundColor: BUBBLE_OTHER,
    borderBottomLeftRadius: 6,
    borderWidth: 1, borderColor: BUBBLE_OTHER_BORDER,
  },
  bubbleBot: {
    backgroundColor: '#EEF2FF', borderBottomLeftRadius: 6,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  bubbleMine: {
    backgroundColor: BUBBLE_ME, borderBottomRightRadius: 6,
    borderWidth: 1, borderColor: BUBBLE_ME_DARK,
  },
  bubbleTxt: { fontSize: 15, color: '#0F172A', lineHeight: 22 },
  bubbleTxtMine: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 4, alignSelf: 'flex-end', fontWeight: '600' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },

  // Sticker (emoji-only message)
  stickerWrap: { paddingVertical: 4, paddingHorizontal: 2 },
  stickerTxt: { fontSize: 44, lineHeight: 52, textAlign: 'center' },
  stickerTime: {
    fontSize: 10, color: CrmColors.gray400, marginTop: 2, fontWeight: '600',
    textAlign: 'center',
  },

  // Reactions
  reactionRow: {
    flexDirection: 'row', gap: 4, marginTop: 4, marginLeft: 6,
  },
  reactionRowMine: { marginLeft: 0, marginRight: 6, justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFFFFF', borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: CrmColors.gray200,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, fontWeight: '700', color: CrmColors.gray700 },

  // Quick reply chips (trên composer)
  quickWrap: {
    height: 44,
    backgroundColor: CHAT_BG,
  },
  quickRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'center',
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 32,
  },
  quickChipTxt: { fontSize: 12.5, color: CrmColors.gray800, fontWeight: '600' },

  // Input emoji button
  inputEmojiBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 2,
  },

  // Reply
  replyBar: { borderLeftWidth: 3, borderLeftColor: CrmColors.blue100, paddingLeft: 8, marginBottom: 6, opacity: 0.85 },
  replyBarMine: { borderLeftColor: 'rgba(255,255,255,0.5)' },
  replyTxt: { fontSize: 12, color: CrmColors.gray500 },
  replyTxtMine: { color: 'rgba(255,255,255,0.7)' },

  // Attachments in bubble
  imgAtt: { width: 200, height: 150, borderRadius: 10, marginTop: 6 },
  fileLink: { fontSize: 14, color: BUBBLE_ME, marginTop: 6, fontWeight: '600' },
  fileLinkMine: { color: 'rgba(255,255,255,0.9)' },

  // Audio player
  audioPlayer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 22,
    paddingHorizontal: 12, paddingVertical: 9,
    minWidth: 200, maxWidth: 260,
    alignSelf: 'stretch',
  },
  audioPlayerMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  audioPlayBtn: {
    fontSize: 14, color: BUBBLE_ME, width: 28, height: 28,
    textAlign: 'center', lineHeight: 28, borderRadius: 14,
    backgroundColor: '#FFFFFF', overflow: 'hidden', fontWeight: '700',
  },
  audioPlayBtnMine: { color: BUBBLE_ME, backgroundColor: '#FFFFFF' },
  audioTrack: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    gap: 2, height: 26, position: 'relative',
  },
  audioFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'transparent' },
  audioBar: { width: 3, borderRadius: 2 },
  audioDur: { fontSize: 11, color: CrmColors.gray600, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  audioDurMine: { color: 'rgba(255,255,255,0.9)' },

  // Reply chip
  replyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderTopWidth: 1, borderTopColor: '#BFDBFE',
  },
  replyChipBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: BUBBLE_ME },
  replyChipLabel: { fontSize: 11, color: BUBBLE_ME, fontWeight: '800' },
  replyChipTxt: { fontSize: 12, color: CrmColors.gray700, marginTop: 2 },

  // Pending files
  pendingRow: { maxHeight: 90, backgroundColor: '#FAFAFA', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CrmColors.gray200 },
  pendingThumb: { width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: CrmColors.gray100, position: 'relative' },
  pendingImg: { width: 72, height: 72 },
  pendingFile: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 4 },
  pendingFileIcon: { fontSize: 22 },
  pendingFileName: { fontSize: 9, color: CrmColors.gray600, textAlign: 'center', marginTop: 2 },
  pendingDel: {
    position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  pendingDelTxt: { fontSize: 9, color: '#fff', fontWeight: '900' },

  // Recording bar
  recBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#FEF2F2', borderTopWidth: 1, borderTopColor: '#FECACA', gap: 8,
  },
  recBarDone: { backgroundColor: '#ECFDF5', borderTopColor: '#A7F3D0' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  recDurTxt: { flex: 1, fontSize: 14, color: '#EF4444', fontWeight: '800' },
  recDurTxtDone: { color: '#0EA5A4' },
  recCancel: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: CrmColors.gray200 },
  recCancelTxt: { fontSize: 13, color: CrmColors.gray700, fontWeight: '700' },
  recStop: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: '#EF4444',
  },
  recStopTxt: { fontSize: 13, color: '#fff', fontWeight: '800' },

  // Composer
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingTop: 10, gap: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CrmColors.gray200,
  },
  composerIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: CrmColors.gray100,
  },
  composerIconOn: { backgroundColor: BUBBLE_ME },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 4,
    minHeight: 40,
    maxHeight: 130,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: CrmColors.gray900,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: BUBBLE_ME, justifyContent: 'center', alignItems: 'center',
    shadowColor: BUBBLE_ME, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3,
    shadowRadius: 4, elevation: 3,
  },
  sendBtnOff: { opacity: 0.5 },

  // Emoji picker
  emojiPanel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    height: 320,
    flexDirection: 'column',
  },
  emojiHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  emojiHeadTitle: { fontSize: 13, fontWeight: '800', color: CrmColors.gray700, letterSpacing: 0.5 },
  emojiCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiGrid: { paddingHorizontal: 8, paddingVertical: 6 },
  emojiCell: {
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    margin: 1, borderRadius: 8,
  },
  emojiTxt: { fontSize: 26, lineHeight: 30 },
  emojiTabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  emojiTabBtn: {
    flex: 1, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiTabBtnOn: {
    borderTopWidth: 2, borderTopColor: BUBBLE_ME,
    backgroundColor: '#FFFFFF',
  },

  // Media panel
  mediaPanel: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around',
    paddingVertical: 16, paddingHorizontal: 16, backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CrmColors.gray200,
  },
  mediaBtn: { alignItems: 'center', gap: 8, paddingVertical: 4, width: 76 },
  mediaIconWrap: {
    width: 56, height: 56, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
  },
  mediaBtnTxt: { fontSize: 11, color: CrmColors.gray700, fontWeight: '700' },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, maxHeight: '88%', flex: 0, minHeight: '60%',
  },
  grabHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: CrmColors.gray300, marginBottom: 8,
  },
  subHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray200,
    gap: 8,
  },
  subBack: { width: 28, alignItems: 'flex-start' },
  subTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: CrmColors.gray900, textAlign: 'center' },

  // Trang thông tin chính (Messenger-style 2026)
  infoScroll: { paddingHorizontal: 12, paddingBottom: 28, backgroundColor: '#F3F4F6' },

  // Card header
  infoHeaderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 12, marginTop: 4, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  infoHeaderAvatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  infoHeaderAvatarTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
  infoHeaderDot: {
    position: 'absolute', right: -2, bottom: -2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#FFFFFF',
  },
  infoHeaderCameraBtn: {
    position: 'absolute', right: -4, top: -4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: BUBBLE_ME, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  infoHeaderName: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  infoHeaderSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 },
  infoHeaderSub: { fontSize: 12, color: CrmColors.gray500, fontWeight: '600' },
  infoHeaderSubDot: { fontSize: 12, color: CrmColors.gray400, marginHorizontal: 2 },
  infoHeaderOnlineDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E', marginRight: 2,
  },
  infoHeaderEditBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },

  // Quick actions row
  quickActionsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 6,
    marginBottom: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  quickActBtn: { flex: 1, alignItems: 'center', gap: 6 },
  quickActIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActLabel: { fontSize: 11.5, color: CrmColors.gray700, fontWeight: '700' },

  // Section cards
  infoSectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
    marginBottom: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  infoSectionHeadX: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  infoSectionHeadL: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoSectionTitleX: {
    fontSize: 12, fontWeight: '800',
    color: CrmColors.gray700, letterSpacing: 0.5,
  },
  infoSectionMore: { fontSize: 12.5, color: BUBBLE_ME, fontWeight: '700' },
  infoEmpty: { fontSize: 12, color: CrmColors.gray400, fontStyle: 'italic', paddingVertical: 8 },

  // Ảnh & video grid (4 ô)
  mediaGridX: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  mediaGridCellX: { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  mediaGridImgX: { width: '100%', height: '100%' },
  mediaGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaGridOverlayTxt: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  viewAllTxt: { fontSize: 13, color: CrmColors.gray700, fontWeight: '700' },

  // File item (Messenger 2026 style)
  fileItemX: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  fileItemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  fileIconBoxX: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  fileItemNameX: { fontSize: 13.5, color: CrmColors.gray900, fontWeight: '700' },
  fileItemMetaX: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  fileDownloadBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: CrmColors.blue50,
    alignItems: 'center', justifyContent: 'center',
  },

  // Thành viên row
  memberRowX: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  memberAvatarX: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarXTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  memberNameX: { fontSize: 13.5, color: CrmColors.gray900, fontWeight: '700' },
  memberStatusX: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  memberRoleBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, backgroundColor: '#F3F4F6',
  },
  memberRoleBadgeAdmin: { backgroundColor: '#FEF3C7' },
  memberRoleTxt: { fontSize: 11, color: CrmColors.gray700, fontWeight: '700' },
  memberRoleTxtAdmin: { color: '#B45309' },
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6',
  },
  addMemberIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CrmColors.blue50,
    alignItems: 'center', justifyContent: 'center',
  },
  addMemberTxt: { fontSize: 13.5, color: CrmColors.blue600, fontWeight: '800' },

  // Settings row
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  settingsIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { flex: 1, fontSize: 14, color: CrmColors.gray900, fontWeight: '600' },

  // Read receipt row (Đã gửi / Đã xem) dưới bubble cuối của mình
  readRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 3, paddingHorizontal: 2,
  },
  readTxt: { fontSize: 11, color: CrmColors.gray500, fontWeight: '600' },
  readTxtSeen: { color: BUBBLE_ME, fontWeight: '700' },

  // Rename modal
  renameBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  renameCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20,
  },
  renameTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  renameSub: { fontSize: 12.5, color: CrmColors.gray500, marginTop: 4, marginBottom: 14 },
  renameInput: {
    borderWidth: 1, borderColor: CrmColors.gray200, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: CrmColors.gray900,
    backgroundColor: '#F9FAFB',
  },
  renameActions: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' },
  renameBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', minWidth: 84,
  },
  renameBtnGhost: { backgroundColor: '#F3F4F6' },
  renameBtnGhostTxt: { fontSize: 14, fontWeight: '700', color: CrmColors.gray700 },
  renameBtnPrimary: { backgroundColor: BUBBLE_ME },
  renameBtnPrimaryTxt: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  renameBtnOff: { opacity: 0.6 },

  // Member preview row
  memberPreviewRow: { flexDirection: 'row', gap: 12, paddingBottom: 4 },
  memberPreviewCell: { alignItems: 'center', width: 56 },
  memberPreviewAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  memberPreviewAvatarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  memberPreviewAdd: {
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    borderStyle: 'dashed',
  },
  memberPreviewName: { marginTop: 4, fontSize: 11, color: CrmColors.gray700, textAlign: 'center', maxWidth: 56 },

  // Media preview grid (3 cột)
  mediaGridPreview: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  mediaGridCell: { width: '32%', aspectRatio: 1, borderRadius: 6, overflow: 'hidden' },
  mediaGridImg: { width: '100%', height: '100%' },

  // File item (Messenger-style)
  fileItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  fileIconBox: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: CrmColors.blue50, alignItems: 'center', justifyContent: 'center',
  },
  fileItemName: { fontSize: 14, color: CrmColors.gray900, fontWeight: '700' },
  fileItemMeta: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },

  // Audio item
  audioItem: { paddingVertical: 8, paddingHorizontal: 4 },
  audioItemMeta: { fontSize: 11, color: CrmColors.gray500, marginTop: 4 },

  // Info actions (Thêm/Rời nhóm)
  infoActions: {
    paddingHorizontal: 16, paddingTop: 20, gap: 10,
    borderTopWidth: 8, borderTopColor: '#F3F4F6',
  },
  infoActBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: CrmColors.blue50,
  },
  infoActBtnDanger: { backgroundColor: '#FEF2F2' },
  infoActTxt: { fontSize: 14, fontWeight: '800', color: CrmColors.blue600 },
  infoActTxtDanger: { color: '#DC2626' },

  // Full image grid cell
  fullImgCell: { width: '33.33%', aspectRatio: 1 },
  fullImg: { width: '100%', height: '100%' },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray200,
  },
  sheetAvatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  sheetAvatarTxt: { fontSize: 17, fontWeight: '700', color: '#fff' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  sheetSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },

  // Tabs
  tabBar: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CrmColors.gray200, backgroundColor: '#fff',
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabBtnOn: { borderBottomWidth: 2, borderBottomColor: BUBBLE_ME },
  tabTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray500 },
  tabTxtOn: { color: BUBBLE_ME },
  tabContent: { flex: 1, maxHeight: 280 },
  tabEmpty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 24, fontSize: 13 },

  // Members
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray100,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memberAvatarTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  memberName: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  memberRole: { fontSize: 11, color: CrmColors.gray500, marginTop: 1 },

  // Sheet actions
  sheetActions: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CrmColors.gray100 },
  sheetBtn: { backgroundColor: BUBBLE_ME, paddingVertical: 12, borderRadius: CrmRadii.md, alignItems: 'center' },
  sheetBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sheetBtnDanger: { paddingVertical: 11, borderRadius: CrmRadii.md, alignItems: 'center', borderWidth: 1, borderColor: CrmColors.red200 },
  sheetBtnDangerTxt: { color: CrmColors.red700, fontWeight: '700' },
  sheetClose: { alignItems: 'center', paddingVertical: 12 },
  sheetCloseTxt: { color: CrmColors.gray500, fontWeight: '600' },

  // File row
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray100,
  },
  fileRowIcon: { fontSize: 22 },
  fileRowName: { fontSize: 14, color: CrmColors.gray900, fontWeight: '600' },
  fileRowDate: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },

  // Image grid
  gridImg: { width: (SW - 4) / 3 - 2, height: (SW - 4) / 3 - 2, borderRadius: 4 },

  // Audio row in info
  audioRow: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray100 },
  audioRowMeta: { fontSize: 11, color: CrmColors.gray500, marginTop: 4 },

  // Debug
  debugSheet: {
    margin: 16, borderRadius: 14, backgroundColor: '#fff',
    borderWidth: 1, borderColor: CrmColors.gray200, maxHeight: '80%', overflow: 'hidden',
  },
  debugHead: {
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: CrmColors.gray100,
  },
  debugTitle: { fontSize: 13, fontWeight: '900', color: CrmColors.gray900 },
  debugBtn: { fontSize: 12, fontWeight: '800', color: BUBBLE_ME },
  debugMono: {
    fontSize: 10, color: CrmColors.gray800, paddingHorizontal: 10, paddingVertical: 1,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
