import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Linking,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { io, type Socket } from 'socket.io-client';
import { api, getStoredToken } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupDetail, MessengerMessage } from '../types/messenger';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';

type R = RouteProp<MoreStackParamList, 'MessengerGroupChat'>;
type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerGroupChat'>;

function mediaUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (u.startsWith('http')) return u;
  return `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`;
}

export default function MessengerGroupChatScreen() {
  const { params } = useRoute<R>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');

  const { groupId, title: titleParam, isDirect: isDirectParam } = params;

  const [group, setGroup] = useState<MessengerGroupDetail | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const displayTitle = group?.name || titleParam || 'Chat nhóm';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, mRes] = await Promise.all([
        api.get<MessengerGroupDetail>(`/messenger/groups/${groupId}`),
        api.get<MessengerMessage[]>(`/messenger/groups/${groupId}/chat`),
      ]);
      setGroup(gRes.data);
      const rows = Array.isArray(mRes.data) ? mRes.data : [];
      setMessages(rows);
      seenIds.current = new Set(rows.map((r) => String(r.id)));
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tải được chat');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    navigation.setOptions({ title: displayTitle });
  }, [navigation, displayTitle]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    const onSockConnect = () => {
      socket?.emit('join:messenger_group', groupId);
    };
    (async () => {
      const token = await getStoredToken();
      if (!token || cancelled) return;
      socket = io(API_ORIGIN, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1500,
      });
      socket.on('connect', onSockConnect);
      if (socket.connected) onSockConnect();
      socket.on('messenger_group:chat', (msg: MessengerMessage) => {
        if (!msg?.id) return;
        const id = String(msg.id);
        setMessages((prev) => {
          if (seenIds.current.has(id)) {
            const i = prev.findIndex((p) => String(p.id) === id);
            if (i >= 0) {
              const next = [...prev];
              next[i] = msg;
              return next;
            }
            return prev;
          }
          seenIds.current.add(id);
          return [...prev, msg];
        });
      });
      socket.on('messenger_group:members', () => {
        void loadAll();
      });
    })();
    return () => {
      cancelled = true;
      try {
        socket?.off('connect', onSockConnect);
      } catch {
        /* ignore */
      }
      try {
        socket?.emit('leave:messenger_group', groupId);
      } catch {
        /* ignore */
      }
      socket?.disconnect();
    };
  }, [groupId, loadAll]);

  const appendMessage = useCallback((msg: MessengerMessage) => {
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
      if (pendingFiles.length === 0) {
        const body: { content: string; reply_to?: string } = { content: text };
        if (replyTo?.id) body.reply_to = String(replyTo.id);
        const { data } = await api.post<MessengerMessage>(`/messenger/groups/${groupId}/chat`, body, {
          timeout: 120000,
          headers: { 'Content-Type': 'application/json' },
        });
        setDraft('');
        setPendingFiles([]);
        setReplyTo(null);
        appendMessage(data);
        return;
      }

      const form = new FormData();
      form.append('content', text);
      if (replyTo?.id) form.append('reply_to', String(replyTo.id));
      for (const f of pendingFiles) {
        form.append('files', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
      }
      const { data } = await api.post<MessengerMessage>(`/messenger/groups/${groupId}/chat`, form, {
        timeout: 120000,
      });
      setDraft('');
      setPendingFiles([]);
      setReplyTo(null);
      appendMessage(data);
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gửi không thành công');
    } finally {
      setSending(false);
    }
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền', 'Cho phép truy cập ảnh trong Cài đặt.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.length) return;
    const next = res.assets.map((a, i) => ({
      uri: a.uri,
      name: a.fileName || `image_${Date.now()}_${i}.jpg`,
      type: a.mimeType || 'image/jpeg',
    }));
    setPendingFiles((p) => [...p, ...next]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền camera', 'Bật quyền Camera trong Cài đặt hệ thống.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    setPendingFiles((p) => [
      ...p,
      { uri: a.uri, name: `camera_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' },
    ]);
  };

  const pickFile = async () => {
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (pick.canceled || !pick.assets?.length) return;
    const next = pick.assets.map((a) => ({
      uri: a.uri,
      name: a.name || 'file',
      type: a.mimeType || 'application/octet-stream',
    }));
    setPendingFiles((p) => [...p, ...next]);
  };

  const isDirectChat = !!(group?.is_direct ?? isDirectParam);

  const leaveGroup = () => {
    if (isDirectChat) {
      Alert.alert('Không áp dụng', 'Chat 1–1 không dùng chức năng rời nhóm.');
      return;
    }
    Alert.alert('Rời nhóm', 'Bạn sẽ không còn nhận tin từ nhóm này.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Rời nhóm',
        style: 'destructive',
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

  const replyLabel = useMemo(() => {
    if (!replyTo) return '';
    const snip = (replyTo.content || '').trim().slice(0, 80);
    return snip || '[Tệp / ảnh]';
  }, [replyTo]);

  const renderMsg = useCallback(
    ({ item }: { item: MessengerMessage }) => {
      const mine = String(item.user_id) === myId;
      if (item.is_system) {
        return (
          <View style={styles.sysWrap}>
            <Text style={styles.sysTxt}>{item.content || '—'}</Text>
            <Text style={styles.sysTime}>{formatDateTime(item.created_at)}</Text>
          </View>
        );
      }
      const name = item.user?.full_name || '—';
      const atts = Array.isArray(item.attachments) ? item.attachments : [];
      const imgUrl = item.attachment_url ? mediaUrl(item.attachment_url) : null;
      const isImg =
        item.message_type === 'image' || (item.attachment_mime || '').startsWith('image/') || (imgUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(imgUrl));

      return (
        <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
            {!mine ? <Text style={styles.bubbleName}>{name}</Text> : null}
            {item.reply_to ? (
              <Text style={styles.replyHint}>↩ Trả lời tin nhắn</Text>
            ) : null}
            {item.content ? <Text style={[styles.bubbleTxt, mine && styles.bubbleTxtMine]}>{item.content}</Text> : null}
            {imgUrl && isImg ? (
              <TouchableOpacity onPress={() => void Linking.openURL(imgUrl)}>
                <Image source={{ uri: imgUrl }} style={styles.imgAtt} resizeMode="cover" />
              </TouchableOpacity>
            ) : imgUrl ? (
              <TouchableOpacity onPress={() => void Linking.openURL(imgUrl)}>
                <Text style={[styles.linkAtt, mine && styles.linkAttMine]}>📎 {item.attachment_name || 'Tệp'}</Text>
              </TouchableOpacity>
            ) : null}
            {atts.map((a, i) => {
              const u = mediaUrl(a.url);
              const im = (a.type || '').startsWith('image/') && u;
              return im ? (
                <TouchableOpacity key={i} onPress={() => u && void Linking.openURL(u)}>
                  <Image source={{ uri: u }} style={styles.imgAtt} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity key={i} onPress={() => u && void Linking.openURL(u)}>
                  <Text style={[styles.linkAtt, mine && styles.linkAttMine]}>📎 {a.name || 'Tệp'}</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatDateTime(item.created_at)}</Text>
            <TouchableOpacity style={styles.replyBtn} onPress={() => setReplyTo(item)} hitSlop={6}>
              <Text style={[styles.replyBtnTxt, mine && styles.replyBtnTxtMine]}>Trả lời</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [myId],
  );

  if (loading && messages.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
      <TouchableOpacity style={styles.infoBar} onPress={() => setInfoOpen(true)}>
        <Text style={styles.infoBarTxt}>
          {isDirectChat ? 'ℹ️ Thành viên' : 'ℹ️ Thành viên · Thêm người · Rời nhóm'}
        </Text>
      </TouchableOpacity>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderMsg}
        contentContainerStyle={styles.listPad}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {replyTo ? (
        <View style={styles.replyChip}>
          <Text style={styles.replyChipTxt} numberOfLines={2}>
            Trả lời: {replyLabel}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={styles.replyChipX}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {pendingFiles.length > 0 ? (
        <View style={styles.pendingBar}>
          <Text style={styles.pendingTxt}>{pendingFiles.length} tệp đính kèm</Text>
          <TouchableOpacity onPress={() => setPendingFiles([])}>
            <Text style={styles.pendingClr}>Xóa</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TouchableOpacity style={styles.iconAct} onPress={() => void pickGallery()} disabled={sending}>
          <Text style={styles.iconActTxt}>🖼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconAct} onPress={() => void takePhoto()} disabled={sending}>
          <Text style={styles.iconActTxt}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconAct} onPress={() => void pickFile()} disabled={sending}>
          <Text style={styles.iconActTxt}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Nhập tin nhắn…"
          placeholderTextColor={CrmColors.gray400}
          multiline
          maxLength={8000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnOff]}
          onPress={() => void sendMessage()}
          disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
        >
          <Text style={styles.sendTxt}>{sending ? '…' : 'Gửi'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={infoOpen} transparent animationType="slide">
        <Pressable style={styles.modalBg} onPress={() => setInfoOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{displayTitle}</Text>
            <Text style={styles.sheetSub}>{isDirectChat ? 'Chat trực tiếp 1–1' : 'Nhóm chat nội bộ'}</Text>
            <Text style={styles.memH}>Thành viên ({group?.members?.length ?? 0})</Text>
            <FlatList
              data={group?.members || []}
              keyExtractor={(m) => String(m.user_id)}
              style={{ maxHeight: 220 }}
              renderItem={({ item }) => (
                <Text style={styles.memRow}>
                  • {item.user?.full_name || item.user_id}
                  {item.role ? ` (${item.role})` : ''}
                </Text>
              )}
            />
            {!isDirectChat ? (
              <>
                <TouchableOpacity
                  style={styles.sheetBtn}
                  onPress={() => {
                    setInfoOpen(false);
                    navigation.navigate('MessengerAddMembers', { groupId });
                  }}
                >
                  <Text style={styles.sheetBtnTxt}>＋ Thêm thành viên</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetBtnDanger} onPress={() => leaveGroup()}>
                  <Text style={styles.sheetBtnDangerTxt}>Rời nhóm</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.sheetClose} onPress={() => setInfoOpen(false)}>
              <Text style={styles.sheetCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CrmColors.white,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray200,
  },
  infoBarTxt: { fontSize: 12, color: CrmColors.blue700, fontWeight: '600', textAlign: 'center' },
  listPad: { padding: 12, paddingBottom: 8 },
  sysWrap: { alignSelf: 'center', maxWidth: '92%', marginVertical: 6, alignItems: 'center' },
  sysTxt: { fontSize: 12, color: CrmColors.gray600, textAlign: 'center' },
  sysTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 2 },
  bubbleRow: { flexDirection: 'row', marginVertical: 4, justifyContent: 'flex-start' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: CrmRadii.lg, padding: 10, borderWidth: 1 },
  bubbleOther: { backgroundColor: CrmColors.white, borderColor: CrmColors.gray200 },
  bubbleMine: { backgroundColor: CrmColors.blue600, borderColor: CrmColors.blue600 },
  bubbleName: { fontSize: 11, fontWeight: '700', color: CrmColors.gray600, marginBottom: 4 },
  replyHint: { fontSize: 10, color: CrmColors.gray500, marginBottom: 4 },
  bubbleTxt: { fontSize: 15, color: CrmColors.gray900 },
  bubbleTxtMine: { color: CrmColors.white },
  imgAtt: { width: 220, height: 160, borderRadius: CrmRadii.md, marginTop: 6, backgroundColor: CrmColors.gray100 },
  linkAtt: { fontSize: 14, color: CrmColors.blue700, marginTop: 6, fontWeight: '600' },
  linkAttMine: { color: CrmColors.blue100 },
  bubbleTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 6 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  replyBtn: { alignSelf: 'flex-end', marginTop: 4 },
  replyBtnTxt: { fontSize: 11, color: CrmColors.blue500, fontWeight: '600' },
  replyBtnTxtMine: { color: 'rgba(255,255,255,0.92)' },
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CrmColors.blue50,
    borderTopWidth: 1,
    borderTopColor: CrmColors.blue100,
  },
  replyChipTxt: { flex: 1, fontSize: 12, color: CrmColors.gray700 },
  replyChipX: { fontSize: 18, color: CrmColors.gray500, paddingLeft: 8 },
  pendingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: CrmColors.amber50,
    borderTopWidth: 1,
    borderTopColor: CrmColors.amber100,
  },
  pendingTxt: { fontSize: 12, color: CrmColors.amber600, fontWeight: '600' },
  pendingClr: { fontSize: 12, color: CrmColors.blue700, fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 6,
    backgroundColor: CrmColors.white,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray200,
  },
  iconAct: { padding: 8, marginBottom: 4 },
  iconActTxt: { fontSize: 20 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  sendBtn: {
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    marginBottom: 4,
  },
  sendBtnOff: { opacity: 0.5 },
  sendTxt: { color: CrmColors.white, fontWeight: '800' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 20,
    maxHeight: '70%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  sheetSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, marginBottom: 12 },
  memH: { fontSize: 12, fontWeight: '800', color: CrmColors.gray600, marginBottom: 6 },
  memRow: { fontSize: 14, color: CrmColors.gray800, paddingVertical: 4 },
  sheetBtn: {
    marginTop: 14,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  sheetBtnTxt: { color: CrmColors.white, fontWeight: '800' },
  sheetBtnDanger: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CrmColors.red200,
  },
  sheetBtnDangerTxt: { color: CrmColors.red700, fontWeight: '800' },
  sheetClose: { marginTop: 16, alignItems: 'center' },
  sheetCloseTxt: { color: CrmColors.gray500, fontWeight: '600' },
});
