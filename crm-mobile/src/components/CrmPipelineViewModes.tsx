import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CrmLeadListItem } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatVND, formatDate, calculateDays, stageTintBg } from '../lib/formatUtils';

export type KanbanStageRow = {
  id: string;
  name?: string | null;
  color?: string | null;
  icon?: string | null;
  is_lost?: boolean | null;
  is_won?: boolean | null;
};
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
  stages: KanbanStageRow[];
  navigation: Nav;
  tabLabel: string;
  pipelineKind: 'lead' | 'deal';
  onMoveToStage: (leadId: string, stageId: string) => Promise<void>;
};

function KanbanLeadCard({
  item,
  onOpen,
  onRequestMove,
}: {
  item: CrmLeadListItem;
  onOpen: () => void;
  onRequestMove: () => void;
}) {
  const stColor = item.stage?.color || '#94a3b8';
  const days = calculateDays(item.created_at);
  const dayStyle = days > 30 ? styles.kdHot : days > 14 ? styles.kdWarm : styles.kdCool;
  const owner = item.assignee?.full_name || item.lead_owner?.full_name;

  return (
    <TouchableOpacity
      style={styles.kanCard}
      onPress={onOpen}
      onLongPress={onRequestMove}
      delayLongPress={380}
      activeOpacity={0.88}
    >
      <View style={styles.kanCardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kanCardCode}>{item.code || '—'}</Text>
          <View style={styles.kanTitleRow}>
            <Text style={styles.kanCardTitle} numberOfLines={2}>
              {item.title || '—'}
            </Text>
            {item.is_new_for_current_user ? (
              <View style={styles.kanNew}>
                <Text style={styles.kanNewTxt}>MỚI</Text>
              </View>
            ) : null}
          </View>
        </View>
        {item.stage?.name ? (
          <View style={[styles.kanStPill, { backgroundColor: stageTintBg(stColor) }]}>
            <Text style={[styles.kanStTxt, { color: stColor }]} numberOfLines={2}>
              {(item.stage.icon ? `${item.stage.icon} ` : '') + item.stage.name}
            </Text>
          </View>
        ) : null}
      </View>
      {item.customer?.full_name ? (
        <Text style={styles.kanCardSub} numberOfLines={1}>
          {item.customer.full_name}
        </Text>
      ) : null}
      {item.customer?.phone ? (
        <Text style={styles.kanPhone} numberOfLines={1}>
          📞 {item.customer.phone}
        </Text>
      ) : null}
      {item.source?.name ? (
        <Text style={styles.kanSrc} numberOfLines={1}>
          {(item.source.icon ? `${item.source.icon} ` : '') + item.source.name}
        </Text>
      ) : null}
      {item.estimated_value != null && item.estimated_value > 0 ? (
        <Text style={styles.kanCardVal}>{formatVND(item.estimated_value)}</Text>
      ) : null}
      <View style={styles.kanCardFoot}>
        <Text style={dayStyle}>{days} ngày</Text>
        {owner ? (
          <Text style={styles.kanOwner} numberOfLines={1}>
            👤 {owner}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity style={styles.kanMoveBtn} onPress={onRequestMove} hitSlop={8}>
        <Text style={styles.kanMoveBtnTxt}>⇄ Chuyển cột</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export function CrmPipelineKanbanView({
  items,
  stages,
  navigation,
  tabLabel,
  pipelineKind,
  onMoveToStage,
}: KanbanProps) {
  const [moveItem, setMoveItem] = useState<CrmLeadListItem | null>(null);
  const [moving, setMoving] = useState(false);

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

  const pickableStages = useMemo(
    () =>
      stages.filter((s) => {
        if (s.is_lost) return false;
        if (pipelineKind === 'lead' && s.is_won) return false;
        return true;
      }),
    [stages, pipelineKind],
  );

  const applyStage = async (stageId: string) => {
    if (!moveItem) return;
    setMoving(true);
    try {
      await onMoveToStage(moveItem.id, stageId);
      setMoveItem(null);
    } catch {
      /* parent đã Alert */
    } finally {
      setMoving(false);
    }
  };

  return (
    <View>
      <Text style={styles.kanHint}>
        Giữ thẻ hoặc chọn «Chuyển cột» để đổi giai đoạn (kéo-thả đa cột trên native sẽ bổ sung sau).
      </Text>
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
                  <KanbanLeadCard
                    key={item.id}
                    item={item}
                    onOpen={() => navigation.navigate('LeadDetail', { id: item.id })}
                    onRequestMove={() => setMoveItem(item)}
                  />
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

      <Modal visible={!!moveItem} animationType="fade" transparent onRequestClose={() => !moving && setMoveItem(null)}>
        <Pressable style={styles.mvBackdrop} onPress={() => !moving && setMoveItem(null)}>
          <Pressable style={styles.mvSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.mvTitle}>Chuyển sang cột</Text>
            <Text style={styles.mvSub} numberOfLines={2}>
              {moveItem?.code} · {moveItem?.title}
            </Text>
            {moving ? <ActivityIndicator style={{ marginVertical: 16 }} color={CrmColors.blue600} /> : null}
            <FlatList
              data={pickableStages}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: s }) => {
                const same = !!(moveItem && String(moveItem.stage_id) === s.id);
                const c = s.color || '#64748b';
                return (
                  <TouchableOpacity
                    style={[styles.mvRow, same && styles.mvRowOff]}
                    disabled={moving || same}
                    onPress={() => void applyStage(s.id)}
                  >
                    <View style={[styles.mvDot, { backgroundColor: c }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mvRowTxt}>
                        {(s.icon ? `${s.icon} ` : '') + (s.name || '—')}
                      </Text>
                      {same ? <Text style={styles.mvSame}>Đang ở cột này</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.muted}>Không có giai đoạn phù hợp để chuyển nhanh.</Text>}
            />
            <TouchableOpacity style={styles.mvClose} onPress={() => !moving && setMoveItem(null)}>
              <Text style={styles.mvCloseTxt}>Hủy</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
  kanHint: {
    fontSize: 11,
    color: CrmColors.gray500,
    paddingHorizontal: 14,
    marginBottom: 8,
    lineHeight: 16,
  },
  kanbanH: { maxHeight: 480, marginBottom: 8 },
  kanbanHContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  kanCol: {
    width: 248,
    maxHeight: 460,
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
  kanColScroll: { maxHeight: 400, paddingHorizontal: 8, paddingVertical: 8 },
  kanCard: {
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  kanCardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  kanTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  kanCardCode: { fontSize: 11, fontWeight: '700', color: CrmColors.blue600 },
  kanCardTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: CrmColors.gray900 },
  kanNew: {
    backgroundColor: CrmColors.rose500,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kanNewTxt: { fontSize: 9, fontWeight: '800', color: '#fff' },
  kanStPill: { maxWidth: 88, paddingHorizontal: 6, paddingVertical: 4, borderRadius: CrmRadii.full },
  kanStTxt: { fontSize: 9, fontWeight: '700' },
  kanCardSub: { fontSize: 11, color: CrmColors.gray600, marginTop: 6 },
  kanPhone: { fontSize: 11, color: CrmColors.gray700, marginTop: 2 },
  kanSrc: { fontSize: 10, color: CrmColors.gray500, marginTop: 4 },
  kanCardVal: { fontSize: 12, fontWeight: '800', color: CrmColors.gray900, marginTop: 6 },
  kanCardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  kdHot: { fontSize: 10, fontWeight: '700', color: '#dc2626' },
  kdWarm: { fontSize: 10, fontWeight: '700', color: '#ea580c' },
  kdCool: { fontSize: 10, color: CrmColors.gray400 },
  kanOwner: { flex: 1, fontSize: 10, color: CrmColors.gray500, textAlign: 'right' },
  kanMoveBtn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: CrmRadii.md, backgroundColor: CrmColors.white, borderWidth: 1, borderColor: CrmColors.gray200 },
  kanMoveBtnTxt: { fontSize: 10, fontWeight: '800', color: CrmColors.blue700 },
  mvBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  mvSheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    padding: 16,
    maxHeight: '80%',
  },
  mvTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  mvSub: { fontSize: 13, color: CrmColors.gray600, marginTop: 6, marginBottom: 12 },
  mvRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  mvRowOff: { opacity: 0.45 },
  mvDot: { width: 10, height: 10, borderRadius: 5 },
  mvRowTxt: { fontSize: 15, fontWeight: '600', color: CrmColors.gray900 },
  mvSame: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  mvClose: { marginTop: 12, alignItems: 'center', padding: 10 },
  mvCloseTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.blue700 },
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
