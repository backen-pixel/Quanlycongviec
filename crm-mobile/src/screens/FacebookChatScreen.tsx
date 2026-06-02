import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  Image,
  Linking,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { resolveAttachmentUrl } from '../lib/resolveMediaUrl';

type Props = NativeStackScreenProps<MoreStackParamList, 'FacebookChat'>;

type Msg = {
  id: string;
  direction?: string | null;
  content?: string | null;
  created_at?: string | null;
  message_type?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
};

type MediaViewer = { uri: string; kind: 'image' | 'video' | 'audio' };

export default function FacebookChatScreen({ route, navigation }: Props) {
  const { contactId } = route.params;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState<MediaViewer | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const listRef = useRef<FlatList>(null);
  const isAtBottom = useRef(true);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
    isAtBottom.current = isCloseToBottom;
  };

  const unloadSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      void unloadSound();
    };
  }, [unloadSound]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, mRes] = await Promise.all([
        api.get(`/facebook/contacts/${contactId}`).catch(() => ({ data: null })),
        api.get<Msg[]>(`/facebook/contacts/${contactId}/messages`).catch(() => ({ data: [] })),
      ]);
      const c = cRes.data as { fb_name?: string | null } | null;
      if (c?.fb_name) navigation.setOptions({ title: c.fb_name });
      setMessages(Array.isArray(mRes.data) ? mRes.data : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [contactId, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await api.post(`/facebook/contacts/${contactId}/reply`, { message: t });
      setDraft('');
      await load();
      listRef.current?.scrollToEnd({ animated: true });
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const openMedia = (m: Msg) => {
    const raw = m.attachment_url;
    const uri = resolveAttachmentUrl(raw);
    if (!uri) return;
    const t = (m.attachment_type || m.message_type || 'file').toLowerCase();
    if (t === 'file') {
      void Linking.openURL(uri);
      return;
    }
    if (t === 'image') setViewer({ uri, kind: 'image' });
    else if (t === 'video') setViewer({ uri, kind: 'video' });
    else if (t === 'audio') setViewer({ uri, kind: 'audio' });
    else void Linking.openURL(uri);
  };

  const playAudioInViewer = async (uri: string) => {
    setAudioLoading(true);
    try {
      await unloadSound();
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      await sound.playAsync();
    } finally {
      setAudioLoading(false);
    }
  };

  const renderAttachment = (m: Msg, out: boolean) => {
    const uri = resolveAttachmentUrl(m.attachment_url);
    if (!uri) return null;
    const t = (m.attachment_type || m.message_type || '').toLowerCase();
    const isImg = t === 'image' || t === 'sticker';
    const isVid = t === 'video';
    const isAud = t === 'audio';

    if (isImg) {
      return (
        <Pressable onPress={() => openMedia(m)} style={styles.attImgWrap}>
          <Image source={{ uri }} style={styles.attImg} resizeMode="cover" />
          <Text style={[styles.attTap, out && styles.attTapOut]}>Chạm xem</Text>
        </Pressable>
      );
    }
    if (isVid) {
      return (
        <TouchableOpacity style={styles.attVidChip} onPress={() => openMedia(m)} activeOpacity={0.85}>
          <Text style={[styles.attVidChipTxt, out && styles.attVidChipTxtOut]}>🎬 Video — chạm trình chiếu</Text>
        </TouchableOpacity>
      );
    }
    if (isAud) {
      return (
        <TouchableOpacity style={styles.attAud} onPress={() => openMedia(m)} activeOpacity={0.85}>
          <Text style={[styles.attAudTxt, out && styles.attAudTxtOut]}>🎧 Ghi âm — chạm phát toàn màn</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity onPress={() => openMedia(m)} activeOpacity={0.85}>
        <Text style={[styles.attFile, out && styles.attFileOut]}>📎 Tệp đính kèm — chạm xem</Text>
      </TouchableOpacity>
    );
  };

  const composerPadBottom =
    Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 4);
  const ChatRoot = KeyboardAvoidingView;
  const chatRootProps =
    Platform.OS === 'ios'
      ? ({ behavior: 'padding' as const, keyboardVerticalOffset: 88 } as const)
      : ({ behavior: 'height' as const } as const);

  return (
    <ChatRoot style={styles.flex} {...chatRootProps}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={CrmColors.blue600} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.msgList}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (isAtBottom.current) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          renderItem={({ item: m }) => {
            const out = m.direction === 'outbound';
            return (
              <View style={[styles.bubbleWrap, out && styles.bubbleWrapOut]}>
                <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
                  {renderAttachment(m, out)}
                  {m.content && m.content !== `[${m.attachment_type || m.message_type}]` ? (
                    <Text style={[styles.bubbleTxt, out && styles.bubbleTxtOut]}>{m.content}</Text>
                  ) : null}
                  {!m.content && !m.attachment_url ? (
                    <Text style={[styles.bubbleTxt, out && styles.bubbleTxtOut]}>—</Text>
                  ) : null}
                  <Text style={[styles.time, out && styles.timeOut]}>
                    {m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={[styles.composer, CrmShadow.card, { paddingBottom: composerPadBottom }]}>
        <TextInput
          style={styles.composerInp}
          placeholder="Nhập tin nhắn…"
          placeholderTextColor={CrmColors.gray400}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
        >
          <Text style={styles.sendBtnTxt}>{sending ? '…' : 'Gửi'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!viewer} animationType="fade" transparent onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.vBack} onPress={() => setViewer(null)}>
          <Pressable style={styles.vInner} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.vClose} onPress={() => setViewer(null)}>
              <Text style={styles.vCloseTxt}>✕ Đóng</Text>
            </TouchableOpacity>
            {viewer?.kind === 'image' ? (
              <Image source={{ uri: viewer.uri }} style={styles.vFullImg} resizeMode="contain" />
            ) : null}
            {viewer?.kind === 'video' ? (
              <Video
                source={{ uri: viewer.uri }}
                style={styles.vFullVid}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            ) : null}
            {viewer?.kind === 'audio' ? (
              <View style={styles.vAudBox}>
                <Text style={styles.vAudLbl}>Ghi âm</Text>
                {audioLoading ? <ActivityIndicator color={CrmColors.blue600} /> : null}
                <TouchableOpacity
                  style={styles.vAudPlay}
                  onPress={() => viewer && void playAudioInViewer(viewer.uri)}
                  disabled={audioLoading}
                >
                  <Text style={styles.vAudPlayTxt}>Phát</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </ChatRoot>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  msgList: { padding: 12, paddingBottom: 8 },
  bubbleWrap: { alignItems: 'flex-start', marginBottom: 8 },
  bubbleWrapOut: { alignItems: 'flex-end' },
  bubble: { maxWidth: '92%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: CrmRadii.lg },
  bubbleIn: { backgroundColor: CrmColors.white, borderWidth: 1, borderColor: CrmColors.gray200 },
  bubbleOut: { backgroundColor: CrmColors.blue600 },
  bubbleTxt: { fontSize: 14, color: CrmColors.gray900 },
  bubbleTxtOut: { color: '#fff' },
  time: { fontSize: 10, color: CrmColors.gray400, marginTop: 4 },
  timeOut: { color: 'rgba(255,255,255,0.85)' },
  attImgWrap: { marginBottom: 6, borderRadius: CrmRadii.md, overflow: 'hidden' },
  attImg: { width: 220, height: 160, backgroundColor: CrmColors.gray100 },
  attTap: { position: 'absolute', bottom: 6, right: 6, fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  attTapOut: {},
  attVidChip: { marginBottom: 6, paddingVertical: 8 },
  attVidChipTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700 },
  attVidChipTxtOut: { color: '#e0e7ff' },
  attAud: { paddingVertical: 8, marginBottom: 4 },
  attAudTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700 },
  attAudTxtOut: { color: '#e0e7ff' },
  attFile: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700, marginBottom: 4 },
  attFileOut: { color: '#e0e7ff' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: CrmColors.white,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray200,
  },
  composerInp: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  sendBtn: {
    flexShrink: 0,
    alignSelf: 'flex-end',
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.45 },
  sendBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  vBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 12 },
  vInner: { flex: 1, justifyContent: 'center' },
  vClose: { alignSelf: 'flex-end', marginBottom: 12, padding: 8 },
  vCloseTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  vFullImg: { width: '100%', minHeight: 320 },
  vFullVid: { width: '100%', height: 360, backgroundColor: '#000' },
  vAudBox: { padding: 24, alignItems: 'center' },
  vAudLbl: { color: '#fff', fontSize: 16, marginBottom: 16 },
  vAudPlay: { backgroundColor: CrmColors.blue600, paddingHorizontal: 28, paddingVertical: 14, borderRadius: CrmRadii.md },
  vAudPlayTxt: { color: '#fff', fontWeight: '800' },
});
