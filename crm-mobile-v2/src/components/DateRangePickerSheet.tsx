import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radii, Spacing, useColors, type ThemeColors } from '../theme';
import { vnAddDaysYmd, vnTodayYmd } from '../lib/vnDate';

type Props = {
  visible: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  accent?: string;
  onConfirm: (from: string, to: string) => void;
  onClear?: () => void;
  onClose: () => void;
};

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function parseIso(iso?: string | null): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

/**
 * Chọn khoảng ngày trong 1 sheet: chạm ngày bắt đầu → chạm ngày kết thúc → Áp dụng.
 */
export default function DateRangePickerSheet({
  visible,
  dateFrom,
  dateTo,
  accent,
  onConfirm,
  onClear,
  onClose,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const tint = accent ?? Colors.blue;

  const todayIso = useMemo(() => vnTodayYmd(), []);
  const initial = parseIso(dateFrom) || parseIso(dateTo) || (() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  })();

  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const [start, setStart] = useState<string | null>(dateFrom || null);
  const [end, setEnd] = useState<string | null>(dateTo || null);
  /** true = đang chờ chọn ngày kết thúc */
  const [pickingEnd, setPickingEnd] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const seed = parseIso(dateFrom) || parseIso(dateTo);
    if (seed) setView({ y: seed.y, m: seed.m });
    setStart(dateFrom || null);
    setEnd(dateTo || null);
    setPickingEnd(!!dateFrom && !dateTo);
  }, [visible, dateFrom, dateTo]);

  const cells = useMemo(() => {
    const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [view]);

  const shiftMonth = (delta: number) => {
    setView((p) => {
      const m = p.m + delta;
      if (m < 0) return { y: p.y - 1, m: 11 };
      if (m > 11) return { y: p.y + 1, m: 0 };
      return { y: p.y, m };
    });
  };

  const ordered = useMemo(() => {
    if (!start) return { from: null as string | null, to: null as string | null };
    if (!end) return { from: start, to: null as string | null };
    return start <= end ? { from: start, to: end } : { from: end, to: start };
  }, [start, end]);

  const onDayPress = (iso: string) => {
    if (!start || (start && end) || !pickingEnd) {
      setStart(iso);
      setEnd(null);
      setPickingEnd(true);
      return;
    }
    setEnd(iso);
    setPickingEnd(false);
  };

  const applyPreset = (from: string, to: string) => {
    setStart(from);
    setEnd(to);
    setPickingEnd(false);
    const p = parseIso(from);
    if (p) setView({ y: p.y, m: p.m });
  };

  const canApply = !!(ordered.from && ordered.to);
  const hint = !start
    ? 'Chọn ngày bắt đầu'
    : pickingEnd || !end
      ? 'Chọn ngày kết thúc'
      : `${ordered.from} → ${ordered.to}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Chọn khoảng ngày</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.hintBar, { borderColor: tint + '55', backgroundColor: tint + '14' }]}>
            <Ionicons name="calendar-outline" size={16} color={tint} />
            <Text style={[styles.hintTxt, { color: tint }]} numberOfLines={1}>{hint}</Text>
          </View>

          <View style={styles.presetRow}>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const to = todayIso;
                const from = vnAddDaysYmd(to, -6) || to;
                applyPreset(from, to);
              }}
            >
              <Text style={styles.presetTxt}>7 ngày</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const to = todayIso;
                const from = vnAddDaysYmd(to, -29) || to;
                applyPreset(from, to);
              }}
            >
              <Text style={styles.presetTxt}>30 ngày</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const [y, m] = todayIso.split('-').map(Number);
                const from = `${y}-${pad(m)}-01`;
                applyPreset(from, todayIso);
              }}
            >
              <Text style={styles.presetTxt}>Tháng này</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{MONTHS[view.m]} {view.y}</Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekTxt}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={`e${i}`} style={styles.cell} />;
              const iso = toIso(view.y, view.m, d);
              const isStart = ordered.from === iso;
              const isEnd = ordered.to === iso;
              const inRange = !!(
                ordered.from
                && ordered.to
                && iso >= ordered.from
                && iso <= ordered.to
              );
              const isToday = iso === todayIso;
              return (
                <TouchableOpacity
                  key={iso}
                  style={styles.cell}
                  activeOpacity={0.7}
                  onPress={() => onDayPress(iso)}
                >
                  <View
                    style={[
                      styles.dayWrap,
                      inRange && !isStart && !isEnd && { backgroundColor: tint + '28' },
                      (isStart || isEnd) && { backgroundColor: tint },
                      !inRange && !isStart && isToday && { borderWidth: 1, borderColor: tint },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayTxt,
                        (isStart || isEnd) && { color: '#fff', fontWeight: '800' },
                        inRange && !isStart && !isEnd && { color: tint, fontWeight: '700' },
                        !inRange && isToday && { color: tint, fontWeight: '800' },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            {onClear ? (
              <TouchableOpacity
                style={styles.footBtn}
                onPress={() => {
                  onClear();
                  onClose();
                }}
              >
                <Text style={styles.footClear}>Xóa</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.footBtn,
                styles.footPrimary,
                { backgroundColor: canApply ? tint : Colors.surfaceSoft },
                !canApply && { opacity: 0.55 },
              ]}
              disabled={!canApply}
              onPress={() => {
                if (!ordered.from || !ordered.to) return;
                onConfirm(ordered.from, ordered.to);
                onClose();
              }}
            >
              <Text style={[styles.footApply, !canApply && { color: Colors.textFaint }]}>
                Áp dụng
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: Spacing.lg,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  title: { color: Colors.text, fontSize: 17, fontWeight: '900' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  hintTxt: { flex: 1, fontSize: 13, fontWeight: '800' },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row', marginTop: 6, marginBottom: 4 },
  weekTxt: { flex: 1, textAlign: 'center', color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as unknown as number, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayTxt: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  footBtn: {
    flex: 1,
    height: 46,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footPrimary: { borderWidth: 0, flex: 2 },
  footClear: { color: Colors.textMuted, fontSize: 15, fontWeight: '700' },
  footApply: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
