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
  projectIsAwaitingDelivery,
  projectIsDelivered,
} from '../lib/sxBoardKpis';
import { useHolidayIndex, workingDaysBetween, type HolidayIndex } from '../lib/workingDays';
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
  /** false = chỉ xem (nhân viên): ẩn nút Chuyển cột / Phân loại. Mặc định true. */
  canEdit?: boolean;
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
function buildDateCells(p: ProductionProject, delivered: boolean, holidays: HolidayIndex): DateCell[] {
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
      // Đếm ngày LÀM VIỆC (bỏ CN + lễ) giống web «Còn N ngày LV».
      const left = workingDaysBetween(now, deadline, holidays);
      if (dayDiff(now, deadline) < 0) {
        deadlineChip = { text: `Trễ ${-left} ngày LV`, tone: 'bad' };
        deadlineTone = 'bad';
      } else {
        deadlineChip = {
          text: dayDiff(now, deadline) === 0 ? 'Hôm nay' : `Còn ${left} ngày LV`,
          tone: 'warn',
        };
      }
    }
  }

  let deliveryChip: DateCell['chip'] = null;
  let deliveryTone: Tone = 'good';
  if (delivery) {
    if (delivered) {
      deliveryChip = { text: 'Đã giao', tone: 'good' };
    } else {
      const left = workingDaysBetween(now, delivery, holidays);
      if (dayDiff(now, delivery) < 0) {
        deliveryChip = { text: 'Giao trễ', tone: 'bad' };
        deliveryTone = 'bad';
      } else {
        deliveryChip = {
          text: dayDiff(now, delivery) === 0 ? 'Hôm nay' : `Còn ${left} ngày LV`,
          tone: 'good',
        };
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
  canEdit = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const accent = stageColor(stage?.color || null, 0);
  const stageName = stage?.name || item.stage_name || '—';
  const owner = item.production_person_name?.trim() || 'Chưa gán';
  const vc = vcLabel(item, stages);
  // «Đã giao thật», không tính dự án chỉ mới được đẩy sang bảng vận chuyển (xem `projectIsDelivered`).
  const delivered = projectIsDelivered(item, stages);
  const holidays = useHolidayIndex();
  const overdue = Boolean(item.is_overdue) && !delivered;
  const needsClassify = !item.workshop_type_id && !!onClassify;
  const dateCells = useMemo(() => buildDateCells(item, delivered, holidays), [item, delivered, holidays]);
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
        {/* Giảm số View native mỗi thẻ: chữ lồng chữ thay cho View + Text, icon đặt LỒNG trong Text (không tạo View riêng),
            nhãn/viên thuốc là Text có nền + bo + đệm thay vì View bọc Text. */}
        <Text style={styles.topRow} numberOfLines={1}>
          <Text style={styles.code}>{item.code}</Text>
          {item.workshop_type_name ? (
            <Text style={styles.typeTxt}>{`   ${item.workshop_type_name}`}</Text>
          ) : null}
        </Text>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <View style={styles.infoRow}>
          {item.company_name ? (
            <Text style={[styles.company, { flexShrink: 0 }]} numberOfLines={1}>
              <Ionicons name="location-outline" size={13} color={colors.textFaint} />
              {` ${item.company_name}`}
            </Text>
          ) : null}
          <Text style={[styles.owner, { flexShrink: 1 }]} numberOfLines={1}>
            <Ionicons name="pricetag-outline" size={13} color={colors.textFaint} />
            {` PT: ${owner}`}
          </Text>
        </View>
        <View style={styles.tagRow}>
          <Text
            style={[styles.stagePill, styles.stageTxt, { backgroundColor: `${accent}22`, color: accent }]}
            numberOfLines={1}
          >
            {stageName}
          </Text>
          {vc ? (
            <Text style={[styles.miniTag, styles.miniTagTxt, { borderColor: colors.primary, color: colors.primary }]}>
              {vc}
            </Text>
          ) : null}
          {overdue ? (
            <Text style={[styles.miniTag, styles.miniTagTxt, { borderColor: colors.danger, color: colors.danger }]}>
              Quá hạn
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Pressable onPress={onPress} style={styles.dates} accessibilityRole="button">
        {dateCells.map((c, i) => {
          const col = toneColor(c.tone);
          return (
            <View key={c.key} style={[styles.dateCol, i > 0 && styles.dateColSep]}>
              <View style={styles.dateHead}>
                {/* Vòng tròn nền ngay trên chính glyph (một View) thay cho View vòng + View glyph. */}
                <Ionicons
                  name={c.icon}
                  size={13}
                  color={col}
                  style={[styles.dateIcon, { backgroundColor: `${col}22` }]}
                />
                <Text style={[styles.dateLabel, { color: col }]} numberOfLines={1}>{c.label}</Text>
              </View>
              <Text style={styles.dateVal} numberOfLines={1}>{c.date}</Text>
              {c.chip ? (
                <Text
                  style={[
                    styles.dateChip,
                    styles.dateChipTxt,
                    { backgroundColor: `${toneColor(c.chip.tone)}22`, color: toneColor(c.chip.tone) },
                  ]}
                  numberOfLines={1}
                >
                  {c.chip.text}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Pressable>

      {canEdit ? (
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
            <Text style={styles.moveBtnTxt}>
              <Ionicons name={needsClassify ? 'layers-outline' : 'swap-horizontal'} size={16} color="#fff" />
              {`  ${needsClassify ? 'Phân loại' : 'Chuyển cột'}`}
            </Text>
          )}
        </Pressable>
      </View>
      ) : null}
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
    // Pressable chính xếp dọc trực tiếp các dòng nội dung (đã bỏ View bọc `body`).
    main: {
      padding: 14,
      paddingBottom: 10,
      gap: 2,
    },
    mainPressed: { opacity: 0.92 },
    topRow: {},
    code: { color: c.primary, fontSize: 12, fontWeight: '800' },
    typeTxt: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
    name: { color: c.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
    company: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    owner: { color: c.textFaint, fontSize: 12, fontWeight: '600' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    // Các nhãn là Text có nền/viền/đệm (không bọc View) — đặt `overflow: hidden` để nền bo theo góc.
    miniTag: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    miniTagTxt: { fontSize: 10, fontWeight: '800' },
    /** Vạch màu theo cột Kanban ở mép trái thẻ — giống thẻ dự án ở Tổng quan. */
    accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    stagePill: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
      overflow: 'hidden',
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
    dateIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      overflow: 'hidden',
      textAlign: 'center',
      textAlignVertical: 'center',
      lineHeight: 20,
      includeFontPadding: false,
    },
    dateLabel: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
    dateVal: { color: c.text, fontSize: 12.5, fontWeight: '800' },
    dateChip: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
      overflow: 'hidden',
    },
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
