import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ProductionProject } from '../types';

const ACCENT = {
  order: '#3B82F6',
  deadline: '#F59E0B',
  delivery: '#10B981',
  today: '#7C3AED',
  late: '#EF4444',
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatShort(d: Date | null): string {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function relativeToToday(target: Date, today: Date): string {
  const n = daysBetween(today, target);
  if (n === 0) return 'Hôm nay';
  if (n === 1) return 'Còn 1 ngày';
  if (n > 1) return `Còn ${n} ngày`;
  if (n === -1) return '1 ngày trước';
  return `${Math.abs(n)} ngày trước`;
}

export type KanbanDealTimelineProps = {
  project: ProductionProject;
  /** Đã giao / đang VC / hoàn tất — quyết định case 3–4 */
  isDelivered: boolean;
};

type Mode =
  | 'producing'
  | 'near_deadline'
  | 'delivered_early'
  | 'delivered_ontime'
  | 'delivered_late'
  | 'empty';

function resolveMode(
  today: Date,
  order: Date | null,
  deadline: Date | null,
  delivery: Date | null,
  isDelivered: boolean,
): Mode {
  if (!order && !deadline && !delivery) return 'empty';
  if (isDelivered && delivery && deadline) {
    const diff = daysBetween(deadline, delivery);
    if (diff < 0) return 'delivered_early';
    if (diff === 0) return 'delivered_ontime';
    return 'delivered_late';
  }
  if (isDelivered && delivery) return 'delivered_ontime';
  if (deadline) {
    const left = daysBetween(today, deadline);
    if (left <= 1) return 'near_deadline';
  }
  return 'producing';
}

function KanbanDealTimeline({ project, isDelivered }: KanbanDealTimelineProps) {
  const { colors, isDark } = useTheme();
  const today = useMemo(() => startOfDay(new Date()), []);
  const order = parseDay(project.order_date);
  const deadline = parseDay(project.production_deadline || project.deadline);
  const delivery = parseDay(project.delivery_date);
  const mode = resolveMode(today, order, deadline, delivery, isDelivered);

  const [trackW, setTrackW] = useState(0);
  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginTop: 10, gap: 8 },
        cols: { flexDirection: 'row', gap: 4 },
        col: { flex: 1, minWidth: 0, alignItems: 'center' },
        iconWrap: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        },
        colLabel: {
          fontSize: 10,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: 0.2,
        },
        colDate: { fontSize: 12, fontWeight: '800', marginTop: 2 },
        hintPill: {
          marginTop: 4,
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 999,
          maxWidth: '100%',
        },
        colHint: {
          fontSize: 10,
          fontWeight: '700',
          textAlign: 'center',
        },
        trackWrap: {
          height: 28,
          justifyContent: 'center',
          marginTop: 2,
          marginHorizontal: 4,
        },
        trackBg: {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 4,
          borderRadius: 2,
          backgroundColor: isDark ? '#334155' : '#E2E8F0',
        },
        trackFill: {
          position: 'absolute',
          height: 4,
          borderRadius: 2,
        },
        trackRemain: {
          position: 'absolute',
          height: 4,
          borderRadius: 2,
          backgroundColor: isDark ? '#475569' : '#CBD5E1',
          opacity: 0.7,
        },
        dot: {
          position: 'absolute',
          top: 7,
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: isDark ? '#0F172A' : '#FFFFFF',
        },
        checkDot: {
          position: 'absolute',
          top: 4,
          width: 18,
          height: 18,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: isDark ? '#0F172A' : '#FFFFFF',
        },
        todayPill: {
          position: 'absolute',
          top: -2,
          minWidth: 58,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: ACCENT.today,
          alignItems: 'center',
        },
        todayText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
        badge: {
          alignSelf: 'center',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
        },
        badgeText: { fontSize: 11, fontWeight: '800' },
      }),
    [colors, isDark],
  );

  const hasAnyDate = !!(order || deadline || delivery);

  // Khi chưa có ngày nào → chỉ hiện 3 cột placeholder, bỏ qua track + badge.
  if (!hasAnyDate) {
    return (
      <View style={styles.wrap}>
        <View style={styles.cols}>
          <View style={styles.col}>
            <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
              <Ionicons name="calendar-outline" size={16} color={ACCENT.order} />
            </View>
            <Text style={[styles.colLabel, { color: ACCENT.order }]}>Ngày đặt</Text>
            <Text style={[styles.colDate, { color: colors.textFaint }]}>Chưa set</Text>
          </View>
          <View style={styles.col}>
            <View style={[styles.iconWrap, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
              <Ionicons name="timer-outline" size={16} color={ACCENT.deadline} />
            </View>
            <Text style={[styles.colLabel, { color: ACCENT.deadline }]}>Deadline</Text>
            <Text style={[styles.colDate, { color: colors.textFaint }]}>Chưa set</Text>
          </View>
          <View style={styles.col}>
            <View style={[styles.iconWrap, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5' }]}>
              <Ionicons name="car-outline" size={16} color={ACCENT.delivery} />
            </View>
            <Text style={[styles.colLabel, { color: ACCENT.delivery }]}>Ngày giao</Text>
            <Text style={[styles.colDate, { color: colors.textFaint }]}>Chưa set</Text>
          </View>
        </View>
      </View>
    );
  }

  const axisStart = order || deadline || delivery!;
  const axisEndCandidates = [deadline, delivery, !isDelivered ? today : null].filter(Boolean) as Date[];
  const axisEnd = axisEndCandidates.reduce(
    (max, d) => (d.getTime() > max.getTime() ? d : max),
    order || deadline || delivery!,
  );
  const spanMs = Math.max(1, axisEnd.getTime() - axisStart.getTime());
  const posOf = (d: Date | null) => {
    if (!d) return null;
    return clamp01((d.getTime() - axisStart.getTime()) / spanMs);
  };

  const orderPos = posOf(order) ?? 0;
  const deadlinePos = posOf(deadline);
  const deliveryPos = posOf(delivery);
  const todayPos = posOf(today);

  const fillEndPos = isDelivered
    ? (deliveryPos ?? deadlinePos ?? 1)
    : Math.min(1, todayPos ?? 0);

  const fillColor =
    mode === 'delivered_early' ? ACCENT.delivery
      : mode === 'delivered_late' ? ACCENT.late
        : mode === 'delivered_ontime' ? ACCENT.order
          : mode === 'near_deadline' ? ACCENT.deadline
            : ACCENT.order;

  const statusBadge = (() => {
    if (mode === 'delivered_early' && delivery && deadline) {
      const n = Math.abs(daysBetween(deadline, delivery));
      return {
        text: `✔ Giao sớm ${n} ngày so với deadline`,
        bg: isDark ? '#064E3B' : '#ECFDF5',
        fg: isDark ? '#6EE7B7' : '#047857',
        border: isDark ? '#059669' : '#A7F3D0',
      };
    }
    if (mode === 'delivered_ontime') {
      return {
        text: '✔ Giao đúng hạn',
        bg: isDark ? '#1E3A5F' : '#EFF6FF',
        fg: isDark ? '#93C5FD' : '#1D4ED8',
        border: isDark ? '#3B82F6' : '#BFDBFE',
      };
    }
    if (mode === 'delivered_late' && delivery && deadline) {
      const n = Math.abs(daysBetween(deadline, delivery));
      return {
        text: `⚠ Trễ ${n} ngày so với deadline`,
        bg: isDark ? '#7F1D1D' : '#FEF2F2',
        fg: isDark ? '#FCA5A5' : '#B91C1C',
        border: isDark ? '#EF4444' : '#FECACA',
      };
    }
    return null;
  })();

  const orderHint = order ? relativeToToday(order, today) : '';
  const deadlineHint = (() => {
    if (!deadline) return '';
    if (isDelivered && delivery) {
      const n = daysBetween(delivery, deadline);
      if (n > 0) return `${n} ngày sau`;
      if (n === 0) return 'Đúng hạn';
      return `${Math.abs(n)} ngày trước`;
    }
    return relativeToToday(deadline, today);
  })();
  const deliveryHint = (() => {
    if (!delivery) return '';
    if (mode === 'delivered_early') return 'Đã giao sớm';
    if (mode === 'delivered_ontime') return 'Đúng hạn';
    if (mode === 'delivered_late') return 'Giao trễ';
    return relativeToToday(delivery, today);
  })();

  const deliveryColor =
    mode === 'delivered_late'
      ? ACCENT.late
      : mode === 'delivered_ontime'
        ? colors.text
        : ACCENT.delivery;

  const orderHintTone = {
    bg: isDark ? '#1E3A5F' : '#DBEAFE',
    fg: isDark ? '#93C5FD' : '#1D4ED8',
  };
  const deadlineHintTone = (() => {
    if (mode === 'near_deadline' || (deadline && daysBetween(today, deadline) < 0 && !isDelivered)) {
      return {
        bg: isDark ? '#7C2D12' : '#FFEDD5',
        fg: isDark ? '#FDBA74' : '#C2410C',
      };
    }
    return {
      bg: isDark ? '#78350F' : '#FEF3C7',
      fg: isDark ? '#FCD34D' : '#B45309',
    };
  })();
  const deliveryHintTone = (() => {
    if (mode === 'delivered_early') {
      return { bg: isDark ? '#064E3B' : '#D1FAE5', fg: isDark ? '#6EE7B7' : '#047857' };
    }
    if (mode === 'delivered_ontime') {
      return { bg: isDark ? '#1E3A5F' : '#DBEAFE', fg: isDark ? '#93C5FD' : '#1D4ED8' };
    }
    if (mode === 'delivered_late') {
      return { bg: isDark ? '#7F1D1D' : '#FEE2E2', fg: isDark ? '#FCA5A5' : '#B91C1C' };
    }
    return { bg: isDark ? '#064E3B' : '#D1FAE5', fg: isDark ? '#6EE7B7' : '#047857' };
  })();

  const showTodayPill = !isDelivered && todayPos != null
    && today.getTime() >= axisStart.getTime()
    && today.getTime() <= axisEnd.getTime() + 86400000;

  const markerLeft = (p: number) => Math.max(0, Math.min(trackW - 14, p * trackW - 7));
  const pillLeft = (p: number) => Math.max(0, Math.min(Math.max(0, trackW - 64), p * trackW - 32));

  return (
    <View style={styles.wrap}>
      <View style={styles.cols}>
        <View style={styles.col}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
            <Ionicons name="calendar-outline" size={16} color={ACCENT.order} />
          </View>
          <Text style={[styles.colLabel, { color: ACCENT.order }]}>Ngày đặt</Text>
          <Text style={[styles.colDate, { color: order ? colors.text : colors.textFaint }]}>
            {order ? formatShort(order) : 'Chưa set'}
          </Text>
          {orderHint ? (
            <View style={[styles.hintPill, { backgroundColor: orderHintTone.bg }]}>
              <Text style={[styles.colHint, { color: orderHintTone.fg }]} numberOfLines={1}>
                {orderHint}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.col}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
            <Ionicons name="timer-outline" size={16} color={ACCENT.deadline} />
          </View>
          <Text style={[styles.colLabel, { color: ACCENT.deadline }]}>Deadline</Text>
          <Text style={[styles.colDate, { color: deadline ? colors.text : colors.textFaint }]}>
            {deadline ? formatShort(deadline) : 'Chưa set'}
          </Text>
          {deadlineHint ? (
            <View style={[styles.hintPill, { backgroundColor: deadlineHintTone.bg }]}>
              <Text style={[styles.colHint, { color: deadlineHintTone.fg }]} numberOfLines={1}>
                {deadlineHint}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.col}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: mode === 'delivered_late'
                  ? (isDark ? '#7F1D1D' : '#FEE2E2')
                  : (isDark ? '#064E3B' : '#D1FAE5'),
              },
            ]}
          >
            <Ionicons name="car-outline" size={16} color={deliveryColor === colors.text ? ACCENT.delivery : deliveryColor} />
          </View>
          <Text style={[styles.colLabel, { color: deliveryColor === colors.text ? ACCENT.delivery : deliveryColor }]}>
            Ngày giao
          </Text>
          <Text style={[styles.colDate, { color: delivery ? colors.text : colors.textFaint }]}>
            {delivery ? formatShort(delivery) : 'Chưa set'}
          </Text>
          {deliveryHint ? (
            <View style={[styles.hintPill, { backgroundColor: deliveryHintTone.bg }]}>
              <Text style={[styles.colHint, { color: deliveryHintTone.fg }]} numberOfLines={1}>
                {deliveryHint}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.trackWrap} onLayout={onTrackLayout}>
        <View style={styles.trackBg} />
        {isDelivered && deliveryPos != null && deadlinePos != null && deliveryPos < deadlinePos && trackW > 0 ? (
          <View
            style={[
              styles.trackRemain,
              {
                left: deliveryPos * trackW,
                width: Math.max(0, (deadlinePos - deliveryPos) * trackW),
              },
            ]}
          />
        ) : null}
        {trackW > 0 ? (
          <View
            style={[
              styles.trackFill,
              {
                left: orderPos * trackW,
                width: Math.max(4, (fillEndPos - orderPos) * trackW),
                backgroundColor: fillColor,
              },
            ]}
          />
        ) : null}

        {trackW > 0 ? (
          <View style={[styles.dot, { left: markerLeft(orderPos), backgroundColor: ACCENT.order }]} />
        ) : null}

        {deadlinePos != null && trackW > 0 ? (
          <View
            style={[
              styles.dot,
              { left: markerLeft(deadlinePos), backgroundColor: ACCENT.deadline },
            ]}
          />
        ) : null}

        {isDelivered && deliveryPos != null && trackW > 0 ? (
          <View
            style={[
              styles.checkDot,
              {
                left: markerLeft(deliveryPos) - 2,
                backgroundColor: fillColor,
              },
            ]}
          >
            <Ionicons name="checkmark" size={10} color="#FFF" />
          </View>
        ) : deliveryPos != null && trackW > 0 ? (
          <View
            style={[
              styles.dot,
              { left: markerLeft(deliveryPos), backgroundColor: ACCENT.delivery },
            ]}
          />
        ) : null}

        {showTodayPill && todayPos != null && trackW > 0 ? (
          <View style={[styles.todayPill, { left: pillLeft(todayPos) }]}>
            <Text style={styles.todayText}>Hôm nay</Text>
          </View>
        ) : null}
      </View>

      {statusBadge ? (
        <View style={[styles.badge, { backgroundColor: statusBadge.bg, borderColor: statusBadge.border }]}>
          <Text style={[styles.badgeText, { color: statusBadge.fg }]}>{statusBadge.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default React.memo(KanbanDealTimeline, (prev, next) => {
  const a = prev.project;
  const b = next.project;
  return (
    prev.isDelivered === next.isDelivered &&
    a.order_date === b.order_date &&
    a.production_deadline === b.production_deadline &&
    a.deadline === b.deadline &&
    a.delivery_date === b.delivery_date
  );
});
