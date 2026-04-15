import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { CrmLeadListItem } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVND, formatDate, calculateDays, stageTintBg } from '../lib/formatUtils';
import CreateCrmEntityModal from '../components/CreateCrmEntityModal';

type Nav = NativeStackNavigationProp<CrmStackParamList, 'LeadList'>;

type Props = { navigation: Nav };

function LeadCard({
  item,
  onPress,
}: {
  item: CrmLeadListItem;
  onPress: () => void;
}) {
  const stageColor = item.stage?.color || '#94a3b8';
  const days = calculateDays(item.created_at);
  const dayStyle =
    days > 30 ? styles.daysHot : days > 14 ? styles.daysWarm : styles.daysCool;
  const owner = item.assignee?.full_name || item.lead_owner?.full_name;

  return (
    <TouchableOpacity
      style={[styles.card, CrmShadow.card]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardCode}>{item.code || '—'}</Text>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title || '—'}
            </Text>
            {item.is_new_for_current_user ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeTxt}>MỚI</Text>
              </View>
            ) : null}
          </View>
          {item.customer?.full_name ? (
            <Text style={styles.cardCustomer} numberOfLines={1}>
              {item.customer.full_name}
            </Text>
          ) : null}
          {item.customer?.phone ? (
            <Text style={styles.cardPhone} numberOfLines={1}>
              📞 {item.customer.phone}
            </Text>
          ) : null}
        </View>
        {item.stage?.name ? (
          <View style={[styles.stagePill, { backgroundColor: stageTintBg(stageColor) }]}>
            <Text style={[styles.stagePillTxt, { color: stageColor }]} numberOfLines={2}>
              {(item.stage.icon ? `${item.stage.icon} ` : '') + item.stage.name}
            </Text>
          </View>
        ) : null}
      </View>
      {item.estimated_value != null && item.estimated_value > 0 ? (
        <Text style={styles.cardValue}>{formatVND(item.estimated_value)}</Text>
      ) : null}
      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaTxt} numberOfLines={1}>
          {owner ? `🤝 ${owner}` : ' '}
        </Text>
        <Text style={styles.cardMetaTxt} numberOfLines={1}>
          {item.source?.icon || item.source?.name
            ? `${item.source?.icon || ''} ${item.source?.name || ''}`.trim()
            : '—'}
        </Text>
        <Text style={styles.cardMetaTxt}>{formatDate(item.created_at)}</Text>
        <Text style={dayStyle}>{days} ngày</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LeadListScreen({ navigation }: Props) {
  const [createMode, setCreateMode] = useState<'lead' | 'deal' | null>(null);
  const [tab, setTab] = useState<'lead' | 'deal'>('lead');
  const [draftQ, setDraftQ] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const appliedSearchRef = useRef('');
  appliedSearchRef.current = appliedSearch;
  const [items, setItems] = useState<CrmLeadListItem[]>([]);
  const [totalServer, setTotalServer] = useState(0);
  const [counts, setCounts] = useState<{ lead: number; deal: number }>({ lead: 0, deal: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  const fetchLeads = useCallback(
    async (startOffset: number, append: boolean, search: string) => {
      const { data } = await api.get('/crm/leads', {
        params: {
          type: tab,
          limit: 30,
          offset: startOffset,
          ...(search ? { search } : {}),
        },
      });
      const list = (data.data || []) as CrmLeadListItem[];
      const total = typeof data.total === 'number' ? data.total : list.length;
      if (append) setItems((prev) => [...prev, ...list]);
      else {
        setItems(list);
        setTotalServer(total);
        setCounts((c) => ({ ...c, [tab]: total }));
      }
      const hm = Boolean(data.hasMore);
      const next = (data.nextOffset as number) ?? startOffset + list.length;
      hasMoreRef.current = hm;
      nextOffsetRef.current = next;
    },
    [tab],
  );

  const loadInitial = useCallback(async () => {
    const search = appliedSearchRef.current;
    setLoading(true);
    nextOffsetRef.current = 0;
    hasMoreRef.current = true;
    try {
      await fetchLeads(0, false, search);
    } finally {
      setLoading(false);
    }
  }, [fetchLeads]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  const onEnd = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      await fetchLeads(nextOffsetRef.current, true, appliedSearchRef.current);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchLeads, loadingMore, loading]);

  const searchSubmit = useCallback(() => {
    const s = draftQ.trim();
    appliedSearchRef.current = s;
    setAppliedSearch(s);
    void loadInitial();
  }, [draftQ, loadInitial]);

  const sumLoadedValue = items.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0);

  const listHeader = (
    <View style={styles.headerBlock}>
      <Text style={styles.kicker}>CRM / Quản lý khách hàng</Text>
      <Text style={styles.h1}>{tab === 'lead' ? '💼 Quản lý Leads' : '🎯 Quản lý Deals'}</Text>

      <View style={styles.addRow}>
        <TouchableOpacity style={styles.addLeadBtn} onPress={() => setCreateMode('lead')} activeOpacity={0.85}>
          <Text style={styles.addLeadTxt}>+ Thêm Lead</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addDealBtn} onPress={() => setCreateMode('deal')} activeOpacity={0.85}>
          <Text style={styles.addDealTxt}>+ Thêm Deal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.pillWrap}>
        <View style={styles.pillOuter}>
          <TouchableOpacity
            onPress={() => setTab('lead')}
            style={[styles.pillBtn, tab === 'lead' && styles.pillBtnOnLead]}
            activeOpacity={0.85}
          >
            <Text style={[styles.pillTxt, tab === 'lead' && styles.pillTxtOnLead]}>
              💼 Leads ({counts.lead || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('deal')}
            style={[styles.pillBtn, tab === 'deal' && styles.pillBtnOnDeal]}
            activeOpacity={0.85}
          >
            <Text style={[styles.pillTxt, tab === 'deal' && styles.pillTxtOnDeal]}>
              🎯 Deals ({counts.deal || 0})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm nhanh: tên, SĐT, mã, mô tả, người phụ trách..."
          placeholderTextColor={CrmColors.gray400}
          value={draftQ}
          onChangeText={setDraftQ}
          onSubmitEditing={searchSubmit}
          returnKeyType="search"
        />
        {draftQ.length > 0 ? (
          <TouchableOpacity onPress={() => setDraftQ('')} style={styles.searchClear}>
            <Text style={styles.searchClearTxt}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity style={styles.searchGo} onPress={searchSubmit} activeOpacity={0.85}>
        <Text style={styles.searchGoTxt}>Tìm</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <CreateCrmEntityModal
        visible={createMode !== null}
        mode={(createMode === 'deal' ? 'deal' : 'lead') as 'lead' | 'deal'}
        onClose={() => setCreateMode(null)}
        onCreated={() => {
          void loadInitial();
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <LeadCard item={item} onPress={() => navigation.navigate('LeadDetail', { id: item.id })} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
        }
        onEndReached={onEnd}
        onEndReachedThreshold={0.35}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>Không có dữ liệu</Text>
          )
        }
        ListFooterComponent={
          <View>
            {loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={CrmColors.blue600} />
            ) : null}
            {!loading && items.length > 0 ? (
              <View style={styles.tableFooter}>
                <Text style={styles.tableFooterTxt}>
                  Tổng: {totalServer} {tab === 'deal' ? 'deal' : 'lead'}
                </Text>
                <Text style={styles.tableFooterTxt}>
                  GT: {sumLoadedValue > 0 ? formatVND(sumLoadedValue) : '0đ'}
                </Text>
              </View>
            ) : null}
          </View>
        }
      />
      {loading && items.length === 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={CrmColors.blue600} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  listContent: { paddingBottom: 24 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CrmColors.pageBg,
  },
  headerBlock: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    color: CrmColors.gray500,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  h1: { fontSize: 26, fontWeight: '700', color: CrmColors.gray900, marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  addLeadBtn: {
    flex: 1,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  addLeadTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 13 },
  addDealBtn: {
    flex: 1,
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  addDealTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 13 },
  pillWrap: { marginBottom: 14 },
  pillOuter: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.gray200,
    borderRadius: CrmRadii.full,
    padding: 4,
    gap: 4,
  },
  pillBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: CrmRadii.full,
  },
  pillBtnOnLead: {
    backgroundColor: CrmColors.white,
    ...CrmShadow.sm,
  },
  pillBtnOnDeal: {
    backgroundColor: CrmColors.white,
    ...CrmShadow.sm,
  },
  pillTxt: { fontSize: 13, fontWeight: '600', color: CrmColors.gray600 },
  pillTxtOnLead: { color: CrmColors.blue600 },
  pillTxtOnDeal: { color: CrmColors.emerald600 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.xl,
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 46,
    ...CrmShadow.card,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: CrmColors.gray900, paddingVertical: 10 },
  searchClear: { padding: 8 },
  searchClearTxt: { color: CrmColors.gray400, fontSize: 14 },
  searchGo: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  searchGoTxt: { color: CrmColors.white, fontWeight: '600', fontSize: 14 },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardLeft: { flex: 1, minWidth: 0 },
  cardCode: { fontSize: 12, fontWeight: '600', color: CrmColors.blue600 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  newBadge: {
    backgroundColor: CrmColors.rose500,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeTxt: { fontSize: 9, fontWeight: '800', color: CrmColors.white },
  cardCustomer: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  cardPhone: { fontSize: 11, color: CrmColors.emerald600, marginTop: 2 },
  stagePill: {
    maxWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: CrmRadii.full,
    alignSelf: 'flex-start',
  },
  stagePillTxt: { fontSize: 11, fontWeight: '600' },
  cardValue: { fontSize: 12, fontWeight: '700', color: CrmColors.gray900, marginTop: 10 },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
    alignItems: 'center',
  },
  cardMetaTxt: { fontSize: 11, color: CrmColors.gray500, flexShrink: 1 },
  daysCool: { fontSize: 11, color: CrmColors.gray500 },
  daysWarm: { fontSize: 11, color: CrmColors.amber600, fontWeight: '600' },
  daysHot: { fontSize: 11, color: CrmColors.red700, fontWeight: '700' },
  empty: { textAlign: 'center', color: CrmColors.gray400, paddingVertical: 40, fontSize: 14 },
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CrmColors.gray50,
    borderBottomLeftRadius: CrmRadii.xl,
    borderBottomRightRadius: CrmRadii.xl,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: CrmColors.gray200,
  },
  tableFooterTxt: { fontSize: 12, color: CrmColors.gray500, fontWeight: '500' },
});
