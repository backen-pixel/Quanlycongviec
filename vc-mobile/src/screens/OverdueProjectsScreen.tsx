import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import TapHighlight from '../components/TapHighlight';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { loadKanbanFilters } from '../lib/kanbanFilterStorage';
import { fetchProductionBoard } from '../lib/logisticsApi';
import { getCachedBoard, isCachedBoardFresh } from '../lib/logisticsBoardCache';
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

  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const loadSeqRef = useRef(0);
  const filtersRef = useRef<{ companyId?: string; workshopTypeId?: string }>({});

  const load = useCallback(async (mode: 'init' | 'refresh' | 'silent' = 'init') => {
    const seq = ++loadSeqRef.current;
    if (mode === 'init') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const snap = await loadKanbanFilters().catch(() => null);
      const companyId = snap?.filterCompany || undefined;
      const workshopTypeId = snap?.filterWorkTypeId;
      const filters = {
        companyId,
        workshopTypeId:
          companyId && workshopTypeId && workshopTypeId !== 'none'
            ? workshopTypeId
            : undefined,
      };
      filtersRef.current = filters;
      if (mode === 'silent' && isCachedBoardFresh(filters) && getCachedBoard(filters)) {
        setProjects(getCachedBoard(filters)!.projects.filter((p) => projectIsDeadlineOverdue(p)));
        return;
      }
      const seeded = getCachedBoard(filters);
      if (seeded && mode !== 'refresh') {
        setProjects(seeded.projects.filter((p) => projectIsDeadlineOverdue(p)));
        if (mode === 'init') setLoading(false);
      }
      const board = await fetchProductionBoard(mode === 'refresh', filters);
      if (seq !== loadSeqRef.current) return;
      setProjects(board.projects.filter((p) => projectIsDeadlineOverdue(p)));
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (mode !== 'silent') setError(formatApiError(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadKanbanFilters().then((snap) => {
      const filters = {
        companyId: snap?.filterCompany || undefined,
        workshopTypeId:
          snap?.filterWorkTypeId && snap.filterWorkTypeId !== 'none'
            ? snap.filterWorkTypeId
            : undefined,
      };
      void load(getCachedBoard(filters) ? 'silent' : 'init');
    });
  }, [load]);

  useProductionRealtime({
    onRefresh: (info) => {
      if (info?.patched) {
        const cached = getCachedBoard(filtersRef.current);
        if (cached) setProjects(cached.projects.filter((p) => projectIsDeadlineOverdue(p)));
        return;
      }
      void load('silent');
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
        <TapHighlight style={styles.backBtn} onPress={() => void load('refresh')} hitSlop={8}>
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
          <TapHighlight onPress={() => void load('init')}>
            <Text style={styles.retry}>Thử lại</Text>
          </TapHighlight>
        </View>
      ) : null}

      {loading && projects.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
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
              onRefresh={() => void load('refresh')}
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
