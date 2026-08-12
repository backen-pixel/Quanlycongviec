import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchQuotations,
  QUOTATION_STATUS_LABEL,
  type QuotationRow,
} from '../api/quotations';
import { formatApiError } from '../api/client';
import { formatDateShort, formatVnd } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Segment = 'all' | 'draft' | 'converted' | 'orphan';
type DatePreset = 'all' | '7d' | '30d' | 'month';

type Facets = {
  companies: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  creators: { id: string; name: string }[];
};

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'converted', label: 'Đã chuyển ĐH' },
  { key: 'orphan', label: 'Chưa gắn deal' },
];

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Mọi ngày' },
  { key: '7d', label: '7 ngày qua' },
  { key: '30d', label: '30 ngày qua' },
  { key: 'month', label: 'Tháng này' },
];

function buildFacets(rows: QuotationRow[]): Facets {
  const companies = new Map<string, string>();
  const regions = new Map<string, string>();
  const creators = new Map<string, string>();
  for (const q of rows) {
    if (q.company_id && q.company) {
      companies.set(q.company_id, q.company.short_name || q.company.name || '—');
    }
    if (q.region_id && q.region) regions.set(q.region_id, q.region.name || '—');
    if (q.created_by && q.creator) creators.set(q.created_by, q.creator.full_name || '—');
  }
  return {
    companies: [...companies.entries()].map(([id, name]) => ({ id, name })),
    regions: [...regions.entries()].map(([id, name]) => ({ id, name })),
    creators: [...creators.entries()].map(([id, name]) => ({ id, name })),
  };
}

function datePresetRange(preset: DatePreset): { from: number; to: number } | null {
  if (preset === 'all') return null;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  if (preset === '7d') return { from: end - 7 * 86400000, to: end };
  if (preset === '30d') return { from: end - 30 * 86400000, to: end };
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return { from: start, to: end };
}

function segmentStyle(key: Segment, active: boolean, Colors: ThemeColors) {
  const map = {
    all: {
      activeBg: Colors.greenSoft,
      activeBorder: Colors.green,
      activeText: Colors.green,
      idleBorder: Colors.border,
    },
    draft: {
      activeBg: Colors.blueSoft,
      activeBorder: Colors.blue,
      activeText: Colors.blue,
      idleBorder: Colors.border,
    },
    converted: {
      activeBg: 'rgba(168,85,247,0.16)',
      activeBorder: Colors.purple,
      activeText: Colors.purple,
      idleBorder: Colors.border,
    },
    orphan: {
      activeBg: Colors.amberSoft,
      activeBorder: Colors.amber,
      activeText: Colors.amber,
      idleBorder: Colors.border,
    },
  } as const;
  const s = map[key];
  return active
    ? { backgroundColor: s.activeBg, borderColor: s.activeBorder, color: s.activeText }
    : { backgroundColor: Colors.card, borderColor: s.idleBorder, color: Colors.textMuted };
}

function statusStyle(status: string | null | undefined, Colors: ThemeColors) {
  switch (status) {
    case 'converted':
      return { bg: 'rgba(168,85,247,0.18)', text: Colors.purple, border: 'rgba(168,85,247,0.35)' };
    case 'draft':
      return { bg: Colors.blueSoft, text: Colors.blue, border: 'rgba(47,107,255,0.35)' };
    default:
      return { bg: Colors.surfaceSoft, text: Colors.textMuted, border: Colors.border };
  }
}

export default function QuotationsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [companyFilter, setCompanyFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const load = useCallback(async (isRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const list = await fetchQuotations({ signal: ac.signal });
      if (!ac.signal.aborted) setRows(list);
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        setError(formatApiError(e));
        setRows([]);
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  const facets = useMemo(() => buildFacets(rows), [rows]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {
      total: rows.length,
      draft: 0,
      converted: 0,
      orphan: 0,
      value: 0,
    };
    for (const q of rows) {
      if (q.status === 'draft') counts.draft += 1;
      if (q.status === 'converted') counts.converted += 1;
      if (!q.lead_id) counts.orphan += 1;
      counts.value += q.total || 0;
    }
    return counts;
  }, [rows]);

  const segmentCount = (key: Segment) => {
    if (key === 'all') return summary.total;
    if (key === 'draft') return summary.draft;
    if (key === 'converted') return summary.converted;
    return summary.orphan;
  };

  const filtered = useMemo(() => {
    let list = [...rows];
    if (segment === 'draft') list = list.filter((q) => q.status === 'draft');
    else if (segment === 'converted') list = list.filter((q) => q.status === 'converted');
    else if (segment === 'orphan') list = list.filter((q) => !q.lead_id);

    if (companyFilter) list = list.filter((q) => q.company_id === companyFilter);
    if (regionFilter) list = list.filter((q) => q.region_id === regionFilter);
    if (creatorFilter) list = list.filter((q) => q.created_by === creatorFilter);

    const range = datePresetRange(datePreset);
    if (range) {
      list = list.filter((q) => {
        const t = q.created_at ? new Date(q.created_at).getTime() : 0;
        return t >= range.from && t <= range.to;
      });
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) =>
          (q.code || '').toLowerCase().includes(s) ||
          (q.title || '').toLowerCase().includes(s) ||
          (q.customer_name || '').toLowerCase().includes(s) ||
          (q.lead?.code || '').toLowerCase().includes(s),
      );
    }

    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [rows, segment, companyFilter, regionFilter, creatorFilter, datePreset, search]);

  const hasExtraFilter = !!(companyFilter || regionFilter || creatorFilter || datePreset !== 'all');

  const clearAdvancedFilters = () => {
    setCompanyFilter('');
    setRegionFilter('');
    setCreatorFilter('');
    setDatePreset('all');
  };

  const onDelete = (_q: QuotationRow) => {
    Alert.alert('Đang cập nhật', 'Tính năng xóa báo giá đang được cập nhật. Vui lòng thử lại sau.');
  };

  const onDownloadPdf = (_q: QuotationRow) => {
    Alert.alert('Đang cập nhật', 'Tính năng tải PDF đang được cập nhật. Vui lòng thử lại sau.');
  };

  const renderFilterChips = (
    label: string,
    value: string,
    onChange: (id: string) => void,
    items: { id: string; name: string }[],
  ) => {
    if (items.length <= 1) return null;
    return (
      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          <Pressable
            style={[styles.filterChip, !value && styles.filterChipActive]}
            onPress={() => onChange('')}
          >
            <Text style={[styles.filterChipTxt, !value && styles.filterChipTxtActive]}>Tất cả</Text>
          </Pressable>
          {items.map((it) => (
            <Pressable
              key={it.id}
              style={[styles.filterChip, value === it.id && styles.filterChipActive]}
              onPress={() => onChange(value === it.id ? '' : it.id)}
            >
              <Text
                style={[styles.filterChipTxt, value === it.id && styles.filterChipTxtActive]}
                numberOfLines={1}
              >
                {it.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderCard = ({ item: q }: { item: QuotationRow }) => {
    const orphan = !q.lead_id;
    const converted = q.status === 'converted';
    const isDeal = q.lead?.type === 'deal';
    const st = statusStyle(q.status, Colors);
    const statusLabel = QUOTATION_STATUS_LABEL[q.status || ''] || q.status || '—';

    return (
      <View
        style={[
          styles.card,
          orphan && styles.cardOrphan,
          converted && !orphan && styles.cardConverted,
        ]}
      >
        {orphan ? <View style={[styles.leftStripe, styles.stripeOrphan]} /> : null}
        {converted && !orphan ? <View style={[styles.leftStripe, styles.stripeConverted]} /> : null}

        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <Text style={styles.code}>{q.code || '—'}</Text>
            <View style={[styles.statusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
              <Text style={[styles.statusTxt, { color: st.text }]}>{statusLabel}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable style={styles.iconBtn} onPress={() => onDownloadPdf(q)}>
                <Ionicons name="download-outline" size={18} color={Colors.textMuted} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => onDelete(q)}>
                <Ionicons name="trash-outline" size={18} color={Colors.red} />
              </Pressable>
            </View>
          </View>

          {orphan ? (
            <View style={styles.orphanBanner}>
              <Ionicons name="warning" size={14} color={Colors.amber} />
              <Text style={styles.orphanBannerTxt}>Chưa gắn deal</Text>
            </View>
          ) : null}

          <Text style={styles.cardTitle} numberOfLines={2}>
            {q.title || 'Bảng báo giá'}
          </Text>

          {q.customer_name ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={14} color={Colors.textFaint} />
              <Text style={styles.metaTxt} numberOfLines={1}>
                {q.customer_name}
              </Text>
            </View>
          ) : null}

          {q.lead?.code ? (
            <View style={[styles.chip, isDeal ? styles.chipDeal : styles.chipLead]}>
              <Ionicons
                name={isDeal ? 'locate-outline' : 'person-outline'}
                size={12}
                color={isDeal ? Colors.blue : Colors.green}
              />
              <Text style={[styles.chipTxt, { color: isDeal ? Colors.blue : Colors.green }]}>
                {q.lead.code}
              </Text>
            </View>
          ) : null}

          <View style={styles.chipRow}>
            {q.company?.name || q.company?.short_name ? (
              <View style={styles.chipCompany}>
                <Ionicons name="business-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.chipCompanyTxt} numberOfLines={1}>
                  {q.company.short_name || q.company.name}
                </Text>
              </View>
            ) : null}
            {q.region?.name ? (
              <View style={styles.chipRegion}>
                <Ionicons name="location-outline" size={12} color={Colors.purple} />
                <Text style={styles.chipRegionTxt} numberOfLines={1}>
                  {q.region.name}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.total}>{formatVnd(q.total)}</Text>
            <View style={styles.footerMeta}>
              {q.creator?.full_name ? (
                <>
                  <Ionicons name="person-circle-outline" size={13} color={Colors.textFaint} />
                  <Text style={styles.footerMetaTxt} numberOfLines={1}>
                    {q.creator.full_name}
                  </Text>
                  <Text style={styles.footerDot}>·</Text>
                </>
              ) : null}
              <Ionicons name="calendar-outline" size={13} color={Colors.textFaint} />
              <Text style={styles.footerMetaTxt}>{formatDateShort(q.created_at)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const listHeader = (
    <>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="document-text" size={24} color={Colors.green} />
            <Text style={styles.headerTitle}>Báo giá</Text>
          </View>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryCount}>{summary.total}</Text>
            {' báo giá · '}
            <Text style={styles.summaryValue}>{formatVnd(summary.value)}</Text>
            {summary.orphan > 0 ? (
              <Text style={styles.summaryWarn}> · ⚠ {summary.orphan} chưa gắn deal</Text>
            ) : null}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentRow}
        style={styles.segmentScroll}
      >
        {SEGMENTS.map((seg) => {
          const active = segment === seg.key;
          const tone = segmentStyle(seg.key, active, Colors);
          return (
            <Pressable
              key={seg.key}
              style={[
                styles.segment,
                { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
              ]}
              onPress={() => setSegment(seg.key)}
            >
              <Text style={[styles.segmentTxt, { color: tone.color }]}>
                {seg.label} ({segmentCount(seg.key)})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm mã, tên, KH, mã deal..."
            placeholderTextColor={Colors.textFaint}
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
          />
          <Pressable
            style={[styles.gearBtn, (filtersOpen || hasExtraFilter) && styles.gearBtnActive]}
            onPress={() => setFiltersOpen((v) => !v)}
            hitSlop={8}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={filtersOpen || hasExtraFilter ? Colors.green : Colors.textMuted}
            />
          </Pressable>
        </View>
      </View>

      {filtersOpen ? (
        <View style={styles.filtersPanel}>
          {renderFilterChips('Công ty', companyFilter, setCompanyFilter, facets.companies)}
          {renderFilterChips('Khu vực', regionFilter, setRegionFilter, facets.regions)}
          {renderFilterChips('Nhân viên', creatorFilter, setCreatorFilter, facets.creators)}
          <View style={styles.filterBlock}>
            <Text style={styles.filterLabel}>Khoảng ngày</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {DATE_PRESETS.map((p) => (
                <Pressable
                  key={p.key}
                  style={[styles.filterChip, datePreset === p.key && styles.filterChipActive]}
                  onPress={() => setDatePreset(p.key)}
                >
                  <Text
                    style={[
                      styles.filterChipTxt,
                      datePreset === p.key && styles.filterChipTxtActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {hasExtraFilter ? (
            <Pressable style={styles.clearFiltersBtn} onPress={clearAdvancedFilters}>
              <Text style={styles.clearFiltersTxt}>Xóa bộ lọc nâng cao</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.listMeta}>
        <Text style={styles.listMetaTxt}>
          Hiển thị <Text style={styles.listMetaStrong}>{filtered.length}</Text> báo giá
          {hasExtraFilter || search || segment !== 'all' ? ' (đã lọc)' : ''}
        </Text>
      </View>
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {loading && !rows.length ? (
        <View style={styles.center}>
          <SpinningLoader color={Colors.blue} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 96 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error || 'Không có báo giá phù hợp'}</Text>
          }
        />
      )}

      <View style={[styles.fabRow, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
        <Pressable
          style={[styles.fab, styles.fabSecondary]}
          onPress={() =>
            Alert.alert(
              'Import Excel',
              'Tính năng import Excel trên mobile đang phát triển. Vui lòng dùng trên web CRM.',
            )
          }
        >
          <Ionicons name="grid-outline" size={20} color={Colors.text} />
          <Text style={styles.fabTxt}>Import Excel</Text>
        </Pressable>
        <Pressable
          style={[styles.fab, styles.fabPrimary]}
          onPress={() =>
            Alert.alert(
              'Tạo báo giá',
              'Tính năng tạo báo giá trên mobile đang phát triển. Vui lòng tạo trên web CRM.',
            )
          }
        >
          <Ionicons name="add" size={22} color={Colors.white} />
          <Text style={[styles.fabTxt, styles.fabTxtPrimary]}>Tạo báo giá</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 12,
      marginHorizontal: -8,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    headerBody: { flex: 1, paddingRight: 8 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle: { color: Colors.text, fontSize: 26, fontWeight: '900' },
    summaryLine: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 6 },
    summaryCount: { color: Colors.text, fontWeight: '800' },
    summaryValue: { color: Colors.green, fontWeight: '900' },
    summaryWarn: { color: Colors.amber, fontWeight: '800' },
    segmentScroll: { maxHeight: 44, marginBottom: 12, marginHorizontal: -16 },
    segmentRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    segment: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radii.pill,
      borderWidth: 1.5,
    },
    segmentTxt: { fontSize: 12, fontWeight: '800' },
    searchRow: { marginBottom: 8 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingLeft: 12,
      paddingRight: 6,
      height: 46,
    },
    searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    gearBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gearBtnActive: { backgroundColor: Colors.greenSoft },
    filtersPanel: {
      backgroundColor: Colors.cardAlt,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      marginBottom: 10,
      gap: 4,
    },
    filterBlock: { marginBottom: 6 },
    filterLabel: {
      color: Colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    chipScroll: { gap: 8, paddingRight: 8 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      maxWidth: 180,
    },
    filterChipActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
    filterChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    filterChipTxtActive: { color: Colors.blue, fontWeight: '800' },
    clearFiltersBtn: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: 2 },
    clearFiltersTxt: { color: Colors.red, fontSize: 12, fontWeight: '800' },
    listMeta: { marginBottom: 10 },
    listMetaTxt: { color: Colors.textFaint, fontSize: 12 },
    listMetaStrong: { color: Colors.textMuted, fontWeight: '800' },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 12,
      overflow: 'hidden',
    },
    cardOrphan: { borderColor: 'rgba(245,158,11,0.5)' },
    cardConverted: { borderColor: 'rgba(168,85,247,0.45)' },
    leftStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    stripeOrphan: { backgroundColor: Colors.amber },
    stripeConverted: { backgroundColor: Colors.purple },
    cardInner: { padding: 14, paddingLeft: 16 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    code: { color: Colors.green, fontSize: 14, fontWeight: '900', flexShrink: 0 },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.pill,
      borderWidth: 1,
    },
    statusTxt: { fontSize: 11, fontWeight: '800' },
    cardActions: { flexDirection: 'row', marginLeft: 'auto', gap: 4 },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: Colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orphanBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.amberSoft,
      borderRadius: Radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 8,
    },
    orphanBannerTxt: { color: Colors.amber, fontSize: 12, fontWeight: '800' },
    cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    metaTxt: { color: Colors.textMuted, fontSize: 14, flex: 1, fontWeight: '600' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radii.pill,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    chipLead: { backgroundColor: Colors.greenSoft, borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' },
    chipDeal: { backgroundColor: Colors.blueSoft, borderWidth: 1, borderColor: 'rgba(47,107,255,0.35)' },
    chipTxt: { fontSize: 11, fontWeight: '800', fontFamily: 'monospace' },
    chipCompany: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radii.pill,
      backgroundColor: Colors.surfaceSoft,
      borderWidth: 1,
      borderColor: Colors.border,
      maxWidth: '70%',
    },
    chipCompanyTxt: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
    chipRegion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radii.pill,
      backgroundColor: 'rgba(168,85,247,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(168,85,247,0.3)',
    },
    chipRegionTxt: { color: Colors.purple, fontSize: 11, fontWeight: '700' },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: Colors.borderSoft,
    },
    total: { color: Colors.green, fontSize: 20, fontWeight: '900', flexShrink: 0 },
    footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
    footerMetaTxt: { color: Colors.textFaint, fontSize: 11, maxWidth: 110 },
    footerDot: { color: Colors.textFaint, fontSize: 11 },
    empty: { textAlign: 'center', color: Colors.textFaint, marginTop: 48, fontSize: 14 },
    fabRow: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      gap: 12,
    },
    fab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 52,
      borderRadius: Radii.pill,
      ...Shadow.fab,
    },
    fabSecondary: {
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    fabPrimary: {
      backgroundColor: Colors.green,
      borderWidth: 0,
    },
    fabTxt: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    fabTxtPrimary: { color: Colors.white },
  });
