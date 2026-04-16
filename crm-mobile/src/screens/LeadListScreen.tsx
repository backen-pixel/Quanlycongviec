import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canAssigneeFilterDeals, canAssigneeFilterLeads } from '../lib/crmMobilePrefs';
import type { CrmLeadListItem } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVND, formatDate, calculateDays, stageTintBg } from '../lib/formatUtils';
import CreateCrmEntityModal from '../components/CreateCrmEntityModal';
import {
  loadCrmMobilePipelineSnapshot,
  saveCrmMobilePipelineSnapshot,
  type CrmMobilePipelineSnapshot,
} from '../lib/crmPipelineStorageMobile';
import {
  buildSmartSourceOptions,
  filterPipelineItemsWebLike,
  type CrmPipelineClientFilters,
  type FbPageRow,
} from '../lib/crmPipelineFiltersWeb';
import CrmLeadListAdvancedFiltersModal from '../components/CrmLeadListAdvancedFiltersModal';
import { openMoreTab } from '../navigation/openMoreTab';
import {
  CrmPipelineKanbanView,
  CrmPipelinePlannerView,
  CrmPipelineCalendarView,
} from '../components/CrmPipelineViewModes';
import CrmAutoPipelineStrip from '../components/CrmAutoPipelineStrip';

type Nav = NativeStackNavigationProp<CrmStackParamList, 'LeadList'>;

type Props = { navigation: Nav };

type PickerUser = { id: string; full_name?: string | null; email?: string | null };

type CompanyRow = { id: string; name?: string | null };
type StageRow = {
  id: string;
  name?: string | null;
  icon?: string | null;
  color?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
};
type SourceRow = { id: string; name?: string | null; icon?: string | null };

async function fetchAllCrmLeadsChunked(
  type: 'lead' | 'deal',
  snapshot: CrmMobilePipelineSnapshot,
  sendAssignedTo: boolean,
): Promise<CrmLeadListItem[]> {
  const dateParams: Record<string, string> = {};
  if (snapshot.customDateFrom) dateParams.date_from = snapshot.customDateFrom;
  if (snapshot.customDateTo) dateParams.date_to = snapshot.customDateTo;

  const common: Record<string, string | number> = { type, ...dateParams };
  if (snapshot.filterPhone) common.phone_filter = snapshot.filterPhone;
  if (sendAssignedTo && snapshot.filterAssignee) common.assigned_to = snapshot.filterAssignee;
  const stageId =
    type === 'lead' ? String(snapshot.filterStageLead || '').trim() : String(snapshot.filterStageDeal || '').trim();
  if (stageId) common.stage_id = stageId;

  const chunk = 500;
  let offset = 0;
  const out: CrmLeadListItem[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const { data } = await api.get('/crm/leads', { params: { ...common, limit: chunk, offset } });
    const payload = data ?? {};
    const page = (Array.isArray(payload) ? payload : payload.data || []) as CrmLeadListItem[];
    out.push(...page);
    if (page.length === 0) break;
    const totalKnown = typeof payload.total === 'number' ? payload.total : null;
    const nextOffset =
      typeof payload.nextOffset === 'number' ? payload.nextOffset : offset + page.length;
    const hasMore =
      typeof payload.hasMore === 'boolean'
        ? payload.hasMore
        : totalKnown != null
          ? nextOffset < totalKnown
          : page.length >= chunk;
    if (!hasMore) break;
    offset = nextOffset;
  }
  return out;
}

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
  const { user } = useAuth();
  const [createMode, setCreateMode] = useState<'lead' | 'deal' | null>(null);
  const [tab, setTab] = useState<'lead' | 'deal'>('lead');
  const [snapshot, setSnapshot] = useState<CrmMobilePipelineSnapshot | null>(null);
  const [draftQ, setDraftQ] = useState('');
  const [rawLead, setRawLead] = useState<CrmLeadListItem[]>([]);
  const [rawDeal, setRawDeal] = useState<CrmLeadListItem[]>([]);
  const [fbLead, setFbLead] = useState<Set<string>>(() => new Set());
  const [fbDeal, setFbDeal] = useState<Set<string>>(() => new Set());
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [stagesLead, setStagesLead] = useState<StageRow[]>([]);
  const [stagesDeal, setStagesDeal] = useState<StageRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [fbPages, setFbPages] = useState<FbPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [advOpen, setAdvOpen] = useState(false);
  const [assigneeModal, setAssigneeModal] = useState(false);
  const [pickerUsers, setPickerUsers] = useState<PickerUser[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const canPickLead = canAssigneeFilterLeads(user?.role);
  const canPickDeal = canAssigneeFilterDeals(user?.role);
  const canPickAssignee = tab === 'lead' ? canPickLead : canPickDeal;

  const snapshotRef = useRef<CrmMobilePipelineSnapshot | null>(null);
  snapshotRef.current = snapshot;

  const apiKey =
    snapshot != null
      ? [
          snapshot.customDateFrom,
          snapshot.customDateTo,
          snapshot.filterPhone,
          snapshot.filterAssignee,
          snapshot.filterStageLead,
          snapshot.filterStageDeal,
          user?.role ?? '',
          refreshNonce,
        ].join('|')
      : '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadCrmMobilePipelineSnapshot();
      if (cancelled) return;
      setSnapshot(s);
      setDraftQ(s.searchText || '');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commitSnapshot = useCallback(async (next: CrmMobilePipelineSnapshot) => {
    setSnapshot(next);
    await saveCrmMobilePipelineSnapshot(next);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [co, sl, sd, src] = await Promise.all([
        api.get('/companies').catch(() => ({ data: {} })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/sources').catch(() => ({ data: {} })),
      ]);
      const companiesPayload = (co.data as { companies?: CompanyRow[] })?.companies;
      setCompanies(Array.isArray(companiesPayload) ? companiesPayload : []);
      setStagesLead(Array.isArray(sl.data) ? sl.data : []);
      setStagesDeal(Array.isArray(sd.data) ? sd.data : []);
      const d = src.data as { sources?: SourceRow[]; fb_pages?: FbPageRow[] };
      setSources(Array.isArray(d?.sources) ? d.sources : []);
      setFbPages(Array.isArray(d?.fb_pages) ? d.fb_pages : []);
    } catch {
      setCompanies([]);
      setStagesLead([]);
      setStagesDeal([]);
      setSources([]);
      setFbPages([]);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (snapshot == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = snapshotRef.current!;
        const assignParam =
          (canAssigneeFilterLeads(user?.role) || canAssigneeFilterDeals(user?.role)) && !!snap.filterAssignee;
        const [leads, deals] = await Promise.all([
          fetchAllCrmLeadsChunked('lead', snap, assignParam),
          fetchAllCrmLeadsChunked('deal', snap, assignParam),
        ]);
        if (!cancelled) {
          setRawLead(leads);
          setRawDeal(deals);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, user?.role]);

  const fbKey = snapshot?.filterSource ?? '';
  useEffect(() => {
    const src = snapshotRef.current?.filterSource || '';
    if (!src.startsWith('fbp:')) {
      setFbLead(new Set());
      setFbDeal(new Set());
      return;
    }
    let cancelled = false;
    const pageId = src.replace(/^fbp:/, '');
    (async () => {
      const [rL, rD] = await Promise.all([
        api.get('/crm/leads-by-fb-page', { params: { page_id: pageId, type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/leads-by-fb-page', { params: { page_id: pageId, type: 'deal' } }).catch(() => ({ data: [] })),
      ]);
      if (cancelled) return;
      const lrows = (rL.data || []) as { id: string }[];
      const drows = (rD.data || []) as { id: string }[];
      setFbLead(new Set(lrows.map((x) => String(x.id))));
      setFbDeal(new Set(drows.map((x) => String(x.id))));
    })();
    return () => {
      cancelled = true;
    };
  }, [fbKey]);

  const clientBase: Omit<CrmPipelineClientFilters, 'filterStage'> | null = useMemo(() => {
    if (!snapshot) return null;
    return {
      searchText: snapshot.searchText || '',
      filterCompany: snapshot.filterCompany || '',
      filterAssignee: canPickLead || canPickDeal ? snapshot.filterAssignee || '' : '',
      filterAssigneeName: snapshot.filterAssigneeName || '',
      filterSource: snapshot.filterSource || '',
      filterPhone: snapshot.filterPhone || '',
    };
  }, [snapshot, canPickLead, canPickDeal]);

  const filteredLead = useMemo(() => {
    if (!clientBase) return [];
    const f: CrmPipelineClientFilters = { ...clientBase, filterStage: snapshot?.filterStageLead || '' };
    return filterPipelineItemsWebLike(rawLead, f, fbLead);
  }, [rawLead, clientBase, fbLead, snapshot?.filterStageLead]);

  const filteredDeal = useMemo(() => {
    if (!clientBase) return [];
    const f: CrmPipelineClientFilters = { ...clientBase, filterStage: snapshot?.filterStageDeal || '' };
    return filterPipelineItemsWebLike(rawDeal, f, fbDeal);
  }, [rawDeal, clientBase, fbDeal, snapshot?.filterStageDeal]);

  const items = tab === 'lead' ? filteredLead : filteredDeal;

  const sourceOptions = useMemo(
    () => buildSmartSourceOptions(sources, fbPages, rawLead, rawDeal),
    [sources, fbPages, rawLead, rawDeal],
  );

  const advFilterCount = useMemo(() => {
    if (!snapshot) return 0;
    return [
      snapshot.timePreset,
      snapshot.filterAssignee,
      snapshot.filterAssigneeName,
      snapshot.filterCompany,
      snapshot.filterSource,
      snapshot.filterStageLead,
      snapshot.filterStageDeal,
      snapshot.filterPhone,
    ].filter(Boolean).length;
  }, [snapshot]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMeta();
      setRefreshNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [loadMeta]);

  const handleKanbanMove = useCallback(async (itemId: string, stageId: string) => {
    try {
      await api.patch(`/crm/leads/${itemId}/stage`, { stage_id: stageId });
      setRefreshNonce((n) => n + 1);
    } catch (e: unknown) {
      const body = (e as { response?: { data?: { error?: string; requires_conversion?: boolean } } })?.response
        ?.data;
      const msg = body?.error || 'Không chuyển được giai đoạn.';
      Alert.alert('Kanban', msg);
      throw e;
    }
  }, []);

  const searchSubmit = useCallback(() => {
    if (!snapshot) return;
    const s = draftQ.trim();
    const next = { ...snapshot, searchText: s };
    void commitSnapshot(next);
  }, [draftQ, snapshot, commitSnapshot]);

  const ensurePickerUsers = useCallback(async () => {
    if (pickerUsers.length) return;
    setPickerLoading(true);
    try {
      const { data } = await api.get<{ users?: PickerUser[] }>('/users');
      setPickerUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      setPickerUsers([]);
    } finally {
      setPickerLoading(false);
    }
  }, [pickerUsers.length]);

  const openAssigneeModal = async () => {
    setAssigneeModal(true);
    await ensurePickerUsers();
  };

  useEffect(() => {
    if (advOpen) void ensurePickerUsers();
  }, [advOpen, ensurePickerUsers]);

  const setPhoneQuick = (mode: '' | 'has_phone' | 'no_phone') => {
    if (!snapshot) return;
    void commitSnapshot({ ...snapshot, filterPhone: mode });
  };

  const sumLoadedValue = items.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => openMoreTab(navigation, 'CrmEvents', {})} hitSlop={12}>
            <Text style={styles.headerIconTxt}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openMoreTab(navigation, 'FacebookInbox')} hitSlop={12}>
            <Text style={styles.headerIconTxt}>📘</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  if (!snapshot) {
    return (
      <View style={[styles.screen, styles.loadingOverlay]}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  const listHeader = (
    <View style={styles.headerBlock}>
      <Text style={styles.kicker}>CRM / Quản lý khách hàng</Text>
      <Text style={styles.h1}>{tab === 'lead' ? '💼 Quản lý Leads' : '🎯 Quản lý Deals'}</Text>

      <CrmAutoPipelineStrip onPress={() => openMoreTab(navigation, 'AutoPipelineStatus')} />

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
              💼 Leads ({filteredLead.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('deal')}
            style={[styles.pillBtn, tab === 'deal' && styles.pillBtnOnDeal]}
            activeOpacity={0.85}
          >
            <Text style={[styles.pillTxt, tab === 'deal' && styles.pillTxtOnDeal]}>
              🎯 Deals ({filteredDeal.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.filterLabel}>Hiển thị (giống web CRM)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScrollPad}>
        {(['list', 'kanban', 'planner', 'calendar'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.vmChip, snapshot.viewMode === m && styles.vmChipOn]}
            onPress={() => void commitSnapshot({ ...snapshot, viewMode: m })}
            activeOpacity={0.85}
          >
            <Text style={[styles.vmChipTxt, snapshot.viewMode === m && styles.vmChipTxtOn]}>
              {m === 'list' ? 'Danh sách' : m === 'kanban' ? 'Kanban' : m === 'planner' ? 'Planner' : 'Lịch'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.filterLabel}>Giai đoạn ({tab === 'lead' ? 'Lead' : 'Deal'} — lọc API + danh sách)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScrollPad}>
        <TouchableOpacity
          style={[styles.chip, (tab === 'lead' ? !snapshot.filterStageLead : !snapshot.filterStageDeal) && styles.chipOn]}
          onPress={() =>
            void commitSnapshot(
              tab === 'lead' ? { ...snapshot, filterStageLead: '' } : { ...snapshot, filterStageDeal: '' },
            )
          }
        >
          <Text
            style={[
              styles.chipTxt,
              (tab === 'lead' ? !snapshot.filterStageLead : !snapshot.filterStageDeal) && styles.chipTxtOn,
            ]}
          >
            Tất cả
          </Text>
        </TouchableOpacity>
        {(tab === 'lead' ? stagesLead : stagesDeal).map((s) => {
          const active = tab === 'lead' ? snapshot.filterStageLead === s.id : snapshot.filterStageDeal === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, active && styles.chipOn]}
              onPress={() =>
                void commitSnapshot(
                  tab === 'lead' ? { ...snapshot, filterStageLead: s.id } : { ...snapshot, filterStageDeal: s.id },
                )
              }
            >
              <Text style={[styles.chipTxt, active && styles.chipTxtOn]} numberOfLines={1}>
                {(s.icon ? `${s.icon} ` : '') + (s.name || '—')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.filterAdvBtn} onPress={() => setAdvOpen(true)} activeOpacity={0.85}>
        <Text style={styles.filterAdvBtnTxt}>Bộ lọc (giống web)</Text>
        {advFilterCount > 0 ? (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeTxt}>{advFilterCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Text style={styles.filterLabel}>Số điện thoại (API)</Text>
      <View style={styles.chipRow}>
        {(
          [
            ['has_phone', 'Có SĐT'],
            ['', 'Tất cả'],
            ['no_phone', 'Chưa có SĐT'],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key || 'all'}
            style={[styles.chip, snapshot.filterPhone === key && styles.chipOn]}
            onPress={() => setPhoneQuick(key)}
          >
            <Text style={[styles.chipTxt, snapshot.filterPhone === key && styles.chipTxtOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {canPickAssignee ? (
        <>
          <Text style={styles.filterLabel}>Nhân viên phụ trách (chỉ quản trị / lãnh đạo)</Text>
          <TouchableOpacity style={styles.assigneeBtn} onPress={() => void openAssigneeModal()} activeOpacity={0.85}>
            <Text style={styles.assigneeBtnTxt}>
              {snapshot.filterAssignee
                ? pickerUsers.find((u) => u.id === snapshot.filterAssignee)?.full_name ||
                  pickerUsers.find((u) => u.id === snapshot.filterAssignee)?.email ||
                  'Đã chọn'
                : 'Tất cả nhân viên'}
            </Text>
            <Text style={styles.assigneeBtnChev}>▾</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.filterHint}>Bạn chỉ thấy {tab === 'deal' ? 'deal' : 'lead'} được giao cho mình.</Text>
      )}

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

  const listBody =
    snapshot.viewMode === 'list' ? (
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
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? null : <Text style={styles.empty}>Không có dữ liệu</Text>}
        ListFooterComponent={
          !loading && items.length > 0 ? (
            <View style={styles.tableFooter}>
              <Text style={styles.tableFooterTxt}>
                Hiển thị: {items.length} {tab === 'deal' ? 'deal' : 'lead'} (sau lọc giống web)
              </Text>
              <Text style={styles.tableFooterTxt}>
                GT: {sumLoadedValue > 0 ? formatVND(sumLoadedValue) : '0đ'}
              </Text>
            </View>
          ) : null
        }
      />
    ) : (
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
        }
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
      >
        {listHeader}
        {snapshot.viewMode === 'kanban' ? (
          <CrmPipelineKanbanView
            items={items}
            stages={tab === 'lead' ? stagesLead : stagesDeal}
            navigation={navigation}
            tabLabel={tab === 'lead' ? 'Lead' : 'Deal'}
            pipelineKind={tab}
            onMoveToStage={handleKanbanMove}
          />
        ) : snapshot.viewMode === 'planner' ? (
          <CrmPipelinePlannerView items={items} navigation={navigation} />
        ) : (
          <CrmPipelineCalendarView
            items={items}
            navigation={navigation}
            onPickDay={(dateKey) => openMoreTab(navigation, 'CrmEvents', { initialDate: dateKey })}
          />
        )}
        {!loading && items.length === 0 ? <Text style={styles.empty}>Không có dữ liệu</Text> : null}
        {!loading && items.length > 0 ? (
          <View style={styles.tableFooter}>
            <Text style={styles.tableFooterTxt}>
              Hiển thị: {items.length} {tab === 'deal' ? 'deal' : 'lead'}
            </Text>
            <Text style={styles.tableFooterTxt}>
              GT: {sumLoadedValue > 0 ? formatVND(sumLoadedValue) : '0đ'}
            </Text>
          </View>
        ) : null}
        {loading && items.length === 0 ? (
          <View style={styles.altLoading}>
            <ActivityIndicator size="large" color={CrmColors.blue600} />
          </View>
        ) : null}
      </ScrollView>
    );

  return (
    <View style={styles.screen}>
      <CreateCrmEntityModal
        visible={createMode !== null}
        mode={(createMode === 'deal' ? 'deal' : 'lead') as 'lead' | 'deal'}
        onClose={() => setCreateMode(null)}
        onCreated={() => {
          setRefreshNonce((n) => n + 1);
        }}
      />
      <CrmLeadListAdvancedFiltersModal
        visible={advOpen}
        onClose={() => setAdvOpen(false)}
        tab={tab}
        initial={snapshot}
        companies={companies}
        stages={tab === 'lead' ? stagesLead : stagesDeal}
        sourceOptions={sourceOptions}
        canPickAssignee={canPickAssignee}
        users={pickerUsers}
        usersLoading={pickerLoading && pickerUsers.length === 0}
        onApply={(next) => {
          void commitSnapshot({ ...next, searchText: snapshot.searchText });
          setDraftQ(next.searchText || '');
        }}
      />
      {listBody}
      {snapshot.viewMode === 'list' && loading && items.length === 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={CrmColors.blue600} />
        </View>
      ) : null}

      <Modal visible={assigneeModal} animationType="slide" transparent onRequestClose={() => setAssigneeModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssigneeModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Lọc theo nhân viên</Text>
            <Text style={styles.modalSub}>Chỉ tài khoản có quyền xem toàn bộ CRM mới dùng được.</Text>
            <TouchableOpacity
              style={styles.modalRow}
              onPress={() => {
                void commitSnapshot({ ...snapshot, filterAssignee: '' });
                setAssigneeModal(false);
              }}
            >
              <Text style={styles.modalRowTxt}>Tất cả nhân viên</Text>
            </TouchableOpacity>
            {pickerLoading ? <ActivityIndicator style={{ marginVertical: 16 }} color={CrmColors.blue600} /> : null}
            <FlatList
              data={pickerUsers}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    void commitSnapshot({ ...snapshot, filterAssignee: u.id });
                    setAssigneeModal(false);
                  }}
                >
                  <Text style={styles.modalRowTxt}>{u.full_name || u.email || u.id}</Text>
                  {u.email && u.full_name ? <Text style={styles.modalRowEmail}>{u.email}</Text> : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setAssigneeModal(false)}>
              <Text style={styles.modalCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  filterAdvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue50,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  filterAdvBtnTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700 },
  filterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeTxt: { color: CrmColors.white, fontSize: 11, fontWeight: '800' },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: CrmColors.gray600,
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipOn: {
    backgroundColor: CrmColors.blue50,
    borderColor: CrmColors.blue600,
  },
  chipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  chipTxtOn: { color: CrmColors.blue700 },
  assigneeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    ...CrmShadow.sm,
  },
  assigneeBtnTxt: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900, flex: 1 },
  assigneeBtnChev: { fontSize: 14, color: CrmColors.gray400 },
  filterHint: { fontSize: 12, color: CrmColors.gray500, marginBottom: 12, lineHeight: 17 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  modalSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 6, marginBottom: 12 },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  modalRowTxt: { fontSize: 15, fontWeight: '600', color: CrmColors.gray900 },
  modalRowEmail: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  modalClose: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  modalCloseTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.blue600 },
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
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingRight: 8 },
  headerIconTxt: { fontSize: 20 },
  hScrollPad: { marginBottom: 10 },
  vmChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 8,
  },
  vmChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  vmChipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  vmChipTxtOn: { color: CrmColors.blue700 },
  altLoading: { paddingVertical: 48, alignItems: 'center' },
});
