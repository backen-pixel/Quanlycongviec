import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import PlannerFilterModal, { type PlannerFilterDimension } from '../components/PlannerFilterModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { fetchPersonalPlanner, fetchProductionBoard, isAbortError } from '../lib/productionApi';
import { getCachedBoard, isCachedBoardFresh } from '../lib/productionBoardCache';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import { formatMoneyAmount, Radii, Spacing, stageColor } from '../theme';
import type { PersonalPlanner, ProductionBoard, ProductionProject } from '../types';

type SubTab = 'by_owner' | 'personal';

/** Số dự án hiển thị ban đầu mỗi nhóm người phụ trách; bấm "Xem thêm" để tải tiếp. */
const OWNER_PAGE_SIZE = 5;
const UNASSIGNED_KEY = '__unassigned__';

function formatMoneyDisplay(value?: number | null): string {
  const formatted = formatMoneyAmount(value);
  return formatted ? `${formatted} \u20AB` : `0 \u20AB`;
}

export default function PlannerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'admin' && !user?.company_id;
  const scopedCompanyId = isSystemAdmin ? undefined : (user?.company_id || undefined);
  const [tab, setTab] = useState<SubTab>('by_owner');
  const [board, setBoard] = useState<ProductionBoard>(
    () => getCachedBoard({ companyId: scopedCompanyId }) ?? { stages: [], projects: [], kpis: null },
  );
  const [personal, setPersonal] = useState<PersonalPlanner>({ columns: [], items: [] });
  const [loading, setLoading] = useState(() => !getCachedBoard({ companyId: scopedCompanyId }));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const loadSeqRef = useRef(0);
  const boardAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    const boardFilters = { companyId: scopedCompanyId };
    if (mode === 'silent' && isCachedBoardFresh(boardFilters) && getCachedBoard(boardFilters)) {
      setBoard(getCachedBoard(boardFilters)!);
      return;
    }
    boardAbortRef.current?.abort();
    const ac = new AbortController();
    boardAbortRef.current = ac;
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    else if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const seeded = getCachedBoard(boardFilters);
      if (seeded && mode !== 'refresh') {
        setBoard(seeded);
        if (mode === 'init') setLoading(false);
      }
      const [boardData, personalData] = await Promise.all([
        fetchProductionBoard(mode === 'refresh', boardFilters, {
          signal: ac.signal,
          onPartial: (partial) => {
            if (seq !== loadSeqRef.current) return;
            setBoard(partial);
            if (mode === 'init') setLoading(false);
          },
        }),
        fetchPersonalPlanner().catch(() => ({ columns: [], items: [] }) as PersonalPlanner),
      ]);
      if (seq !== loadSeqRef.current) return;
      setBoard(boardData);
      setPersonal(personalData);
      if (mode !== 'silent') setOwnerVisible({});
    } catch (e) {
      if (seq !== loadSeqRef.current || isAbortError(e)) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [scopedCompanyId]);

  useEffect(() => () => {
    boardAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    void load(isCachedBoardFresh({ companyId: scopedCompanyId }) ? 'silent' : 'init');
  }, [load, scopedCompanyId]);

  useProductionRealtime({
    onRefresh: (info) => {
      if (info?.patched) {
        const cached = getCachedBoard({ companyId: scopedCompanyId });
        if (cached) setBoard(cached);
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  const stageById = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon: string }>();
    board.stages.forEach((s, i) =>
      map.set(s.id, { name: s.name, color: stageColor(s.color, i), icon: s.icon || '📋' }),
    );
    return map;
  }, [board.stages]);

  const projectById = useMemo(() => {
    const map = new Map<string, ProductionProject>();
    board.projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [board.projects]);

  const needle = search.trim().toLowerCase();

  const matchesSearch = useCallback(
    (p: ProductionProject) => {
      if (filters.region && String(p.region_id || '') !== filters.region) return false;
      if (filters.person && String(p.production_person_id || '') !== filters.person) return false;
      if (filters.stage && String(p.resolved_column_id || '') !== filters.stage) return false;
      if (filters.type && String(p.workshop_type_id || '') !== filters.type) return false;
      if (!needle) return true;
      const hay = `${p.code || ''} ${p.name || ''} ${p.customer_name || ''} ${p.customer_phone || ''} ${p.production_person_name || ''}`.toLowerCase();
      return hay.includes(needle);
    },
    [needle, filters],
  );

  // Tùy chọn bộ lọc — suy ra từ dữ liệu board hiện có.
  const filterOptions = useMemo(() => {
    const regionMap = new Map<string, string>();
    const personMap = new Map<string, string>();
    const typeMap = new Map<string, string>();
    board.projects.forEach((p) => {
      if (p.region_id && p.region_name) regionMap.set(String(p.region_id), p.region_name);
      if (p.production_person_id && p.production_person_name) {
        personMap.set(String(p.production_person_id), p.production_person_name);
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

  // Nhóm theo người phụ trách (giống tab web "Theo người phụ trách").
  const ownerGroups = useMemo(() => {
    const map = new Map<string, { name: string; items: ProductionProject[]; total: number }>();
    const unassigned: ProductionProject[] = [];
    board.projects.filter(matchesSearch).forEach((p) => {
      const id = p.production_person_id;
      const name = p.production_person_name;
      if (id && name) {
        if (!map.has(id)) map.set(id, { name, items: [], total: 0 });
        const g = map.get(id)!;
        g.items.push(p);
        g.total += Number(p.estimated_value || 0);
      } else {
        unassigned.push(p);
      }
    });
    const groups = [...map.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.items.length - a.items.length);
    return { groups, unassigned };
  }, [board.projects, matchesSearch]);

  const personalColumns = useMemo(() => {
    const itemsByCol = new Map<string, ProductionProject[]>();
    personal.columns.forEach((c) => itemsByCol.set(c.id, []));
    [...personal.items]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .forEach((it) => {
        const proj = projectById.get(it.project_id);
        if (proj && matchesSearch(proj) && itemsByCol.has(it.column_id)) itemsByCol.get(it.column_id)!.push(proj);
      });
    return personal.columns
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c, i) => ({ col: c, color: stageColor(c.color, i), items: itemsByCol.get(c.id) || [] }));
  }, [personal, projectById, matchesSearch]);

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
        tabRow: {
          flexDirection: 'row',
          gap: 6,
          marginHorizontal: Spacing.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          padding: 4,
          marginBottom: Spacing.sm,
        },
        tabBtn: { flex: 1, height: 36, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
        tabBtnActive: { backgroundColor: colors.primary },
        tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
        tabTextActive: { color: colors.white },
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
        errorText: { color: colors.textMuted, textAlign: 'center' },
        empty: { color: colors.textMuted, textAlign: 'center', marginTop: 8, fontSize: 14 },
        emptySub: { color: colors.textFaint, textAlign: 'center', fontSize: 12 },
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
        plannerColumn: {
          width: 260,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          overflow: 'hidden',
          padding: Spacing.sm,
          gap: Spacing.sm,
        },
        plannerColTop: { height: 4, borderRadius: Radii.full, marginBottom: 2 },
        plannerColHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
        plannerColTitle: { color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
        plannerColCount: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
        plannerColEmpty: { color: colors.textFaint, fontSize: 12, textAlign: 'center', paddingVertical: 16 },
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Planner</Text>
          <Text style={styles.subtitle}>
            {isSystemAdmin ? 'Tất cả công ty' : 'Sắp xếp & phân bổ dự án sản xuất'}
          </Text>
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

      <View style={styles.tabRow}>
        {([
          { id: 'by_owner', label: 'Theo người phụ trách' },
          { id: 'personal', label: 'Cá nhân của tôi' },
        ] as const).map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={tab === 'by_owner' ? 'Tìm người phụ trách, mã, khách...' : 'Tìm mã, tên dự án, khách...'}
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
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textFaint} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />
          }
        >
          {tab === 'by_owner' ? (
            !ownerGroups.groups.length && !ownerGroups.unassigned.length ? (
              <Text style={styles.empty}>
                {needle ? `Không tìm thấy kết quả cho "${search.trim()}"` : 'Không có dự án xưởng'}
              </Text>
            ) : (
              <>
                {ownerGroups.groups.map((g) => {
                  const limit = ownerLimit(g.id);
                  const remaining = g.items.length - limit;
                  return (
                    <View key={g.id} style={styles.groupCard}>
                      <View style={styles.groupHeader}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{g.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                          <Text style={styles.groupMeta}>
                            {g.items.length} dự án • {formatMoneyDisplay(g.total)}
                          </Text>
                        </View>
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
                })}
                {ownerGroups.unassigned.length ? (() => {
                  const limit = ownerLimit(UNASSIGNED_KEY);
                  const remaining = ownerGroups.unassigned.length - limit;
                  return (
                    <View style={[styles.groupCard, styles.groupCardDashed]}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupNameMuted}>
                          Chưa gán SX ({ownerGroups.unassigned.length})
                        </Text>
                      </View>
                      <View style={styles.groupBody}>
                        {ownerGroups.unassigned.slice(0, limit).map(renderCard)}
                        {remaining > 0 ? (
                          <Pressable style={styles.moreBtn} onPress={() => showMoreOwner(UNASSIGNED_KEY, ownerGroups.unassigned.length)}>
                            <Ionicons name="chevron-down" size={16} color={colors.primary} />
                            <Text style={styles.moreBtnText}>
                              Xem thêm {Math.min(remaining, OWNER_PAGE_SIZE)} / {remaining} dự án
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })() : null}
              </>
            )
          ) : personalColumns.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="albums-outline" size={36} color={colors.textFaint} />
              <Text style={styles.empty}>Bạn chưa có cột Planner cá nhân nào.</Text>
              <Text style={styles.emptySub}>
                Tạo cột và kéo-thả dự án trên web; ở đây bạn xem được nội dung đã sắp xếp.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: Spacing.md }}
            >
              {personalColumns.map(({ col, color, items }) => (
                <View key={col.id} style={styles.plannerColumn}>
                  <View style={[styles.plannerColTop, { backgroundColor: color }]} />
                  <View style={styles.plannerColHeader}>
                    <Text style={styles.plannerColTitle} numberOfLines={1}>{col.name}</Text>
                    <Text style={styles.plannerColCount}>{items.length}</Text>
                  </View>
                  {items.length ? items.map(renderCard) : (
                    <Text style={styles.plannerColEmpty}>Trống</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </ScrollView>
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

