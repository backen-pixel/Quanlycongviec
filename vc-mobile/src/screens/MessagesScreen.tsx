import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { fetchActivityUsers, type ActivityUserItem } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import {
  createDirectChat,
  fetchCallHistoryItems,
} from '../lib/messengerApi';
import ConversationActionsSheet from '../components/messenger/ConversationActionsSheet';
import { markThreadDeleted, loadDeletedThreadIds } from '../lib/messengerThreadStorage';
import type { CallHistoryItem } from '../lib/messengerCallLog';
import { formatPresenceLabel } from '../lib/messengerPresence';
import { avatarColorFromName } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../context/ThemeContext';
import { Radii, type AppColors } from '../theme';
import type { MessengerThread } from '../types/messenger';

type HubTab = 'chats' | 'calls';
type Nav = NativeStackNavigationProp<RootStackParamList>;

function firstName(name: string): string {
  const part = name.trim().split(/\s+/).filter(Boolean)[0];
  return part || name || '?';
}

function ThreadRow({
  item,
  onPress,
  onLongPress,
  activityLabel,
}: {
  item: MessengerThread;
  onPress: () => void;
  onLongPress?: () => void;
  activityLabel?: string | null;
}) {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const color = item.avatarColor || avatarColorFromName(item.name);

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      android_ripple={{ color: Colors.cardAlt }}
    >
      <Avatar name={item.name} size={52} color={color} online={item.online} avatarUrl={item.avatarUrl} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowTime, item.unread > 0 && { color: Colors.primary, fontWeight: '800' }]}>
            {item.timeLabel}
          </Text>
        </View>
        {activityLabel ? (
          <Text style={styles.activityLabel} numberOfLines={1}>{activityLabel}</Text>
        ) : null}
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

function CallHistoryRow({
  item,
  onPress,
}: {
  item: CallHistoryItem;
  onPress: () => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const iconName = item.status === 'missed' || item.status === 'rejected' ? 'call-outline' : 'call';
  const iconColor = item.status === 'missed' || item.status === 'rejected' ? Colors.danger : Colors.primary;
  const timeLabel = useMemo(() => {
    try {
      return new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [item.createdAt]);

  return (
    <Pressable style={styles.row} onPress={onPress} android_ripple={{ color: Colors.cardAlt }}>
      <Avatar
        name={item.groupName}
        size={52}
        color={avatarColorFromName(item.groupName)}
        avatarUrl={item.groupAvatarUrl}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{item.groupName}</Text>
          <Text style={styles.rowTime}>{timeLabel}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={2}>{item.label}</Text>
      </View>
      <View style={[styles.callIcon, { backgroundColor: Colors.cardAlt }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUserId = user?.id || user?.userId || '';
  const {
    threads,
    loading,
    loadingMore,
    hasMoreThreads,
    error,
    refreshThreads,
    loadMoreThreads,
    getPeerPresence,
  } = useMessenger();

  const [hub, setHub] = useState<HubTab>('chats');
  const [query, setQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<ActivityUserItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [actionThread, setActionThread] = useState<MessengerThread | null>(null);

  useEffect(() => {
    void loadDeletedThreadIds(String(myUserId)).then(setDeletedIds);
  }, [myUserId]);

  const loadOnline = useCallback(async () => {
    try {
      const list = await fetchActivityUsers(undefined, { onlineOnly: true });
      setOnlineUsers(list.filter((u) => u.online && String(u.id) !== String(myUserId)));
      setOnlineError('');
    } catch {
      setOnlineUsers([]);
    }
  }, [myUserId]);

  const loadCallHistory = useCallback(async () => {
    if (!myUserId) return;
    setCallsLoading(true);
    try {
      setCallHistory(await fetchCallHistoryItems(threads, myUserId));
    } finally {
      setCallsLoading(false);
    }
  }, [myUserId, threads]);

  useFocusEffect(
    useCallback(() => {
      void refreshThreads(true);
      void loadOnline();
    }, [refreshThreads, loadOnline]),
  );

  useEffect(() => {
    if (hub === 'calls') void loadCallHistory();
  }, [hub, loadCallHistory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = threads.filter((t) => !deletedIds.has(String(t.id)));
    if (!q) return list;
    return list.filter(
      (t) => t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q),
    );
  }, [query, threads, deletedIds]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshThreads(true);
      await loadOnline();
      if (hub === 'calls') await loadCallHistory();
    } finally {
      setRefreshing(false);
    }
  };

  const handleThreadAction = useCallback(
    (action: 'createGroup' | 'delete', thread: MessengerThread) => {
      if (action === 'createGroup') {
        const peerId = thread.peerId;
        if (!peerId) return;
        navigation.navigate('CreateGroupChat', {
          preselectedUserIds: [String(peerId)],
          suggestedName: `${thread.name} + bạn bè`,
        });
        return;
      }
      Alert.alert(
        'Xóa cuộc hội thoại',
        'Cuộc hội thoại sẽ được ẩn khỏi danh sách. Bạn vẫn có thể mở lại khi có tin nhắn mới.',
        [
          { text: 'Huỷ', style: 'cancel' },
          {
            text: 'Xóa',
            style: 'destructive',
            onPress: () => {
              void markThreadDeleted(String(myUserId), thread.id).then(setDeletedIds);
            },
          },
        ],
      );
    },
    [myUserId, navigation],
  );

  const openChat = (threadId: string, title: string) => {
    navigation.navigate('ChatDetail', { threadId, title });
  };

  const openOnlineUser = async (u: ActivityUserItem) => {
    const existing = threads.find((t) => t.isDirect && t.peerId && String(t.peerId) === String(u.id));
    if (existing) {
      openChat(existing.id, existing.name);
      return;
    }
    try {
      const threadId = await createDirectChat(u.id);
      await refreshThreads(true);
      openChat(threadId, u.name);
    } catch (e) {
      setOnlineError(formatApiError(e));
    }
  };

  const threadActivityLabel = (t: MessengerThread): string | null => {
    if (!t.isDirect || !t.peerId) return null;
    const pres = getPeerPresence(t.peerId);
    const label = formatPresenceLabel(pres || (t.online ? { online: true } : { online: false }));
    return label || null;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Tin nhắn</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="search-outline" size={20} color={Colors.text} />
          </Pressable>
          <Pressable
            style={styles.composeBtn}
            onPress={() => navigation.navigate('CreateGroupChat', { preselectedUserIds: [] })}
          >
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

      {hub === 'chats' ? (
        <View style={styles.onlineSection}>
          <View style={styles.onlineHeader}>
            <View style={styles.onlineTitleRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineTitle}>Đang online</Text>
            </View>
            <Text style={styles.onlineCount}>{onlineUsers.length}</Text>
          </View>
          {onlineError ? (
            <Text style={[styles.onlineEmpty, { color: Colors.danger }]}>{onlineError}</Text>
          ) : onlineUsers.length === 0 ? (
            <Text style={styles.onlineEmpty}>Chưa có ai online</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stories}
              style={styles.storiesScroll}
            >
              {onlineUsers.map((u) => (
                <Pressable key={u.id} style={styles.storyItem} onPress={() => void openOnlineUser(u)}>
                  <Avatar name={u.name} size={56} color={u.color} online avatarUrl={u.avatarUrl} />
                  <Text style={styles.storyLabel} numberOfLines={2}>
                    {firstName(u.name)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      <View style={styles.hubBar}>
        {([
          ['chats', 'chatbubbles', 'Chats'],
        ] as const).map(([key, icon, label]) => {
          const active = hub === key;
          return (
            <Pressable
              key={key}
              style={[styles.hubTab, active && { borderBottomColor: Colors.primary }]}
              onPress={() => setHub(key)}
            >
              <Ionicons
                name={(active ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap}
                size={18}
                color={active ? Colors.primary : Colors.textFaint}
              />
              <Text style={[styles.hubLabel, { color: active ? Colors.primary : Colors.textFaint }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hub === 'chats' ? (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          initialNumToRender={16}
          windowSize={9}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!query.trim() && hasMoreThreads && !loadingMore) void loadMoreThreads();
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={Colors.primary} />
          }
          renderItem={({ item }) => (
            <ThreadRow
              item={item}
              activityLabel={threadActivityLabel(item)}
              onPress={() => openChat(item.id, item.name)}
              onLongPress={() => setActionThread(item)}
            />
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
            ) : error ? (
              <Text style={[styles.empty, { color: Colors.danger }]}>{error}</Text>
            ) : (
              <Text style={styles.empty}>Không có hội thoại</Text>
            )
          }
        />
      ) : (
        <FlatList
          data={callHistory}
          keyExtractor={(item) => `${item.groupId}-${item.id}`}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={Colors.primary} />
          }
          renderItem={({ item }) => (
            <CallHistoryRow item={item} onPress={() => openChat(item.groupId, item.groupName)} />
          )}
          ListHeaderComponent={
            <Text style={styles.callsHeader}>Lịch sử cuộc gọi</Text>
          }
          ListEmptyComponent={
            callsLoading || loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <Text style={styles.empty}>Chưa có cuộc gọi trong lịch sử chat</Text>
            )
          }
        />
      )}

      <ConversationActionsSheet
        visible={!!actionThread}
        thread={actionThread}
        onDismiss={() => setActionThread(null)}
        onAction={handleThreadAction}
      />
    </View>
  );
}

const makeStyles = (Colors: AppColors) => StyleSheet.create({
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
    backgroundColor: Colors.primary,
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
  onlineSection: {
    marginTop: 8,
    marginBottom: 4,
    minHeight: 108,
  },
  onlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  onlineTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  onlineTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  onlineCount: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  onlineEmpty: {
    color: Colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  storiesScroll: { flexGrow: 0 },
  stories: {
    paddingHorizontal: 16,
    gap: 14,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  storyItem: {
    alignItems: 'center',
    width: 72,
    minHeight: 84,
  },
  storyLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 8,
    fontWeight: '600',
    width: '100%',
    textAlign: 'center',
    lineHeight: 14,
  },
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
  activityLabel: { color: Colors.textFaint, fontSize: 12, marginTop: 2 },
  rowTime: { color: Colors.textFaint, fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  rowPreview: { color: Colors.textMuted, fontSize: 14, flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  callIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callsHeader: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
    textTransform: 'uppercase',
  },
  empty: { textAlign: 'center', color: Colors.textFaint, marginTop: 40 },
});
