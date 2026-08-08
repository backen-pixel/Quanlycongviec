import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Radii, type AppColors } from '../../theme';

export type CalendarMode = 'week' | 'month';

export type DayMark = { color: string };

export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const DAY_LABEL = ['CN', 'TH2', 'TH3', 'TH4', 'TH5', 'TH6', 'TH7'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function fullDayLabel(d: Date): string {
  const wd = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()];
  return `${wd}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function rangeLabel(mode: CalendarMode, cursor: Date, rangeFrom: Date, rangeTo: Date): string {
  if (mode === 'month') {
    return `Tháng ${cursor.getMonth() + 1}/${cursor.getFullYear()}`;
  }
  return `${pad(rangeFrom.getDate())}/${pad(rangeFrom.getMonth() + 1)} – ${pad(rangeTo.getDate())}/${pad(rangeTo.getMonth() + 1)}/${rangeTo.getFullYear()}`;
}

type Props = {
  mode: CalendarMode;
  cursor: Date;
  selectedDay: Date;
  marksByDay: Map<string, DayMark[]>;
  onModeChange: (mode: CalendarMode) => void;
  onCursorChange: (next: Date) => void;
  onSelectDay: (day: Date) => void;
};

export default function CalendarChrome({
  mode,
  cursor,
  selectedDay,
  marksByDay,
  onModeChange,
  onCursorChange,
  onSelectDay,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const today = useMemo(() => new Date(), []);

  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(cursor);
      return { from, to: addDays(from, 6) };
    }
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from, to };
  }, [mode, cursor]);

  const weekDays = useMemo(() => {
    const from = startOfWeek(mode === 'week' ? cursor : selectedDay);
    return Array.from({ length: 7 }, (_, i) => addDays(from, i));
  }, [mode, cursor, selectedDay]);

  const monthMatrix = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, inMonth: date.getMonth() === cursor.getMonth() };
    });
  }, [cursor]);

  const navPrev = () => {
    if (mode === 'week') {
      const next = addDays(cursor, -7);
      onCursorChange(next);
      onSelectDay(addDays(selectedDay, -7));
    } else {
      const next = addMonths(cursor, -1);
      onCursorChange(next);
      onSelectDay(new Date(next.getFullYear(), next.getMonth(), Math.min(selectedDay.getDate(), 28)));
    }
  };

  const navNext = () => {
    if (mode === 'week') {
      const next = addDays(cursor, 7);
      onCursorChange(next);
      onSelectDay(addDays(selectedDay, 7));
    } else {
      const next = addMonths(cursor, 1);
      onCursorChange(next);
      onSelectDay(new Date(next.getFullYear(), next.getMonth(), Math.min(selectedDay.getDate(), 28)));
    }
  };

  return (
    <View>
      <View style={styles.modeRow}>
        {(['week', 'month'] as CalendarMode[]).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => onModeChange(m)}
            >
              <Ionicons
                name={m === 'week' ? 'calendar-outline' : 'grid-outline'}
                size={15}
                color={active ? '#fff' : colors.textMuted}
              />
              <Text style={[styles.modeTxt, active && styles.modeTxtActive]}>
                {m === 'week' ? 'Tuần' : 'Tháng'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={navPrev} hitSlop={6}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.navLabel}>{rangeLabel(mode, cursor, range.from, range.to)}</Text>
        <Pressable style={styles.navBtn} onPress={navNext} hitSlop={6}>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      {mode === 'week' ? (
        <View style={styles.weekStrip}>
          {weekDays.map((d) => {
            const key = ymd(d);
            const marks = marksByDay.get(key) || [];
            const selected = isSameDay(d, selectedDay);
            const isToday = isSameDay(d, today);
            return (
              <Pressable
                key={key}
                style={[styles.weekDay, selected && styles.weekDaySelected]}
                onPress={() => onSelectDay(d)}
              >
                <Text style={[styles.weekDayName, selected && styles.weekDayTxtSel]}>
                  {DAY_LABEL[d.getDay()]}
                </Text>
                <Text
                  style={[
                    styles.weekDayNum,
                    selected && styles.weekDayTxtSel,
                    isToday && !selected && { color: colors.primary },
                  ]}
                >
                  {d.getDate()}
                </Text>
                <View style={styles.dotsRow}>
                  {marks.slice(0, 3).map((m, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: m.color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.monthWrap}>
          <View style={styles.weekHeaderRow}>
            {WEEKDAY_SHORT.map((w, i) => (
              <Text key={w} style={[styles.weekHeaderTxt, i === 0 && { color: colors.danger }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {monthMatrix.map(({ date, inMonth }) => {
              const key = ymd(date);
              const marks = marksByDay.get(key) || [];
              const selected = isSameDay(date, selectedDay);
              const isToday = isSameDay(date, today);
              const isSunday = date.getDay() === 0;
              return (
                <Pressable
                  key={key}
                  style={[styles.monthCell, selected && styles.monthCellSelected]}
                  onPress={() => {
                    onSelectDay(date);
                    if (!inMonth) onCursorChange(new Date(date.getFullYear(), date.getMonth(), 1));
                  }}
                >
                  <Text
                    style={[
                      styles.monthCellNum,
                      !inMonth && styles.monthCellMuted,
                      isSunday && inMonth && { color: colors.danger },
                      isToday && { color: colors.primary, fontWeight: '900' },
                      selected && styles.weekDayTxtSel,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  <View style={styles.dotsRow}>
                    {marks.slice(0, 3).map((m, i) => (
                      <View key={i} style={[styles.dotSm, { backgroundColor: m.color }]} />
                    ))}
                  </View>
                  {marks.length > 3 ? (
                    <Text style={styles.moreTxt}>+{marks.length - 3}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      backgroundColor: colors.bgElevated,
      borderRadius: Radii.md,
      padding: 4,
      marginHorizontal: 14,
    },
    modeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: Radii.sm,
    },
    modeBtnActive: { backgroundColor: colors.primary },
    modeTxt: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
    modeTxtActive: { color: '#fff' },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingHorizontal: 18,
    },
    navBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    navLabel: { color: colors.text, fontSize: 16, fontWeight: '900' },
    weekStrip: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 14 },
    weekDay: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 4,
    },
    weekDaySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    weekDayName: { color: colors.textFaint, fontSize: 10, fontWeight: '800' },
    weekDayNum: { color: colors.text, fontSize: 18, fontWeight: '900' },
    weekDayTxtSel: { color: '#fff' },
    dotsRow: { flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' },
    dot: { width: 5, height: 5, borderRadius: 3 },
    dotSm: { width: 4, height: 4, borderRadius: 2 },
    monthWrap: { paddingHorizontal: 12, paddingTop: 14 },
    weekHeaderRow: { flexDirection: 'row', marginBottom: 6 },
    weekHeaderTxt: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    monthCell: {
      width: `${100 / 7}%` as unknown as number,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 4,
      borderRadius: Radii.sm,
    },
    monthCellSelected: { backgroundColor: colors.primary },
    monthCellNum: { color: colors.text, fontSize: 14, fontWeight: '700' },
    monthCellMuted: { color: colors.textFaint, opacity: 0.45 },
    moreTxt: {
      color: colors.textFaint,
      fontSize: 8,
      fontWeight: '800',
      position: 'absolute',
      bottom: 2,
      right: 6,
    },
  });
}
