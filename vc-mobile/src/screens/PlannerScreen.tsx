import SpinningLoader from '../components/SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import PlannerFilterModal, { type PlannerFilterDimension } from '../components/PlannerFilterModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import { loadKanbanFilters, saveKanbanFilters, subscribeSharedFilters, boardFiltersFromSharedSnap, getSharedFiltersSync, type KanbanFilterSnapshot } from '../lib/kanbanFilterStorage';
import { fetchCompanies, type CompanyOption } from '../lib/logisticsApi';
import { invalidateVcBoard, refreshVcBoard, useVcBoard } from '../queries/vcQueries';
import { isSystemAdmin } from '../lib/productionFilters';

const EMPTY_BOARD: ProductionBoard = { stages: [], projects: [], kpis: null };
import { formatMoneyAmount, Radii, Spacing, stageColor } from '../theme';
import type { ProductionBoard, ProductionProject } from '../types';

/** Số dự án hiển thị ban đầu mỗi nhóm người phụ trách; bấm "Xem thêm" để tải tiếp. */
const OWNER_PAGE_SIZE = 5;
const UNASSIGNED_KEY = '__unassigned__';

type OwnerGroupRow = {
  id: string;
  name: string;
  items: ProductionProject[];
  total: number;
  unassigned?: boolean;
};

/** Người phụ trách VC/Lắp đặt của dự án — ưu tiên logistics_person, fallback installer_person. */
function ownerOf(p: ProductionProject): { id: string | null | undefined; name: string | null | undefined } {
  if (p.logistics_person_id && p.logistics_person_name) {
    return { id: p.logistics_person_id, name: p.logistics_person_name };
  }
  return { id: p.installer_person_id, name: p.installer_person_name };
}

function formatMoneyDisplay(value?: number | null): string {
  const formatted = formatMoneyAmount(value);
  return formatted ? `${formatted} \u20AB` : `0 \u20AB`;
}

export default function PlannerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const sysAdmin = isSystemAdmin(user);
  const [filterCompany, setFilterCompany] = useState(() => (
    sysAdmin ? '' : String(user?.company_id || '')
  ));
  /** Đồng bộ workshopType / dealCompany với Kanban để cùng cache key board. */
  const [sharedSnap, setSharedSnap] = useState<KanbanFilterSnapshot>(() => getSharedFiltersSync());
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const companiesRef = useRef<CompanyOption[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [ownerVisible, setOwnerVisible] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<PlannerFilterDimension, string>>({
    region: '',
    person: '',
    stage: '',
    type: '',
  });
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const ownerLimit = useCallback(
    (key: string) => ownerVisible[key] || OWNER_PAGE_SIZE,
    [ownerVisible],
  );
  const showMoreOwner = useCallback((key: string, total: number) => {
    setOwnerVisible((prev) => ({
      ...prev,
      [key]: Math.min((prev[key] || OWNER_PAGE_SIZE) + OWNER_PAGE_SIZE, total),
    }));
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    void (async () => {
      const snap = await loadKanbanFilters().catch(() => null);
      if (alive && snap) setSharedSnap({ ...snap });
      let id = sysAdmin
        ? String(snap?.filterCompany || '').trim()
        : String(user?.company_id || '');
      let list = companiesRef.current;
      if (!list.length) {
        list = await fetchCompanies().catch(() => [] as CompanyOption[]);
        companiesRef.current = list;
        if (alive) setCompanies(list);
      }
      // Sysadmin: '' = Tất cả công ty — không ép công ty đầu.
      if (!sysAdmin && !id && list[0]?.id) {
        id = String(list[0].id);
        await saveKanbanFilters({ filterCompany: id });
      }
      if (alive) setFilterCompany(id);
    })();
    return () => { alive = false; };
  }, [sysAdmin, user?.company_id]));

  useEffect(() => {
    const unsub = subscribeSharedFilters((snap) => {
      setSharedSnap({ ...snap });
      if (!sysAdmin) return;
      const next = String(snap.filterCompany || '');
      setFilterCompany((prev) => (prev === next ? prev : next));
    });
    return unsub;
  }, [sysAdmin]);

  const boardFilters = useMemo(
    () => boardFiltersFromSharedSnap(
      { ...sharedSnap, filterCompany },
      { companyIdOverride: filterCompany },
    ),
    [sharedSnap, filterCompany],
  );

  const boardFiltersRef = useRef(boardFilters);
  boardFiltersRef.current = boardFilters;

  // Sysadmin với '' = Tất cả — vẫn tải. NV thiếu companyId thì chờ.
  const boardQuery = useVcBoard(boardFilters, { enabled: sysAdmin || !!filterCompany });
  const board = boardQuery.data ?? EMPTY_BOARD;
  const loading = boardQuery.isLoading || (!sysAdmin && !filterCompany);
  const error = refreshError || (boardQuery.error ? formatApiError(boardQuery.error) : null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshVcBoard(boardFiltersRef.current);
      setOwnerVisible({});
    } catch (e) {
      setRefreshError(formatApiError(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useProductionRealtime({
    onRefresh: (info) => {
      if (info?.patched) return;
      invalidateVcBoard();
    },
    modes: REALTIME_BOARD_TASK,
  });

  const companyLabel = useMemo(() => {
    if (!filterCompany) {
      return sysAdmin ? 'Tất cả công ty' : 'Sắp xếp & phân bổ dự án lắp đặt';
    }
    const fromList = companies.find((c) => String(c.id) === String(filterCompany))?.name;
    if (fromList) return fromList;
    return board.projects.find((p) => p.company_name)?.company_name
      || 'Sắp xếp & phân bổ dự án lắp đặt';
  }, [filterCompany, companies, board.projects, sysAdmin]);

  const stageById = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon: string }>();
    board.stages.forEach((s, i) =>
      map.set(s.id, { name: s.name, color: stageColor(s.color, i), icon: s.icon || '📋' }),
    );
    return map;
  }, [board.stages]);

  const needle = search.trim().toLowerCase();

  const matchesSearch = useCallback(
    (p: ProductionProject) => {
      const owner = ownerOf(p);
      if (filters.region && String(p.region_id || '') !== filters.region) return false;
      if (filters.person && String(owner.id || '') !== filters.person) return false;
      if (filters.stage && String(p.resolved_column_id || '') !== filters.stage) return false;
      if (filters.type && String(p.workshop_type_id || '') !== filters.type) return false;
      if (!needle) return true;
      const hay = `${p.code || ''} ${p.name || ''} ${p.customer_name || ''} ${p.customer_phone || ''} ${owner.name || ''}`.toLowerCase();
      return hay.includes(needle);
    },
    [needle, filters],
  );

  const filterOptions = useMemo(() => {
    const regionMap = new Map<string, string>();
    const personMap = new Map<string, string>();
    const typeMap = new Map<string, string>();
    board.projects.forEach((p) => {
      if (p.region_id && p.region_name) regionMap.set(String(p.region_id), p.region_name);
      const owner = ownerOf(p);
      if (owner.id && owner.name) {
        personMap.set(String(owner.id), owner.name);
      }
      if (p.workshop_type_id && p.workshop_type_name) typeMap.set(String(p.workshop_type_id), p.workshop_type_name);
    });
    const toOpts = (m: Map<string, string>, allLabel: string) => [
      { id: '', label: allLabel },
      ...[...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label })),
    ];
    return {
      region: toOpts(regionMap, 'Tất cả khu vực'),
      person: toOpts(personMap, 'Tất cả nhân viên'),
      stage: [
        { id: '', label: 'Tất cả giai đoạn' },
        ...board.stages.map((s) => ({ id: s.id, label: `${s.icon || ''} ${s.name}`.trim() })),
      ],
      type: toOpts(typeMap, 'Tất cả phân loại'),
    };
  }, [board.projects, board.stages]);

  const ownerRows = useMemo((): OwnerGroupRow[] => {
    const map = new Map<string, { name: string; items: ProductionProject[]; total: number }>();
    const unassigned: ProductionProject[] = [];
    board.projects.filter(matchesSearch).forEach((p) => {
      const owner = ownerOf(p);
      if (owner.id && owner.name) {
        if (!map.has(owner.id)) map.set(owner.id, { name: owner.name, items: [], total: 0 });
        const g = map.get(owner.id)!;
        g.items.push(p);
        g.total += Number(p.estimated_value || 0);
      } else {
        unassigned.push(p);
      }
    });
    const groups: OwnerGroupRow[] = [...map.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.items.length - a.items.length);
    if (unassigned.length) {
      groups.push({
        id: UNASSIGNED_KEY,
        name: `Chưa phân công (${unassigned.length})`,
        items: unassigned,
        total: 0,
        unassigned: true,
      });
    }
    return groups;
  }, [board.projects, matchesSearch]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: Spacing.xl, paddingVertical: 48 },
        header: {
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
        },
        title: { color: colors.text, fontSize: 20, fontWeight: '800' },
        subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        filterBtn: {
          width: 40, height: 40, borderRadius: Radii.md,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center',
        },
        filterBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
        filterBadge: {
          position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18,
          borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg,
        },
        filterBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
        searchRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
        searchBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 12,
          height: 42,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 14 },
        listContent: { padding: Spacing.md, paddingBottom: 24 },
        errorText: { color: colors.textMuted, textAlign: 'center' },
        empty: { color: colors.textMuted, textAlign: 'center', marginTop: 8, fontSize: 14 },
        groupCard: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          overflow: 'hidden',
          marginBottom: Spacing.md,
        },
        groupCardDashed: { borderStyle: 'dashed', borderColor: colors.borderStrong },
        groupHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: Spacing.md,
          paddingVertical: 10,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
        avatarText: { color: colors.white, fontSize: 14, fontWeight: '800' },
        groupName: { color: colors.text, fontSize: 14, fontWeight: '800' },
        groupNameMuted: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
        groupMeta: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
        groupBody: { padding: Spacing.sm, gap: Spacing.sm },
        card: {
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          padding: 10,
        },
        cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
        cardCode: { color: colors.primary, fontSize: 11, fontWeight: '800' },
        stageTag: { borderRadius: Radii.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 160 },
        stageTagText: { fontSize: 10, fontWeight: '700' },
        cardName: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 6 },
        cardCustomer: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
        cardValue: { color: colors.valueText, fontSize: 12, fontWeight: '800', marginTop: 6 },
        moreBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 10,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderStyle: 'dashed',
          backgroundColor: colors.cardAlt,
        },
        moreBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
      }),
    [colors],
  );

  const renderCard = (item: ProductionProject) => {
    const stage = item.resolved_column_id ? stageById.get(item.resolved_column_id) : null;
    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardCode}>{item.code}</Text>
          {stage ? (
            <View style={[styles.stageTag, { backgroundColor: `${stage.color}22`, borderColor: stage.color }]}>
              <Text style={[styles.stageTagText, { color: stage.color }]} numberOfLines={1}>
                {stage.icon} {stage.name}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        {item.customer_name ? <Text style={styles.cardCustomer} numberOfLines={1}>{item.customer_name}</Text> : null}
        {Number(item.estimated_value) > 0 ? (
          <Text style={styles.cardValue}>{formatMoneyDisplay(item.estimated_value)}</Text>
        ) : null}
      </View>
    );
  };

  const renderGroup = ({ item: g }: { item: OwnerGroupRow }) => {
    const limit = ownerLimit(g.id);
    const remaining = g.items.length - limit;
    return (
      <View style={[styles.groupCard, g.unassigned && styles.groupCardDashed]}>
        <View style={styles.groupHeader}>
          {g.unassigned ? (
            <Text style={styles.groupNameMuted}>{g.name}</Text>
          ) : (
            <>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{g.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.groupMeta}>
                  {g.items.length} dự án • {formatMoneyDisplay(g.total)}
                </Text>
              </View>
            </>
          )}
        </View>
        <View style={styles.groupBody}>
          {g.items.slice(0, limit).map(renderCard)}
          {remaining > 0 ? (
            <Pressable style={styles.moreBtn} onPress={() => showMoreOwner(g.id, g.items.length)}>
              <Ionicons name="chevron-down" size={16} color={colors.primary} />
              <Text style={styles.moreBtnText}>
                Xem thêm {Math.min(remaining, OWNER_PAGE_SIZE)} / {remaining} dự án
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Planner</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{companyLabel}</Text>
        </View>
        <Pressable
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setFilterOpen(true)}
          hitSlop={6}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeFilterCount > 0 ? colors.primary : colors.text}
          />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm người phụ trách, mã, khách..."
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <SpinningLoader color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textFaint} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={ownerRows}
          keyExtractor={(g) => g.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.listContent}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {needle ? `Không tìm thấy kết quả cho "${search.trim()}"` : 'Không có dự án'}
            </Text>
          }
        />
      )}

      <PlannerFilterModal
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        options={filterOptions}
        values={filters}
        onChange={(dimension, id) => setFilters((prev) => ({ ...prev, [dimension]: id }))}
        onClear={() => setFilters({ region: '', person: '', stage: '', type: '' })}
      />
    </View>
  );
}
