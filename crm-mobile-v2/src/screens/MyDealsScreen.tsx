import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPlannerSectionPage, PLANNER_FETCH_LIMIT, PLANNER_MAX_BUFFER } from '../api/crm';
import PlannerCompactCard from '../components/planner/PlannerCompactCard';
import { currentUserId, useAuth } from '../context/AuthContext';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { RootStackParamList } from '../navigation/types';
import { useColors, type ThemeColors } from '../theme';
import type { PlannerItem } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Trang trống — chỉ danh sách Deal đang phụ trách (không thống kê, không lọc). */
export default function MyDealsScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const userId = currentUserId(user);

  const [items, setItems] = useState<PlannerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean; silent?: boolean }) => {
    if (!userId) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const silent = opts?.silent ?? false;
    if (opts?.refresh && !silent) setRefreshing(true);
    else if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const page = await fetchPlannerSectionPage('deal', userId, 0, PLANNER_FETCH_LIMIT, {
        signal: ac.signal,
        companyId: user?.company_id || undefined,
        assignedTo: userId,
      });
      if (!ac.signal.aborted) {
        setItems(page.items);
        setTotal(page.total);
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
      }
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        setError((e as { message?: string })?.message || 'Không tải được deal');
      }
    } finally {
      if (!ac.signal.aborted && !silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, user?.company_id]);

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
    Boolean(userId),
  );

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore || items.length >= PLANNER_MAX_BUFFER) return;
    setLoadingMore(true);
    try {
      const page = await fetchPlannerSectionPage('deal', userId, nextOffset, PLANNER_FETCH_LIMIT, {
        companyId: user?.company_id || undefined,
        assignedTo: userId,
      });
      setItems((prev) => [...prev, ...page.items].slice(0, PLANNER_MAX_BUFFER));
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore, items.length, nextOffset, user?.company_id]);

  const handlePress = useCallback((item: PlannerItem) => {
    navigation.navigate('LeadDealDetail', {
      leadId: item.id,
      kind: 'deal',
      code: item.code,
      title: item.title,
    });
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Deal đang phụ trách</Text>
          <Text style={styles.sub}>{total > 0 ? `${total} deal` : 'Danh sách deal của bạn'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.orange} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={Colors.textFaint} />
          <Text style={styles.errTxt}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
            <Text style={styles.retryTxt}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.orange} />
          }
          renderItem={({ item }) => (
            <PlannerCompactCard item={item} onPress={handlePress} />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Ionicons name="pricetags-outline" size={28} color={Colors.textFaint} />
              </View>
              <Text style={styles.emptyTxt}>Không có deal nào được giao.</Text>
            </View>
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={Colors.orange} style={{ marginVertical: 12 }} /> : null
          }
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
    },
    h1: { color: Colors.text, fontSize: 20, fontWeight: '900' },
    sub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
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
    retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.orange },
    retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
