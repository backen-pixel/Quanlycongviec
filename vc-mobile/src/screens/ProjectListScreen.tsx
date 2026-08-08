import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchProductionBoard } from '../lib/logisticsApi';
import { getCachedBoard, isCachedBoardFresh, setCachedBoard } from '../lib/logisticsBoardCache';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { Radii, Spacing, getTaskProgressColor, stageColor } from '../theme';
import type { ProductionBoard } from '../types';

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
  const [board, setBoard] = useState<ProductionBoard>({ stages: [], projects: [], kpis: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
        progressTrack: { height: 6, borderRadius: Radii.full, backgroundColor: colors.cardAlt, overflow: 'hidden', marginTop: 10 },
        progressFill: { height: 6, borderRadius: Radii.full },
      }),
    [colors],
  );

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    const cached = getCachedBoard();
    if (mode !== 'refresh' && cached) {
      setBoard(cached);
      if (mode === 'init') setLoading(false);
    }
    if (mode === 'silent' && isCachedBoardFresh() && cached) return;
    if (mode === 'init' && !cached) setLoading(true);
    else if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);
    try {
      const next = await fetchProductionBoard(mode === 'refresh');
      setCachedBoard({}, next);
      setBoard(next);
    } catch (e) {
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('init');
  }, [load]);

  useProductionRealtime({
    onRefresh: () => load('silent'),
  });

  const stageNameById = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    board.stages.forEach((s, i) => map.set(s.id, { name: s.name, color: stageColor(s.color, i) }));
    return map;
  }, [board.stages]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return board.projects;
    return board.projects.filter((p) =>
      `${p.code} ${p.name} ${p.customer_name || ''} ${p.customer_phone || ''}`.toLowerCase().includes(needle),
    );
  }, [board.projects, search]);

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
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>Không có dự án phù hợp</Text>}
        renderItem={({ item }) => {
          const stage = item.resolved_column_id ? stageNameById.get(item.resolved_column_id) : null;
          const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
          const progressColor = getTaskProgressColor(progress, colors);
          return (
            <TapHighlight style={styles.row} onPress={() => openProjectDetail(item.id)}>
              <View style={styles.rowTop}>
                <Text style={styles.code}>{item.code}</Text>
                {stage ? (
                  <View style={[styles.stageTag, { backgroundColor: stage.color }]}>
                    <Text style={styles.stageTagText} numberOfLines={1}>{stage.name}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.customer_name || '--'}
                {item.customer_phone ? ` • ${item.customer_phone}` : ''}
                {item.deadline ? ` • ${formatDate(item.deadline)}` : ''}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: progressColor }]} />
              </View>
            </TapHighlight>
          );
        }}
      />
    </View>
  );
}
