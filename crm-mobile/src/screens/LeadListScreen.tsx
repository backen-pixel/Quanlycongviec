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
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { canAssigneeFilterDeals, canAssigneeFilterLeads } from '../lib/crmMobilePrefs';
import type { CrmLeadListItem } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmShadow } from '../theme/crmTheme';
import { formatVND, formatDate, calculateDays, stageTintBg } from '../lib/formatUtils';
import CreateCrmEntityModal from '../components/CreateCrmEntityModal';
import { setLeadPin, setLeadInteracted } from '../lib/crmLeadFlags';
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

const HERO_GRADIENT: readonly [string, string, string] = ['#1E40AF', '#4F46E5', '#7C3AED'];

/**
 * Cap an toàn để chống đơ:
 *  - chunk = 500 (giữ nguyên: cân bằng round-trip / payload)
 *  - hardLimit = 30 vòng = 15.000 bản ghi/tab — đủ dùng cho 99% công ty;
 *    quá ngưỡng này user nên dùng bộ lọc / chuyển sang xem theo stage.
 */
const FETCH_CHUNK = 500;
const FETCH_MAX_LOOPS = 30;

async function fetchAllCrmLeadsChunked(
  type: 'lead' | 'deal',
  snapshot: CrmMobilePipelineSnapshot,
  sendAssignedTo: boolean,
  signal?: AbortSignal,
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

  let offset = 0;
  const out: CrmLeadListItem[] = [];
  for (let guard = 0; guard < FETCH_MAX_LOOPS; guard++) {
    if (signal?.aborted) break;
    const { data } = await api.get('/crm/leads', {
      params: { ...common, limit: FETCH_CHUNK, offset },
      signal,
    });
    if (signal?.aborted) break;
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
          : page.length >= FETCH_CHUNK;
    if (!hasMore) break;
    offset = nextOffset;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Lead card                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `React.memo` để chỉ re-render khi item thật sự đổi (không phụ thuộc parent).
 * `onPressItem`/`onLongPressItem` là callback ID-based (stable từ cha) → mỗi
 * lần parent re-render, card sẽ không phải tạo lại closure nội bộ.
 */
const LeadCard = React.memo(LeadCardInner);

function LeadCardInner({
  item,
  onPressItem,
  onLongPressItem,
}: {
  item: CrmLeadListItem;
  onPressItem: (id: string) => void;
  onLongPressItem: (item: CrmLeadListItem) => void;
}) {
  const onPress = useCallback(() => onPressItem(item.id), [onPressItem, item.id]);
  const onLongPress = useCallback(() => onLongPressItem(item), [onLongPressItem, item]);
  const stageColor = item.stage?.color || '#94a3b8';
  const days = calculateDays(item.created_at);
  const dayStyle =
    days > 30
      ? { bg: styles.daysPillHot, txt: styles.daysHotTxt }
      : days > 14
        ? { bg: styles.daysPillWarm, txt: styles.daysWarmTxt }
        : { bg: styles.daysPillCool, txt: styles.daysCoolTxt };
  const owner = item.assignee?.full_name || item.lead_owner?.full_name;

  return (
    <TouchableOpacity
      style={[styles.card, CrmShadow.card, item.is_pinned ? styles.cardPinned : null]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.78}
    >
      {/* Stage stripe ở mép trái — nổi bật giai đoạn */}
      <View style={[styles.cardStripe, { backgroundColor: stageColor }]} />

      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <View style={styles.codeRow}>
            <View style={styles.codePill}>
              <Text style={styles.cardCode}>{item.code || '—'}</Text>
            </View>
            {item.is_pinned ? (
              <View style={styles.pinChip}>
                <Ionicons name="bookmark" size={11} color="#b45309" />
              </View>
            ) : null}
            {item.is_interacted ? (
              <View style={styles.tickChip}>
                <Ionicons name="checkmark-circle" size={11} color={CrmColors.emerald600} />
              </View>
            ) : null}
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title || '—'}
            </Text>
          </View>
          {item.customer?.full_name ? (
            <Text style={styles.cardCustomer} numberOfLines={1}>
              {item.customer.full_name}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardRight}>
          {item.is_new_for_current_user ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeTxt}>MỚI</Text>
            </View>
          ) : null}
          {item.stage?.name ? (
            <View style={[styles.stagePill, { backgroundColor: stageTintBg(stageColor), borderColor: stageColor }]}>
              <Text style={[styles.stagePillTxt, { color: stageColor }]} numberOfLines={2}>
                {(item.stage.icon ? `${item.stage.icon} ` : '') + item.stage.name}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Highlighted info chips: phone + owner */}
      {(item.customer?.phone || owner) ? (
        <View style={styles.highlightRow}>
          {item.customer?.phone ? (
            <View style={[styles.highlightChip, styles.highlightChipPhone]}>
              <Ionicons name="call" size={13} color={CrmColors.emerald700} />
              <Text style={styles.highlightChipPhoneTxt} numberOfLines={1}>
                {item.customer.phone}
              </Text>
            </View>
          ) : null}
          {owner ? (
            <View style={[styles.highlightChip, styles.highlightChipOwner]}>
              <Ionicons name="person-circle" size={14} color={CrmColors.blue700} />
              <Text style={styles.highlightChipOwnerTxt} numberOfLines={1}>
                {owner}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {item.estimated_value != null && item.estimated_value > 0 ? (
        <View style={styles.valueBlock}>
          <Ionicons name="cash" size={14} color={CrmColors.emerald700} />
          <Text style={styles.cardValueTxt}>{formatVND(item.estimated_value)}</Text>
        </View>
      ) : null}

      <View style={styles.cardFooterRow}>
        <View style={styles.metaInline}>
          <Ionicons name="calendar-outline" size={12} color={CrmColors.gray500} />
          <Text style={styles.cardMetaTxt}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={[styles.daysPill, dayStyle.bg]}>
          <Text style={dayStyle.txt}>{days} ngày</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero stat tile                                                             */
/* -------------------------------------------------------------------------- */

function StatTile({
  icon,
  iconColor,
  iconBg,
  value,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  value: string | number;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={[styles.statTile, active && styles.statTileActive]}
    >
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main screen                                                                */
/* -------------------------------------------------------------------------- */

export default function LeadListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
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
  const [flagItem, setFlagItem] = useState<CrmLeadListItem | null>(null);
  const [flagBusy, setFlagBusy] = useState(false);
  const [assigneeModal, setAssigneeModal] = useState(false);
  const [pickerUsers, setPickerUsers] = useState<PickerUser[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

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

  /** Cập nhật snapshot ngay (state), persist xuống AsyncStorage **không chặn**
   *  UI — viết bất đồng bộ trong microtask kế tiếp. */
  const commitSnapshot = useCallback((next: CrmMobilePipelineSnapshot) => {
    setSnapshot(next);
    setTimeout(() => {
      void saveCrmMobilePipelineSnapshot(next);
    }, 0);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const filterCo =
        (snapshotRef.current?.filterCompany && String(snapshotRef.current.filterCompany)) ||
        (user?.company_id ? String(user.company_id) : '');
      const srcParams = filterCo ? { company_id: filterCo } : {};
      const [compRes, sl, sd, src] = await Promise.all([
        api.get('/companies').catch(() => ({ data: {} })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/sources', { params: srcParams }).catch(() => ({ data: {} })),
      ]);
      const companiesPayload = (compRes.data as { companies?: CompanyRow[] })?.companies;
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
  }, [user?.company_id]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta, snapshot?.filterCompany]);

  /**
   * Fetch lead + deal — chống đơ:
   *  1) Tab đang xem load trước → user thấy data ngay, không chờ tab kia.
   *  2) Tab còn lại fetch sau khi tương tác/animation lắng xuống
   *     (InteractionManager) — không block first paint.
   *  3) AbortController hủy request cũ khi params đổi → không nuốt CPU/mạng
   *     cho dữ liệu sắp bị thay thế.
   */
  useEffect(() => {
    if (snapshot == null) return;
    const controller = new AbortController();
    let cancelled = false;
    let secondaryHandle: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    (async () => {
      setLoading(true);
      try {
        const snap = snapshotRef.current!;
        const assignParam =
          (canAssigneeFilterLeads(user?.role) || canAssigneeFilterDeals(user?.role)) && !!snap.filterAssignee;

        const primaryType: 'lead' | 'deal' = tab;
        const secondaryType: 'lead' | 'deal' = tab === 'lead' ? 'deal' : 'lead';
        const setPrimary = primaryType === 'lead' ? setRawLead : setRawDeal;
        const setSecondary = secondaryType === 'lead' ? setRawLead : setRawDeal;

        const primary = await fetchAllCrmLeadsChunked(primaryType, snap, assignParam, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setPrimary(primary);
        setLoading(false);

        secondaryHandle = InteractionManager.runAfterInteractions(() => {
          if (cancelled || controller.signal.aborted) return;
          void (async () => {
            try {
              const secondary = await fetchAllCrmLeadsChunked(
                secondaryType,
                snap,
                assignParam,
                controller.signal,
              );
              if (!cancelled && !controller.signal.aborted) setSecondary(secondary);
            } catch {
              /* ignore: secondary tab — không cần thông báo */
            }
          })();
        });
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== 'CanceledError' && !cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (secondaryHandle && 'cancel' in secondaryHandle) secondaryHandle.cancel();
    };
  }, [apiKey, user?.role, tab]);

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
    const co =
      (snapshotRef.current?.filterCompany && String(snapshotRef.current.filterCompany)) ||
      (user?.company_id ? String(user.company_id) : '');
    (async () => {
      const p = { page_id: pageId, ...(co ? { company_id: co } : {}) };
      const [rL, rD] = await Promise.all([
        api.get('/crm/leads-by-fb-page', { params: { ...p, type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/leads-by-fb-page', { params: { ...p, type: 'deal' } }).catch(() => ({ data: [] })),
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
  }, [fbKey, user?.company_id, snapshot?.filterCompany]);

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

  const rawForTab = tab === 'lead' ? filteredLead : filteredDeal;

  const items = useMemo(() => {
    const arr = rawForTab.slice();
    arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortNewestFirst ? tb - ta : ta - tb;
    });
    arr.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    return arr;
  }, [rawForTab, sortNewestFirst]);

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

  /** Đếm số lead/deal trong từng stage (đã qua lọc client) — hiển thị trên chip. */
  const stageCountsLead = useMemo(() => {
    const m = new Map<string, number>();
    filteredLead.forEach((it) => {
      const id = it.stage?.id || it.stage_id || '';
      if (!id) return;
      m.set(id, (m.get(id) || 0) + 1);
    });
    return m;
  }, [filteredLead]);
  const stageCountsDeal = useMemo(() => {
    const m = new Map<string, number>();
    filteredDeal.forEach((it) => {
      const id = it.stage?.id || it.stage_id || '';
      if (!id) return;
      m.set(id, (m.get(id) || 0) + 1);
    });
    return m;
  }, [filteredDeal]);

  /** Số liệu cho hero. */
  const heroStats = useMemo(() => {
    const newPhones = new Set<string>();
    const owners = new Set<string>();
    rawLead.forEach((l) => {
      if (l.customer?.phone) newPhones.add(l.customer.phone);
      const oid = l.assignee?.id || l.lead_owner?.id;
      if (oid) owners.add(oid);
    });
    rawDeal.forEach((d) => {
      const oid = d.assignee?.id || d.lead_owner?.id;
      if (oid) owners.add(oid);
    });
    return {
      leadCount: filteredLead.length,
      dealCount: filteredDeal.length,
      newPhones: newPhones.size,
      owners: owners.size,
    };
  }, [filteredLead.length, filteredDeal.length, rawLead, rawDeal]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMeta();
      setRefreshNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [loadMeta]);

  /** Callback ID-based — ổn định qua nhiều lần render, kết hợp với React.memo
   *  ở LeadCard giúp FlatList không phải re-render toàn bộ row mỗi khi cha thay
   *  đổi state (vd. typing trong ô tìm kiếm). */
  const onPressLeadItem = useCallback(
    (id: string) => navigation.navigate('LeadDetail', { id }),
    [navigation],
  );
  const onLongPressLeadItem = useCallback((it: CrmLeadListItem) => setFlagItem(it), []);
  const renderLeadItem = useCallback(
    ({ item }: { item: CrmLeadListItem }) => (
      <LeadCard item={item} onPressItem={onPressLeadItem} onLongPressItem={onLongPressLeadItem} />
    ),
    [onPressLeadItem, onLongPressLeadItem],
  );
  const keyExtractor = useCallback((it: CrmLeadListItem) => it.id, []);

  /** Cập nhật optimistic cờ ghim / tương tác trong cả rawLead & rawDeal — đỡ phải refetch. */
  const patchLeadFlagsLocal = useCallback(
    (id: string, patch: Partial<Pick<CrmLeadListItem, 'is_pinned' | 'is_interacted'>>) => {
      const apply = (arr: CrmLeadListItem[]) =>
        arr.map((it) => (it.id === id ? { ...it, ...patch } : it));
      setRawLead((arr) => apply(arr));
      setRawDeal((arr) => apply(arr));
    },
    [],
  );

  const togglePin = useCallback(
    async (it: CrmLeadListItem) => {
      const next = !it.is_pinned;
      setFlagBusy(true);
      patchLeadFlagsLocal(it.id, { is_pinned: next });
      try {
        await setLeadPin(it.id, next);
      } catch (e: unknown) {
        patchLeadFlagsLocal(it.id, { is_pinned: !next });
        Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không cập nhật được ghim');
      } finally {
        setFlagBusy(false);
        setFlagItem(null);
      }
    },
    [patchLeadFlagsLocal],
  );

  const toggleInteracted = useCallback(
    async (it: CrmLeadListItem) => {
      const next = !it.is_interacted;
      setFlagBusy(true);
      patchLeadFlagsLocal(it.id, { is_interacted: next });
      try {
        await setLeadInteracted(it.id, next);
      } catch (e: unknown) {
        patchLeadFlagsLocal(it.id, { is_interacted: !next });
        Alert.alert(
          'Lỗi',
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không cập nhật được trạng thái tương tác',
        );
      } finally {
        setFlagBusy(false);
        setFlagItem(null);
      }
    },
    [patchLeadFlagsLocal],
  );

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
          <TouchableOpacity onPress={() => openMoreTab(navigation, 'FacebookInbox')} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="search" size={20} color={CrmColors.gray700} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate('NotificationsTab' as never)}
            hitSlop={10}
            style={styles.headerBtn}
          >
            <Ionicons name="notifications-outline" size={22} color={CrmColors.gray700} />
            {unreadCount > 0 ? <View style={styles.headerDot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openMoreTab(navigation, 'AccountSettings')} hitSlop={10}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
                <Text style={styles.headerAvatarTxt}>
                  {((user?.full_name || user?.fullName || user?.email || '?')[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, unreadCount, user?.avatar, user?.full_name, user?.fullName, user?.email]);

  if (!snapshot) {
    return (
      <View style={[styles.screen, styles.loadingOverlay]}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  /* --------------------------------- HEADER (hero + filters) --------------- */

  const heroBlock = (
    <LinearGradient
      colors={HERO_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, CrmShadow.card]}
    >
      <View style={styles.heroTopRow}>
        <View style={styles.heroIcon}>
          <Ionicons name="briefcase" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {tab === 'lead' ? 'Quản lý Leads' : 'Quản lý Deals'}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            Tìm kiếm, quản lý và chăm sóc khách hàng
          </Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatTile
          icon="people"
          iconColor="#1d4ed8"
          iconBg="#dbeafe"
          value={heroStats.leadCount.toLocaleString('vi-VN')}
          label="Leads"
          active={tab === 'lead'}
          onPress={() => setTab('lead')}
        />
        <StatTile
          icon="trophy"
          iconColor="#dc2626"
          iconBg="#fee2e2"
          value={heroStats.dealCount.toLocaleString('vi-VN')}
          label="Deals"
          active={tab === 'deal'}
          onPress={() => setTab('deal')}
        />
        <StatTile
          icon="call"
          iconColor="#059669"
          iconBg="#d1fae5"
          value={heroStats.newPhones.toLocaleString('vi-VN')}
          label="SĐT mới"
        />
        <StatTile
          icon="person"
          iconColor="#ea580c"
          iconBg="#ffedd5"
          value={heroStats.owners.toLocaleString('vi-VN')}
          label="NV phụ trách"
        />
      </View>

      <View style={styles.heroBtnRow}>
        <TouchableOpacity
          style={[styles.heroBtn, styles.heroBtnLead]}
          activeOpacity={0.88}
          onPress={() => setCreateMode('lead')}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.heroBtnTxt}>Thêm Lead</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.heroBtn, styles.heroBtnDeal]}
          activeOpacity={0.88}
          onPress={() => setCreateMode('deal')}
        >
          <Ionicons name="flag" size={16} color="#fff" />
          <Text style={styles.heroBtnTxt}>Thêm Deal</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );

  const viewModeChips: { key: 'list' | 'kanban' | 'planner' | 'calendar'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'list', label: 'Danh sách', icon: 'list' },
    { key: 'kanban', label: 'Kanban', icon: 'grid' },
    { key: 'planner', label: 'Planner', icon: 'calendar-clear-outline' },
    { key: 'calendar', label: 'Lịch', icon: 'calendar-outline' },
  ];

  const stages = tab === 'lead' ? stagesLead : stagesDeal;
  const stageCounts = tab === 'lead' ? stageCountsLead : stageCountsDeal;
  const activeStage = tab === 'lead' ? snapshot.filterStageLead : snapshot.filterStageDeal;

  const listHeader = (
    <View style={styles.headerBlock}>
      {heroBlock}

      <CrmAutoPipelineStrip onPress={() => openMoreTab(navigation, 'AutoPipelineStatus')} />

      {/* HIỂN THỊ */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Hiển thị (giống web CRM)</Text>
        <TouchableOpacity onPress={() => setAdvOpen(true)} hitSlop={6}>
          <View style={styles.sectionTitleAction}>
            <Ionicons name="options-outline" size={14} color={CrmColors.blue600} />
            <Text style={styles.sectionTitleActionTxt}>Tùy chỉnh</Text>
          </View>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScrollPad}>
        {viewModeChips.map((m) => {
          const on = snapshot.viewMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.vmChip, on && styles.vmChipOn]}
              activeOpacity={0.85}
              onPress={() => void commitSnapshot({ ...snapshot, viewMode: m.key })}
            >
              <Ionicons name={m.icon} size={14} color={on ? CrmColors.blue700 : CrmColors.gray500} />
              <Text style={[styles.vmChipTxt, on && styles.vmChipTxtOn]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* GIAI ĐOẠN */}
      <Text style={styles.sectionTitle}>
        Giai đoạn ({tab === 'lead' ? 'Lead' : 'Deal'} — lọc API + danh sách)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScrollPad}>
        <TouchableOpacity
          style={[styles.stageChip, !activeStage && styles.stageChipOn]}
          onPress={() =>
            void commitSnapshot(
              tab === 'lead' ? { ...snapshot, filterStageLead: '' } : { ...snapshot, filterStageDeal: '' },
            )
          }
        >
          <Text style={[styles.stageChipTxt, !activeStage && styles.stageChipTxtOn]}>Tất cả</Text>
          <View style={[styles.stageChipBadge, !activeStage && styles.stageChipBadgeOn]}>
            <Text style={[styles.stageChipBadgeTxt, !activeStage && styles.stageChipBadgeTxtOn]}>
              {(tab === 'lead' ? filteredLead.length : filteredDeal.length).toString()}
            </Text>
          </View>
        </TouchableOpacity>
        {stages.map((s) => {
          const active = activeStage === s.id;
          const color = s.color || CrmColors.blue600;
          const count = stageCounts.get(s.id) || 0;
          return (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.stageChip,
                active && { backgroundColor: stageTintBg(color), borderColor: color },
              ]}
              onPress={() =>
                void commitSnapshot(
                  tab === 'lead' ? { ...snapshot, filterStageLead: s.id } : { ...snapshot, filterStageDeal: s.id },
                )
              }
            >
              <Text
                style={[styles.stageChipTxt, active && { color }]}
                numberOfLines={1}
              >
                {(s.icon ? `${s.icon} ` : '') + (s.name || '—')}
              </Text>
              <View
                style={[
                  styles.stageChipBadge,
                  active && { backgroundColor: color },
                ]}
              >
                <Text
                  style={[
                    styles.stageChipBadgeTxt,
                    active && styles.stageChipBadgeTxtOn,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* SỐ ĐIỆN THOẠI */}
      <Text style={styles.sectionTitle}>Số điện thoại (API)</Text>
      <View style={styles.chipRow}>
        {(
          [
            ['has_phone', 'Có SĐT', 'call' as const],
            ['', 'Tất cả', 'apps-outline' as const],
            ['no_phone', 'Chưa có SĐT', 'call-outline' as const],
          ] as const
        ).map(([key, label, ic]) => {
          const on = snapshot.filterPhone === key;
          return (
            <TouchableOpacity
              key={key || 'all'}
              style={[styles.phoneChip, on && styles.phoneChipOn]}
              onPress={() => setPhoneQuick(key)}
              activeOpacity={0.85}
            >
              <Ionicons name={ic} size={13} color={on ? CrmColors.blue700 : CrmColors.gray500} />
              <Text style={[styles.phoneChipTxt, on && styles.phoneChipTxtOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* NHÂN VIÊN */}
      {canPickAssignee ? (
        <>
          <Text style={styles.sectionTitle}>Nhân viên phụ trách (chỉ quản trị / lãnh đạo)</Text>
          <TouchableOpacity style={styles.assigneeBtn} onPress={() => void openAssigneeModal()} activeOpacity={0.85}>
            <Ionicons name="person-outline" size={16} color={CrmColors.blue600} />
            <Text style={styles.assigneeBtnTxt} numberOfLines={1}>
              {snapshot.filterAssignee
                ? pickerUsers.find((u) => u.id === snapshot.filterAssignee)?.full_name ||
                  pickerUsers.find((u) => u.id === snapshot.filterAssignee)?.email ||
                  'Đã chọn'
                : 'Tất cả nhân viên'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={CrmColors.gray400} />
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.filterHint}>Bạn chỉ thấy {tab === 'deal' ? 'deal' : 'lead'} được giao cho mình.</Text>
      )}

      {/* SEARCH BAR */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={CrmColors.gray400} />
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
          <TouchableOpacity onPress={() => { setDraftQ(''); if (snapshot.searchText) void commitSnapshot({ ...snapshot, searchText: '' }); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={CrmColors.gray400} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setAdvOpen(true)} hitSlop={8} style={styles.searchFilterBtn}>
          <Ionicons name="options" size={16} color={CrmColors.blue700} />
          {advFilterCount > 0 ? (
            <View style={styles.searchFilterDot}>
              <Text style={styles.searchFilterDotTxt}>{advFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* DANH SÁCH HEADER */}
      <View style={styles.listHead}>
        <Text style={styles.listHeadTitle}>
          Danh sách {tab === 'lead' ? 'Leads' : 'Deals'}
        </Text>
        <TouchableOpacity
          style={styles.sortBtn}
          activeOpacity={0.85}
          onPress={() => setSortNewestFirst((v) => !v)}
        >
          <Text style={styles.sortBtnTxt}>{sortNewestFirst ? 'Mới nhất' : 'Cũ nhất'}</Text>
          <Ionicons name={sortNewestFirst ? 'arrow-down' : 'arrow-up'} size={12} color={CrmColors.blue700} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const footer =
    !loading && items.length > 0 ? (
      <View style={styles.tableFooter}>
        <Text style={styles.tableFooterTxt}>
          Hiển thị: {items.length} {tab === 'deal' ? 'deal' : 'lead'} (sau lọc giống web)
        </Text>
        <Text style={styles.tableFooterTxt}>
          GT: {sumLoadedValue > 0 ? formatVND(sumLoadedValue) : '0đ'}
        </Text>
      </View>
    ) : null;

  const listBody =
    snapshot.viewMode === 'list' ? (
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        renderItem={renderLeadItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? null : <Text style={styles.empty}>Không có dữ liệu</Text>}
        ListFooterComponent={footer}
        /* Perf: chỉ render ~8 card đầu, mở rộng cửa sổ khi cuộn — tránh đơ ban đầu */
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={10}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
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
            onLongPressItem={(it) => setFlagItem(it)}
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
        {footer}
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

      <Modal
        visible={!!flagItem}
        animationType="fade"
        transparent
        onRequestClose={() => !flagBusy && setFlagItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => !flagBusy && setFlagItem(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Thao tác nhanh</Text>
            <Text style={styles.modalSub} numberOfLines={2}>
              {flagItem?.code || '—'} · {flagItem?.title || '—'}
            </Text>
            <TouchableOpacity
              style={styles.modalRow}
              disabled={flagBusy || !flagItem}
              onPress={() => flagItem && void togglePin(flagItem)}
            >
              <Ionicons name="bookmark" size={16} color="#f59e0b" />
              <Text style={styles.modalRowTxt}>
                {flagItem?.is_pinned ? 'Bỏ ghim thẻ' : 'Ghim thẻ lên đầu'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalRow}
              disabled={flagBusy || !flagItem}
              onPress={() => flagItem && void toggleInteracted(flagItem)}
            >
              <Ionicons name="checkmark-circle" size={16} color={CrmColors.emerald600} />
              <Text style={styles.modalRowTxt}>
                {flagItem?.is_interacted ? 'Bỏ tick tương tác' : 'Đánh dấu đã tương tác'}
              </Text>
            </TouchableOpacity>
            {flagBusy ? <ActivityIndicator style={{ marginVertical: 12 }} color={CrmColors.blue600} /> : null}
            <TouchableOpacity style={styles.modalClose} onPress={() => !flagBusy && setFlagItem(null)}>
              <Text style={styles.modalCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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
              <Ionicons name="people-outline" size={16} color={CrmColors.blue600} />
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
                  <Ionicons name="person-circle-outline" size={18} color={CrmColors.gray500} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowTxt}>{u.full_name || u.email || u.id}</Text>
                    {u.email && u.full_name ? <Text style={styles.modalRowEmail}>{u.email}</Text> : null}
                  </View>
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

/* -------------------------------------------------------------------------- */
/*  Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  listContent: { paddingBottom: 24 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CrmColors.pageBg,
  },

  /* Header (navigation right) */
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  headerBtn: { padding: 6 },
  headerDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, marginLeft: 4 },
  headerAvatarPlaceholder: { backgroundColor: CrmColors.blue100, alignItems: 'center', justifyContent: 'center' },
  headerAvatarTxt: { fontSize: 13, fontWeight: '800', color: CrmColors.blue700 },

  headerBlock: { paddingTop: 12, paddingBottom: 4 },

  /* HERO --------------------------------------------------------------- */
  hero: {
    marginHorizontal: 14,
    borderRadius: 18,
    padding: 16,
    paddingBottom: 14,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statTile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 10,
    minWidth: 0,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statTileActive: {
    borderColor: '#fde68a',
    backgroundColor: '#fff',
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: CrmColors.gray900,
    textAlign: 'center',
    lineHeight: 20,
  },
  statLabel: {
    fontSize: 11,
    color: CrmColors.gray500,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },

  heroBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  heroBtnLead: { backgroundColor: 'rgba(59,130,246,0.95)' },
  heroBtnDeal: { backgroundColor: 'rgba(124,58,237,0.95)' },
  heroBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  /* SECTION TITLES ----------------------------------------------------- */
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: CrmColors.gray700,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sectionTitleAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitleActionTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.blue600 },

  hScrollPad: { paddingHorizontal: 14, marginBottom: 4 },

  /* VIEW MODE CHIPS ---------------------------------------------------- */
  vmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 8,
  },
  vmChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  vmChipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  vmChipTxtOn: { color: CrmColors.blue700, fontWeight: '700' },

  /* STAGE CHIPS -------------------------------------------------------- */
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 8,
  },
  stageChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  stageChipTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray700, maxWidth: 150 },
  stageChipTxtOn: { color: CrmColors.blue700 },
  stageChipBadge: {
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: CrmColors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageChipBadgeOn: { backgroundColor: CrmColors.blue600 },
  stageChipBadgeTxt: { fontSize: 11, fontWeight: '800', color: CrmColors.gray600 },
  stageChipBadgeTxtOn: { color: '#fff' },

  /* PHONE CHIPS -------------------------------------------------------- */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  phoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  phoneChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  phoneChipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  phoneChipTxtOn: { color: CrmColors.blue700, fontWeight: '700' },

  /* ASSIGNEE ----------------------------------------------------------- */
  assigneeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...CrmShadow.sm,
  },
  assigneeBtnTxt: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900, flex: 1 },
  filterHint: {
    fontSize: 12,
    color: CrmColors.gray500,
    marginHorizontal: 16,
    marginBottom: 10,
    lineHeight: 17,
  },

  /* SEARCH ------------------------------------------------------------- */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 46,
    ...CrmShadow.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: CrmColors.gray900, paddingVertical: 10 },
  searchFilterBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: CrmColors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchFilterDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  searchFilterDotTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  /* LIST HEAD ---------------------------------------------------------- */
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  listHeadTitle: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CrmColors.blue50,
    borderRadius: 999,
  },
  sortBtnTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.blue700 },

  /* CARD --------------------------------------------------------------- */
  card: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    paddingLeft: 16,
    backgroundColor: CrmColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    overflow: 'hidden',
  },
  cardStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardLeft: { flex: 1, minWidth: 0 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  codePill: {
    backgroundColor: CrmColors.blue50,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardCode: { fontSize: 11, fontWeight: '800', color: CrmColors.blue700, letterSpacing: 0.4 },
  pinChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CrmColors.emerald50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPinned: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  titleRow: { marginTop: 6 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900, lineHeight: 20 },
  cardCustomer: { fontSize: 12, color: CrmColors.gray600, marginTop: 4, fontWeight: '600' },
  metaInline: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  /* highlight chips (phone / owner) */
  highlightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  highlightChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  highlightChipPhone: {
    backgroundColor: CrmColors.emerald50,
    borderColor: CrmColors.emerald200,
  },
  highlightChipPhoneTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: CrmColors.emerald700,
    letterSpacing: 0.2,
  },
  highlightChipOwner: {
    backgroundColor: CrmColors.blue50,
    borderColor: CrmColors.blue100,
    flexShrink: 1,
  },
  highlightChipOwnerTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: CrmColors.blue700,
    flexShrink: 1,
  },

  /* value */
  valueBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: CrmColors.emerald50,
    alignSelf: 'flex-start',
  },
  cardValueTxt: { fontSize: 14, fontWeight: '800', color: CrmColors.emerald700 },

  newBadge: {
    backgroundColor: CrmColors.rose500,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  newBadgeTxt: { fontSize: 9, fontWeight: '900', color: CrmColors.white, letterSpacing: 0.5 },
  stagePill: {
    maxWidth: 140,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-end',
  },
  stagePillTxt: { fontSize: 11, fontWeight: '800' },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray100,
  },
  cardMetaTxt: { fontSize: 11, color: CrmColors.gray500, fontWeight: '600' },

  /* day pills */
  daysPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  daysPillCool: { backgroundColor: CrmColors.gray100 },
  daysPillWarm: { backgroundColor: '#fef3c7' },
  daysPillHot: { backgroundColor: '#fee2e2' },
  daysCoolTxt: { fontSize: 11, color: CrmColors.gray700, fontWeight: '700' },
  daysWarmTxt: { fontSize: 11, color: '#b45309', fontWeight: '800' },
  daysHotTxt: { fontSize: 11, color: CrmColors.red700, fontWeight: '800' },

  /* FOOTER / EMPTY ----------------------------------------------------- */
  empty: { textAlign: 'center', color: CrmColors.gray400, paddingVertical: 40, fontSize: 14 },
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CrmColors.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  tableFooterTxt: { fontSize: 12, color: CrmColors.gray500, fontWeight: '600' },
  altLoading: { paddingVertical: 48, alignItems: 'center' },

  /* MODAL -------------------------------------------------------------- */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  modalSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 6, marginBottom: 12 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  modalRowTxt: { fontSize: 15, fontWeight: '600', color: CrmColors.gray900 },
  modalRowEmail: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  modalClose: { marginTop: 16, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24 },
  modalCloseTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.blue600 },
});
