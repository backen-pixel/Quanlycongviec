import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationChannel,
} from '../api/notifications';
import { timeLabel } from '../lib/media';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS: { key: NotificationChannel; label: string }[] = [
  { key: 'activity', label: 'Hoạt động' },
  { key: 'assignments', label: 'Giao việc' },
  { key: 'events', label: 'Sự kiện' },
  { key: 'deadlines', label: 'Nhắc hạn' },
];

type IconMeta = { icon: keyof typeof Ionicons.glyphMap; color: keyof ThemeColors };

function iconForType(type: string | null, entityType: string | null): IconMeta {
  const t = (type || '').toLowerCase();
  const e = (entityType || '').toLowerCase();
  if (t.includes('deadline') || t.includes('overdue') || t.includes('reminder')) {
    return { icon: 'alarm', color: 'red' };
  }
  if (t.includes('assign') || e === 'crm_assignment' || e === 'crm_task' || e === 'task') {
    return { icon: 'clipboard', color: 'purple' };
  }
  if (t.includes('event') || e === 'event') return { icon: 'calendar', color: 'cyan' };
  if (t.includes('won') || t.includes('deal')) return { icon: 'trophy', color: 'amber' };
  if (e === 'crm_lead' || e === 'lead' || t.includes('lead')) return { icon: 'people', color: 'blue' };
  if (e === 'crm_deal') return { icon: 'pricetags', color: 'orange' };
  if (t.includes('chat') || t.includes('message')) return { icon: 'chatbubble', color: 'green' };
  if (t.includes('approval')) return { icon: 'shield-checkmark', color: 'orange' };
  return { icon: 'notifications', color: 'blue' };
}

function dayGroupLabel(iso: string | null): string {
  if (!iso) return 'Khác';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Khác';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hôm nay';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Section = { title: string; data: AppNotification[] };

function groupByDay(items: AppNotification[]): Section[] {
  const map = new Map<string, AppNotification[]>();
  for (const n of items) {
    const key = dayGroupLabel(n.created_at);
    const arr = map.get(key);
    if (arr) arr.push(n);
    else map.set(key, [n]);
  }
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

export default function NotificationsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [tab, setTab] = useState<NotificationChannel>('activity');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts?: { refresh?: boolean; silent?: boolean }) => {
      const isRefresh = opts?.refresh ?? false;
      const silent = opts?.silent ?? false;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (isRefresh && !silent) setRefreshing(true);
      else if (!silent) setLoading(true);
      if (!silent) setError('');
      try {
        const list = await fetchNotifications({ channel: tab, onlyUnread, signal: ac.signal });
        if (!ac.signal.aborted) setItems(list);
      } catch (e: unknown) {
        if (!ac.signal.aborted) {
          setError((e as { message?: string })?.message || 'Không tải được thông báo');
          setItems([]);
        }
      } finally {
        if (!ac.signal.aborted) {
          if (!silent) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }
    },
    [tab, onlyUnread],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      void load({ refresh: true, silent: true });
    }, [load]),
  );

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);
  const sections = useMemo(() => groupByDay(items), [items]);

  const handleMarkAll = async () => {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      // Đánh dấu đã đọc toàn bộ kênh để badge tổng về 0.
      await markAllNotificationsRead();
    } catch {
      void load();
    } finally {
      setMarking(false);
    }
  };

  const navigateForNotification = (n: AppNotification) => {
    const e = (n.entity_type || '').toLowerCase();
    if (e === 'crm_lead' || e === 'lead' || e === 'crm_task') {
      navigation.navigate('CrmHub', { initialMode: 'leads' });
      return;
    }
    if (e === 'crm_deal') {
      navigation.navigate('CrmHub', { initialMode: 'deals' });
    }
  };

  const handlePress = (n: AppNotification) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, is_read: true } : it)));
      void markNotificationRead(n.id).catch(() => {});
    }
    navigateForNotification(n);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Thông báo</Text>
            <Text style={styles.sub}>
              {unreadCount > 0 ? `${unreadCount} thông báo mới` : 'Đã xem hết'}
            </Text>
          </View>
        </View>

        <Pressable
          style={[styles.markAllBtn, (marking || unreadCount === 0) && { opacity: 0.5 }]}
          onPress={() => void handleMarkAll()}
          disabled={marking || unreadCount === 0}
        >
          <Ionicons name="checkmark-done" size={16} color={Colors.blue} />
          <Text style={styles.markAllTxt}>Đánh dấu đã đọc tất cả</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.unreadRow}>
          <Text style={styles.unreadLbl}>Chỉ chưa đọc</Text>
          <Switch
            value={onlyUnread}
            onValueChange={setOnlyUnread}
            trackColor={{ false: Colors.border, true: Colors.blue }}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.blue} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={Colors.textFaint} />
          <Text style={styles.errTxt}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
            <Text style={styles.retryTxt}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={28} color={Colors.textFaint} />
              </View>
              <Text style={styles.emptyTxt}>
                {onlyUnread ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item: n }) => {
            const meta = iconForType(n.type, n.entity_type);
            const color = Colors[meta.color] as string;
            return (
              <Pressable
                style={[styles.card, !n.is_read && styles.cardUnread]}
                onPress={() => handlePress(n)}
              >
                {!n.is_read ? <View style={styles.unreadBar} /> : null}
                <View style={[styles.cardIcon, { backgroundColor: color + '22' }]}>
                  <Ionicons name={meta.icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTopRow}>
                    <Text style={[styles.cardTitle, !n.is_read && styles.cardTitleUnread]} numberOfLines={2}>
                      {n.title}
                    </Text>
                    <Text style={styles.cardTime}>{timeLabel(n.created_at)}</Text>
                  </View>
                  {n.message ? (
                    <Text style={styles.cardMsg} numberOfLines={3}>
                      {n.message}
                    </Text>
                  ) : null}
                </View>
                {!n.is_read ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderSoft },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
    },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    sub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: Colors.blueSoft,
    },
    markAllTxt: { color: Colors.blue, fontWeight: '800', fontSize: 13 },
    tabsRow: { gap: 8, paddingTop: 12, paddingBottom: 2 },
    tab: {
      paddingHorizontal: 14,
      height: 34,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
    tabTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '800' },
    tabTxtActive: { color: '#fff' },
    unreadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingVertical: 2,
    },
    unreadLbl: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 24 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: Colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center' },
    retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radii.md, backgroundColor: Colors.blue },
    retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    sectionHeader: {
      color: Colors.textFaint,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
    },
    card: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      marginHorizontal: 14,
      marginBottom: 8,
      padding: 12,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      overflow: 'hidden',
    },
    cardUnread: { backgroundColor: Colors.blueSoft, borderColor: 'rgba(47,107,255,0.35)' },
    unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Colors.blue },
    cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    cardTitleUnread: { fontWeight: '900' },
    cardTime: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', marginTop: 1 },
    cardMsg: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.blue, marginTop: 4 },
  });
