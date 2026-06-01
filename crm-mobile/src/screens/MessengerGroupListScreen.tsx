import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { API_ORIGIN } from '../config';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupListItem } from '../types/messenger';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { useNotifications } from '../context/NotificationContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerGroupList'>;
type TabKey = 'group' | 'direct';

/* ─── helpers ─────────────────────────────────────────────────── */

const AVATAR_PALETTE = [
  '#2563EB', // blue
  '#EC4899', // pink
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EF4444', // red
  '#0EA5E9', // sky
  '#14B8A6', // teal
];

function colorForName(name: string): string {
  const s = (name || '?').trim() || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function absUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const v = String(u).trim();
  if (!v) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  const base = (API_ORIGIN || '').replace(/\/$/, '');
  return base ? `${base}/${v.replace(/^\//, '')}` : v;
}

/** "11:38" nếu cùng ngày, "T3" nếu trong tuần, "12/05" nếu xa hơn. */
function shortTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const diff = now.getTime() - d.getTime();
  if (diff < 7 * 24 * 3600 * 1000) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[d.getDay()];
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isRecentlyActive(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!t) return false;
  return Date.now() - t < 60 * 60 * 1000; // 1h
}

/** Sắp xếp: pin trước → last_message_at giảm dần */
function sortGroups(list: MessengerGroupListItem[], pinSet: Set<string>): MessengerGroupListItem[] {
  return [...list].sort((a, b) => {
    const ap = pinSet.has(String(a.id)) ? 1 : 0;
    const bp = pinSet.has(String(b.id)) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ta = new Date(a.last_message_at || 0).getTime();
    const tb = new Date(b.last_message_at || 0).getTime();
    return tb - ta;
  });
}

/* ─── small subcomponents ─────────────────────────────────────── */

function Avatar({
  name,
  url,
  size = 44,
  rounded = true,
  showOnline = false,
}: {
  name: string;
  url?: string | null;
  size?: number;
  rounded?: boolean;
  showOnline?: boolean;
}) {
  const color = colorForName(name);
  const radius = rounded ? size / 2 : 12;
  return (
    <View style={{ width: size, height: size }}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: color }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>
            {initials(name)}
          </Text>
        </View>
      )}
      {showOnline ? <View style={[styles.onlineDot, { right: -1, bottom: -1 }]} /> : null}
    </View>
  );
}

function PresenceCell({
  item,
  onPress,
}: {
  item: MessengerGroupListItem;
  onPress: () => void;
}) {
  const label = (item.name || '?').split(/\s+/).slice(0, 2).join(' ');
  return (
    <TouchableOpacity style={styles.presCell} activeOpacity={0.85} onPress={onPress}>
      <Avatar
        name={item.name || '?'}
        url={absUrl(item.peer_avatar)}
        size={48}
        showOnline
      />
      <Text style={styles.presLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ConversationRow({
  item,
  pinned,
  onPress,
  onLongPress,
}: {
  item: MessengerGroupListItem;
  pinned: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const unread = item.unread_count ?? 0;
  const hasUnread = unread > 0;
  const active = isRecentlyActive(item.last_message_at);
  const stripeColor = active ? '#10B981' : pinned ? CrmColors.amber500 : 'transparent';

  const subtitle = item.last_message
    ? item.last_message
    : item.is_direct
      ? `Chat trực tiếp · ${item.message_count ?? 0} tin`
      : item.crm_lead_id
        ? `Nhóm theo lead · ${item.message_count ?? 0} tin`
        : `Nhóm · ${item.message_count ?? 0} tin`;

  return (
    <TouchableOpacity
      style={[styles.convRow, CrmShadow.card]}
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={[styles.convStripe, { backgroundColor: stripeColor }]} />

      <View style={styles.convAvatarWrap}>
        <Avatar
          name={item.name || (item.is_direct ? 'Trực tiếp' : 'Nhóm')}
          url={item.is_direct ? absUrl(item.peer_avatar) : null}
          size={44}
        />
        {pinned ? (
          <View style={styles.pinChip}>
            <Ionicons name="bookmark" size={10} color="#fff" />
          </View>
        ) : null}
      </View>

      <View style={styles.convBody}>
        <View style={styles.convTitleRow}>
          <Text
            style={[styles.convTitle, hasUnread && styles.convTitleUnread]}
            numberOfLines={1}
          >
            {item.name || (item.is_direct ? 'Trực tiếp' : 'Nhóm')}
          </Text>
          {active ? (
            <View style={styles.livePill}>
              <Text style={styles.livePillTxt}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.convSub, hasUnread && styles.convSubUnread]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>

      <View style={styles.convRight}>
        <Text style={styles.convTime}>{shortTime(item.last_message_at)}</Text>
        {hasUnread ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadTxt}>{unread > 99 ? '99+' : String(unread)}</Text>
          </View>
        ) : item.crm_lead_id ? (
          <View style={styles.cornerIcon}>
            <Ionicons name="location" size={13} color={CrmColors.blue600} />
          </View>
        ) : (
          <View style={[styles.cornerIcon, styles.cornerIconGhost]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

/* ─── main screen ─────────────────────────────────────────────── */

export default function MessengerGroupListScreen({ navigation }: { navigation: Nav }) {
  const { refreshUnread, subscribeIncoming } = useNotifications();
  const [groups, setGroups] = useState<MessengerGroupListItem[]>([]);
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('group');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const pinsRef = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Tin nhắn',
      headerTitleAlign: 'center',
    });
  }, [navigation]);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  /** Debounce search 250ms — gõ nhanh không gây re-filter ngay mỗi keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(draftSearch.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [draftSearch]);

  const load = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        api.get<MessengerGroupListItem[]>('/messenger/groups'),
        api
          .get<{ group_ids?: string[] }>('/messenger/pins')
          .catch(() => ({ data: { group_ids: [] } })),
      ]);
      const list = Array.isArray(gRes.data) ? gRes.data : [];
      const ids = (pRes.data?.group_ids || []).filter(Boolean);
      const pinSet = new Set(ids.map(String));
      setPins(pinSet);
      setGroups(sortGroups(list, pinSet));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshUnread();
      setLoading(true);
      void load();
    }, [load, refreshUnread]),
  );

  /** Realtime: cập nhật last_message + unread_count + sort lại khi có tin mới. */
  useEffect(() => {
    const unsub = subscribeIncoming((n) => {
      if (n.type !== 'messenger_chat' || n.entity_type !== 'messenger_group' || !n.entity_id) return;
      const groupId = String(n.entity_id);
      const meta =
        n.metadata && typeof n.metadata === 'object' ? (n.metadata as Record<string, unknown>) : {};
      const groupName = typeof meta.group_name === 'string' ? meta.group_name : undefined;
      const msgContent = n.message ?? '';

      setGroups((prev) => {
        const idx = prev.findIndex((g) => String(g.id) === groupId);
        let updated: MessengerGroupListItem[];
        if (idx >= 0) {
          updated = prev.map((g, i) =>
            i !== idx
              ? g
              : {
                  ...g,
                  last_message_at: new Date().toISOString(),
                  last_message: msgContent,
                  unread_count: (g.unread_count ?? 0) + 1,
                },
          );
        } else {
          updated = [
            {
              id: groupId,
              name: groupName,
              last_message_at: new Date().toISOString(),
              last_message: msgContent,
              unread_count: 1,
              message_count: 1,
            },
            ...prev,
          ];
        }
        return sortGroups(updated, pinsRef.current);
      });
    });
    return unsub;
  }, [subscribeIncoming]);

  const togglePin = useCallback(
    (g: MessengerGroupListItem) => {
      const id = String(g.id);
      const next = !pins.has(id);
      Alert.alert(next ? 'Ghim hội thoại' : 'Bỏ ghim', g.name || 'Nhóm', [
        { text: 'Hủy', style: 'cancel' },
        {
          text: next ? 'Ghim' : 'Bỏ',
          onPress: async () => {
            try {
              await api.put(`/messenger/pins/${id}`, { pinned: next });
              setPins((prev) => {
                const n = new Set(prev);
                if (next) n.add(id);
                else n.delete(id);
                return n;
              });
              await load();
            } catch (e: unknown) {
              Alert.alert(
                'Lỗi',
                (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                  'Không cập nhật được',
              );
            }
          },
        },
      ]);
    },
    [pins, load],
  );

  /** Đếm số theo từng tab (sau khi filter search) — hiển thị trên pill. */
  const counts = useMemo(() => {
    const g = groups.filter((it) => !it.is_direct).length;
    const d = groups.filter((it) => it.is_direct).length;
    return { group: g, direct: d };
  }, [groups]);

  const filteredAll = useMemo(() => {
    const byTab = groups.filter((it) => (tab === 'group' ? !it.is_direct : !!it.is_direct));
    if (!search) return byTab;
    return byTab.filter((it) => (it.name || '').toLowerCase().includes(search));
  }, [groups, tab, search]);

  /** "Đang trực tuyến": đối tác chat 1-1 có hoạt động <24h, max 8 cell. */
  const onlinePeers = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return groups
      .filter(
        (g) =>
          g.is_direct &&
          (!!g.last_message_at && new Date(g.last_message_at).getTime() >= cutoff),
      )
      .slice(0, 10);
  }, [groups]);

  const openCompose = useCallback(() => {
    Alert.alert('Tạo hội thoại mới', undefined, [
      {
        text: 'Chat nhóm',
        onPress: () => navigation.navigate('MessengerCompose', { mode: 'group' }),
      },
      {
        text: 'Chat 1–1',
        onPress: () => navigation.navigate('MessengerCompose', { mode: 'direct' }),
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: MessengerGroupListItem }) => (
      <ConversationRow
        item={item}
        pinned={pins.has(String(item.id))}
        onPress={() =>
          navigation.navigate('MessengerGroupChat', {
            groupId: String(item.id),
            title: item.name || undefined,
            isDirect: !!item.is_direct,
          })
        }
        onLongPress={() => togglePin(item)}
      />
    ),
    [pins, navigation, togglePin],
  );

  const keyExtractor = useCallback((it: MessengerGroupListItem) => String(it.id), []);

  const listHeader = useMemo(
    () => (
      <View>
        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={CrmColors.gray400} />
          <TextInput
            value={draftSearch}
            onChangeText={setDraftSearch}
            placeholder="Tìm kiếm hội thoại..."
            placeholderTextColor={CrmColors.gray400}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {draftSearch ? (
            <TouchableOpacity onPress={() => setDraftSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={CrmColors.gray400} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabPill, tab === 'group' && styles.tabPillActive]}
            activeOpacity={0.85}
            onPress={() => setTab('group')}
          >
            <Ionicons
              name="people"
              size={15}
              color={tab === 'group' ? '#fff' : CrmColors.gray600}
            />
            <Text style={[styles.tabTxt, tab === 'group' && styles.tabTxtActive]}>Nhóm</Text>
            <View style={[styles.tabCount, tab === 'group' && styles.tabCountActive]}>
              <Text style={[styles.tabCountTxt, tab === 'group' && styles.tabCountTxtActive]}>
                {counts.group}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, tab === 'direct' && styles.tabPillActive]}
            activeOpacity={0.85}
            onPress={() => setTab('direct')}
          >
            <Ionicons
              name="chatbubble-ellipses"
              size={15}
              color={tab === 'direct' ? '#fff' : CrmColors.gray600}
            />
            <Text style={[styles.tabTxt, tab === 'direct' && styles.tabTxtActive]}>1–1</Text>
            <View style={[styles.tabCount, tab === 'direct' && styles.tabCountActive]}>
              <Text style={[styles.tabCountTxt, tab === 'direct' && styles.tabCountTxtActive]}>
                {counts.direct}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Online row */}
        {onlinePeers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionH}>ĐANG TRỰC TUYẾN</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presScroll}
            >
              {onlinePeers.map((g) => (
                <PresenceCell
                  key={g.id}
                  item={g}
                  onPress={() =>
                    navigation.navigate('MessengerGroupChat', {
                      groupId: String(g.id),
                      title: g.name || undefined,
                      isDirect: true,
                    })
                  }
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text style={[styles.sectionH, { marginTop: 4, marginBottom: 8 }]}>HỘI THOẠI GẦN ĐÂY</Text>
      </View>
    ),
    [draftSearch, tab, counts, onlinePeers, navigation],
  );

  if (loading && groups.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredAll}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={CrmColors.blue600}
          />
        }
        contentContainerStyle={
          filteredAll.length === 0 ? styles.emptyPad : styles.listPad
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search
              ? `Không có hội thoại nào khớp "${search}".`
              : tab === 'group'
                ? 'Chưa có nhóm chat. Tạo nhóm mới ở nút + bên dưới.'
                : 'Chưa có cuộc trò chuyện 1–1 nào.'}
          </Text>
        }
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <TouchableOpacity style={[styles.fab, CrmShadow.card]} onPress={openCompose} activeOpacity={0.88}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

/* ─── styles ──────────────────────────────────────────────────── */

const FAB_BLUE = '#5B5BF5';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listPad: { padding: 16, paddingBottom: 96 },
  emptyPad: { flexGrow: 1, padding: 16, paddingBottom: 96 },
  empty: {
    fontSize: 14,
    color: CrmColors.gray500,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 32,
  },

  /* search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E9EDF5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: CrmColors.gray800,
    paddingVertical: 0,
  },

  /* tabs */
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  tabPillActive: {
    backgroundColor: FAB_BLUE,
    borderColor: FAB_BLUE,
  },
  tabTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray700 },
  tabTxtActive: { color: '#fff' },
  tabCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: CrmColors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountTxt: { fontSize: 11, fontWeight: '800', color: CrmColors.gray700 },
  tabCountTxtActive: { color: '#fff' },

  /* section header */
  section: { marginBottom: 12 },
  sectionH: {
    fontSize: 11,
    fontWeight: '800',
    color: CrmColors.gray500,
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  /* online presence row */
  presScroll: { gap: 14, paddingRight: 8, paddingVertical: 4 },
  presCell: { alignItems: 'center', width: 60 },
  presLabel: {
    marginTop: 6,
    fontSize: 11,
    color: CrmColors.gray700,
    textAlign: 'center',
    maxWidth: 60,
  },
  onlineDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#fff',
  },

  /* conversation card */
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    marginBottom: 10,
    overflow: 'hidden',
  },
  convStripe: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 12,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  convAvatarWrap: { marginRight: 12, position: 'relative' },
  pinChip: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CrmColors.amber500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  convBody: { flex: 1, minWidth: 0 },
  convTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  convTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: CrmColors.gray900,
    flexShrink: 1,
  },
  convTitleUnread: { fontWeight: '800' },
  convSub: { fontSize: 12.5, color: CrmColors.gray500, marginTop: 3 },
  convSubUnread: { color: CrmColors.gray800, fontWeight: '600' },

  livePill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  livePillTxt: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },

  convRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minWidth: 44,
    alignSelf: 'stretch',
    paddingVertical: 2,
  },
  convTime: { fontSize: 11, color: CrmColors.gray400, fontWeight: '600' },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: FAB_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  cornerIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CrmColors.blue50,
  },
  cornerIconGhost: { backgroundColor: 'transparent' },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: FAB_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
