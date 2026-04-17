import React, { useCallback, useState } from 'react';
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

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MessengerGroupList'>;

export default function MessengerGroupListScreen({ navigation }: { navigation: Nav }) {
  const [groups, setGroups] = useState<MessengerGroupListItem[]>([]);
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        api.get<MessengerGroupListItem[]>('/messenger/groups'),
        api.get<{ group_ids?: string[] }>('/messenger/pins').catch(() => ({ data: { group_ids: [] } })),
      ]);
      const list = Array.isArray(gRes.data) ? gRes.data : [];
      const ids = (pRes.data?.group_ids || []).filter(Boolean);
      setPins(new Set(ids.map(String)));
      const pinSet = new Set(ids.map(String));
      list.sort((a, b) => {
        const ap = pinSet.has(String(a.id)) ? 1 : 0;
        const bp = pinSet.has(String(b.id)) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const ta = new Date(a.last_message_at || 0).getTime();
        const tb = new Date(b.last_message_at || 0).getTime();
        return tb - ta;
      });
      setGroups(list);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

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
          return (
            <TouchableOpacity
              style={[styles.row, CrmShadow.card]}
              onPress={() =>
                navigation.navigate('MessengerGroupChat', {
                  groupId: String(item.id),
                  title: item.name || undefined,
                  isDirect: !!item.is_direct,
                })
              }
              activeOpacity={0.85}
            >
              <View style={styles.rowIcon}>
                <Text style={styles.rowIconTxt}>{item.is_direct ? '💬' : '👥'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  {pinned ? <Text style={styles.pinMark}>📌 </Text> : null}
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name || 'Nhóm'}
                  </Text>
                </View>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.is_direct ? 'Chat trực tiếp' : item.crm_lead_id ? 'Nhóm theo lead/deal' : 'Nhóm'} ·{' '}
                  {item.message_count ?? 0} tin
                  {item.last_message_at ? ` · ${formatDateTime(item.last_message_at)}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.pinHit} onPress={() => togglePin(item)} hitSlop={10}>
                <Text style={styles.pinBtn}>{pinned ? '📌' : '📍'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

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
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconTxt: { fontSize: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  pinMark: { fontSize: 13 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: CrmColors.gray900, flexShrink: 1 },
  rowSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  pinHit: { padding: 6 },
  pinBtn: { fontSize: 18 },
});
