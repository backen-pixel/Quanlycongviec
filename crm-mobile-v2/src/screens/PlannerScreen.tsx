import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchPlannerSection,
  invalidatePlannerCache,
  peekPlannerCache,
  setPlannerCache,
} from '../api/crm';
import { currentUserId, useAuth } from '../context/AuthContext';
import { Colors, Radii } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { PlannerItem, PlannerKind } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const KIND_META: Record<
  PlannerKind,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; soft: string }
> = {
  lead: { label: 'Leads của tôi', icon: 'people', color: Colors.blue, soft: Colors.blueSoft },
  deal: { label: 'Deals của tôi', icon: 'pricetags', color: Colors.orange, soft: Colors.orangeSoft },
};

const SECTION_LIMIT = 30;

function ItemCard({ item }: { item: PlannerItem }) {
  const meta = KIND_META[item.kind];
  return (
    <View style={[styles.card, { borderLeftColor: meta.color }]}>
      <View style={styles.cardHead}>
        <View style={[styles.kindIcon, { backgroundColor: meta.soft }]}>
          <Ionicons name={meta.icon} size={14} color={meta.color} />
        </View>
        <Text style={styles.cardCode}>{item.code}</Text>
        {item.overdue ? (
          <View style={styles.overduePill}>
            <Text style={styles.overdueTxt}>Quá hạn</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.cardMetaRow}>
        <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
        <Text style={styles.cardMeta} numberOfLines={1}>{item.contactName}</Text>
        {item.valueLabel ? (
          <>
            <View style={styles.dot} />
            <Text style={[styles.cardMeta, { color: Colors.orange, fontWeight: '800' }]}>
              {item.valueLabel}
            </Text>
          </>
        ) : null}
      </View>
      <View style={styles.cardFoot}>
        <View style={[styles.statusChip, { backgroundColor: meta.soft }]}>
          <Text style={[styles.statusTxt, { color: meta.color }]} numberOfLines={1}>
            {item.status}
          </Text>
        </View>
        <View style={styles.dueRow}>
          <Ionicons
            name="time-outline"
            size={12}
            color={item.overdue ? Colors.red : Colors.textMuted}
          />
          <Text style={[styles.dueTxt, item.overdue && { color: Colors.red }]} numberOfLines={1}>
            {item.deadlineLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Section({
  kind,
  items,
  loading,
  onSeeAll,
}: {
  kind: PlannerKind;
  items: PlannerItem[];
  loading?: boolean;
  onSeeAll: () => void;
}) {
  const meta = KIND_META[kind];
  const overdue = items.filter((i) => i.overdue).length;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, SECTION_LIMIT);
  const hasMore = items.length > SECTION_LIMIT;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionBadge, { backgroundColor: meta.soft }]}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
        </View>
        <Text style={styles.sectionTitle}>{meta.label}</Text>
        <View style={[styles.countBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.countTxt}>{items.length}</Text>
        </View>
        {overdue > 0 ? <Text style={styles.sectionOverdue}>{overdue} quá hạn</Text> : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: meta.color }]}>Xem tất cả</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={meta.color} style={{ marginVertical: 16 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Không có {kind === 'lead' ? 'lead' : 'deal'} nào được giao.</Text>
      ) : (
        <>
          {shown.map((it) => <ItemCard key={it.id} item={it} />)}
          {hasMore && !expanded ? (
            <Pressable style={styles.showMoreBtn} onPress={() => setExpanded(true)}>
              <Text style={[styles.showMoreTxt, { color: meta.color }]}>
                Xem thêm {items.length - SECTION_LIMIT} mục...
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const userId = currentUserId(user);

  const [leads, setLeads] = useState<PlannerItem[]>(() => peekPlannerCache(userId)?.leads ?? []);
  const [deals, setDeals] = useState<PlannerItem[]>(() => peekPlannerCache(userId)?.deals ?? []);
  const [leadsLoading, setLeadsLoading] = useState(() => !peekPlannerCache(userId));
  const [dealsLoading, setDealsLoading] = useState(() => !peekPlannerCache(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (loadingRef.current && !isRefresh) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    loadingRef.current = true;

    const cached = peekPlannerCache(userId);
    if (cached && !isRefresh) {
      setLeads(cached.leads);
      setDeals(cached.deals);
      setLeadsLoading(false);
      setDealsLoading(false);
      loadingRef.current = false;
      return;
    }
    if (!cached) {
      setLeadsLoading(true);
      setDealsLoading(true);
    }
    if (isRefresh) {
      invalidatePlannerCache(userId);
      setRefreshing(true);
    }
    setError('');

    let leadErr = '';
    let dealErr = '';
    let leadItems: PlannerItem[] = [];
    let dealItems: PlannerItem[] = [];

    const leadPromise = fetchPlannerSection('lead', userId, ac.signal)
      .then((items) => {
        leadItems = items;
        if (!ac.signal.aborted) setLeads(items);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) {
          leadErr =
            (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
            (e as { message?: string })?.message ||
            'Không tải được leads';
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLeadsLoading(false);
      });

    const dealPromise = fetchPlannerSection('deal', userId, ac.signal)
      .then((items) => {
        dealItems = items;
        if (!ac.signal.aborted) setDeals(items);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) {
          dealErr =
            (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
            (e as { message?: string })?.message ||
            'Không tải được deals';
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setDealsLoading(false);
      });

    await Promise.all([leadPromise, dealPromise]);

    if (!ac.signal.aborted) {
      if (leadErr && dealErr) setError(leadErr);
      else setError('');
      setPlannerCache(userId, { leads: leadItems, deals: dealItems });
    }
    loadingRef.current = false;
    setRefreshing(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  const overdueCount =
    leads.filter((l) => l.overdue).length + deals.filter((d) => d.overdue).length;

  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const displayName = user?.full_name || user?.fullName || '';

  const summary = useMemo(() => ({
    leads: leads.length,
    deals: deals.length,
    overdue: overdueCount,
  }), [leads.length, deals.length, overdueCount]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Kế hoạch của tôi</Text>
            <Text style={styles.date}>
              {today}{displayName ? ` · ${displayName}` : ''}
            </Text>
          </View>
          <Pressable style={styles.bellBtn}>
            <Ionicons name="notifications-outline" size={20} color={Colors.text} />
            {overdueCount > 0 && <View style={styles.bellDot} />}
          </Pressable>
        </View>

        {/* Tổng quan */}
        <View style={styles.summary}>
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.blue }]}>{summary.leads}</Text>
            <Text style={styles.sumLabel}>Leads</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.orange }]}>{summary.deals}</Text>
            <Text style={styles.sumLabel}>Deals</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumValue, { color: Colors.red }]}>{summary.overdue}</Text>
            <Text style={styles.sumLabel}>Quá hạn</Text>
          </View>
        </View>

        {/* Thao tác nhanh */}
        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickBtn, { borderColor: Colors.blue }]}
            onPress={() => navigation.navigate('CrmHub', { initialMode: 'leads' })}
          >
            <View style={[styles.quickIcon, { backgroundColor: Colors.blueSoft }]}>
              <Ionicons name="people" size={22} color={Colors.blue} />
            </View>
            <View style={styles.quickBody}>
              <Text style={styles.quickTitle}>Quản lý Leads</Text>
              <Text style={styles.quickSub}>Danh sách · tìm kiếm · lọc</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
          </Pressable>
          <Pressable
            style={[styles.quickBtn, { borderColor: Colors.orange }]}
            onPress={() => navigation.navigate('CrmHub', { initialMode: 'deals' })}
          >
            <View style={[styles.quickIcon, { backgroundColor: Colors.orangeSoft }]}>
              <Ionicons name="pricetags" size={22} color={Colors.orange} />
            </View>
            <View style={styles.quickBody}>
              <Text style={styles.quickTitle}>Quản lý Deals</Text>
              <Text style={styles.quickSub}>Pipeline · giá trị · trạng thái</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textFaint} />
          </Pressable>
        </View>

        {/* Nội dung — mỗi section load độc lập, không chặn cả trang */}
        <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
          {error && !leadsLoading && !dealsLoading ? (
            <View style={styles.errBox}>
              <Ionicons name="cloud-offline-outline" size={32} color={Colors.textFaint} />
              <Text style={styles.errTxt}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void load(true)}>
                <Text style={styles.retryTxt}>Thử lại</Text>
              </Pressable>
            </View>
          ) : null}
          <Section
            kind="lead"
            items={leads}
            loading={leadsLoading}
            onSeeAll={() => navigation.navigate('CrmHub', { initialMode: 'leads' })}
          />
          <Section
            kind="deal"
            items={deals}
            loading={dealsLoading}
            onSeeAll={() => navigation.navigate('CrmHub', { initialMode: 'deals' })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  greeting: { color: Colors.text, fontSize: 24, fontWeight: '900' },
  date: { color: Colors.textMuted, fontSize: 13, marginTop: 3 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.red,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sumItem: { flex: 1, alignItems: 'center' },
  sumValue: { fontSize: 26, fontWeight: '900' },
  sumLabel: { color: Colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600' },
  sumDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  quickRow: { paddingHorizontal: 16, marginTop: 14, gap: 10 },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickBody: { flex: 1 },
  quickTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  quickSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '900' },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  sectionOverdue: { color: Colors.red, fontSize: 12, fontWeight: '800', marginLeft: 2 },
  seeAll: { fontSize: 13, fontWeight: '800' },
  empty: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', marginVertical: 14 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  kindIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardCode: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', flex: 1 },
  overduePill: {
    backgroundColor: Colors.redSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  overdueTxt: { color: Colors.red, fontSize: 10, fontWeight: '800' },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  cardMeta: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.textFaint, marginHorizontal: 2 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.pill, flexShrink: 1 },
  statusTxt: { fontSize: 11, fontWeight: '800' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueTxt: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  showMoreBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, marginTop: 2, marginBottom: 6 },
  showMoreTxt: { fontSize: 13, fontWeight: '800' },
  errBox: { alignItems: 'center', gap: 12, padding: 32, marginTop: 20 },
  errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: Radii.md,
    backgroundColor: Colors.blue,
  },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
