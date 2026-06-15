import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import { formatApiError } from '../api/client';
import { fetchThreads, type ThreadItem } from '../api/messenger';
import { currentUserId, useAuth } from '../context/AuthContext';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type HubTab = 'chats' | 'calls';

function ThreadRow({ item, onPress }: { item: ThreadItem; onPress: () => void }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <Pressable style={styles.row} onPress={onPress} android_ripple={{ color: Colors.surfaceSoft }}>
      <Avatar name={item.name} size={52} color={item.color} online={item.online} avatarUrl={item.avatarUrl} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowTime, item.unread > 0 && { color: Colors.blue, fontWeight: '800' }]}>
            {item.timeLabel}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.rowPreview, item.unread > 0 && { color: Colors.text, fontWeight: '600' }]}
            numberOfLines={1}
          >
            {item.preview}
          </Text>
          {item.unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{item.unread > 99 ? '99+' : item.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myId = currentUserId(user);
  const [hub, setHub] = useState<HubTab>('chats');
  const [query, setQuery] = useState('');
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        setThreads(await fetchThreads(myId));
      } catch (e) {
        setError(formatApiError(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [myId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const directContacts = useMemo(() => threads.filter((t) => t.isDirect).slice(0, 12), [threads]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) => t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q),
    );
  }, [query, threads]);

  const openChat = (t: ThreadItem) => {
    navigation.navigate('ChatDetail', { threadId: t.id, title: t.name, color: t.color });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Tin nhắn</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="search-outline" size={20} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.composeBtn}>
            <Ionicons name="create-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={Colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm kiếm..."
          placeholderTextColor={Colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stories}>
        <View style={styles.storyItem}>
          <View style={styles.storyAdd}>
            <Ionicons name="add" size={26} color={Colors.blue} />
          </View>
          <Text style={styles.storyLabel}>Của bạn</Text>
        </View>
        {directContacts.map((c) => (
          <Pressable key={c.id} style={styles.storyItem} onPress={() => openChat(c)}>
            <Avatar name={c.name} size={56} color={c.color} online={c.online} avatarUrl={c.avatarUrl} />
            <Text style={styles.storyLabel} numberOfLines={1}>{c.name.split(' ')[0]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.hubBar}>
        {([
          ['chats', 'chatbubbles', 'Chats'],
          ['calls', 'call', 'Cuộc gọi'],
        ] as const).map(([key, icon, label]) => {
          const active = hub === key;
          return (
            <Pressable
              key={key}
              style={[styles.hubTab, active && { borderBottomColor: Colors.blue }]}
              onPress={() => setHub(key)}
            >
              <Ionicons
                name={(active ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap}
                size={18}
                color={active ? Colors.blue : Colors.textFaint}
              />
              <Text style={[styles.hubLabel, { color: active ? Colors.blue : Colors.textFaint }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />
        }
        renderItem={({ item }) => <ThreadRow item={item} onPress={() => openChat(item)} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.blue} style={{ marginTop: 40 }} />
          ) : error ? (
            <Text style={[styles.empty, { color: Colors.red }]}>{error}</Text>
          ) : (
            <Text style={styles.empty}>Không có hội thoại</Text>
          )
        }
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { color: Colors.text, fontSize: 28, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 6,
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 0 },
  stories: { paddingHorizontal: 16, gap: 16, paddingVertical: 16 },
  storyItem: { alignItems: 'center', width: 60 },
  storyAdd: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.blue,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 6, fontWeight: '600' },
  hubBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hubTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginRight: 18,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  hubLabel: { fontSize: 13, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { color: Colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  rowTime: { color: Colors.textFaint, fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  rowPreview: { color: Colors.textMuted, fontSize: 14, flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { textAlign: 'center', color: Colors.textFaint, marginTop: 40 },
});
