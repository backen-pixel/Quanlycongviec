import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupListItem, MessengerMessage } from '../types/messenger';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { buildBulkForwardMessageContent } from '../lib/messengerMessageActions';
import { formatMessagePreview } from '../lib/messengerPreview';
import { getMessengerGroupsCache, setMessengerGroupsCache } from '../lib/messengerGroupsCache';

type Route = RouteProp<MoreStackParamList, 'MessengerForward'>;
type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerForward'>;
type Panel = 'chats' | 'staff';

type PickerUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

type ForwardTarget =
  | { type: 'group'; id: string; name?: string }
  | { type: 'user'; id: string; name?: string };

function targetKey(t: ForwardTarget): string {
  return t.type === 'group' ? `g:${t.id}` : `u:${t.id}`;
}

export default function MessengerForwardScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const { excludeGroupId, sourceTitle, messagesJson } = route.params;

  const messages = useMemo(() => {
    try {
      const parsed = JSON.parse(messagesJson) as MessengerMessage[];
      return Array.isArray(parsed) ? parsed.filter((m) => m?.id) : [];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const previewText = useMemo(
    () => buildBulkForwardMessageContent(messages, { sourceTitle }),
    [messages, sourceTitle],
  );

  const previewLines = useMemo(
    () =>
      messages.map((m) => {
        const who = m.user?.full_name || 'Ai đó';
        const body = formatMessagePreview(m) || '—';
        return `${who}: ${body}`;
      }),
    [messages],
  );

  const [panel, setPanel] = useState<Panel>('chats');
  const cached = getMessengerGroupsCache();
  const [groups, setGroups] = useState<MessengerGroupListItem[]>(() => {
    if (!cached) return [];
    return cached.filter((g) => String(g.id) !== String(excludeGroupId));
  });
  const [loading, setLoading] = useState(!groups.length);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, ForwardTarget>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [staffHits, setStaffHits] = useState<PickerUser[]>([]);
  const [searchingStaff, setSearchingStaff] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!groups.length) setLoading(true);
    try {
      const { data } = await api.get<MessengerGroupListItem[]>('/messenger/groups');
      const list = Array.isArray(data) ? data : [];
      setMessengerGroupsCache(list);
      setGroups(list.filter((g) => String(g.id) !== String(excludeGroupId)));
    } catch {
      if (!groups.length) setGroups([]);
    }
    setLoading(false);
  }, [excludeGroupId, groups.length]);

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
      }
      setSearchingStaff(false);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, panel, myId]);

  const filteredGroups = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => (g.name || '').toLowerCase().includes(term));
  }, [groups, q]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggleGroup = (g: MessengerGroupListItem) => {
    const target: ForwardTarget = {
      type: 'group',
      id: String(g.id),
      name: g.name || undefined,
    };
    const key = targetKey(target);
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
    const key = targetKey(target);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = target;
      return next;
    });
  };

  const send = async () => {
    if (!selectedList.length) {
      Alert.alert('Chuyển tiếp', 'Chọn ít nhất một hội thoại hoặc nhân viên.');
      return;
    }
    const body = buildBulkForwardMessageContent(messages, { sourceTitle, note });
    if (!body.trim()) {
      Alert.alert('Chuyển tiếp', 'Không có nội dung để gửi.');
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
      Alert.alert('Đã gửi', `Đã chuyển tiếp tới ${ok} hội thoại.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Lỗi', 'Không gửi được tin chuyển tiếp.');
    }
  };

  return (
    <View style={s.root}>
      {/* Preview — hiển thị ngay từ messagesJson, không chờ API */}
      <View style={s.previewCard}>
        <View style={s.previewHead}>
          <Ionicons name="arrow-redo" size={18} color={CrmColors.blue600} />
          <Text style={s.previewTitle}>
            {messages.length > 1 ? `Chia sẻ ${messages.length} tin` : 'Chia sẻ tin nhắn'}
          </Text>
        </View>
        <ScrollView style={s.previewScroll} nestedScrollEnabled>
          {previewLines.length ? (
            previewLines.map((line, i) => (
              <Text key={`${i}-${line.slice(0, 12)}`} style={s.previewLine} numberOfLines={2}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={s.previewLine} numberOfLines={3}>
              {previewText || '—'}
            </Text>
          )}
        </ScrollView>
        <Text style={s.hint}>Từ {sourceTitle || 'chat'}</Text>
      </View>

      <View style={s.noteWrap}>
        <Text style={s.noteLabel}>Ghi chú (tuỳ chọn)</Text>
        <TextInput
          style={s.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Thêm lời nhắn khi chuyển tiếp…"
          placeholderTextColor={CrmColors.gray400}
          multiline
        />
      </View>

      <View style={s.panelRow}>
        <TouchableOpacity
          style={[s.panelBtn, panel === 'chats' && s.panelBtnOn]}
          onPress={() => setPanel('chats')}
        >
          <Text style={[s.panelTxt, panel === 'chats' && s.panelTxtOn]}>Hội thoại</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.panelBtn, panel === 'staff' && s.panelBtnOn]}
          onPress={() => setPanel('staff')}
        >
          <Text style={[s.panelTxt, panel === 'staff' && s.panelTxtOn]}>Nhân viên</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={s.search}
        value={q}
        onChangeText={setQ}
        placeholder={panel === 'staff' ? 'Tìm nhân viên (≥2 ký tự)…' : 'Tìm nhóm hoặc chat…'}
        placeholderTextColor={CrmColors.gray400}
      />

      {loading && panel === 'chats' && !groups.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={CrmColors.blue600} />
      ) : panel === 'chats' ? (
        <FlatList
          data={filteredGroups}
          keyExtractor={(g) => String(g.id)}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const key = targetKey({ type: 'group', id: String(item.id) });
            const on = !!selected[key];
            const sub = item.last_message
              ? formatMessagePreview(item.last_message)
              : item.is_direct
                ? 'Chat trực tiếp'
                : 'Nhóm chat';
            return (
              <TouchableOpacity style={[s.row, on && s.rowOn]} onPress={() => toggleGroup(item)}>
                <Ionicons
                  name={item.is_direct ? 'person' : 'people'}
                  size={20}
                  color={on ? CrmColors.blue600 : CrmColors.gray500}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.rowTitle, on && s.rowTitleOn]} numberOfLines={1}>
                    {item.name || (item.is_direct ? 'Chat trực tiếp' : 'Nhóm')}
                  </Text>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {sub}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? CrmColors.blue600 : CrmColors.gray400}
                />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={s.empty}>Không có hội thoại khác để chuyển tiếp.</Text>
          }
        />
      ) : searchingStaff ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={CrmColors.blue600} />
      ) : (
        <FlatList
          data={staffHits}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const key = targetKey({ type: 'user', id: String(item.id) });
            const on = !!selected[key];
            const label = item.full_name || item.email || String(item.id);
            return (
              <TouchableOpacity style={[s.row, on && s.rowOn]} onPress={() => toggleUser(item)}>
                <Ionicons name="person-circle-outline" size={22} color={on ? CrmColors.blue600 : CrmColors.gray500} />
                <Text style={[s.rowTitle, on && s.rowTitleOn]} numberOfLines={1}>
                  {label}
                </Text>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? CrmColors.blue600 : CrmColors.gray400}
                />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={s.empty}>
              {q.trim().length < 2
                ? 'Nhập ít nhất 2 ký tự để tìm nhân viên.'
                : 'Không tìm thấy nhân viên.'}
            </Text>
          }
        />
      )}

      <View style={s.footer}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={s.cancelTxt}>Huỷ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sendBtn, (!selectedList.length || sending) && s.sendBtnOff]}
          onPress={() => void send()}
          disabled={!selectedList.length || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.sendTxt}>Gửi ({selectedList.length})</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CrmColors.pageBg },
  previewCard: {
    margin: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  previewTitle: { fontSize: 14, fontWeight: '800', color: CrmColors.gray900 },
  previewScroll: { maxHeight: 88 },
  previewLine: { fontSize: 13, color: CrmColors.gray700, lineHeight: 20, marginBottom: 4 },
  noteWrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  noteLabel: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6 },
  noteInput: { fontSize: 15, color: CrmColors.gray900, minHeight: 44, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: CrmColors.gray500, marginTop: 8 },
  panelRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  panelBtn: { flex: 1, paddingVertical: 8, borderRadius: CrmRadii.md, alignItems: 'center' },
  panelBtnOn: { backgroundColor: '#EFF6FF' },
  panelTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray600 },
  panelTxtOn: { color: CrmColors.blue700 },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CrmColors.gray200,
  },
  rowOn: { backgroundColor: '#EFF6FF' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: CrmColors.gray800 },
  rowTitleOn: { color: CrmColors.blue700 },
  rowSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  empty: { textAlign: 'center', color: CrmColors.gray500, marginTop: 32, paddingHorizontal: 24 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray200,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    backgroundColor: CrmColors.gray100,
    alignItems: 'center',
  },
  cancelTxt: { fontWeight: '700', color: CrmColors.gray700 },
  sendBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
  },
  sendBtnOff: { opacity: 0.5 },
  sendTxt: { fontWeight: '800', color: '#fff' },
});
