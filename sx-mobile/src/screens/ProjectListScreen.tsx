import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import TapHighlight from '../components/TapHighlight';
import { useTheme } from '../context/ThemeContext';
import { fetchProductionBoard, isAbortError, type BoardFilters } from '../lib/productionApi';
import { getCachedBoard, isCachedBoardFresh } from '../lib/productionBoardCache';
import { loadKanbanFilters } from '../lib/kanbanFilterStorage';
import { REALTIME_BOARD_TASK } from '../lib/realtimeModes';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { Radii, Spacing, stageColor } from '../theme';
import type { KanbanStage, ProductionBoard, ProductionProject } from '../types';

async function resolveListFilters(): Promise<BoardFilters> {
  const snap = await loadKanbanFilters().catch(() => null);
  const companyId = snap?.filterCompany || undefined;
  return {
    companyId,
    dealCompanyId: snap?.filterDealCompany || undefined,
    workshopTypeId:
      companyId && snap?.filterWorkTypeId && snap.filterWorkTypeId !== 'none'
        ? snap.filterWorkTypeId
        : undefined,
  };
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

export default function ProjectListScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { openProjectDetail } = useRootNavigation();
  const [board, setBoard] = useState<ProductionBoard>(
    () => ({ stages: [], projects: [], kpis: null }),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const loadSeqRef = useRef(0);
  const boardAbortRef = useRef<AbortController | null>(null);
  const filtersRef = useRef<BoardFilters>({});

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
        header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
        title: { color: colors.text, fontSize: 20, fontWeight: '800' },
        subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        searchWrap: {
          marginHorizontal: Spacing.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: Spacing.sm,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 11 },
        errorBox: {
          marginHorizontal: Spacing.md,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
          borderRadius: Radii.md,
          padding: 10,
          marginBottom: Spacing.sm,
        },
        errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
        empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
        row: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          padding: Spacing.md,
          marginBottom: Spacing.md,
        },
        rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
        code: { color: colors.primary, fontSize: 12, fontWeight: '800' },
        stageTag: { borderRadius: Radii.full, paddingHorizontal: 10, paddingVertical: 3, maxWidth: 150 },
        stageTagText: { color: colors.white, fontSize: 10, fontWeight: '700' },
        name: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 8 },
        meta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
        dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
        dateChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: Radii.md,
          borderWidth: 1,
        },
        dateChipText: { fontSize: 11, fontWeight: '700' },
      }),
    [colors],
  );

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    boardAbortRef.current?.abort();
    const ac = new AbortController();
    boardAbortRef.current = ac;
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    else if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const filters = await resolveListFilters();
      if (seq !== loadSeqRef.current) return;
      filtersRef.current = filters;
      if (mode === 'silent' && isCachedBoardFresh(filters) && getCachedBoard(filters)) {
        setBoard(getCachedBoard(filters)!);
        return;
      }
      const seeded = getCachedBoard(filters);
      if (seeded && mode !== 'refresh') {
        setBoard(seeded);
        if (mode === 'init') setLoading(false);
      }
      const data = await fetchProductionBoard(mode === 'refresh', filters, {
        signal: ac.signal,
        onPartial: (partial) => {
          if (seq !== loadSeqRef.current) return;
          setBoard(partial);
          if (mode === 'init') setLoading(false);
        },
      });
      if (seq !== loadSeqRef.current) return;
      setBoard(data);
    } catch (e) {
      if (seq !== loadSeqRef.current || isAbortError(e)) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => () => {
    boardAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    // Đồng bộ scope với Kanban/Overview (cùng bộ lọc lưu local).
    void resolveListFilters().then((filters) => {
      void load(isCachedBoardFresh(filters) ? 'silent' : 'init');
    });
  }, [load]);

  useProductionRealtime({
    onRefresh: (info) => {
      if (info?.patched) {
        const cached = getCachedBoard(filtersRef.current);
        if (cached) setBoard(cached);
        return;
      }
      void load('silent');
    },
    modes: REALTIME_BOARD_TASK,
    debounceMs: 1500,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return board.projects;
    return board.projects.filter((p) =>
      `${p.code} ${p.name} ${p.customer_name || ''} ${p.customer_phone || ''}`.toLowerCase().includes(needle),
    );
  }, [board.projects, search]);

  const stageById = useMemo(() => {
    const m = new Map<string, KanbanStage>();
    board.stages.forEach((s) => m.set(String(s.id), s));
    return m;
  }, [board.stages]);

  const renderItem = useCallback(
    ({ item }: { item: ProductionProject }) => {
      const stage = item.resolved_column_id ? stageById.get(String(item.resolved_column_id)) : undefined;
      return <ProjectRow item={item} stage={stage} styles={styles} onPress={openProjectDetail} />;
    },
    [stageById, styles, openProjectDetail],
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Danh sách dự án</Text>
        <Text style={styles.subtitle}>{filtered.length} dự án</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm mã, tên, khách, SĐT..."
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
        />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>Không có dự án phù hợp</Text>}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        renderItem={renderItem}
      />
    </View>
  );
}

const keyExtractor = (item: ProductionProject) => item.id;

type ProjectRowProps = {
  item: ProductionProject;
  stage?: KanbanStage;
  styles: ReturnType<typeof StyleSheet.create>;
  onPress: (id: string) => void;
};

const ProjectRow = memo(function ProjectRow({ item, stage, styles, onPress }: ProjectRowProps) {
  const orderStr = formatDate(item.order_date);
  const deliveryStr = formatDate(item.delivery_date);
  const deliveryOverdue = Boolean(item.is_delivery_overdue || item.is_overdue);
  return (
    <TapHighlight style={styles.row} onPress={() => onPress(item.id)}>
      <View style={styles.rowTop}>
        <Text style={styles.code}>{item.code}</Text>
        {stage ? (
          <View style={[styles.stageTag, { backgroundColor: stage.color || stageColor(null, 0) }]}>
            <Text style={styles.stageTagText} numberOfLines={1}>{stage.name}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.customer_name || '--'}
        {item.customer_phone ? ` • ${item.customer_phone}` : ''}
      </Text>
      <View style={styles.dateRow}>
        <View style={[styles.dateChip, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}>
          <Text style={[styles.dateChipText, { color: '#4338CA' }]}>
            Đặt {orderStr || '—'}
          </Text>
        </View>
        <View
          style={[
            styles.dateChip,
            {
              backgroundColor: deliveryOverdue && deliveryStr ? '#FEF2F2' : '#ECFDF5',
              borderColor: deliveryOverdue && deliveryStr ? '#FECACA' : '#A7F3D0',
            },
          ]}
        >
          <Text
            style={[
              styles.dateChipText,
              { color: deliveryOverdue && deliveryStr ? '#B91C1C' : '#047857' },
            ]}
          >
            Giao {deliveryStr || '—'}
          </Text>
        </View>
      </View>
    </TapHighlight>
  );
});
