import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MessengerAvatar from '../components/messenger/MessengerAvatar';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import { fetchCallHistoryItems } from '../lib/messengerApi';
import type { CallHistoryItem } from '../lib/messengerCallLog';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Radii, Spacing } from '../theme';
import type { MessengerThread } from '../types/messenger';

type Props = NativeStackScreenProps<RootStackParamList, 'Messages'>;
type HubTab = 'chats' | 'calls';

function ThreadRow({
  item,
  onPress,
}: {
  item: MessengerThread;
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          gap: 12,
        },
        body: { flex: 1, minWidth: 0 },
        top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        name: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
        time: { color: item.unread ? mc.accent : colors.textFaint, fontSize: 12, fontWeight: item.unread ? '700' : '500' },
        preview: { color: colors.textMuted, fontSize: 14, marginTop: 3 },
        badge: {
          minWidth: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: mc.unreadBadge,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 6,
          marginTop: 4,
          alignSelf: 'flex-end',
        },
        badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
      }),
    [colors, mc, item.unread],
  );

  return (
    <TapHighlight style={styles.row} onPress={onPress}>
      <MessengerAvatar
        name={item.name}
        size={52}
        color={item.avatarColor || avatarColorFromName(item.name)}
        avatarUrl={item.avatarUrl}
        online={item.online}
      />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.time}>{item.timeLabel}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{item.preview}</Text>
        {item.unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
          </View>
        ) : null}
      </View>
    </TapHighlight>
  );
}

function CallHistoryRow({
  item,
  onPress,
}: {
  item: CallHistoryItem;
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const iconName = item.status === 'missed' || item.status === 'rejected' ? 'call-outline' : 'call';
  const iconColor = item.status === 'missed' || item.status === 'rejected' ? '#EF4444' : mc.accent;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          gap: 12,
        },
        body: { flex: 1, minWidth: 0 },
        top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        name: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
        time: { color: colors.textFaint, fontSize: 12 },
        label: { color: colors.textMuted, fontSize: 14, marginTop: 3 },
        callIcon: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
        },
      }),
    [colors, isDark],
  );

  const timeLabel = useMemo(() => {
    try {
      return new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [item.createdAt]);

  return (
    <TapHighlight style={styles.row} onPress={onPress}>
      <MessengerAvatar
        name={item.groupName}
        size={52}
        color={avatarColorFromName(item.groupName)}
        avatarUrl={item.groupAvatarUrl}
      />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>{item.groupName}</Text>
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
        <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
      </View>
      <View style={styles.callIcon}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
    </TapHighlight>
  );
}

export default function MessagesScreen({ navigation, route }: Props) {
  const initialTab = route.params?.tab === 'calls' ? 'calls' : 'chats';
  const [hubTab, setHubTab] = useState<HubTab>(initialTab);
  const [query, setQuery] = useState('');
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const mc = getMessengerColors(colors, isDark);
  const { user } = useAuth();
  const myUserId = user?.id || user?.userId || '';
  const { threads, loading, error, refreshThreads } = useMessenger();
  const [refreshing, setRefreshing] = useState(false);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);

  const loadCallHistory = async () => {
    if (!myUserId) return;
    setCallsLoading(true);
    try {
      const items = await fetchCallHistoryItems(threads, myUserId);
      setCallHistory(items);
    } finally {
      setCallsLoading(false);
    }
  };

  useEffect(() => {
    if (hubTab === 'calls') void loadCallHistory();
  }, [hubTab, threads, myUserId]);

  const directContacts = useMemo(
    () => threads.filter((t) => t.isDirect).slice(0, 12),
    [threads],
  );

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = hubTab === 'calls'
      ? threads.filter((t) => /cuộc gọi|call/i.test(t.preview))
      : threads;
    if (!q) return base;
    return base.filter(
      (t) => t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q),
    );
  }, [query, threads, hubTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshThreads(true);
      if (hubTab === 'calls') await loadCallHistory();
    } finally {
      setRefreshing(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
        },
        title: { color: colors.text, fontSize: 28, fontWeight: '800' },
        headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        iconBtn: {
          width: 40,
          height: 40,
          borderRadius: Radii.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        composeBtn: {
          width: 44,
          height: 44,
          borderRadius: Radii.full,
          backgroundColor: mc.accent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        searchWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: Spacing.lg,
          marginBottom: 14,
          backgroundColor: mc.searchBg,
          borderRadius: Radii.lg,
          paddingHorizontal: 12,
          height: 44,
          gap: 8,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
        stories: { paddingHorizontal: Spacing.lg, gap: 14, paddingBottom: 16 },
        storyItem: { alignItems: 'center', width: 64 },
        storyLabel: { color: colors.textMuted, fontSize: 11, marginTop: 6, fontWeight: '600' },
        hubBar: {
          flexDirection: 'row',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
        hubTab: { flex: 1, alignItems: 'center', gap: 4 },
        hubLabel: { fontSize: 11, fontWeight: '700' },
        empty: { textAlign: 'center', color: colors.textFaint, marginTop: 40, fontSize: 14 },
      }),
    [colors, insets, mc],
  );

  const openChat = (threadId: string, name: string) => {
    navigation.navigate('ChatDetail', { threadId, title: name });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Tin nhắn</Text>
        <View style={styles.headerActions}>
          <TapHighlight style={styles.iconBtn} onPress={() => {}}>
            <Ionicons name="search-outline" size={20} color={colors.text} />
          </TapHighlight>
          <TapHighlight style={styles.composeBtn} onPress={() => {}}>
            <Ionicons name="create-outline" size={22} color="#FFF" />
          </TapHighlight>
        </View>
      </View>

      {hubTab === 'chats' ? (
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm..."
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stories}
          >
            <View style={styles.storyItem}>
              <MessengerAvatar name="+" size={56} dashed>
                <Ionicons name="add" size={24} color={mc.accent} />
              </MessengerAvatar>
              <Text style={styles.storyLabel}>Của bạn</Text>
            </View>
            {directContacts.map((c) => (
              <TapHighlight
                key={c.id}
                style={styles.storyItem}
                onPress={() => openChat(c.id, c.name)}
              >
                <MessengerAvatar
                  name={c.name}
                  size={56}
                  color={avatarColorFromName(c.name)}
                  avatarUrl={c.avatarUrl}
                />
                <Text style={styles.storyLabel} numberOfLines={1}>{c.name.split(' ')[0]}</Text>
              </TapHighlight>
            ))}
          </ScrollView>

          {error ? (
            <Text style={[styles.empty, { color: colors.danger, marginTop: 12 }]}>{error}</Text>
          ) : null}

          <FlatList
            data={filteredThreads}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={mc.accent} />
            }
            renderItem={({ item }) => (
              <ThreadRow item={item} onPress={() => openChat(item.id, item.name)} />
            )}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={mc.accent} />
              ) : (
                <Text style={styles.empty}>Chưa có hội thoại Messenger</Text>
              )
            }
          />
        </>
      ) : (
        <FlatList
          data={callHistory}
          keyExtractor={(item) => `${item.groupId}-${item.id}`}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={mc.accent} />
          }
          renderItem={({ item }) => (
            <CallHistoryRow
              item={item}
              onPress={() => openChat(item.groupId, item.groupName)}
            />
          )}
          ListHeaderComponent={
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
                paddingHorizontal: Spacing.lg,
                paddingVertical: 12,
                textTransform: 'uppercase',
              }}
            >
              Lịch sử cuộc gọi
            </Text>
          }
          ListEmptyComponent={
            callsLoading || loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={mc.accent} />
            ) : (
              <Text style={styles.empty}>Chưa có cuộc gọi trong lịch sử chat</Text>
            )
          }
        />
      )}

      <View style={styles.hubBar}>
        {([
          ['chats', 'chatbubbles', 'Chats'],
          ['calls', 'call', 'Calls'],
        ] as const).map(([key, icon, label]) => {
          const active = hubTab === key;
          return (
            <TapHighlight key={key} style={styles.hubTab} onPress={() => setHubTab(key)}>
              <Ionicons
                name={(active ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap}
                size={22}
                color={active ? mc.accent : colors.textFaint}
              />
              <Text style={[styles.hubLabel, { color: active ? mc.accent : colors.textFaint }]}>
                {label}
              </Text>
            </TapHighlight>
          );
        })}
        <TapHighlight style={styles.hubTab} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-outline" size={22} color={colors.textFaint} />
          <Text style={[styles.hubLabel, { color: colors.textFaint }]}>Kanban</Text>
        </TapHighlight>
      </View>
    </View>
  );
}
