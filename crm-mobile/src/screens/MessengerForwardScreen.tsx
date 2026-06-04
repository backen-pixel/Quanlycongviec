import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupListItem, MessengerMessage } from '../types/messenger';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { buildBulkForwardMessageContent } from '../lib/messengerMessageActions';

type Route = RouteProp<MoreStackParamList, 'MessengerForward'>;
type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerForward'>;

export default function MessengerForwardScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { excludeGroupId, sourceTitle, messagesJson } = route.params;

  const messages = useMemo(() => {
    try {
      const parsed = JSON.parse(messagesJson) as MessengerMessage[];
      return Array.isArray(parsed) ? parsed.filter((m) => m?.id) : [];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const [groups, setGroups] = useState<MessengerGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<MessengerGroupListItem[]>('/messenger/groups');
      const list = Array.isArray(data) ? data : [];
      setGroups(list.filter((g) => String(g.id) !== String(excludeGroupId)));
    } catch {
      setGroups([]);
    }
    setLoading(false);
  }, [excludeGroupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => (g.name || '').toLowerCase().includes(term));
  }, [groups, q]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const send = async () => {
    if (!selectedIds.length) {
      Alert.alert('Chuyển tiếp', 'Chọn ít nhất một hội thoại.');
      return;
    }
    const body = buildBulkForwardMessageContent(messages, { sourceTitle, note });
    if (!body.trim()) {
      Alert.alert('Chuyển tiếp', 'Không có nội dung để gửi.');
      return;
    }
    setSending(true);
    let ok = 0;
    for (const gid of selectedIds) {
      try {
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
        <Text style={s.hint}>
          {messages.length > 1 ? `${messages.length} tin nhắn` : '1 tin nhắn'} · từ {sourceTitle || 'chat'}
        </Text>
      </View>

      <TextInput
        style={s.search}
        value={q}
        onChangeText={setQ}
        placeholder="Tìm nhóm hoặc chat…"
        placeholderTextColor={CrmColors.gray400}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={CrmColors.blue600} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(g) => String(g.id)}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const on = !!selected[String(item.id)];
            return (
              <TouchableOpacity style={[s.row, on && s.rowOn]} onPress={() => toggle(String(item.id))}>
                <Ionicons
                  name={item.is_direct ? 'person' : 'people'}
                  size={20}
                  color={on ? CrmColors.blue600 : CrmColors.gray500}
                />
                <Text style={[s.rowTitle, on && s.rowTitleOn]} numberOfLines={1}>
                  {item.name || (item.is_direct ? 'Chat trực tiếp' : 'Nhóm')}
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
            <Text style={s.empty}>Không có hội thoại khác để chuyển tiếp.</Text>
          }
        />
      )}

      <View style={s.footer}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={s.cancelTxt}>Huỷ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sendBtn, (!selectedIds.length || sending) && s.sendBtnOff]}
          onPress={() => void send()}
          disabled={!selectedIds.length || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.sendTxt}>Gửi ({selectedIds.length})</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CrmColors.pageBg },
  noteWrap: {
    margin: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  noteLabel: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6 },
  noteInput: { fontSize: 15, color: CrmColors.gray900, minHeight: 44, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: CrmColors.gray500, marginTop: 8 },
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
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: CrmColors.gray800 },
  rowTitleOn: { color: CrmColors.blue700 },
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
