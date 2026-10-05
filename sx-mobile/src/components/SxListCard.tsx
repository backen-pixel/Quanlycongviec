import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  countsAsCompletedRevenue,
  projectIsAwaitingDelivery,
  projectIsShipped,
} from '../lib/sxBoardKpis';
import { Radii, Spacing, stageColor, type AppColors } from '../theme';
import type { KanbanStage, ProductionProject } from '../types';

import SpinningLoader from './SpinningLoader';
type Props = {
  item: ProductionProject;
  stage?: KanbanStage | null;
  stages: KanbanStage[];
  moving?: boolean;
  onPress: () => void;
  onMove: () => void;
  onClassify?: () => void;
};

function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fullDate(d: Date | null): string {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

type Tone = 'info' | 'warn' | 'good' | 'bad' | 'violet';
type DateCell = {
  key: 'order' | 'deadline' | 'delivery';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: Tone;
  date: string;
  chip: { text: string; tone: Tone } | null;
};

/** Ba mốc ngày giống thẻ Kanban: đặt hàng → deadline → giao hàng, kèm chip còn/trễ bao nhiêu ngày. */
function buildDateCells(p: ProductionProject, delivered: boolean): DateCell[] {
  const t = new Date();
  const now = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const order = parseDay(p.order_date);
  const deadline = parseDay(p.production_deadline || p.deadline);
  const delivery = parseDay(p.delivery_date);

  let orderChip: DateCell['chip'] = null;
  if (order) {
    const n = dayDiff(order, now);
    orderChip = n <= 0 ? { text: 'Hôm nay', tone: 'violet' } : { text: `${n} ngày trước`, tone: 'info' };
  }

  let deadlineChip: DateCell['chip'] = null;
  let deadlineTone: Tone = 'warn';
  if (deadline) {
    if (delivered) {
      deadlineChip = { text: 'Đã xong', tone: 'good' };
      deadlineTone = 'good';
    } else {
      const left = dayDiff(now, deadline);
      if (left < 0) {
        deadlineChip = { text: `Trễ ${-left} ngày`, tone: 'bad' };
        deadlineTone = 'bad';
      } else {
        deadlineChip = { text: left === 0 ? 'Hôm nay' : `Còn ${left} ngày`, tone: 'warn' };
      }
    }
  }

  let deliveryChip: DateCell['chip'] = null;
  let deliveryTone: Tone = 'good';
  if (delivery) {
    if (delivered) {
      deliveryChip = { text: 'Đã giao', tone: 'good' };
    } else {
      const left = dayDiff(now, delivery);
      if (left < 0) {
        deliveryChip = { text: 'Giao trễ', tone: 'bad' };
        deliveryTone = 'bad';
      } else {
        deliveryChip = { text: left === 0 ? 'Hôm nay' : `Còn ${left} ngày`, tone: 'good' };
      }
    }
  }

  return [
    { key: 'order', label: 'Ngày đặt', icon: 'calendar-outline', tone: 'info', date: fullDate(order), chip: orderChip },
    { key: 'deadline', label: 'Deadline', icon: 'time-outline', tone: deadlineTone, date: fullDate(deadline), chip: deadlineChip },
    { key: 'delivery', label: 'Ngày giao', icon: 'car-outline', tone: deliveryTone, date: fullDate(delivery), chip: deliveryChip },
  ];
}

function vcLabel(p: ProductionProject, stages: KanbanStage[]): string | null {
  if (projectIsAwaitingDelivery(p, stages)) return 'Chờ VC';
  const status = String(p.status || '');
  if (['shipping', 'installing', 'warranty'].includes(status)) return 'Đang VC';
  return null;
}

function SxListCard({
  item,
  stage,
  stages,
  moving,
  onPress,
  onMove,
  onClassify,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const accent = stageColor(stage?.color || null, 0);
  const stageName = stage?.name || item.stage_name || '—';
  const customerLine = [item.customer_name, item.customer_phone].filter(Boolean).join(' · ');
  const owner = item.production_person_name?.trim() || 'Chưa gán';
  const vc = vcLabel(item, stages);
  const delivered = projectIsShipped(item) || countsAsCompletedRevenue(item, stages);
  const overdue = Boolean(item.is_overdue) && !delivered;
  const needsClassify = !item.workshop_type_id && !!onClassify;
  const dateCells = useMemo(() => buildDateCells(item, delivered), [item, delivered]);
  const toneColor = (tone: Tone) =>
    tone === 'info' ? colors.primary : tone === 'warn' ? '#D97706' : tone === 'good' ? '#059669' : tone === 'bad' ? colors.danger : '#7C3AED';

  return (
    <View style={styles.card}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
        accessibilityRole="button"
      >
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.code} numberOfLines={1}>{item.code}</Text>
            {item.workshop_type_name ? (
              <Text style={styles.typeTxt} numberOfLines={1}>{item.workshop_type_name}</Text>
            ) : null}
          </View>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <View style={styles.infoRow}>
            {customerLine ? (
              <View style={[styles.infoItem, { flexShrink: 2 }]}>
                <Ionicons name="person-outline" size={13} color={colors.textFaint} />
                <Text style={styles.customer} numberOfLines={1}>{customerLine}</Text>
              </View>
            ) : null}
            {item.company_name ? (
              <View style={[styles.infoItem, { flexShrink: 0 }]}>
                <Ionicons name="location-outline" size={13} color={colors.textFaint} />
                <Text style={styles.company} numberOfLines={1}>{item.company_name}</Text>
              </View>
            ) : null}
            <View style={[styles.infoItem, { flexShrink: 1 }]}>
              <Ionicons name="pricetag-outline" size={13} color={colors.textFaint} />
              <Text style={styles.owner} numberOfLines={1}>PT: {owner}</Text>
            </View>
          </View>
          <View style={styles.tagRow}>
            <View style={[styles.stagePill, { backgroundColor: `${accent}22` }]}>
              <Text style={[styles.stageTxt, { color: accent }]} numberOfLines={1}>
                {stageName}
              </Text>
            </View>
            {vc ? (
              <View style={[styles.miniTag, { borderColor: colors.primary }]}>
                <Text style={[styles.miniTagTxt, { color: colors.primary }]}>{vc}</Text>
              </View>
            ) : null}
            {overdue ? (
              <View style={[styles.miniTag, { borderColor: colors.danger }]}>
                <Text style={[styles.miniTagTxt, { color: colors.danger }]}>Quá hạn</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      <Pressable onPress={onPress} style={styles.dates} accessibilityRole="button">
        {dateCells.map((c, i) => {
          const col = toneColor(c.tone);
          return (
            <View key={c.key} style={[styles.dateCol, i > 0 && styles.dateColSep]}>
              <View style={styles.dateHead}>
                <View style={[styles.dateIcon, { backgroundColor: `${col}22` }]}>
                  <Ionicons name={c.icon} size={13} color={col} />
                </View>
                <Text style={[styles.dateLabel, { color: col }]} numberOfLines={1}>{c.label}</Text>
              </View>
              <Text style={styles.dateVal} numberOfLines={1}>{c.date}</Text>
              {c.chip ? (
                <View style={[styles.dateChip, { backgroundColor: `${toneColor(c.chip.tone)}22` }]}>
                  <Text style={[styles.dateChipTxt, { color: toneColor(c.chip.tone) }]} numberOfLines={1}>
                    {c.chip.text}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.moveBtn, moving && styles.moveBtnBusy]}
          onPress={needsClassify ? onClassify : onMove}
          disabled={!!moving}
          accessibilityLabel={needsClassify ? 'Phân loại' : 'Chuyển cột'}
        >
          {moving ? (
            <SpinningLoader size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={needsClassify ? 'layers-outline' : 'swap-horizontal'}
                size={16}
                color="#fff"
              />
              <Text style={styles.moveBtnTxt}>
                {needsClassify ? 'Phân loại' : 'Chuyển cột'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default memo(SxListCard);

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: Spacing.lg,
      marginBottom: 10,
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    main: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      paddingBottom: 10,
    },
    mainPressed: { opacity: 0.92 },
    body: { flex: 1, minWidth: 0, gap: 2 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    code: { color: c.primary, fontSize: 12, fontWeight: '800' },
    typeTxt: { color: c.textMuted, fontSize: 11, fontWeight: '700', flexShrink: 1 },
    name: { color: c.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
    infoItem: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
    customer: { color: c.primary, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    company: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    owner: { color: c.textFaint, fontSize: 12, fontWeight: '600', flexShrink: 1 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    miniTag: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    miniTagTxt: { fontSize: 10, fontWeight: '800' },
    meta: { alignItems: 'flex-end', gap: 6, maxWidth: 118 },
    /** Vạch màu theo cột Kanban ở mép trái thẻ — giống thẻ dự án ở Tổng quan. */
    accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    stagePill: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    stageTxt: { fontSize: 11, fontWeight: '800' },
    dates: {
      flexDirection: 'row',
      marginHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    dateCol: { flex: 1, minWidth: 0, gap: 3, paddingRight: 4 },
    dateColSep: { borderLeftWidth: 1, borderLeftColor: c.border, paddingLeft: 10 },
    dateHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dateIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    dateLabel: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
    dateVal: { color: c.text, fontSize: 12.5, fontWeight: '800' },
    dateChip: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    dateChipTxt: { fontSize: 10.5, fontWeight: '800' },
    actions: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    moveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 118,
      minHeight: 36,
      justifyContent: 'center',
    },
    moveBtnBusy: { opacity: 0.7 },
    moveBtnTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  });
