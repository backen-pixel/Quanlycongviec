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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'FacebookChat'>;

type Msg = {
  id: string;
  direction?: string | null;
  content?: string | null;
  created_at?: string | null;
  message_type?: string | null;
};

export default function FacebookChatScreen({ route, navigation }: Props) {
  const { contactId } = route.params;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
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
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => {
            const out = m.direction === 'outbound';
            return (
              <View style={[styles.bubbleWrap, out && styles.bubbleWrapOut]}>
                <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
                  <Text style={[styles.bubbleTxt, out && styles.bubbleTxtOut]}>{m.content || '—'}</Text>
                  <Text style={[styles.time, out && styles.timeOut]}>
                    {m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={[styles.composer, CrmShadow.card]}>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  msgList: { padding: 12, paddingBottom: 8 },
  bubbleWrap: { alignItems: 'flex-start', marginBottom: 8 },
  bubbleWrapOut: { alignItems: 'flex-end' },
  bubble: { maxWidth: '86%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: CrmRadii.lg },
  bubbleIn: { backgroundColor: CrmColors.white, borderWidth: 1, borderColor: CrmColors.gray200 },
  bubbleOut: { backgroundColor: CrmColors.blue600 },
  bubbleTxt: { fontSize: 14, color: CrmColors.gray900 },
  bubbleTxtOut: { color: '#fff' },
  time: { fontSize: 10, color: CrmColors.gray400, marginTop: 4 },
  timeOut: { color: 'rgba(255,255,255,0.85)' },
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
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  sendBtnOff: { opacity: 0.45 },
  sendBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
