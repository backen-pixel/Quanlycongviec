import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import type { MessengerGroupListItem } from '../types/messenger';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { useNotifications } from '../context/NotificationContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerGroupList'>;

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

export default function MessengerGroupListScreen({ navigation }: { navigation: Nav }) {
  const { refreshUnread, subscribeIncoming } = useNotifications();
  const [groups, setGroups] = useState<MessengerGroupListItem[]>([]);
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pinsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const load = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        api.get<MessengerGroupListItem[]>('/messenger/groups'),
        api.get<{ group_ids?: string[] }>('/messenger/pins').catch(() => ({ data: { group_ids: [] } })),
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

  // Re-sort realtime khi nhận tin nhắn mới qua socket
  useEffect(() => {
    const unsub = subscribeIncoming((n) => {
      if (n.type !== 'messenger_chat' || n.entity_type !== 'messenger_group' || !n.entity_id) return;
      const groupId = String(n.entity_id);
      const meta = n.metadata && typeof n.metadata === 'object'
        ? (n.metadata as Record<string, unknown>)
        : {};
      const groupName = typeof meta.group_name === 'string' ? meta.group_name : undefined;
      const msgContent = n.message ?? '';

      setGroups((prev) => {
        const idx = prev.findIndex((g) => String(g.id) === groupId);
        let updated: MessengerGroupListItem[];

        if (idx >= 0) {
          // Group đã có: cập nhật last_message_at, last_message, tăng unread_count
          updated = prev.map((g, i) => {
            if (i !== idx) return g;
            return {
              ...g,
              last_message_at: new Date().toISOString(),
              last_message: msgContent,
              unread_count: (g.unread_count ?? 0) + 1,
            };
          });
        } else {
          // Group chưa có trong list (mới được thêm vào) — thêm tạm, sẽ reload khi focus lại
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

  const togglePin = (g: MessengerGroupListItem) => {
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
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không cập nhật được');
          }
        },
      },
    ]);
  };

  if (loading && groups.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolBtn, CrmShadow.sm]}
          onPress={() => navigation.navigate('MessengerCompose', { mode: 'group' })}
        >
          <Text style={styles.toolBtnTxt}>＋ Nhóm</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolBtnSec, CrmShadow.sm]}
          onPress={() => navigation.navigate('MessengerCompose', { mode: 'direct' })}
        >
          <Text style={styles.toolBtnSecTxt}>💬 1–1</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={groups}
        keyExtractor={(it) => String(it.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        contentContainerStyle={groups.length === 0 ? styles.emptyPad : styles.listPad}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có nhóm chat. Tạo nhóm hoặc chat 1–1 với đồng nghiệp.</Text>}
        renderItem={({ item }) => {
          const pinned = pins.has(String(item.id));
          const unread = item.unread_count ?? 0;
          const hasUnread = unread > 0;
          return (
            <TouchableOpacity
              style={[styles.row, hasUnread && styles.rowUnread, CrmShadow.card]}
              onPress={() =>
                navigation.navigate('MessengerGroupChat', {
                  groupId: String(item.id),
                  title: item.name || undefined,
                  isDirect: !!item.is_direct,
                })
              }
              activeOpacity={0.85}
            >
              {/* Avatar */}
              <View style={[styles.rowIcon, hasUnread && styles.rowIconUnread]}>
                <Text style={styles.rowIconTxt}>{item.is_direct ? '💬' : '👥'}</Text>
              </View>

              {/* Content */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  {pinned ? <Text style={styles.pinMark}>📌 </Text> : null}
                  <Text
                    style={[styles.rowTitle, hasUnread && styles.rowTitleUnread]}
                    numberOfLines={1}
                  >
                    {item.name || 'Nhóm'}
                  </Text>
                </View>

                {/* Preview tin nhắn cuối */}
                {item.last_message ? (
                  <Text
                    style={[styles.rowPreview, hasUnread && styles.rowPreviewUnread]}
                    numberOfLines={1}
                  >
                    {item.last_message}
                  </Text>
                ) : (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.is_direct ? 'Chat trực tiếp' : item.crm_lead_id ? 'Nhóm theo lead/deal' : 'Nhóm'} ·{' '}
                    {item.message_count ?? 0} tin
                    {item.last_message_at ? ` · ${formatDateTime(item.last_message_at)}` : ''}
                  </Text>
                )}

                {/* Thời gian + sub khi có preview */}
                {item.last_message && item.last_message_at ? (
                  <Text style={styles.rowTime}>{formatDateTime(item.last_message_at)}</Text>
                ) : null}
              </View>

              {/* Right side: unread badge + pin */}
              <View style={styles.rowRight}>
                {hasUnread ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadTxt}>{unread > 99 ? '99+' : String(unread)}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.pinHit} onPress={() => togglePin(item)} hitSlop={10}>
                  <Text style={styles.pinBtn}>{pinned ? '📌' : '📍'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const ZALO_BLUE = '#0068FF';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  toolBtn: {
    flex: 1,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  toolBtnTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 14 },
  toolBtnSec: {
    flex: 1,
    backgroundColor: CrmColors.white,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  toolBtnSecTxt: { color: CrmColors.gray800, fontWeight: '800', fontSize: 14 },
  listPad: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyPad: { flexGrow: 1, padding: 24 },
  empty: { fontSize: 14, color: CrmColors.gray500, textAlign: 'center', lineHeight: 21 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  rowUnread: {
    borderColor: ZALO_BLUE + '55',
    backgroundColor: '#F0F7FF',
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconUnread: {
    backgroundColor: ZALO_BLUE + '22',
  },
  rowIconTxt: { fontSize: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  pinMark: { fontSize: 13 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: CrmColors.gray700, flexShrink: 1 },
  rowTitleUnread: { fontWeight: '800', color: CrmColors.gray900 },
  rowPreview: {
    fontSize: 13,
    color: CrmColors.gray500,
    marginTop: 3,
  },
  rowPreviewUnread: {
    color: CrmColors.gray800,
    fontWeight: '600',
  },
  rowSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  rowTime: { fontSize: 11, color: CrmColors.gray400, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ZALO_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadTxt: { color: CrmColors.white, fontSize: 11, fontWeight: '900' },
  pinHit: { padding: 4 },
  pinBtn: { fontSize: 16 },
});
