import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import MessengerAvatar from '../components/messenger/MessengerAvatar';
import TapHighlight from '../components/TapHighlight';
import Toast, { type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  buildBulkForwardMessageContent,
  forwardTargetKey,
  type ForwardTarget,
} from '../lib/messengerForward';
import { fetchMessengerGroups } from '../lib/messengerApi';
import { buildMessengerMessagePreview } from '../lib/messengerPreview';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Radii, Spacing } from '../theme';
import type { MessengerMessage, MessengerThread } from '../types/messenger';

type Props = NativeStackScreenProps<RootStackParamList, 'MessengerForward'>;
type Panel = 'chats' | 'staff';

type PickerUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export default function MessengerForwardScreen({ navigation, route }: Props) {
  const { excludeGroupId, sourceTitle, messagesJson } = route.params;
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();

  const messages = useMemo(() => {
    try {
      const parsed = JSON.parse(messagesJson) as MessengerMessage[];
      return Array.isArray(parsed) ? parsed.filter((m) => m?.id) : [];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const previewLines = useMemo(
    () =>
      messages.map((m) => {
        const who = m.user?.full_name || 'Ai đó';
        const body = buildMessengerMessagePreview(m) || '—';
        return `${who}: ${body}`;
      }),
    [messages],
  );

  const [panel, setPanel] = useState<Panel>('chats');
  const [groups, setGroups] = useState<MessengerThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, ForwardTarget>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [staffHits, setStaffHits] = useState<PickerUser[]>([]);
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMessengerGroups(myId);
      setGroups(list.filter((g) => String(g.id) !== String(excludeGroupId)));
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Không tải được danh sách', kind: 'error' });
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [excludeGroupId, myId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = q.trim();
    if (panel !== 'staff' || term.length < 2) {
      setStaffHits([]);
      setSearchingStaff(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingStaff(true);
      try {
        const { data } = await api.get<{ users?: PickerUser[] }>('/users', {
          params: { search: term },
        });
        const list = Array.isArray(data?.users) ? data.users : [];
        setStaffHits(list.filter((u) => String(u.id) !== myId).slice(0, 14));
      } catch {
        setStaffHits([]);
      } finally {
        setSearchingStaff(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, panel, myId]);

  const filteredGroups = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(term) || g.preview.toLowerCase().includes(term),
    );
  }, [groups, q]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggleGroup = (g: MessengerThread) => {
    const target: ForwardTarget = { type: 'group', id: g.id, name: g.name };
    const key = forwardTargetKey(target);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = target;
      return next;
    });
  };

  const toggleUser = (u: PickerUser) => {
    const target: ForwardTarget = {
      type: 'user',
      id: String(u.id),
      name: u.full_name || u.email || undefined,
    };
    const key = forwardTargetKey(target);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = target;
      return next;
    });
  };

  const send = async () => {
    if (!selectedList.length) {
      Alert.alert('Chia sẻ', 'Chọn ít nhất một hội thoại hoặc thành viên.');
      return;
    }
    const body = buildBulkForwardMessageContent(messages, { sourceTitle, note });
    if (!body.trim()) {
      Alert.alert('Chia sẻ', 'Không có nội dung để gửi.');
      return;
    }
    setSending(true);
    let ok = 0;
    for (const target of selectedList) {
      try {
        let gid = target.type === 'group' ? target.id : null;
        if (target.type === 'user') {
          const { data } = await api.post<{ id?: string }>('/messenger/direct', {
            peer_user_id: target.id,
          });
          gid = data?.id ? String(data.id) : null;
        }
        if (!gid) continue;
        await api.post(`/messenger/groups/${gid}/chat`, { content: body });
        ok += 1;
      } catch {
        /* continue */
      }
    }
    setSending(false);
    if (ok > 0) {
      Alert.alert('Đã gửi', `Đã chia sẻ tới ${ok} hội thoại.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Lỗi', 'Không gửi được tin chia sẻ.');
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
          gap: 10,
        },
        backBtn: {
          width: 38,
          height: 38,
          borderRadius: Radii.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
        previewCard: {
          margin: Spacing.md,
          marginBottom: 8,
          padding: 12,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
        previewTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
        previewScroll: { maxHeight: 88 },
        previewLine: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 4 },
        hint: { color: colors.textFaint, fontSize: 11, marginTop: 8 },
        noteWrap: {
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          padding: 12,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        noteLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
        noteInput: { color: colors.text, fontSize: 15, minHeight: 44, textAlignVertical: 'top' },
        panelRow: {
          flexDirection: 'row',
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          gap: 8,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          padding: 4,
          borderWidth: 1,
          borderColor: colors.border,
        },
        panelBtn: { flex: 1, paddingVertical: 8, borderRadius: Radii.md, alignItems: 'center' },
        panelBtnOn: { backgroundColor: mc.accentSoft },
        panelTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
        panelTxtOn: { color: mc.accent },
        search: {
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: mc.inputBg,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          fontSize: 15,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowOn: { backgroundColor: mc.accentSoft },
        rowBody: { flex: 1, minWidth: 0 },
        rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
        rowTitleOn: { color: mc.accent },
        rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        empty: { textAlign: 'center', color: colors.textFaint, marginTop: 32, paddingHorizontal: 24 },
        footer: {
          flexDirection: 'row',
          gap: 10,
          padding: Spacing.md,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: colors.bgElevated,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        cancelBtn: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
          alignItems: 'center',
        },
        cancelTxt: { fontWeight: '700', color: colors.text },
        sendBtn: {
          flex: 2,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          backgroundColor: mc.accent,
          alignItems: 'center',
        },
        sendBtnOff: { opacity: 0.5 },
        sendTxt: { fontWeight: '800', color: '#FFF' },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      }),
    [colors, isDark, mc, insets],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Chia sẻ tin nhắn</Text>
      </View>

      <View style={styles.previewCard}>
        <View style={styles.previewHead}>
          <Ionicons name="arrow-redo" size={18} color={mc.accent} />
          <Text style={styles.previewTitle}>
            {messages.length > 1 ? `Chia sẻ ${messages.length} tin` : 'Chia sẻ tin nhắn'}
          </Text>
        </View>
        <ScrollView style={styles.previewScroll} nestedScrollEnabled>
          {previewLines.length ? (
            previewLines.map((line, i) => (
              <Text key={`${i}-${line.slice(0, 12)}`} style={styles.previewLine} numberOfLines={2}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={styles.previewLine} numberOfLines={3}>—</Text>
          )}
        </ScrollView>
        <Text style={styles.hint}>Từ {sourceTitle || 'chat'}</Text>
      </View>

      <View style={styles.noteWrap}>
        <Text style={styles.noteLabel}>Ghi chú (tuỳ chọn)</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Thêm lời nhắn khi chia sẻ…"
          placeholderTextColor={colors.textFaint}
          multiline
        />
      </View>

      <View style={styles.panelRow}>
        <TapHighlight
          style={[styles.panelBtn, panel === 'chats' && styles.panelBtnOn]}
          onPress={() => setPanel('chats')}
        >
          <Text style={[styles.panelTxt, panel === 'chats' && styles.panelTxtOn]}>Hội thoại</Text>
        </TapHighlight>
        <TapHighlight
          style={[styles.panelBtn, panel === 'staff' && styles.panelBtnOn]}
          onPress={() => setPanel('staff')}
        >
          <Text style={[styles.panelTxt, panel === 'staff' && styles.panelTxtOn]}>Thành viên</Text>
        </TapHighlight>
      </View>

      <TextInput
        style={styles.search}
        value={q}
        onChangeText={setQ}
        placeholder={panel === 'staff' ? 'Tìm thành viên (≥2 ký tự)…' : 'Tìm hội thoại…'}
        placeholderTextColor={colors.textFaint}
      />

      {loading && panel === 'chats' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={mc.accent} />
        </View>
      ) : panel === 'chats' ? (
        <FlatList
          data={filteredGroups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const key = forwardTargetKey({ type: 'group', id: item.id });
            const on = !!selected[key];
            const color = avatarColorFromName(item.name);
            return (
              <TapHighlight style={[styles.row, on && styles.rowOn]} onPress={() => toggleGroup(item)}>
                <MessengerAvatar
                  name={item.name}
                  size={44}
                  color={item.avatarColor || color}
                  avatarUrl={item.avatarUrl}
                  online={item.online}
                />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, on && styles.rowTitleOn]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.preview || (item.isDirect ? 'Chat trực tiếp' : 'Nhóm chat')}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? mc.accent : colors.textFaint}
                />
              </TapHighlight>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Không có hội thoại khác để chia sẻ.</Text>
          }
        />
      ) : searchingStaff ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={mc.accent} />
        </View>
      ) : (
        <FlatList
          data={staffHits}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const key = forwardTargetKey({ type: 'user', id: String(item.id) });
            const on = !!selected[key];
            const label = item.full_name || item.email || String(item.id);
            return (
              <TapHighlight style={[styles.row, on && styles.rowOn]} onPress={() => toggleUser(item)}>
                <MessengerAvatar
                  name={label}
                  size={44}
                  color={avatarColorFromName(label)}
                  avatarUrl={item.avatar}
                />
                <Text style={[styles.rowTitle, on && styles.rowTitleOn, { flex: 1 }]} numberOfLines={1}>
                  {label}
                </Text>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? mc.accent : colors.textFaint}
                />
              </TapHighlight>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {q.trim().length < 2
                ? 'Nhập ít nhất 2 ký tự để tìm thành viên.'
                : 'Không tìm thấy thành viên.'}
            </Text>
          }
        />
      )}

      <View style={styles.footer}>
        <TapHighlight style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={styles.cancelTxt}>Huỷ</Text>
        </TapHighlight>
        <TapHighlight
          style={[styles.sendBtn, (!selectedList.length || sending) && styles.sendBtnOff]}
          onPress={() => void send()}
          disabled={!selectedList.length || sending}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.sendTxt}>Gửi ({selectedList.length})</Text>
          )}
        </TapHighlight>
      </View>

      <Toast state={toast} />
    </View>
  );
}
