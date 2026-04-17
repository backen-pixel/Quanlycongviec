import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type R = RouteProp<MoreStackParamList, 'MessengerAddMembers'>;

type PickerUser = { id: string; full_name?: string | null; email?: string | null; phone?: string | null };

type PhoneFilter = 'all' | 'has_phone' | 'no_phone';

type UsersApiResponse = { users?: PickerUser[] } | PickerUser[];

type GroupMembersApiResponse = { members?: Array<{ user_id: string }> };

const PHONE_CHIPS: { key: PhoneFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'has_phone', label: 'Có SĐT' },
  { key: 'no_phone', label: 'Chưa SĐT' },
];

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

function userHasPhone(u: PickerUser): boolean {
  const p = (u.phone || '').trim();
  return p.length > 0 && digits(p).length > 0;
}

export default function MessengerAddMembersScreen() {
  const { params } = useRoute<R>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { groupId } = params;
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');

  const [users, setUsers] = useState<PickerUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, gRes] = await Promise.all([
        api.get<UsersApiResponse>('/users'),
        api.get<GroupMembersApiResponse>(`/messenger/groups/${groupId}`),
      ]);
      const raw = Array.isArray(uRes.data) ? uRes.data : uRes.data?.users;
      const list = Array.isArray(raw) ? raw : [];
      const mems = (gRes.data?.members || []).map((m) => String(m.user_id));
      setUsers(list.filter((u) => !mems.includes(String(u.id))));
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return users.filter((u) => {
      if (phoneFilter === 'has_phone' && !userHasPhone(u)) return false;
      if (phoneFilter === 'no_phone' && userHasPhone(u)) return false;
      if (!q) return true;
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      const phoneD = digits(u.phone || '');
      if (name.includes(q) || email.includes(q) || phone.includes(q)) return true;
      if (qDigits && phoneD.includes(qDigits)) return true;
      return false;
    });
  }, [users, search, phoneFilter]);

  const toggle = (id: string) => {
    if (String(id) === myId) return;
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const add = async () => {
    if (!selected.size) {
      Alert.alert('Chọn người', 'Chọn ít nhất một nhân viên chưa có trong nhóm.');
      return;
    }
    setBusy(true);
    try {
      const members = [...selected].map((user_id) => ({ user_id, role: 'member' }));
      await api.post(`/messenger/groups/${groupId}/members`, { members });
      Alert.alert('Đã thêm', 'Thành viên đã được thêm vào nhóm.');
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không thêm được');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  const footerPad = Math.max(insets.bottom, 12);

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>Chọn người chưa thuộc nhóm (đã ẩn thành viên hiện có).</Text>
      <TextInput
        style={styles.searchInp}
        placeholder="Tìm theo tên, email hoặc số điện thoại…"
        placeholderTextColor={CrmColors.gray400}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PHONE_CHIPS.map((c) => {
          const on = phoneFilter === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setPhoneFilter(c.key)}
            >
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {users.length === 0
              ? 'Không còn nhân viên nào để thêm hoặc không tải được danh sách.'
              : 'Không có nhân viên khớp bộ lọc / từ khóa.'}
          </Text>
        }
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          const ph = (item.phone || '').trim();
          return (
            <TouchableOpacity
              style={[styles.row, on && styles.rowOn, CrmShadow.card]}
              onPress={() => toggle(item.id)}
            >
              <Text style={styles.check}>{on ? '☑' : '☐'}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{item.full_name || item.id}</Text>
                {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
                {ph ? <Text style={styles.phone}>{ph}</Text> : <Text style={styles.noPhone}>Chưa có SĐT</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <View style={[styles.footer, { paddingBottom: footerPad }]}>
        <TouchableOpacity style={[styles.cta, busy && styles.ctaOff]} onPress={() => void add()} disabled={busy}>
          <Text style={styles.ctaTxt}>{busy ? 'Đang thêm…' : 'Thêm vào nhóm'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg, paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { fontSize: 13, color: CrmColors.gray600, marginBottom: 10, lineHeight: 19 },
  searchInp: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
    marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, paddingRight: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  chipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  chipTxtOn: { color: CrmColors.blue700 },
  list: { flex: 1, minHeight: 0 },
  listPad: { paddingBottom: 8 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
    marginBottom: 8,
    gap: 10,
  },
  rowOn: { borderColor: CrmColors.blue500, backgroundColor: CrmColors.blue50 },
  check: { fontSize: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  email: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  phone: { fontSize: 12, color: CrmColors.gray700, marginTop: 4, fontWeight: '600' },
  noPhone: { fontSize: 12, color: CrmColors.gray400, marginTop: 4, fontStyle: 'italic' },
  footer: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CrmColors.gray200,
    backgroundColor: CrmColors.pageBg,
  },
  cta: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    alignItems: 'center',
  },
  ctaOff: { opacity: 0.6 },
  ctaTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 16 },
});
