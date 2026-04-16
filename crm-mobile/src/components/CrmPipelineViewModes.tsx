import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CrmLeadListItem } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVND, formatDate, calculateDays, stageTintBg } from '../lib/formatUtils';

type StageRow = { id: string; name?: string | null; color?: string | null; icon?: string | null };
type Nav = NativeStackNavigationProp<CrmStackParamList, 'LeadList'>;

function dayKeyFromIso(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthMatrix(year: number, month1: number) {
  const first = new Date(year, month1 - 1, 1);
  const startWeekday = first.getDay();
  const mondayOffset = startWeekday === 0 ? 6 : startWeekday - 1;
  const gridStart = new Date(year, month1 - 1, 1 - mondayOffset);
  const weeks: { y: number; m: number; d: number; inMonth: boolean; key: string }[][] = [];
  let cur = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const row: { y: number; m: number; d: number; inMonth: boolean; key: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      const inMonth = cur.getMonth() === month1 - 1;
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      row.push({ y, m, d, inMonth, key });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

type KanbanProps = {
  items: CrmLeadListItem[];
  stages: StageRow[];
  navigation: Nav;
  tabLabel: string;
};

export function CrmPipelineKanbanView({ items, stages, navigation, tabLabel }: KanbanProps) {
  const byStage = useMemo(() => {
    const m = new Map<string, CrmLeadListItem[]>();
    stages.forEach((s) => m.set(s.id, []));
    items.forEach((it) => {
      const sid = String(it.stage_id || '');
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push(it);
    });
    return m;
  }, [items, stages]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.kanbanH} contentContainerStyle={styles.kanbanHContent}>
      {stages.map((st) => {
        const col = byStage.get(st.id) || [];
        const color = st.color || '#64748b';
        return (
          <View key={st.id} style={[styles.kanCol, CrmShadow.card]}>
            <View style={[styles.kanColHead, { borderLeftColor: color }]}>
              <Text style={styles.kanColTitle} numberOfLines={2}>
                {(st.icon ? `${st.icon} ` : '') + (st.name || '—')}
              </Text>
              <Text style={styles.kanColCount}>{col.length}</Text>
            </View>
            <ScrollView style={styles.kanColScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              {col.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.kanCard}
                  onPress={() => navigation.navigate('LeadDetail', { id: item.id })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.kanCardCode}>{item.code || '—'}</Text>
                  <Text style={styles.kanCardTitle} numberOfLines={3}>
                    {item.title || '—'}
                  </Text>
                  {item.customer?.full_name ? (
                    <Text style={styles.kanCardSub} numberOfLines={1}>
                      {item.customer.full_name}
                    </Text>
                  ) : null}
                  {item.estimated_value != null && item.estimated_value > 0 ? (
                    <Text style={styles.kanCardVal}>{formatVND(item.estimated_value)}</Text>
                  ) : null}
                  <Text style={styles.kanCardMeta}>{calculateDays(item.created_at)} ngày</Text>
                </TouchableOpacity>
              ))}
              {col.length === 0 ? <Text style={styles.kanEmpty}>Trống</Text> : null}
            </ScrollView>
          </View>
        );
      })}
      {stages.length === 0 ? (
        <Text style={styles.muted}>Chưa có giai đoạn {tabLabel}. Tải lại hoặc cấu hình pipeline trên web.</Text>
      ) : null}
    </ScrollView>
  );
}

type PlannerProps = {
  items: CrmLeadListItem[];
  navigation: Nav;
};

export function CrmPipelinePlannerView({ items, navigation }: PlannerProps) {
  const groups = useMemo(() => {
    const map: Record<string, { name: string; items: CrmLeadListItem[]; total: number }> = {};
    const unassigned: CrmLeadListItem[] = [];
    items.forEach((item) => {
      const owner = item.assignee || item.lead_owner;
      const oid = String(item.assigned_to || item.lead_owner_id || '');
      if (oid && owner?.full_name) {
        if (!map[oid]) map[oid] = { name: owner.full_name, items: [], total: 0 };
        map[oid].items.push(item);
        map[oid].total += Number(item.estimated_value) || 0;
      } else {
        unassigned.push(item);
      }
    });
    const assignees = Object.entries(map)
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.items.length - a.items.length);
    return { assignees, unassigned };
  }, [items]);

  const renderCard = (item: CrmLeadListItem) => {
    const stColor = item.stage?.color || '#94a3b8';
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.planCard, CrmShadow.sm]}
        onPress={() => navigation.navigate('LeadDetail', { id: item.id })}
        activeOpacity={0.85}
      >
        <View style={styles.planCardTop}>
          <Text style={styles.planCardCode}>{item.code || '—'}</Text>
          {item.stage?.name ? (
            <View style={[styles.planStage, { backgroundColor: stageTintBg(stColor) }]}>
              <Text style={[styles.planStageTxt, { color: stColor }]} numberOfLines={1}>
                {(item.stage.icon ? `${item.stage.icon} ` : '') + item.stage.name}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.planCardTitle} numberOfLines={2}>
          {item.title || '—'}
        </Text>
        {item.customer?.full_name ? (
          <Text style={styles.planCardSub} numberOfLines={1}>
            {item.customer.full_name}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.planScroll} contentContainerStyle={styles.planContent} nestedScrollEnabled>
      {groups.assignees.map((g) => (
        <View key={g.id} style={[styles.planBlock, CrmShadow.card]}>
          <View style={styles.planBlockHead}>
            <Text style={styles.planBlockName}>{g.name}</Text>
            <Text style={styles.planBlockMeta}>
              {g.items.length} thẻ · {g.total > 0 ? formatVND(g.total) : '—'}
            </Text>
          </View>
          <View style={styles.planGrid}>{g.items.map(renderCard)}</View>
        </View>
      ))}
      {groups.unassigned.length > 0 ? (
        <View style={[styles.planBlock, styles.planBlockDash]}>
          <View style={styles.planBlockHead}>
            <Text style={styles.planBlockName}>Chưa giao</Text>
            <Text style={styles.planBlockMeta}>{groups.unassigned.length} thẻ</Text>
          </View>
          <View style={styles.planGrid}>{groups.unassigned.map(renderCard)}</View>
        </View>
      ) : null}
      {items.length === 0 ? <Text style={styles.muted}>Không có dữ liệu sau lọc.</Text> : null}
    </ScrollView>
  );
}

type CalendarProps = {
  items: CrmLeadListItem[];
  navigation: Nav;
  onPickDay: (dateKey: string) => void;
};

export function CrmPipelineCalendarView({ items, navigation, onPickDay }: CalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const counts = useMemo(() => {
    const c: Record<string, CrmLeadListItem[]> = {};
    items.forEach((it) => {
      const k = dayKeyFromIso(it.created_at);
      if (!k) return;
      if (!c[k]) c[k] = [];
      c[k].push(it);
    });
    return c;
  }, [items]);

  const matrix = useMemo(() => monthMatrix(year, month), [year, month]);
  const monthNames = [
    '',
    'Tháng 1',
    'Tháng 2',
    'Tháng 3',
    'Tháng 4',
    'Tháng 5',
    'Tháng 6',
    'Tháng 7',
    'Tháng 8',
    'Tháng 9',
    'Tháng 10',
    'Tháng 11',
    'Tháng 12',
  ];

  return (
    <View style={styles.calWrap}>
      <View style={styles.calNav}>
        <TouchableOpacity
          style={styles.calNavBtn}
          onPress={() => {
            if (month <= 1) {
              setMonth(12);
              setYear((y) => y - 1);
            } else setMonth((m) => m - 1);
          }}
        >
          <Text style={styles.calNavBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.calNavTitle}>
          {monthNames[month]} {year}
        </Text>
        <TouchableOpacity
          style={styles.calNavBtn}
          onPress={() => {
            if (month >= 12) {
              setMonth(1);
              setYear((y) => y + 1);
            } else setMonth((m) => m + 1);
          }}
        >
          <Text style={styles.calNavBtnTxt}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.calWeekRow}>
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
          <Text key={d} style={styles.calWeekLbl}>
            {d}
          </Text>
        ))}
      </View>
      {matrix.map((week, wi) => (
        <View key={wi} style={styles.calWeek}>
          {week.map((cell) => {
            const n = (counts[cell.key] || []).length;
            return (
              <TouchableOpacity
                key={cell.key}
                style={[styles.calCell, !cell.inMonth && styles.calCellOff]}
                onPress={() => onPickDay(cell.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.calCellDay, !cell.inMonth && styles.calCellDayOff]}>{cell.d}</Text>
                {n > 0 ? (
                  <View style={styles.calBadge}>
                    <Text style={styles.calBadgeTxt}>{n > 9 ? '9+' : n}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <Text style={styles.calHint}>
        Chạm ô ngày: mở màn hình Sự kiện với ngày đã chọn để tạo lịch hẹn nhanh.
      </Text>
      <ScrollView style={styles.calList} nestedScrollEnabled>
        <Text style={styles.calListH}>Lead/Deal tạo trong tháng này (tối đa 50)</Text>
        {items
          .filter((it) => {
            const k = dayKeyFromIso(it.created_at);
            if (!k) return false;
            const [y, m] = k.split('-').map(Number);
            return y === year && m === month;
          })
          .slice(0, 50)
          .map((it) => (
            <TouchableOpacity
              key={it.id}
              style={styles.calRow}
              onPress={() => navigation.navigate('LeadDetail', { id: it.id })}
            >
              <Text style={styles.calRowDate}>{formatDate(it.created_at)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.calRowTitle} numberOfLines={2}>
                  {it.code} · {it.title}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  kanbanH: { maxHeight: 420, marginBottom: 8 },
  kanbanHContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  kanCol: {
    width: 220,
    maxHeight: 400,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    overflow: 'hidden',
  },
  kanColHead: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderLeftWidth: 4,
    backgroundColor: CrmColors.gray50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kanColTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: CrmColors.gray800 },
  kanColCount: { fontSize: 11, fontWeight: '800', color: CrmColors.gray500 },
  kanColScroll: { maxHeight: 340, paddingHorizontal: 8, paddingVertical: 8 },
  kanCard: {
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  kanCardCode: { fontSize: 11, fontWeight: '700', color: CrmColors.blue600 },
  kanCardTitle: { fontSize: 13, fontWeight: '600', color: CrmColors.gray900, marginTop: 4 },
  kanCardSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 4 },
  kanCardVal: { fontSize: 11, fontWeight: '700', marginTop: 6 },
  kanCardMeta: { fontSize: 10, color: CrmColors.gray400, marginTop: 4 },
  kanEmpty: { fontSize: 12, color: CrmColors.gray400, textAlign: 'center', paddingVertical: 16 },
  muted: { padding: 16, color: CrmColors.gray500, fontSize: 13 },
  planScroll: { maxHeight: 480 },
  planContent: { paddingHorizontal: 12, paddingBottom: 16 },
  planBlock: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginBottom: 12,
    overflow: 'hidden',
  },
  planBlockDash: { borderStyle: 'dashed' as const },
  planBlockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: CrmColors.gray50,
  },
  planBlockName: { fontSize: 14, fontWeight: '800', color: CrmColors.gray900 },
  planBlockMeta: { fontSize: 11, color: CrmColors.gray500, fontWeight: '600' },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  planCard: {
    width: '47%',
    minWidth: 140,
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  planCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  planCardCode: { fontSize: 10, fontWeight: '700', color: CrmColors.blue600 },
  planStage: { maxWidth: 90, paddingHorizontal: 6, paddingVertical: 2, borderRadius: CrmRadii.full },
  planStageTxt: { fontSize: 9, fontWeight: '700' },
  planCardTitle: { fontSize: 12, fontWeight: '600', color: CrmColors.gray900, marginTop: 6 },
  planCardSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 4 },
  calWrap: { paddingHorizontal: 12, marginBottom: 12 },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNavBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  calNavBtnTxt: { fontSize: 22, color: CrmColors.blue600, fontWeight: '700' },
  calNavTitle: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekLbl: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: CrmColors.gray500 },
  calWeek: { flexDirection: 'row', marginBottom: 4 },
  calCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    margin: 2,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calCellOff: { opacity: 0.35 },
  calCellDay: { fontSize: 13, fontWeight: '700', color: CrmColors.gray900 },
  calCellDayOff: { color: CrmColors.gray400 },
  calBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  calBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  calHint: { fontSize: 11, color: CrmColors.gray500, marginTop: 8, marginBottom: 6 },
  calList: { maxHeight: 200 },
  calListH: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 8 },
  calRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  calRowDate: { fontSize: 11, color: CrmColors.gray500, width: 72 },
  calRowTitle: { fontSize: 13, color: CrmColors.gray900, fontWeight: '600' },
});
