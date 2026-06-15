import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
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

type Props = {
  visible: boolean;
  /** Giá trị hiện tại dạng yyyy-mm-dd. */
  value?: string | null;
  accent?: string;
  onSelect: (isoDate: string) => void;
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

export default function DatePickerSheet({ visible, value, accent, onSelect, onClear, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const tint = accent ?? Colors.blue;

  const initial = parseIso(value) || (() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  })();
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  const todayIso = useMemo(() => {
    const t = new Date();
    return toIso(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  // Lưới ngày: bù ô trống đầu tháng (tuần bắt đầu T2).
  const cells = useMemo(() => {
    const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // 0 = T2
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>{MONTHS[view.m]} {view.y}</Text>
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
              const selected = iso === value;
              const isToday = iso === todayIso;
              return (
                <TouchableOpacity
                  key={iso}
                  style={styles.cell}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelect(iso);
                    onClose();
                  }}
                >
                  <View style={[
                    styles.dayWrap,
                    selected && { backgroundColor: tint },
                    !selected && isToday && { borderWidth: 1, borderColor: tint },
                  ]}>
                    <Text style={[
                      styles.dayTxt,
                      selected && { color: '#fff', fontWeight: '800' },
                      !selected && isToday && { color: tint, fontWeight: '800' },
                    ]}>
                      {d}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.footBtn}
              onPress={() => {
                onClear?.();
                onClose();
              }}
            >
              <Text style={styles.footClear}>Xóa hạn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footBtn, { backgroundColor: tint }]}
              onPress={() => {
                onSelect(todayIso);
                onClose();
              }}
            >
              <Text style={styles.footToday}>Hôm nay</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row', marginTop: 6, marginBottom: 4 },
  weekTxt: { flex: 1, textAlign: 'center', color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayTxt: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 4 },
  footBtn: {
    flex: 1, height: 46, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  footClear: { color: Colors.textMuted, fontSize: 15, fontWeight: '700' },
  footToday: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
