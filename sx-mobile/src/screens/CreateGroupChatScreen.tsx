import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import TapHighlight from '../components/TapHighlight';
import { formatApiError } from '../api/client';
import { fetchActivityUsers, type ActivityUserItem } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { createMessengerGroup } from '../lib/messengerApi';
import { avatarColorFromName } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../context/ThemeContext';
import { Radii, Spacing } from '../theme';

import SpinningLoader from '../components/SpinningLoader';
type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroupChat'>;

export default function CreateGroupChatScreen({ navigation, route }: Props) {
  const { preselectedUserIds = [], suggestedName = '' } = route.params;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUserId = String(user?.id || user?.userId || '');

  const [groupName, setGroupName] = useState(suggestedName);
  const [users, setUsers] = useState<ActivityUserItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselectedUserIds.map(String)));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchActivityUsers()
      .then((list) => setUsers(list.filter((u) => String(u.id) !== myUserId)))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [myUserId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.name || '').toLowerCase().includes(q));
  }, [users, query]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const submit = async () => {
    const name = groupName.trim();
    if (!name) {
      Alert.alert('Thiếu tên', 'Nhập tên nhóm chat.');
      return;
    }
    if (!selected.size) {
      Alert.alert('Chọn thành viên', 'Chọn ít nhất một thành viên.');
      return;
    }
    setBusy(true);
    try {
      const group = await createMessengerGroup(name, [...selected]);
      navigation.replace('ChatDetail', { threadId: group.id, title: group.name });
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
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
          paddingBottom: 12,
          paddingHorizontal: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
          gap: 10,
        },
        backBtn: { width: 38, height: 38, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
        createBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: Radii.lg,
          backgroundColor: colors.primary,
        },
        createBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
        nameWrap: {
          margin: Spacing.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        nameInput: { color: colors.text, fontSize: 15 },
        searchWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? colors.card : colors.cardAlt,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 15 },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.md,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
        check: {
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      }),
    [colors, isDark, insets.top],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Tạo nhóm chat</Text>
        <Pressable style={styles.createBtn} onPress={() => void submit()} disabled={busy}>
          {busy ? (
            <SpinningLoader size="small" color="#FFF" />
          ) : (
            <Text style={styles.createBtnTxt}>Tạo</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.nameWrap}>
        <TextInput
          style={styles.nameInput}
          placeholder="Tên nhóm"
          placeholderTextColor={colors.textFaint}
          value={groupName}
          onChangeText={setGroupName}
        />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm thành viên..."
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <SpinningLoader size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => String(u.id)}
          renderItem={({ item }) => {
            const id = String(item.id);
            const on = selected.has(id);
            const name = item.name || 'Thành viên';
            return (
              <Pressable style={styles.row} onPress={() => toggle(id)}>
                <Avatar name={name} size={40} color={avatarColorFromName(name)} />
                <Text style={styles.rowName}>{name}</Text>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Ionicons name="checkmark" size={14} color="#FFF" /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
