import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type R = RouteProp<MoreStackParamList, 'MessengerCompose'>;
type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerCompose'>;

type PickerUser = { id: string; full_name?: string | null; email?: string | null };

export default function MessengerComposeScreen() {
  const { params } = useRoute<R>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const mode = params.mode;

  const [users, setUsers] = useState<PickerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: mode === 'direct' ? 'Chat 1–1' : 'Tạo nhóm chat' });
  }, [navigation, mode]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ users?: PickerUser[] } | PickerUser[]>('/users');
      const raw = Array.isArray(data) ? data : data?.users;
      const list = Array.isArray(raw) ? raw : [];
      setUsers(list.filter((u) => String(u.id) !== myId));
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (mode === 'direct') {
        n.clear();
        n.add(id);
        return n;
      }
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (mode === 'direct') {
      const peer = [...selected][0];
      if (!peer) {
        Alert.alert('Chọn người', 'Chọn một đồng nghiệp để bắt đầu chat.');
        return;
      }
      setBusy(true);
      try {
        const { data } = await api.post<{ id: string; name?: string }>('/messenger/direct', { peer_user_id: peer });
        navigation.replace('MessengerGroupChat', {
          groupId: String(data.id),
          title: data.name || undefined,
          isDirect: true,
        });
      } catch (e: unknown) {
        Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tạo được cuộc trò chuyện');
      } finally {
        setBusy(false);
      }
      return;
    }

    const name = groupName.trim();
    if (!name) {
      Alert.alert('Thiếu tên', 'Nhập tên nhóm.');
      return;
    }
    const members = [...selected].map((user_id) => ({ user_id, role: 'member' }));
    setBusy(true);
    try {
      const { data } = await api.post<{ id: string; name?: string }>('/messenger/groups', { name, members });
      navigation.replace('MessengerGroupChat', {
        groupId: String(data.id),
        title: data.name || name,
        isDirect: false,
      });
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tạo được nhóm');
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

  return (
    <View style={styles.screen}>
      {mode === 'group' ? (
        <>
          <Text style={styles.lbl}>Tên nhóm *</Text>
          <TextInput
            style={styles.inp}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Ví dụ: Team kinh doanh miền Nam"
            placeholderTextColor={CrmColors.gray400}
          />
          <Text style={styles.hint}>Chọn thêm thành viên (bạn đã được thêm làm trưởng nhóm trên server).</Text>
        </>
      ) : (
        <Text style={styles.hint}>Chọn một nhân viên để chat riêng (nếu đã có hội thoại sẽ mở lại).</Text>
      )}

      <Text style={styles.secH}>{mode === 'direct' ? 'Danh sách nhân viên' : 'Thêm thành viên'}</Text>
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Không tải được danh sách user (cần quyền API /users).</Text>}
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.userRow, on && styles.userRowOn, CrmShadow.card]}
              onPress={() => toggle(item.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.check}>{on ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.full_name || item.id}</Text>
                {item.email ? <Text style={styles.userEmail}>{item.email}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={[styles.cta, busy && styles.ctaOff]} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.ctaTxt}>{busy ? 'Đang xử lý…' : mode === 'direct' ? 'Bắt đầu chat' : 'Tạo nhóm'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lbl: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 12,
    fontSize: 16,
    backgroundColor: CrmColors.white,
    color: CrmColors.gray900,
  },
  hint: { fontSize: 13, color: CrmColors.gray500, marginTop: 10, lineHeight: 19 },
  secH: { fontSize: 14, fontWeight: '800', color: CrmColors.gray800, marginTop: 18, marginBottom: 10 },
  listPad: { paddingBottom: 100 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 24 },
  userRow: {
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
  userRowOn: { borderColor: CrmColors.blue500, backgroundColor: CrmColors.blue50 },
  check: { fontSize: 18, color: CrmColors.gray700 },
  userName: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  userEmail: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  cta: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.lg,
    alignItems: 'center',
  },
  ctaOff: { opacity: 0.6 },
  ctaTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 16 },
});
