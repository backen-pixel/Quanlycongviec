import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import { fetchMessages, sendMessage } from '../api/messenger';
import { currentUserId, useAuth } from '../context/AuthContext';
import { Colors, Radii } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { ChatMessage } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

function Bubble({ m }: { m: ChatMessage }) {
  return (
    <View style={[styles.bubbleRow, { justifyContent: m.mine ? 'flex-end' : 'flex-start' }]}>
      <View style={{ maxWidth: '82%' }}>
        <View
          style={[
            styles.bubble,
            m.mine
              ? { backgroundColor: Colors.blue, borderBottomRightRadius: 5 }
              : { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 5 },
          ]}
        >
          <Text style={[styles.bubbleTxt, { color: m.mine ? '#fff' : Colors.text }]}>{m.text}</Text>
        </View>
        <View style={[styles.meta, { alignSelf: m.mine ? 'flex-end' : 'flex-start' }]}>
          <Text style={styles.metaTime}>{m.time}</Text>
          {m.mine && m.read ? <Ionicons name="checkmark-done" size={14} color={Colors.cyan} /> : null}
        </View>
      </View>
    </View>
  );
}

export default function ChatDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { threadId, title, color } = route.params;
  const { user } = useAuth();
  const myId = currentUserId(user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await fetchMessages(threadId, myId));
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [threadId, myId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    const optimistic: ChatMessage = {
      id: `tmp${Date.now()}`,
      text,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      mine: true,
      read: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const saved = await sendMessage(threadId, text);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <Avatar name={title} size={40} color={color} online />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerName} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerStatus}>Đang hoạt động</Text>
        </View>
        <Pressable style={styles.headerIcon}>
          <Ionicons name="call" size={20} color={Colors.blue} />
        </Pressable>
        <Pressable style={styles.headerIcon}>
          <Ionicons name="videocam" size={20} color={Colors.blue} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.blue} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
          renderItem={({ item }) => <Bubble m={item} />}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.emptyChat}>Chưa có tin nhắn</Text>}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.composerIcon}>
            <Ionicons name="add-circle" size={26} color={Colors.blue} />
          </Pressable>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Nhắn tin..."
              placeholderTextColor={Colors.textFaint}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable style={styles.composerIcon}>
              <Ionicons name="happy-outline" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>
          <Pressable style={styles.sendBtn} onPress={() => void send()}>
            <Ionicons name={draft.trim() ? 'send' : 'mic'} size={19} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerName: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  headerStatus: { color: Colors.green, fontSize: 12, marginTop: 1 },
  headerIcon: { padding: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleTxt: { fontSize: 15, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaTime: { color: Colors.textFaint, fontSize: 11 },
  emptyChat: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 30 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  composerIcon: { padding: 4 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  input: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 9, maxHeight: 110 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
