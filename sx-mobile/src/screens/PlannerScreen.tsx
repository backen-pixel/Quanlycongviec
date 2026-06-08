import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { fetchPersonalPlanner, fetchProductionBoard } from '../lib/productionApi';
import { formatMoneyAmount, Radii, Spacing, stageColor } from '../theme';
import type { PersonalPlanner, ProductionBoard, ProductionProject } from '../types';

type SubTab = 'by_owner' | 'personal';

function formatMoneyDisplay(value?: number | null): string {
  const formatted = formatMoneyAmount(value);
  return formatted ? `${formatted} \u20AB` : `0 \u20AB`;
}

export default function PlannerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SubTab>('by_owner');
  const [board, setBoard] = useState<ProductionBoard>({ stages: [], projects: [], kpis: null });
  const [personal, setPersonal] = useState<PersonalPlanner>({ columns: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'init' | 'refresh' = 'init') => {
    if (mode === 'init') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [boardData, personalData] = await Promise.all([
        fetchProductionBoard(),
        fetchPersonalPlanner().catch(() => ({ columns: [], items: [] }) as PersonalPlanner),
      ]);
      setBoard(boardData);
      setPersonal(personalData);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('init');
  }, [load]);

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

  // Nhóm theo người phụ trách (giống tab web "Theo người phụ trách").
  const ownerGroups = useMemo(() => {
    const map = new Map<string, { name: string; items: ProductionProject[]; total: number }>();
    const unassigned: ProductionProject[] = [];
    board.projects.forEach((p) => {
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
  }, [board.projects]);

  const personalColumns = useMemo(() => {
    const itemsByCol = new Map<string, ProductionProject[]>();
    personal.columns.forEach((c) => itemsByCol.set(c.id, []));
    [...personal.items]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .forEach((it) => {
        const proj = projectById.get(it.project_id);
        if (proj && itemsByCol.has(it.column_id)) itemsByCol.get(it.column_id)!.push(proj);
      });
    return personal.columns
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c, i) => ({ col: c, color: stageColor(c.color, i), items: itemsByCol.get(c.id) || [] }));
  }, [personal, projectById]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: Spacing.xl, paddingVertical: 48 },
        header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
        title: { color: colors.text, fontSize: 20, fontWeight: '800' },
        subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
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
        <Text style={styles.title}>Planner</Text>
        <Text style={styles.subtitle}>Sắp xếp & phân bổ dự án sản xuất</Text>
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
              <Text style={styles.empty}>Không có dự án xưởng</Text>
            ) : (
              <>
                {ownerGroups.groups.map((g) => (
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
                    <View style={styles.groupBody}>{g.items.map(renderCard)}</View>
                  </View>
                ))}
                {ownerGroups.unassigned.length ? (
                  <View style={[styles.groupCard, styles.groupCardDashed]}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupNameMuted}>
                        Chưa gán SX ({ownerGroups.unassigned.length})
                      </Text>
                    </View>
                    <View style={styles.groupBody}>{ownerGroups.unassigned.map(renderCard)}</View>
                  </View>
                ) : null}
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
    </View>
  );
}

