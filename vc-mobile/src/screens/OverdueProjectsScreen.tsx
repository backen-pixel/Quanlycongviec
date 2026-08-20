import SpinningLoader from '../components/SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import TapHighlight from '../components/TapHighlight';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import {
  areSharedFiltersHydrated,
  boardFiltersFromSharedSnap,
  getSharedFiltersSync,
  loadKanbanFilters,
  subscribeSharedFilters,
  type KanbanFilterSnapshot,
} from '../lib/kanbanFilterStorage';
import { invalidateVcBoard, refreshVcBoard, useVcBoard } from '../queries/vcQueries';
import { REALTIME_BOARD } from '../lib/realtimeModes';
import { initialsFrom, projectIsDeadlineOverdue, shortDateLabel } from '../lib/vcBoardKpis';
import { useRootNavigation } from '../navigation/useRootNavigation';
import type { ProductionProject } from '../types';
import { Radii, Spacing, colorWithAlpha, getTaskProgressColor } from '../theme';

function overdueDateLabel(p: ProductionProject): string {
  return shortDateLabel(p.deadline);
}

function personLabel(p: ProductionProject): string | null {
  return p.logistics_person_name || p.installer_person_name || null;
}

export default function OverdueProjectsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { openProjectDetail } = useRootNavigation();

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Dùng chung board cache với Kanban → mở màn này không tải lại danh sách dự án.
  const [filterSnap, setFilterSnap] = useState<KanbanFilterSnapshot>(() => getSharedFiltersSync());
  const [snapHydrated, setSnapHydrated] = useState(() => areSharedFiltersHydrated());

  useEffect(() => {
    if (snapHydrated) return;
    let cancelled = false;
    void loadKanbanFilters().catch(() => null).then((snap) => {
      if (cancelled) return;
      setFilterSnap(snap || {});
      setSnapHydrated(true);
    });
    return () => { cancelled = true; };
  }, [snapHydrated]);

  useEffect(() => subscribeSharedFilters((snap) => setFilterSnap(snap)), []);

  const boardFilters = useMemo(() => boardFiltersFromSharedSnap(filterSnap), [filterSnap]);
  const boardFiltersRef = useRef(boardFilters);
  boardFiltersRef.current = boardFilters;

  const boardQuery = useVcBoard(boardFilters, { enabled: snapHydrated });
  const projects = useMemo(
    () => (boardQuery.data?.projects ?? []).filter((p) => projectIsDeadlineOverdue(p)),
    [boardQuery.data],
  );
  const loading = boardQuery.isLoading || !snapHydrated;
  const error = refreshError || (boardQuery.error ? formatApiError(boardQuery.error) : null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshVcBoard(boardFiltersRef.current);
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
    modes: REALTIME_BOARD,
    debounceMs: 1500,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...projects].sort((a, b) => {
      const da = new Date(a.deadline || 0).getTime();
      const db = new Date(b.deadline || 0).getTime();
      return da - db;
    });
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p.code} ${p.name} ${p.customer_name || ''} ${p.customer_phone || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search]);

  const renderItem = useCallback(({ item }: { item: ProductionProject }) => {
    const pct = Math.max(0, Math.min(100, Number(item.progress || 0)));
    const accent = getTaskProgressColor(pct, colors);
    const done = Number(item.done_tasks || 0);
    const total = Number(item.task_total || 0);
    const person = personLabel(item);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => openProjectDetail(item.id)}
      >
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: colorWithAlpha(colors.danger, 0.2) }]}>
            <Text style={[styles.avatarText, { color: colors.danger }]}>
              {initialsFrom(item.customer_name || item.name || item.code)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.customer_name || '—'}
              {person ? ` · ${person}` : ''}
            </Text>
          </View>
          <View style={styles.rightCol}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Quá hạn</Text>
            </View>
            <Text style={styles.dateText}>{overdueDateLabel(item)}</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: accent }]} />
        </View>
        <Text style={styles.progressLabel}>
          {total > 0 ? `${done}/${total} nhiệm vụ` : `${pct}% tiến độ`}
          {item.workshop_type_name ? ` · ${item.workshop_type_name}` : ''}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, styles, openProjectDetail]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TapHighlight>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dự án quá hạn</Text>
          <Text style={styles.subtitle}>
            {filtered.length} dự án cần xử lý ưu tiên
          </Text>
        </View>
        <TapHighlight style={styles.backBtn} onPress={() => void onRefresh()} hitSlop={8}>
          <Ionicons name="refresh-outline" size={20} color={colors.text} />
        </TapHighlight>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm mã, tên, khách hàng…"
          placeholderTextColor={colors.textFaint}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TapHighlight onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </TapHighlight>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TapHighlight onPress={() => void onRefresh()}>
            <Text style={styles.retry}>Thử lại</Text>
          </TapHighlight>
        </View>
      ) : null}

      {loading && projects.length === 0 ? (
        <View style={styles.center}>
          <SpinningLoader color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải danh sách quá hạn…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? 'Không tìm thấy dự án phù hợp' : 'Không có dự án quá hạn'}
            </Text>
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { color: colors.textMuted, fontSize: 13 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: 4,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
    },
    title: { color: colors.text, fontSize: 18, fontWeight: '800' },
    subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    searchWrap: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 11 },
    errorBox: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: Radii.md,
      padding: 12,
    },
    errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
    retry: { color: colors.primary, fontWeight: '700', marginTop: 8 },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 48, fontSize: 14 },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: isDark ? '#7F1D1D55' : '#FECACA',
      borderRadius: Radii.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 13, fontWeight: '800' },
    code: { color: colors.primary, fontSize: 11, fontWeight: '800' },
    name: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
    meta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
    rightCol: { alignItems: 'flex-end', gap: 6 },
    badge: {
      backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.full,
    },
    badgeText: { color: isDark ? '#FCA5A5' : '#DC2626', fontSize: 10, fontWeight: '800' },
    dateText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
    progressTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.cardAlt,
      marginTop: 10,
      overflow: 'hidden',
    },
    progressFill: { height: 5, borderRadius: 3 },
    progressLabel: { color: colors.textFaint, fontSize: 10, marginTop: 4 },
  });
}
