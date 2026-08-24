import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import HeaderMenuBell from '../components/HeaderMenuBell';
import { formatApiError } from '../api/client';
import { fetchActivityUsers, type ActivityUserItem } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import {
  createDirectChat,
  fetchCallHistoryItems,
} from '../lib/messengerApi';
import ConversationActionsSheet from '../components/messenger/ConversationActionsSheet';
import { markThreadDeleted, loadDeletedThreadIds } from '../lib/messengerThreadStorage';
import type { CallHistoryItem } from '../lib/messengerCallLog';
import { formatPresenceLabel } from '../lib/messengerPresence';
import { avatarColorFromName } from '../lib/messengerTheme';
import { getMessengerPerfLimits } from '../lib/devicePerf';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { MessengerThread } from '../types/messenger';
import { CALLING_ENABLED } from '../config';

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
  skipRemoteAvatars,
}: {
  item: MessengerThread;
  onPress: () => void;
  onLongPress?: () => void;
  activityLabel?: string | null;
  skipRemoteAvatars?: boolean;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const color = item.avatarColor || avatarColorFromName(item.name);

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      android_ripple={{ color: Colors.surfaceSoft }}
    >
      <Avatar
        name={item.name}
        size={52}
        color={color}
        online={item.online}
        avatarUrl={item.avatarUrl}
        skipRemoteImage={skipRemoteAvatars}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowTime, item.unread > 0 && { color: Colors.blue, fontWeight: '800' }]}>
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

const MemoThreadRow = memo(ThreadRow);

function CallHistoryRow({
  item,
  onPress,
  skipRemoteAvatars,
}: {
  item: CallHistoryItem;
  onPress: () => void;
  skipRemoteAvatars?: boolean;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const iconName = item.status === 'missed' || item.status === 'rejected' ? 'call-outline' : 'call';
  const iconColor = item.status === 'missed' || item.status === 'rejected' ? Colors.red : Colors.blue;
  const timeLabel = useMemo(() => {
    try {
      return new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [item.createdAt]);

  return (
    <Pressable style={styles.row} onPress={onPress} android_ripple={{ color: Colors.surfaceSoft }}>
      <Avatar
        name={item.groupName}
        size={52}
        color={avatarColorFromName(item.groupName)}
        avatarUrl={item.groupAvatarUrl}
        skipRemoteImage={skipRemoteAvatars}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{item.groupName}</Text>
          <Text style={styles.rowTime}>{timeLabel}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={2}>{item.label}</Text>
      </View>
      <View style={[styles.callIcon, { backgroundColor: Colors.surfaceSoft }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
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
  const { isOnline } = useNetworkStatus();
  const myUserId = user?.id || user?.userId || '';
  const { threads, loading, error, refreshThreads, getPeerPresence } = useMessenger();
  const perf = useMemo(() => getMessengerPerfLimits(), []);

  const [hub, setHub] = useState<HubTab>('chats');
  const [query, setQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<ActivityUserItem[]>([]);
  const [onlineTotal, setOnlineTotal] = useState(0);
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
      const list = await fetchActivityUsers();
      const online = list.filter((u) => u.online && String(u.id) !== String(myUserId));
      setOnlineTotal(online.length);
      setOnlineUsers(online.slice(0, perf.onlineStripMax));
      setOnlineError('');
    } catch {
      setOnlineUsers([]);
      setOnlineTotal(0);
    }
  }, [myUserId, perf.onlineStripMax]);

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
      // Provider đã refresh khi mount/foreground — chỉ pull khi list trống.
      if (!threads.length) void refreshThreads(true);
      void loadOnline();
    }, [refreshThreads, loadOnline, threads.length]),
  );

  /** Có mạng trở lại → làm mới hội thoại + online strip. */
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (!isOnline || !wasOffline) return;
    void refreshThreads(true);
    void loadOnline();
    if (hub === 'calls') void loadCallHistory();
  }, [isOnline, refreshThreads, loadOnline, loadCallHistory, hub]);

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

  const openChat = useCallback((threadId: string, title: string) => {
    navigation.navigate('ChatDetail', { threadId, title });
  }, [navigation]);

  const openOnlineUser = useCallback(async (u: ActivityUserItem) => {
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
  }, [threads, openChat, refreshThreads]);

  const threadActivityLabel = useCallback((t: MessengerThread): string | null => {
    if (!t.isDirect || !t.peerId) return null;
    const pres = getPeerPresence(t.peerId);
    const label = formatPresenceLabel(pres || (t.online ? { online: true } : { online: false }));
    return label || null;
  }, [getPeerPresence]);

  const renderOnlineItem = useCallback(({ item: u }: { item: ActivityUserItem }) => (
    <Pressable style={styles.storyItem} onPress={() => void openOnlineUser(u)}>
      <Avatar
        name={u.name}
        size={56}
        color={u.color}
        online
        avatarUrl={u.avatarUrl}
        skipRemoteImage={perf.skipRemoteAvatars}
      />
      <Text style={styles.storyLabel} numberOfLines={2}>
        {firstName(u.name)}
      </Text>
    </Pressable>
  ), [styles.storyItem, styles.storyLabel, openOnlineUser, perf.skipRemoteAvatars]);

  const renderThread = useCallback(({ item }: { item: MessengerThread }) => (
    <MemoThreadRow
      item={item}
      activityLabel={threadActivityLabel(item)}
      skipRemoteAvatars={perf.skipRemoteAvatars}
      onPress={() => openChat(item.id, item.name)}
      onLongPress={() => setActionThread(item)}
    />
  ), [threadActivityLabel, perf.skipRemoteAvatars, openChat]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Tin nhắn</Text>
        <View style={styles.headerActions}>
          <HeaderMenuBell />
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
            <Text style={styles.onlineCount}>{onlineTotal}</Text>
          </View>
          {onlineError ? (
            <Text style={[styles.onlineEmpty, { color: Colors.red }]}>{onlineError}</Text>
          ) : onlineUsers.length === 0 ? (
            <Text style={styles.onlineEmpty}>Chưa có ai online</Text>
          ) : (
            <FlatList
              horizontal
              data={onlineUsers}
              keyExtractor={(u) => String(u.id)}
              renderItem={renderOnlineItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stories}
              style={styles.storiesScroll}
              initialNumToRender={Math.min(8, perf.onlineStripMax)}
              maxToRenderPerBatch={6}
              windowSize={3}
              removeClippedSubviews
            />
          )}
        </View>
      ) : null}

      <View style={styles.hubBar}>
        {(
          CALLING_ENABLED
            ? ([
                ['chats', 'chatbubbles', 'Chats'],
                ['calls', 'call', 'Cuộc gọi'],
              ] as const)
            : ([['chats', 'chatbubbles', 'Chats']] as const)
        ).map(([key, icon, label]) => {
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

      {hub === 'chats' ? (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          initialNumToRender={perf.listInitial}
          maxToRenderPerBatch={perf.listBatch}
          windowSize={perf.listWindow}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={Colors.blue} />
          }
          renderItem={renderThread}
          ListEmptyComponent={
            loading ? (
              <SpinningLoader color={Colors.blue} style={{ marginTop: 40 }} />
            ) : error ? (
              <Text style={[styles.empty, { color: Colors.red }]}>{error}</Text>
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
          initialNumToRender={perf.listInitial}
          maxToRenderPerBatch={perf.listBatch}
          windowSize={perf.listWindow}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={Colors.blue} />
          }
          renderItem={({ item }) => (
            <CallHistoryRow
              item={item}
              skipRemoteAvatars={perf.skipRemoteAvatars}
              onPress={() => openChat(item.groupId, item.groupName)}
            />
          )}
          ListHeaderComponent={
            <Text style={styles.callsHeader}>Lịch sử cuộc gọi</Text>
          }
          ListEmptyComponent={
            callsLoading || loading ? (
              <SpinningLoader color={Colors.blue} style={{ marginTop: 40 }} />
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
    backgroundColor: Colors.green,
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
    backgroundColor: Colors.blue,
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
