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
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { api, formatApiError, postMultipart } from '../api/client';
import { API_ORIGIN } from '../config';
import { useAuth } from '../context/AuthContext';
import type { CrmLeadMessage } from '../types/crm';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';
import { chatDebugClear, chatDebugLog, chatDebugSnapshot, chatDebugSubscribe } from '../lib/chatDebug';
import { setForegroundLead } from '../lib/bubbleRealtimeSocket';

type Props = { leadId: string };

type ChatFilter = 'all' | 'media' | 'file' | 'link';

/** Trạng thái UI ghi âm trong composer (giống Messenger group chat). */
type RecState = 'idle' | 'recording' | 'done';

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Mở Cài đặt ứng dụng khi quyền bị "Don't ask again" — cùng lý lẽ với
 * `voicePermissions.requestVoicePermissionsQuick`: 1 nút Đóng + 1 nút Mở
 * cài đặt, không retry sai vô hạn.
 */
function alertPermissionGap(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Đóng', style: 'cancel' },
    { text: 'Mở Cài đặt', onPress: () => void Linking.openSettings() },
  ]);
}

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
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugText, setDebugText] = useState('');
  const insets = useSafeAreaInsets();
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<ScrollView>(null);
  const isAtBottom = useRef(true);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
    isAtBottom.current = isCloseToBottom;
  };

  // ── Voice recording ──────────────────────────────
  const [recState, setRecState] = useState<RecState>('idle');
  const [recDur, setRecDur] = useState(0);
  const recRef = useRef<Audio.Recording | null>(null);
  const recUriRef = useRef<string | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bảo đảm dọn recording khi unmount (tránh leak file/handle).
  useEffect(() => {
    return () => {
      if (recTimer.current) clearInterval(recTimer.current);
      void (async () => {
        try { await recRef.current?.stopAndUnloadAsync(); } catch { /* ignore */ }
        recRef.current = null;
      })();
    };
  }, []);

  useEffect(() => {
    const update = () => {
      const rows = chatDebugSnapshot();
      const text = rows
        .map((r) => {
          let d = '';
          if (r.data !== undefined) {
            try {
              d = JSON.stringify(r.data, null, 2);
            } catch {
              d = String(r.data);
            }
          }
          return `${r.at}  [${r.scope}]  ${r.message}${d ? `\n${d}` : ''}`;
        })
        .join('\n\n');
      setDebugText(text);
    };
    update();
    return chatDebugSubscribe(update);
  }, []);

  const loadChat = useCallback(async () => {
    setLoading(true);
    try {
      chatDebugLog('lead-chat', 'GET /crm/leads/:id/chat', { leadId });
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
    if (!leadId) return;
    setForegroundLead(leadId);
    return () => setForegroundLead(null);
  }, [leadId]);

  useEffect(() => {
    if (!token || !leadId) return;
    const s = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 12_000,
      randomizationFactor: 0.5,
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
      chatDebugLog('lead-chat', 'POST /crm/leads/:id/chat (text)', { leadId, content_len: t.length });
      await api.post(
        `/crm/leads/${leadId}/chat`,
        { content: t },
        { headers: { 'Content-Type': 'application/json' } },
      );
      setDraft('');
      await loadChat();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 250);
    } catch (e: unknown) {
      const err = e as {
        message?: string;
        response?: { status?: number; data?: { error?: string; message?: string } };
        config?: { method?: string; url?: string; baseURL?: string; timeout?: number };
      };
      chatDebugLog('lead-chat', 'POST text failed', {
        status: err?.response?.status,
        api_error: err?.response?.data?.error || err?.response?.data?.message,
        message: err?.message,
        req: err?.config,
      });
      const msg = formatApiError(e);
      Alert.alert('Lỗi gửi chat', String(msg));
    } finally {
      setSending(false);
    }
  };

  const uploadAsset = async (uri: string, name: string, mime: string) => {
    setSending(true);
    try {
      chatDebugLog('lead-chat', 'POST /crm/leads/:id/chat/upload', { leadId, name, mime, uri });
      const fd = new FormData();
      const fileName =
        (name || '').trim() && (name || '').trim() !== '.'
          ? (name || '').trim()
          : `file_${Date.now()}.${(mime || '').includes('png') ? 'png' : (mime || '').includes('pdf') ? 'pdf' : 'bin'}`;
      fd.append('file', {
        uri,
        name: fileName,
        type: mime || 'application/octet-stream',
      } as unknown as Blob);
      if (draft.trim()) fd.append('content', draft.trim());
      await postMultipart(`/crm/leads/${leadId}/chat/upload`, fd, { timeoutMs: 120000 });
      setDraft('');
      await loadChat();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: unknown) {
      const err = e as {
        message?: string;
        response?: { status?: number; data?: { error?: string; message?: string } };
        config?: { method?: string; url?: string; baseURL?: string; timeout?: number };
      };
      chatDebugLog('lead-chat', 'POST upload failed', {
        status: err?.response?.status,
        api_error: err?.response?.data?.error || err?.response?.data?.message,
        message: err?.message,
        req: err?.config,
      });
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    // Bước 1: kiểm tra quyền hiện tại — nếu chưa từng hỏi → gọi `request…` để
    // hệ thống bật dialog. Nếu đã từ chối "Don't ask again" (`canAskAgain=false`)
    // → phải mở Settings vì dialog sẽ không bao giờ hiện lại nữa.
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = cur.status === 'granted';
    if (!granted) {
      if (cur.status === 'denied' && cur.canAskAgain === false) {
        alertPermissionGap(
          'Cần quyền Thư viện ảnh',
          'Bạn đã chặn quyền truy cập ảnh. Mở Cài đặt → Quyền → Ảnh và bật để gửi hình trong chat.',
        );
        return;
      }
      const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
      granted = next.status === 'granted';
      if (!granted) {
        // User vừa từ chối — nếu hệ thống cho ASK_AGAIN, lần sau bấm lại sẽ hiện dialog;
        // còn nếu khoá luôn thì đẩy thẳng Settings.
        if (next.status === 'denied' && next.canAskAgain === false) {
          alertPermissionGap(
            'Cần quyền Thư viện ảnh',
            'Bạn đã chặn quyền truy cập ảnh. Mở Cài đặt → Quyền → Ảnh và bật để gửi hình.',
          );
        } else {
          Alert.alert('Quyền', 'Cần quyền thư viện ảnh để gửi hình.');
        }
        return;
      }
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

  // ── Voice recording (ghi âm trực tiếp, không chọn file) ─────────────
  const startRecording = async () => {
    try {
      // Xin quyền micro nếu chưa có. expo-av tự đồng bộ với android.permission.RECORD_AUDIO.
      const cur = await Audio.getPermissionsAsync();
      let granted = cur.status === 'granted';
      if (!granted) {
        const next = await Audio.requestPermissionsAsync();
        granted = next.status === 'granted';
        if (!granted) {
          alertPermissionGap(
            'Cần quyền Micro',
            'Bật quyền Micro trong Cài đặt → Quyền để ghi âm trong chat.',
          );
          return;
        }
      }
      // Phải set audio mode trước khi tạo recording — iOS requirement.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recRef.current = recording;
      recUriRef.current = null;
      setRecState('recording');
      setRecDur(0);
      recTimer.current = setInterval(() => setRecDur((d) => d + 1), 1000);
    } catch (e: unknown) {
      chatDebugLog('lead-chat', 'startRecording failed', { message: (e as Error)?.message });
      Alert.alert('Lỗi', 'Không thể ghi âm. Hãy kiểm tra quyền micro.');
    }
  };

  const stopRecording = async () => {
    if (recTimer.current) {
      clearInterval(recTimer.current);
      recTimer.current = null;
    }
    try {
      const rec = recRef.current;
      if (!rec) {
        setRecState('idle');
        return;
      }
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (uri) {
        recUriRef.current = uri;
        setRecState('done');
      } else {
        setRecState('idle');
      }
    } catch {
      setRecState('idle');
    }
  };

  const cancelRecording = async () => {
    if (recTimer.current) {
      clearInterval(recTimer.current);
      recTimer.current = null;
    }
    try { await recRef.current?.stopAndUnloadAsync(); } catch { /* ignore */ }
    recRef.current = null;
    recUriRef.current = null;
    setRecState('idle');
    setRecDur(0);
  };

  const sendVoice = async () => {
    const uri = recUriRef.current;
    if (!uri) {
      setRecState('idle');
      return;
    }
    const fname = `voice_${Date.now()}.m4a`;
    // Reset trạng thái trước khi upload — UX không treo nếu mạng chậm.
    recUriRef.current = null;
    setRecState('idle');
    setRecDur(0);
    await uploadAsset(uri, fname, 'audio/m4a');
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

  // Android: app.json softwareKeyboardLayoutMode=resize — cửa sổ tự co, không thêm padding bàn phím thủ công.
  const composerPadBottom =
    Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 4);

  const Root = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const rootProps =
    Platform.OS === 'ios'
      ? ({
          behavior: 'padding' as const,
          keyboardVerticalOffset: 88,
        } as const)
      : {};

  return (
    <Root {...rootProps} style={styles.root}>
      <Modal visible={debugOpen} transparent animationType="fade" onRequestClose={() => setDebugOpen(false)}>
        <Pressable style={styles.debugBackdrop} onPress={() => setDebugOpen(false)}>
          <Pressable style={[styles.debugSheet, CrmShadow.card]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.debugHead}>
              <Text style={styles.debugTitle}>Log chat (debug)</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    chatDebugClear();
                    setDebugText('');
                  }}
                >
                  <Text style={styles.debugBtn}>Xóa</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDebugOpen(false)}>
                  <Text style={styles.debugBtn}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.debugBody}>
              <Text style={styles.debugMono}>{debugText || 'Chưa có log.'}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <TouchableOpacity style={styles.webBtn} onPress={() => openWebPath(`/crm/leads/${leadId}?tab=chat`)}>
            <Text style={styles.webBtnTxt}>Web đầy đủ (reply, reaction)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugBtnPill} onPress={() => setDebugOpen(true)} activeOpacity={0.85}>
            <Text style={styles.debugBtnPillTxt}>Log</Text>
          </TouchableOpacity>
        </View>
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
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (isAtBottom.current) {
                  listRef.current?.scrollToEnd({ animated: false });
                }
              }}
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
      {recState === 'idle' ? (
        <View style={styles.attachRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => void pickImage()} disabled={sending}>
            <Text style={styles.iconBtnTxt}>🖼</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => void pickDoc()} disabled={sending}>
            <Text style={styles.iconBtnTxt}>📎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.iconBtnMic]}
            onPress={() => void startRecording()}
            disabled={sending}
          >
            <Text style={styles.iconBtnTxt}>🎙</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Recording UI: thanh đỏ khi đang ghi / thanh xanh khi đã ghi xong */}
      {recState === 'recording' ? (
        <View style={styles.recBar}>
          <View style={styles.recDot} />
          <Text style={styles.recDurTxt}>Đang ghi âm…  {fmtSecs(recDur)}</Text>
          <TouchableOpacity style={styles.recCancel} onPress={() => void cancelRecording()}>
            <Text style={styles.recCancelTxt}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.recStop} onPress={() => void stopRecording()}>
            <Text style={styles.recStopTxt}>⏹ Dừng</Text>
          </TouchableOpacity>
        </View>
      ) : recState === 'done' ? (
        <View style={[styles.recBar, styles.recBarDone]}>
          <Text style={[styles.recDurTxt, styles.recDurTxtDone]}>🎵 Đã ghi {fmtSecs(recDur)} giây</Text>
          <TouchableOpacity style={styles.recCancel} onPress={() => void cancelRecording()}>
            <Text style={styles.recCancelTxt}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.recStop, styles.recStopSend]} onPress={() => void sendVoice()}>
            <Text style={styles.recStopTxt}>Gửi ▲</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {recState === 'idle' ? (
        <View style={[styles.inputRow, { paddingBottom: composerPadBottom }]}>
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
      ) : null}
    </Root>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, minHeight: 320 },
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
  debugBtnPill: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray900,
  },
  debugBtnPillTxt: { fontSize: 12, fontWeight: '800', color: CrmColors.white },
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
  iconBtnMic: { backgroundColor: '#E8F8F4', borderColor: '#2EC4B6' },

  // Voice recording bar (đỏ khi đang ghi, xanh khi đã ghi xong).
  recBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF5F5',
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: '#FFD0D0',
    gap: 8,
    marginBottom: 8,
  },
  recBarDone: { backgroundColor: '#F2FBF7', borderColor: '#A6E5CE' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recDurTxt: { flex: 1, fontSize: 14, color: '#FF3B30', fontWeight: '700' },
  recDurTxtDone: { color: '#19A974' },
  recCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: CrmColors.gray200,
  },
  recCancelTxt: { fontSize: 13, color: CrmColors.gray700, fontWeight: '700' },
  recStop: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  recStopSend: { backgroundColor: CrmColors.blue600 },
  recStopTxt: { fontSize: 13, color: '#fff', fontWeight: '800' },

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

  debugBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 18 },
  debugSheet: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  debugHead: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debugTitle: { fontSize: 14, fontWeight: '900', color: CrmColors.gray900 },
  debugBtn: { fontSize: 12, fontWeight: '800', color: CrmColors.blue700 },
  debugBody: { paddingHorizontal: 12, paddingVertical: 10 },
  debugMono: {
    fontSize: 11,
    color: CrmColors.gray800,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
