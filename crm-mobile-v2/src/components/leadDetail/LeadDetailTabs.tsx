import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatApiError } from '../../api/client';
import {
  fetchFacebookLeadMessages,
  fetchLeadMembers,
  sendFacebookReply,
  sendZaloReply,
  fetchZaloLeadMessages,
  type FacebookMessage,
  type LeadMember,
  type ZaloMessage,
} from '../../api/leadDetail';
import Avatar from '../Avatar';
import { resolveMediaUrl } from '../../lib/media';
import { colorFromName, initialsFromName } from '../../lib/media';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';

export { default as LeadTasksTab } from './LeadTasksTab';
export { default as LeadDriveTab } from './LeadDriveTab';
export { default as LeadDocumentsTab } from './LeadDocumentsTab';
export { default as LeadCommentsTab } from './LeadCommentsTab';

export type LeadDetailTabKey =
  | 'tasks'
  | 'documents'
  | 'drive'
  | 'comments'
  | 'members'
  | 'facebook'
  | 'zalo';

const ROLE_LABELS: Record<string, string> = {
  member: 'Tham gia',
  supervisor: 'Giám sát',
  responsible: 'Chịu trách nhiệm',
  viewer: 'Xem',
  owner: 'Phụ trách',
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function EmptyState({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={Colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryTxt}>Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Members ──────────────────────────────────────────────────────────────────

export function LeadMembersTab({ leadId }: { leadId: string }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [items, setItems] = useState<LeadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchLeadMembers(leadId));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !items.length) {
    return <ActivityIndicator color={Colors.blue} style={{ marginTop: 32 }} />;
  }
  if (error && !items.length) return <ErrorBanner message={error} onRetry={() => void load()} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(m, i) => m.user_id || m.id || String(i)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={Colors.blue} />}
      contentContainerStyle={items.length ? styles.listPad : styles.listPadGrow}
      ListEmptyComponent={<EmptyState icon="people-outline" title="Chưa có thành viên" hint="Thành viên nhóm trao đổi lead/deal." />}
      renderItem={({ item }) => {
        const name = item.user?.full_name || 'Thành viên';
        const roleLabel = ROLE_LABELS[String(item.role || '')] || item.role || '';
        return (
          <View style={styles.memberRow}>
            <Avatar
              name={name}
              initials={initialsFromName(name)}
              size={42}
              color={colorFromName(name)}
              avatarUrl={item.user?.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{name}</Text>
              {item.user?.email ? <Text style={styles.metaTxt}>{item.user.email}</Text> : null}
              {roleLabel ? (
                <View style={[styles.badge, { backgroundColor: Colors.blueSoft, marginTop: 4 }]}>
                  <Text style={[styles.badgeTxt, { color: Colors.blue }]}>{roleLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

// ── Facebook / Zalo inbox ────────────────────────────────────────────────────

function InboxBubble({
  text,
  time,
  outbound,
  attachmentUrl,
  messageType,
}: {
  text?: string | null;
  time?: string | null;
  outbound?: boolean;
  attachmentUrl?: string | null;
  messageType?: string | null;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const imgUrl = messageType === 'image' ? resolveMediaUrl(attachmentUrl) : null;

  return (
    <View style={[styles.bubbleWrap, outbound ? styles.bubbleWrapOut : styles.bubbleWrapIn]}>
      <View style={[styles.bubble, outbound ? styles.bubbleOut : styles.bubbleIn]}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={styles.bubbleImg} resizeMode="cover" />
        ) : null}
        {text ? <Text style={[styles.bubbleTxt, outbound && styles.bubbleTxtOut]}>{text}</Text> : null}
        {!text && !imgUrl && attachmentUrl ? (
          <Text style={styles.bubbleTxt}>[Đính kèm]</Text>
        ) : null}
        {time ? <Text style={[styles.bubbleTime, outbound && styles.bubbleTimeOut]}>{time}</Text> : null}
      </View>
    </View>
  );
}

function useInboxMessages<T extends { id: string; created_at?: string | null }>(
  loadFn: () => Promise<T[]>,
  dedupeKey: (m: T) => string,
) {
  const [messages, setMessages] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const list = await loadFn();
      const seen = new Set<string>();
      setMessages(
        list.filter((m) => {
          const k = dedupeKey(m);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadFn, dedupeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { messages, loading, refreshing, error, load, setMessages, setError };
}

export function LeadFacebookTab({ leadId, companyId }: { leadId: string; companyId?: string | null }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const loadFn = useCallback(() => fetchFacebookLeadMessages(leadId), [leadId]);
  const dedupe = useCallback((m: FacebookMessage) => m.id || String(m.created_at), []);
  const { messages, loading, refreshing, error, load, setMessages, setError } = useInboxMessages(loadFn, dedupe);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const contact = messages.find((m) => m.contact)?.contact || null;
  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  };

  const send = async () => {
    const text = reply.trim();
    if (!text || !contact?.id || sending) return;
    setSending(true);
    try {
      const msg = await sendFacebookReply(contact.id, text, companyId);
      setMessages((prev) => [...prev, { ...msg, contact }]);
      setReply('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  if (loading && !messages.length) {
    return <ActivityIndicator color={Colors.blue} style={{ marginTop: 32 }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {contact ? (
        <View style={styles.inboxHeader}>
          {contact.fb_profile_pic ? (
            <Image source={{ uri: contact.fb_profile_pic }} style={styles.inboxAvatar} />
          ) : (
            <Avatar name={contact.fb_name || 'FB'} initials="F" size={36} color={Colors.blue} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.inboxName}>{contact.fb_name || 'Messenger'}</Text>
            {contact.phone ? <Text style={styles.metaTxt}>📞 {contact.phone}</Text> : null}
          </View>
        </View>
      ) : null}
      {error && !messages.length ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {!messages.length && !contact ? (
        <EmptyState icon="logo-facebook" title="Chưa có tin Facebook" hint="Khi khách nhắn Messenger và gán lead, tin sẽ hiện ở đây." />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => m.id || String(i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />}
          contentContainerStyle={styles.chatPad}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <InboxBubble
              text={item.content}
              time={formatTime(item.created_at)}
              outbound={item.direction === 'outbound'}
              attachmentUrl={item.attachment_url}
              messageType={item.message_type}
            />
          )}
        />
      )}
      {contact ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="Trả lời Messenger…"
            placeholderTextColor={Colors.textFaint}
            value={reply}
            onChangeText={setReply}
            multiline
          />
          <Pressable style={[styles.sendBtn, (!reply.trim() || sending) && styles.sendBtnDisabled]} onPress={() => void send()} disabled={!reply.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="send" size={18} color={Colors.white} />}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function LeadZaloTab({ leadId }: { leadId: string }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const loadFn = useCallback(() => fetchZaloLeadMessages(leadId), [leadId]);
  const dedupe = useCallback((m: ZaloMessage) => m.id || String(m.created_at), []);
  const { messages, loading, refreshing, error, load, setMessages, setError } = useInboxMessages(loadFn, dedupe);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const contact = messages.find((m) => m.contact)?.contact || null;
  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  };

  const send = async () => {
    const text = reply.trim();
    if (!text || !contact?.id || sending) return;
    setSending(true);
    try {
      const d = await sendZaloReply(contact.id, text);
      if (d.message) {
        setMessages((prev) => [...prev, { ...d.message, contact } as ZaloMessage]);
      }
      setReply('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  if (loading && !messages.length) {
    return <ActivityIndicator color={Colors.blue} style={{ marginTop: 32 }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {contact ? (
        <View style={styles.inboxHeader}>
          {contact.avatar_url ? (
            <Image source={{ uri: contact.avatar_url }} style={styles.inboxAvatar} />
          ) : (
            <Avatar name={contact.display_name || 'Zalo'} initials="Z" size={36} color={Colors.cyan} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.inboxName}>{contact.display_name || contact.user_id || 'Khách Zalo'}</Text>
            {contact.phone ? <Text style={styles.metaTxt}>📞 {contact.phone}</Text> : null}
          </View>
        </View>
      ) : null}
      {error && !messages.length ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {!messages.length && !contact ? (
        <EmptyState icon="chatbubble-ellipses-outline" title="Chưa có tin Zalo OA" hint="Khi khách nhắn OA và gán lead, tin sẽ hiện ở đây." />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => m.id || String(i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />}
          contentContainerStyle={styles.chatPad}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <InboxBubble
              text={item.content}
              time={formatTime(item.created_at)}
              outbound={item.direction === 'outbound'}
              attachmentUrl={item.attachment_url}
              messageType={item.message_type}
            />
          )}
        />
      )}
      {contact ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="Trả lời Zalo OA…"
            placeholderTextColor={Colors.textFaint}
            value={reply}
            onChangeText={setReply}
            multiline
          />
          <Pressable style={[styles.sendBtn, (!reply.trim() || sending) && styles.sendBtnDisabled]} onPress={() => void send()} disabled={!reply.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="send" size={18} color={Colors.white} />}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    listPad: { padding: Spacing.md, paddingBottom: Spacing.xl },
    listPadGrow: { flexGrow: 1, padding: Spacing.md },
    chatPad: { padding: Spacing.md, paddingBottom: Spacing.sm },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: C.borderSoft,
      padding: 12,
      marginBottom: 10,
    },
    cardTitle: { fontSize: 15, fontWeight: '600', color: C.text },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.sm,
      marginTop: 6,
    },
    badgeTxt: { fontSize: 11, fontWeight: '600' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    metaTxt: { fontSize: 12, color: C.textMuted },
    metaFaint: { fontSize: 11, color: C.textFaint, marginTop: 2 },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: C.textMuted },
    emptyHint: { fontSize: 12, color: C.textFaint, textAlign: 'center', paddingHorizontal: 24 },
    errorBox: {
      backgroundColor: C.redSoft,
      borderRadius: Radii.md,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.red + '44',
    },
    errorText: { color: C.red, fontSize: 13 },
    retryBtn: { marginTop: 8, alignSelf: 'flex-start' },
    retryTxt: { color: C.blue, fontWeight: '600', fontSize: 13 },
    crumbRow: { marginBottom: 8, maxHeight: 36 },
    crumbChip: { flexDirection: 'row', alignItems: 'center' },
    crumbTxt: { color: C.blue, fontSize: 13, maxWidth: 120 },
    crumbSep: { color: C.textFaint },
    commentRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    commentBody: { flex: 1, backgroundColor: C.card, borderRadius: Radii.md, padding: 10, borderWidth: 1, borderColor: C.borderSoft },
    commentAuthor: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
    commentText: { fontSize: 14, color: C.text, lineHeight: 20 },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: Radii.md,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: Spacing.sm,
      paddingBottom: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: C.borderSoft,
      backgroundColor: C.bgElevated,
    },
    composerInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      backgroundColor: C.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.borderSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: C.text,
      fontSize: 14,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.45 },
    inboxHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.borderSoft,
    },
    inboxAvatar: { width: 36, height: 36, borderRadius: 18 },
    inboxName: { fontSize: 15, fontWeight: '700', color: C.text },
    bubbleWrap: { marginBottom: 8, flexDirection: 'row' },
    bubbleWrapIn: { justifyContent: 'flex-start' },
    bubbleWrapOut: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '78%', borderRadius: Radii.lg, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleIn: { backgroundColor: C.card, borderBottomLeftRadius: 4 },
    bubbleOut: { backgroundColor: C.blue, borderBottomRightRadius: 4 },
    bubbleTxt: { fontSize: 14, color: C.text, lineHeight: 20 },
    bubbleTxtOut: { color: C.white },
    bubbleTime: { fontSize: 10, color: C.textFaint, marginTop: 4 },
    bubbleTimeOut: { color: 'rgba(255,255,255,0.75)' },
    bubbleImg: { width: 200, height: 140, borderRadius: Radii.md, marginBottom: 4 },
  });
}
