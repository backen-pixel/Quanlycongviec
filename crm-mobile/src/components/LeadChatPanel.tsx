import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { io, type Socket } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from '../context/AuthContext';
import type { CrmLeadMessage } from '../types/crm';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';

type Props = { leadId: string };

type ChatFilter = 'all' | 'media' | 'file' | 'link';

function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

function linksInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const m = text.match(/https?:\/\/[^\s<]+/gi);
  return m || [];
}

function messageKind(m: CrmLeadMessage): 'link' | 'media' | 'file' | 'text' {
  const mt = (m.message_type || '').toLowerCase();
  const mime = (m as { attachment_mime?: string | null }).attachment_mime || '';
  if (linksInText(m.content || '').length) return 'link';
  if (mt === 'image' || mime.startsWith('image/')) return 'media';
  if (mt === 'video' || mime.startsWith('video/')) return 'media';
  if (mt === 'audio' || mime.startsWith('audio/')) return 'media';
  if (m.attachment_url || (m as { attachments?: unknown }).attachments) return 'file';
  return 'text';
}

/** Gợi ý: thông báo khay hệ thống khi app nền cần FCM + expo-notifications — xem docs Expo. */
export default function LeadChatPanel({ leadId }: Props) {
  const { token, user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const [messages, setMessages] = useState<CrmLeadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<ScrollView>(null);

  const loadChat = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CrmLeadMessage[]>(`/crm/leads/${leadId}/chat`);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (!token || !leadId) return;
    const s = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
    });
    socketRef.current = s;
    const onConnect = () => {
      s.emit('join:lead', leadId);
    };
    const onChat = (msg: CrmLeadMessage) => {
      if (!msg?.id) return;
      setMessages((prev) => {
        if (prev.some((x) => x.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    };
    s.on('connect', onConnect);
    s.on('lead:chat', onChat);
    if (s.connected) onConnect();
    return () => {
      try {
        s.emit('leave:lead', leadId);
      } catch {
        /* ignore */
      }
      s.off('connect', onConnect);
      s.off('lead:chat', onChat);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [token, leadId]);

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (filter === 'all') return true;
      const k = messageKind(m);
      if (filter === 'link') return k === 'link';
      if (filter === 'media') return k === 'media';
      if (filter === 'file') return k === 'file';
      return true;
    });
  }, [messages, filter]);

  const sidebarCounts = useMemo(() => {
    const c = { all: messages.length, media: 0, file: 0, link: 0 };
    for (const m of messages) {
      const k = messageKind(m);
      if (k === 'media') c.media += 1;
      if (k === 'file') c.file += 1;
      if (k === 'link') c.link += 1;
    }
    return c;
  }, [messages]);

  const sendText = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await api.post(
        `/crm/leads/${leadId}/chat`,
        { content: t },
        { headers: { 'Content-Type': 'application/json' } },
      );
      setDraft('');
      await loadChat();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 250);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không gửi được tin nhắn';
      Alert.alert('Lỗi gửi chat', String(msg));
    } finally {
      setSending(false);
    }
  };

  const uploadAsset = async (uri: string, name: string, mime: string) => {
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri, name, type: mime } as unknown as Blob);
      if (draft.trim()) fd.append('content', draft.trim());
      await api.post(`/crm/leads/${leadId}/chat/upload`, fd);
      setDraft('');
      await loadChat();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload thất bại';
      Alert.alert('Lỗi', String(msg));
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền', 'Cần quyền thư viện ảnh để gửi hình.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const uri = a.uri;
    const mime = a.mimeType || 'image/jpeg';
    const name = a.fileName || `photo_${Date.now()}.jpg`;
    await uploadAsset(uri, name, mime);
  };

  const pickDoc = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await uploadAsset(a.uri, a.name || 'file', a.mimeType || 'application/octet-stream');
  };

  const renderMsg = (msg: CrmLeadMessage) => {
    const uid =
      (msg.user as { id?: string } | undefined)?.id ||
      (msg as { user_id?: string | null }).user_id ||
      null;
    const mine = !!(myId && uid && String(uid) === String(myId));
    const who = msg.user?.full_name || (msg.is_system ? 'Hệ thống' : '—');
    const att = fileUrl(msg.attachment_url);
    const mime = (msg as { attachment_mime?: string | null }).attachment_mime || '';
    const isImg = (msg.message_type || '') === 'image' || mime.startsWith('image/');
    const isVid = (msg.message_type || '') === 'video' || mime.startsWith('video/');
    const isAud = (msg.message_type || '') === 'audio' || mime.startsWith('audio/');
    const links = linksInText(msg.content || '');

    if (msg.is_system) {
      return (
        <View style={styles.sysBubble}>
          <Text style={styles.sysText}>{msg.content || '—'}</Text>
          <Text style={styles.sysTime}>{formatDateTime(msg.created_at)}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapOther]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, CrmShadow.card]}>
          {!mine ? <Text style={styles.bubbleWho}>{who}</Text> : null}
          {msg.content ? (
            <Text style={[styles.bubbleTxt, mine && styles.bubbleTxtMine]}>{msg.content}</Text>
          ) : null}
          {links.map((url) => (
            <TouchableOpacity key={url} onPress={() => void Linking.openURL(url)}>
              <Text style={[styles.linkTxt, mine && styles.linkTxtMine]} numberOfLines={2}>
                🔗 {url}
              </Text>
            </TouchableOpacity>
          ))}
          {att && isImg ? (
            <TouchableOpacity onPress={() => void Linking.openURL(att)} activeOpacity={0.9}>
              <Image source={{ uri: att }} style={styles.chatImg} resizeMode="cover" />
            </TouchableOpacity>
          ) : null}
          {att && isVid ? (
            <TouchableOpacity style={styles.mediaChip} onPress={() => void Linking.openURL(att)}>
              <Text style={[styles.mediaChipTxt, mine && styles.mediaChipTxtMine]}>▶ Video — mở</Text>
            </TouchableOpacity>
          ) : null}
          {att && isAud ? (
            <TouchableOpacity style={styles.mediaChip} onPress={() => void Linking.openURL(att)}>
              <Text style={[styles.mediaChipTxt, mine && styles.mediaChipTxtMine]}>🎙 Ghi âm — mở</Text>
            </TouchableOpacity>
          ) : null}
          {att && !isImg && !isVid && !isAud ? (
            <TouchableOpacity onPress={() => void Linking.openURL(att)}>
              <Text style={[styles.attachTxt, mine && styles.attachTxtMine]}>📎 {msg.attachment_name || 'Tệp đính kèm'}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatDateTime(msg.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      style={styles.root}
    >
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.webBtn} onPress={() => openWebPath(`/crm/leads/${leadId}?tab=chat`)}>
          <Text style={styles.webBtnTxt}>Web đầy đủ (reply, reaction)</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.bodyRow}>
        <View style={styles.chatCol}>
          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={CrmColors.blue600} />
            </View>
          ) : (
            <ScrollView
              ref={listRef}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              nestedScrollEnabled
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            >
              {filtered.length === 0 ? (
                <Text style={styles.muted}>Không có tin nhắn (hoặc bộ lọc trống).</Text>
              ) : (
                filtered.map((msg) => <React.Fragment key={msg.id}>{renderMsg(msg)}</React.Fragment>)
              )}
            </ScrollView>
          )}
        </View>
        <View style={styles.rail}>
          {(
            [
              ['all', 'Tất cả', `${sidebarCounts.all}`] as const,
              ['media', 'Ảnh/Video', `${sidebarCounts.media}`] as const,
              ['file', 'File', `${sidebarCounts.file}`] as const,
              ['link', 'Link', `${sidebarCounts.link}`] as const,
            ] as const
          ).map(([key, label, cnt]) => (
            <TouchableOpacity
              key={key}
              style={[styles.railBtn, filter === key && styles.railBtnOn]}
              onPress={() => setFilter(key)}
            >
              <Text style={[styles.railBtnTxt, filter === key && styles.railBtnTxtOn]} numberOfLines={3}>
                {label}
              </Text>
              <Text style={styles.railCnt}>{cnt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.attachRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => void pickImage()} disabled={sending}>
          <Text style={styles.iconBtnTxt}>🖼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => void pickDoc()} disabled={sending}>
          <Text style={styles.iconBtnTxt}>📎</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Nhập tin nhắn…"
          placeholderTextColor={CrmColors.gray400}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          style={[styles.send, (!draft.trim() || sending) && styles.sendOff]}
          onPress={() => void sendText()}
          disabled={!draft.trim() || sending}
        >
          <Text style={styles.sendTxt}>{sending ? '…' : 'Gửi'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 420 },
  toolbar: { marginBottom: 8 },
  webBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue50,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  webBtnTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.blue600 },
  bodyRow: { flexDirection: 'row', gap: 8, minHeight: 320 },
  chatCol: { flex: 1, minWidth: 0 },
  rail: { width: 76, flexShrink: 0, gap: 6 },
  railBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
  },
  railBtnOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue500 },
  railBtnTxt: { fontSize: 10, fontWeight: '700', color: CrmColors.gray600, textAlign: 'center' },
  railBtnTxtOn: { color: CrmColors.blue700 },
  railCnt: { fontSize: 10, color: CrmColors.gray400, marginTop: 2 },
  list: { flex: 1 },
  listContent: { paddingBottom: 12, paddingRight: 4 },
  loader: { flex: 1, minHeight: 200, justifyContent: 'center', alignItems: 'center' },
  muted: { textAlign: 'center', color: CrmColors.gray400, marginTop: 24, fontSize: 13 },
  sysBubble: {
    alignSelf: 'center',
    maxWidth: '92%',
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.amber50,
    borderWidth: 1,
    borderColor: CrmColors.amber100,
    marginBottom: 10,
  },
  sysText: { fontSize: 12, color: CrmColors.gray800, textAlign: 'center' },
  sysTime: { fontSize: 10, color: CrmColors.gray400, textAlign: 'center', marginTop: 4 },
  bubbleWrap: { marginBottom: 10, maxWidth: '88%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapOther: { alignSelf: 'flex-start' },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  bubbleMine: {
    backgroundColor: CrmColors.blue600,
    borderColor: CrmColors.blue700,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: CrmColors.white,
    borderColor: CrmColors.gray200,
    borderBottomLeftRadius: 4,
  },
  bubbleWho: { fontSize: 11, fontWeight: '800', color: CrmColors.gray700 },
  bubbleTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 8 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  bubbleTxt: { fontSize: 14, marginTop: 2, lineHeight: 20, color: CrmColors.gray900 },
  bubbleTxtMine: { color: '#fff' },
  linkTxt: { fontSize: 13, color: CrmColors.blue600, fontWeight: '600', marginTop: 6 },
  linkTxtMine: { color: '#e0e7ff' },
  chatImg: { width: 220, height: 160, borderRadius: 12, marginTop: 8, backgroundColor: 'rgba(0,0,0,0.06)' },
  mediaChip: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  mediaChipTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700 },
  mediaChipTxtMine: { color: '#fff' },
  attachTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue600, marginTop: 8 },
  attachTxtMine: { color: '#e0e7ff' },
  attachRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnTxt: { fontSize: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
    backgroundColor: CrmColors.white,
  },
  send: {
    flexShrink: 0,
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.45 },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
