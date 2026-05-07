import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { io, type Socket } from 'socket.io-client';
import { api, getStoredToken, postMultipart } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupDetail, MessengerMessage } from '../types/messenger';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { chatDebugClear, chatDebugLog, chatDebugSnapshot, chatDebugSubscribe } from '../lib/chatDebug';
import { setMessengerBubbleTarget } from '../lib/messengerBubbleTarget';
import { useNotifications } from '../context/NotificationContext';

const { width: SW } = Dimensions.get('window');
const CHAT_BG = '#EAE6DF';
const BUBBLE_ME = '#005CE8';
const BUBBLE_OTHER = '#FFFFFF';

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
  return (Array.isArray(m.attachments) ? m.attachments : []).some((a) =>
    (a.type || '').startsWith('image/'),
  );
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
  overrideFromBubble?: boolean;
}

/* ─── main screen ─────────────────────────────────────────────── */
export default function MessengerGroupChatScreen({
  overrideGroupId,
  overrideTitle,
  overrideFromBubble,
}: Props = {}) {
  const routeResult = useRoute<R>();
  const params = overrideGroupId
    ? { groupId: overrideGroupId, title: overrideTitle, isDirect: false, fromBubble: overrideFromBubble }
    : routeResult.params;
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const insets = useSafeAreaInsets();
  const { refreshUnread } = useNotifications();
  const [kbInset, setKbInset] = useState(0);

  const { groupId, title: titleParam, isDirect: isDirectParam, fromBubble } = params;

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

  // Voice recording
  const [recState, setRecState] = useState<RecState>('idle');
  const [recDur, setRecDur] = useState(0);
  const recRef = useRef<Audio.Recording | null>(null);
  const recUri = useRef<string | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const displayTitle = group?.name || titleParam || 'Chat nhóm';
  const isDirectChat = !!(group?.is_direct ?? isDirectParam);

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

  /* ── keyboard ──────────────────────────────────────── */
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbInset(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbInset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  /* ── bubble target ─────────────────────────────────── */
  useEffect(() => { void setMessengerBubbleTarget(groupId, displayTitle); }, [groupId, displayTitle]);

  /* ── back (bubble) ─────────────────────────────────── */
  useEffect(() => {
    if (!fromBubble || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      NativeModules.FloatingBubbleOverlay?.minimizeApp?.();
      return true;
    });
    return () => sub.remove();
  }, [fromBubble]);

  /* ── load ──────────────────────────────────────────── */
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
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tải được');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnread();
      void loadAll();
      void api.patch(`/messenger/groups/${groupId}/read`).catch(() => {});
    }, [refreshUnread, loadAll, groupId]),
  );

  useEffect(() => { listRef.current?.scrollToEnd({ animated: true }); }, [messages.length]);
  useEffect(() => { navigation.setOptions({ title: displayTitle }); }, [navigation, displayTitle]);

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

  /* ── render message ────────────────────────────────── */
  const renderMsg = useCallback(
    ({ item, index }: { item: MessengerMessage; index: number }) => {
      const mine = String(item.user_id) === myId;

      // Date separator
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

      const name = item.user?.full_name || '?';
      const atts = Array.isArray(item.attachments) ? item.attachments : [];
      const imgUrl = item.attachment_url ? mediaUrl(item.attachment_url) : null;
      const isImg =
        item.message_type === 'image' ||
        (item.attachment_mime || '').startsWith('image/') ||
        (imgUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(imgUrl));

      return (
        <View>
          {showDate && <DateSep date={String(item.created_at || '')} />}
          <View style={[s.row, mine && s.rowMine]}>
            {/* Avatar — chỉ với người khác */}
            {!mine ? (
              <View style={[s.avatar, { backgroundColor: avatarColor(name) }]}>
                <Text style={s.avatarTxt}>{initials(name)}</Text>
              </View>
            ) : (
              <View style={s.avatarSpace} />
            )}

            <View style={{ maxWidth: SW * 0.72, alignItems: mine ? 'flex-end' : 'flex-start' }}>
              {!mine && !isDirectChat ? (
                <Text style={s.msgName}>{name}</Text>
              ) : null}
              <Pressable
                style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}
                onLongPress={() => setReplyTo(item)}
              >
                {item.reply_to ? (
                  <View style={[s.replyBar, mine && s.replyBarMine]}>
                    <Text style={[s.replyTxt, mine && s.replyTxtMine]} numberOfLines={1}>
                      ↩ Trả lời tin nhắn
                    </Text>
                  </View>
                ) : null}

                {/* Audio message */}
                {isAudioMsg(item) && imgUrl ? (
                  <AudioPlayer url={imgUrl} mine={mine} />
                ) : null}

                {/* Text */}
                {item.content ? (
                  <Text style={[s.bubbleTxt, mine && s.bubbleTxtMine]}>{item.content}</Text>
                ) : null}

                {/* Image/file attachment */}
                {!isAudioMsg(item) && imgUrl && isImg ? (
                  <TouchableOpacity onPress={() => void Linking.openURL(imgUrl as string)}>
                    <Image source={{ uri: imgUrl }} style={s.imgAtt} resizeMode="cover" />
                  </TouchableOpacity>
                ) : !isAudioMsg(item) && imgUrl && !isImg ? (
                  <TouchableOpacity onPress={() => void Linking.openURL(imgUrl as string)}>
                    <Text style={[s.fileLink, mine && s.fileLinkMine]}>
                      📎 {item.attachment_name || 'Tệp'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Multiple attachments */}
                {atts.map((a, i) => {
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

                <Text style={[s.bubbleTime, mine && s.bubbleTimeMine]}>
                  {formatDateTime(item.created_at)}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    },
    [myId, isDirectChat, messages],
  );

  const replyLabel = useMemo(() => {
    if (!replyTo) return '';
    return (replyTo.content || '').trim().slice(0, 80) || '[Tệp / ảnh]';
  }, [replyTo]);

  if (loading && messages.length === 0) {
    return <View style={s.center}><ActivityIndicator color={BUBBLE_ME} size="large" /></View>;
  }

  const composerPadBot = Math.max(insets.bottom, 8) + (Platform.OS === 'android' ? kbInset : 0);

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Header info bar */}
      <TouchableOpacity
        style={s.headerBar}
        onPress={() => { setInfoOpen(true); setInfoTab('members'); }}
        activeOpacity={0.85}
      >
        <View style={[s.headerAvatar, { backgroundColor: avatarColor(displayTitle) }]}>
          <Text style={s.headerAvatarTxt}>{initials(displayTitle)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>{displayTitle}</Text>
          <Text style={s.headerSub}>
            {isDirectChat ? 'Chat 1–1' : `${group?.members?.length ?? 0} thành viên · Xem chi tiết`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setDebugOpen(true)} style={s.debugPill}>
          <Text style={s.debugPillTxt}>Log</Text>
        </TouchableOpacity>
      </TouchableOpacity>

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
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Reply chip */}
      {replyTo ? (
        <View style={s.replyChip}>
          <Text style={s.replyChipTxt} numberOfLines={1}>↩ {replyLabel}</Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={s.replyChipX}>✕</Text>
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
                  <Text style={s.pendingDelTxt}>✕</Text>
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
            <Text style={s.recStopTxt}>⏹ Dừng</Text>
          </TouchableOpacity>
        </View>
      ) : recState === 'done' ? (
        <View style={s.recBar}>
          <Text style={s.recDurTxt}>🎵 Đã ghi {fmtSecs(recDur)} giây</Text>
          <TouchableOpacity style={s.recCancel} onPress={() => void cancelRecording()}>
            <Text style={s.recCancelTxt}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.recStop, { backgroundColor: BUBBLE_ME }]} onPress={() => void sendVoice()}>
            <Text style={s.recStopTxt}>Gửi ▲</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Composer */}
      {recState === 'idle' ? (
        <View style={[s.composer, { paddingBottom: composerPadBot }]}>
          <TouchableOpacity
            style={s.composerIcon}
            onPress={() => setMediaOpen((v) => !v)}
          >
            <Text style={s.composerIconTxt}>{mediaOpen ? '✕' : '＋'}</Text>
          </TouchableOpacity>

          <TextInput
            style={s.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Tin nhắn…"
            placeholderTextColor="#A0A8B0"
            multiline
            maxLength={8000}
          />

          {draft.trim() || pendingFiles.length > 0 ? (
            <TouchableOpacity
              style={[s.sendBtn, sending && s.sendBtnOff]}
              onPress={() => void sendMessage()}
              disabled={sending}
            >
              <Text style={s.sendTxt}>{sending ? '…' : '▶'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.composerIcon} onPress={() => void startRecording()}>
              <Text style={s.composerIconTxt}>🎙</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Media panel */}
      {mediaOpen && recState === 'idle' ? (
        <View style={[s.mediaPanel, { paddingBottom: composerPadBot }]}>
          <TouchableOpacity style={s.mediaBtn} onPress={() => void pickGallery()}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#0068FF' }]}>
              <Text style={s.mediaIcon}>🖼</Text>
            </View>
            <Text style={s.mediaBtnTxt}>Thư viện</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => void takePhoto()}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#FF5B5B' }]}>
              <Text style={s.mediaIcon}>📷</Text>
            </View>
            <Text style={s.mediaBtnTxt}>Máy ảnh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => void pickFile()}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#FF9F1C' }]}>
              <Text style={s.mediaIcon}>📎</Text>
            </View>
            <Text style={s.mediaBtnTxt}>Tệp tin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => { setMediaOpen(false); void startRecording(); }}>
            <View style={[s.mediaIconWrap, { backgroundColor: '#2EC4B6' }]}>
              <Text style={s.mediaIcon}>🎙</Text>
            </View>
            <Text style={s.mediaBtnTxt}>Ghi âm</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Group Info Modal ── */}
      <Modal visible={infoOpen} transparent animationType="slide" onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setInfoOpen(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            {/* Sheet header */}
            <View style={s.sheetHeader}>
              <View style={[s.sheetAvatar, { backgroundColor: avatarColor(displayTitle) }]}>
                <Text style={s.sheetAvatarTxt}>{initials(displayTitle)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{displayTitle}</Text>
                <Text style={s.sheetSub}>{isDirectChat ? 'Chat 1–1' : `${group?.members?.length ?? 0} thành viên`}</Text>
              </View>
            </View>

            {/* Tabs */}
            <View style={s.tabBar}>
              {([['members', 'Thành viên'], ['images', 'Ảnh'], ['files', 'File'], ['audio', 'Ghi âm']] as [InfoTab, string][]).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.tabBtn, infoTab === key && s.tabBtnOn]}
                  onPress={() => setInfoTab(key)}
                >
                  <Text style={[s.tabTxt, infoTab === key && s.tabTxtOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tab content */}
            {infoTab === 'members' ? (
              <View style={{ flex: 1 }}>
                <FlatList
                  data={group?.members || []}
                  keyExtractor={(m) => String(m.user_id)}
                  style={s.tabContent}
                  renderItem={({ item }) => (
                    <View style={s.memberRow}>
                      <View style={[s.memberAvatar, { backgroundColor: avatarColor(item.user?.full_name || String(item.user_id)) }]}>
                        <Text style={s.memberAvatarTxt}>{initials(item.user?.full_name || String(item.user_id))}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.memberName}>{item.user?.full_name || String(item.user_id)}</Text>
                        {item.role ? <Text style={s.memberRole}>{item.role === 'admin' ? '⭐ Admin' : 'Thành viên'}</Text> : null}
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có thành viên</Text>}
                />
                {!isDirectChat ? (
                  <View style={s.sheetActions}>
                    <TouchableOpacity
                      style={s.sheetBtn}
                      onPress={() => { setInfoOpen(false); navigation.navigate('MessengerAddMembers', { groupId }); }}
                    >
                      <Text style={s.sheetBtnTxt}>＋ Thêm thành viên</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.sheetBtnDanger} onPress={leaveGroup}>
                      <Text style={s.sheetBtnDangerTxt}>Rời nhóm</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : infoTab === 'images' ? (
              <FlatList
                data={sharedImages}
                keyExtractor={(m) => String(m.id)}
                numColumns={3}
                style={s.tabContent}
                contentContainerStyle={{ gap: 2, padding: 2 }}
                renderItem={({ item }) => {
                  const u = mediaUrl(item.attachment_url);
                  return u ? (
                    <TouchableOpacity onPress={() => void Linking.openURL(u)}>
                      <Image source={{ uri: u }} style={s.gridImg} />
                    </TouchableOpacity>
                  ) : null;
                }}
                ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có ảnh nào</Text>}
              />
            ) : infoTab === 'files' ? (
              <FlatList
                data={sharedFiles}
                keyExtractor={(m) => String(m.id)}
                style={s.tabContent}
                renderItem={({ item }) => {
                  const u = mediaUrl(item.attachment_url);
                  return (
                    <TouchableOpacity
                      style={s.fileRow}
                      onPress={() => u && void Linking.openURL(u)}
                    >
                      <Text style={s.fileRowIcon}>📎</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fileRowName} numberOfLines={1}>
                          {item.attachment_name || 'Tệp đính kèm'}
                        </Text>
                        <Text style={s.fileRowDate}>{formatDateTime(item.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có file nào</Text>}
              />
            ) : (
              <FlatList
                data={sharedAudio}
                keyExtractor={(m) => String(m.id)}
                style={s.tabContent}
                renderItem={({ item }) => {
                  const u = mediaUrl(item.attachment_url);
                  return u ? (
                    <View style={s.audioRow}>
                      <AudioPlayer url={u} mine={false} />
                      <Text style={s.audioRowMeta}>{item.user?.full_name ?? '?'} · {formatDateTime(item.created_at)}</Text>
                    </View>
                  ) : null;
                }}
                ListEmptyComponent={<Text style={s.tabEmpty}>Chưa có ghi âm nào</Text>}
              />
            )}

            <TouchableOpacity style={s.sheetClose} onPress={() => setInfoOpen(false)}>
              <Text style={s.sheetCloseTxt}>Đóng</Text>
            </TouchableOpacity>
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
    </KeyboardAvoidingView>
  );
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CrmColors.gray200,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerAvatarTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  headerName: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  headerSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 1 },
  debugPill: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, backgroundColor: CrmColors.gray200 },
  debugPillTxt: { fontSize: 11, fontWeight: '700', color: CrmColors.gray700 },

  // Messages
  msgList: { flex: 1 },
  msgPad: { padding: 10, paddingBottom: 8 },

  // Date separator
  dateSep: { alignSelf: 'center', marginVertical: 10 },
  dateSepTxt: {
    fontSize: 11, color: CrmColors.gray500, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10,
  },

  // System message
  sysWrap: { alignSelf: 'center', marginVertical: 4 },
  sysTxt: { fontSize: 12, color: CrmColors.gray500, textAlign: 'center', fontStyle: 'italic' },

  // Message rows
  row: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end', paddingHorizontal: 4 },
  rowMine: { flexDirection: 'row-reverse' },

  // Avatar
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4, flexShrink: 0 },
  avatarTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  avatarSpace: { width: 30, marginHorizontal: 4 },

  msgName: { fontSize: 11, fontWeight: '700', color: CrmColors.gray600, marginBottom: 2, marginLeft: 2 },

  // Bubbles
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  bubbleOther: { backgroundColor: BUBBLE_OTHER, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: BUBBLE_ME, borderBottomRightRadius: 4 },
  bubbleTxt: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  bubbleTxtMine: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.6)' },

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
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 22,
    paddingHorizontal: 10, paddingVertical: 7, minWidth: 180,
  },
  audioPlayerMine: { backgroundColor: 'rgba(255,255,255,0.15)' },
  audioPlayBtn: { fontSize: 16, color: BUBBLE_ME },
  audioPlayBtnMine: { color: '#fff' },
  audioTrack: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 24, overflow: 'hidden', position: 'relative',
  },
  audioFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'transparent' },
  audioBar: { width: 3, borderRadius: 2 },
  audioDur: { fontSize: 11, color: CrmColors.gray600, fontWeight: '600', minWidth: 32, textAlign: 'right' },
  audioDurMine: { color: 'rgba(255,255,255,0.8)' },

  // Reply chip
  replyChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#EFF3FF',
    borderTopWidth: 1, borderTopColor: '#C8D4FF',
  },
  replyChipTxt: { flex: 1, fontSize: 12, color: CrmColors.gray700 },
  replyChipX: { fontSize: 18, color: CrmColors.gray400, paddingLeft: 8 },

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
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#FFF5F5', borderTopWidth: 1, borderTopColor: '#FFD0D0', gap: 8,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recDurTxt: { flex: 1, fontSize: 14, color: '#FF3B30', fontWeight: '600' },
  recCancel: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: CrmColors.gray200 },
  recCancelTxt: { fontSize: 13, color: CrmColors.gray700, fontWeight: '700' },
  recStop: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FF3B30' },
  recStopTxt: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // Composer
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8, gap: 6,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CrmColors.gray200,
  },
  composerIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: CrmColors.gray100 },
  composerIconTxt: { fontSize: 18 },
  input: {
    flex: 1, minHeight: 38, maxHeight: 120,
    borderWidth: 1, borderColor: CrmColors.gray200, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 15, color: CrmColors.gray900, backgroundColor: '#F8F9FA',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: BUBBLE_ME, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnOff: { opacity: 0.5 },
  sendTxt: { fontSize: 16, color: '#fff', fontWeight: '900' },

  // Media panel
  mediaPanel: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around',
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CrmColors.gray200,
  },
  mediaBtn: { alignItems: 'center', gap: 6, paddingVertical: 6, width: 70 },
  mediaIconWrap: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  mediaIcon: { fontSize: 24 },
  mediaBtnTxt: { fontSize: 11, color: CrmColors.gray700, fontWeight: '600' },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, maxHeight: '82%', flex: 0,
  },
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
