import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EVENT_STATUS_META,
  fetchEventsRange,
  type AppEvent,
  type EventStatus,
} from '../api/events';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Mode = 'week' | 'month';

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAY_LABEL = ['CN', 'TH2', 'TH3', 'TH4', 'TH5', 'TH6', 'TH7'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dayKeyOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ymd(d);
}

function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function fullDayLabel(d: Date): string {
  const wd = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()];
  return `${wd}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function statusColor(status: EventStatus, Colors: ThemeColors): string {
  const tone = EVENT_STATUS_META[status].tone;
  return Colors[tone] as string;
}

export default function EventsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [mode, setMode] = useState<Mode>('week');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(cursor);
      const to = addDays(from, 6);
      return { from, to };
    }
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from, to };
  }, [mode, cursor]);

  const load = useCallback(
    async (opts?: { refresh?: boolean; silent?: boolean }) => {
      const isRefresh = opts?.refresh ?? false;
      const silent = opts?.silent ?? false;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (isRefresh && !silent) setRefreshing(true);
      else if (!silent) setLoading(true);
      if (!silent) setError('');
      try {
        // Không truyền company_id — để backend tự xác định theo tài khoản (giống web).
        const list = await fetchEventsRange({
          dateFrom: ymd(range.from),
          dateTo: ymd(range.to),
          search,
          signal: ac.signal,
        });
        if (!ac.signal.aborted) setEvents(list);
      } catch (e: unknown) {
        if (!ac.signal.aborted) {
          setError((e as { message?: string })?.message || 'Không tải được sự kiện');
          setEvents([]);
        }
      } finally {
        if (!ac.signal.aborted) {
          if (!silent) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }
    },
    [range.from, range.to, search],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      void load({ refresh: true, silent: true });
    }, [load]),
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AppEvent[]>();
    for (const e of events) {
      const key = dayKeyOf(e.startTime);
      if (!key) continue;
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [events]);

  const weekDays = useMemo(() => {
    const from = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(from, i));
  }, [cursor]);

  const monthMatrix = useMemo(() => {
    if (mode !== 'month') return [];
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeekSunday(first);
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      cells.push({ date: d, inMonth: d.getMonth() === cursor.getMonth() });
    }
    while (cells.length > 35 && cells.slice(35).every((c) => !c.inMonth)) {
      cells.length = 35;
    }
    return cells;
  }, [mode, cursor]);

  const selectedEvents = useMemo(
    () => eventsByDay.get(ymd(selectedDay)) || [],
    [eventsByDay, selectedDay],
  );

  const rangeLabel = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(cursor);
      const to = addDays(from, 6);
      const sameMonth = from.getMonth() === to.getMonth();
      return sameMonth
        ? `${from.getDate()} — ${to.getDate()} Th${to.getMonth() + 1}`
        : `${from.getDate()} Th${from.getMonth() + 1} — ${to.getDate()} Th${to.getMonth() + 1}`;
    }
    return `Tháng ${cursor.getMonth() + 1}, ${cursor.getFullYear()}`;
  }, [mode, cursor]);

  const navPrev = () => setCursor((c) => (mode === 'week' ? addDays(c, -7) : addMonths(c, -1)));
  const navNext = () => setCursor((c) => (mode === 'week' ? addDays(c, 7) : addMonths(c, 1)));

  const today = new Date();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <Ionicons name="calendar" size={20} color={Colors.blue} />
          <Text style={styles.h1}>Lịch sự kiện</Text>
          <View style={{ flex: 1 }} />
          <View style={styles.countPill}>
            <Text style={styles.countPillTxt}>{events.length} sự kiện</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textFaint} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Tìm sự kiện, khách hàng…"
            placeholderTextColor={Colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchDraft ? (
            <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.modeRow}>
          {(['week', 'month'] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Ionicons
                  name={m === 'week' ? 'calendar-outline' : 'grid-outline'}
                  size={15}
                  color={active ? '#fff' : Colors.textMuted}
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
            <Ionicons name="chevron-back" size={18} color={Colors.text} />
          </Pressable>
          <Text style={styles.navLabel}>{rangeLabel}</Text>
          <Pressable style={styles.navBtn} onPress={navNext} hitSlop={6}>
            <Ionicons name="chevron-forward" size={18} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
        }
      >
        {mode === 'week' ? (
          <View style={styles.weekStrip}>
            {weekDays.map((d) => {
              const key = ymd(d);
              const dayEvents = eventsByDay.get(key) || [];
              const selected = isSameDay(d, selectedDay);
              const isToday = isSameDay(d, today);
              return (
                <Pressable
                  key={key}
                  style={[styles.weekDay, selected && styles.weekDaySelected]}
                  onPress={() => setSelectedDay(d)}
                >
                  <Text style={[styles.weekDayName, selected && styles.weekDayTxtSel]}>
                    {DAY_LABEL[d.getDay()]}
                  </Text>
                  <Text style={[styles.weekDayNum, selected && styles.weekDayTxtSel, isToday && !selected && { color: Colors.blue }]}>
                    {d.getDate()}
                  </Text>
                  <View style={styles.dotsRow}>
                    {dayEvents.slice(0, 3).map((e, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: e.typeColor }]} />
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
                <Text key={w} style={[styles.weekHeaderTxt, i === 0 && { color: Colors.red }]}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={styles.monthGrid}>
              {monthMatrix.map(({ date, inMonth }) => {
                const key = ymd(date);
                const dayEvents = eventsByDay.get(key) || [];
                const selected = isSameDay(date, selectedDay);
                const isToday = isSameDay(date, today);
                const isSunday = date.getDay() === 0;
                return (
                  <Pressable
                    key={key}
                    style={[styles.monthCell, selected && styles.monthCellSelected]}
                    onPress={() => setSelectedDay(date)}
                  >
                    <Text
                      style={[
                        styles.monthCellNum,
                        !inMonth && styles.monthCellMuted,
                        isSunday && inMonth && { color: Colors.red },
                        isToday && { color: Colors.blue, fontWeight: '900' },
                        selected && styles.weekDayTxtSel,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    <View style={styles.dotsRow}>
                      {dayEvents.slice(0, 3).map((e, i) => (
                        <View key={i} style={[styles.dotSm, { backgroundColor: e.typeColor }]} />
                      ))}
                    </View>
                    {dayEvents.length > 3 ? (
                      <Text style={styles.moreTxt}>+{dayEvents.length - 3}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.detailHead}>
          <Ionicons name="calendar-clear-outline" size={16} color={Colors.blue} />
          <Text style={styles.detailHeadTxt}>{fullDayLabel(selectedDay)}</Text>
          <View style={styles.detailCountPill}>
            <Text style={styles.detailCountTxt}>{selectedEvents.length} sự kiện</Text>
          </View>
          {isSameDay(selectedDay, today) ? <Text style={styles.todayTag}>Hôm nay</Text> : null}
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.blue} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={34} color={Colors.textFaint} />
            <Text style={styles.errTxt}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </Pressable>
          </View>
        ) : selectedEvents.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={26} color={Colors.textFaint} />
            </View>
            <Text style={styles.emptyTxt}>Không có sự kiện trong ngày này</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 14, paddingTop: 4 }}>
            {selectedEvents.map((e) => (
              <EventCard key={e.id} event={e} Colors={Colors} styles={styles} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function startOfWeekSunday(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function EventCard({
  event: e,
  Colors,
  styles,
}: {
  event: AppEvent;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const sColor = statusColor(e.status, Colors);
  const timeStr = e.allDay
    ? 'Cả ngày'
    : e.endTime
      ? `${timeOf(e.startTime)} — ${timeOf(e.endTime)}`
      : timeOf(e.startTime);
  return (
    <View style={[styles.card, { borderLeftColor: e.typeColor }]}>
      <View style={styles.cardTopRow}>
        <View style={[styles.typeBadge, { backgroundColor: e.typeColor + '22' }]}>
          <Text style={styles.typeBadgeTxt}>{e.typeIcon} {e.typeName.toUpperCase()}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: sColor + '22' }]}>
          <Text style={[styles.statusPillTxt, { color: sColor }]}>{EVENT_STATUS_META[e.status].label}</Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{e.title}</Text>

      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.metaTxt}>{timeStr || '—'}</Text>
      </View>
      {e.assigneeName ? (
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.metaTxt} numberOfLines={1}>Người phụ trách: {e.assigneeName}</Text>
        </View>
      ) : null}
      {e.location ? (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.metaTxt} numberOfLines={1}>{e.location}</Text>
        </View>
      ) : null}
      {e.leadTitle || e.customerName ? (
        <View style={styles.metaRow}>
          <Ionicons name="briefcase-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.metaTxt} numberOfLines={1}>
            {e.leadCode ? `${e.leadCode} · ` : ''}{e.leadTitle || e.customerName}
          </Text>
        </View>
      ) : null}
      {e.creatorName ? (
        <Text style={styles.creatorTxt}>Tạo: {e.creatorName}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSoft },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
    },
    h1: { color: Colors.text, fontSize: 19, fontWeight: '900' },
    countPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radii.pill,
      backgroundColor: Colors.surfaceSoft,
    },
    countPillTxt: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      paddingHorizontal: 12,
      marginTop: 12,
      backgroundColor: Colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      backgroundColor: Colors.surfaceSoft,
      borderRadius: Radii.md,
      padding: 4,
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
    modeBtnActive: { backgroundColor: Colors.blue },
    modeTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '800' },
    modeTxtActive: { color: '#fff' },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
    navBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    navLabel: { color: Colors.text, fontSize: 16, fontWeight: '900' },
    weekStrip: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 14 },
    weekDay: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      gap: 4,
    },
    weekDaySelected: { backgroundColor: Colors.blue, borderColor: Colors.blue },
    weekDayName: { color: Colors.textFaint, fontSize: 10, fontWeight: '800' },
    weekDayNum: { color: Colors.text, fontSize: 18, fontWeight: '900' },
    weekDayTxtSel: { color: '#fff' },
    dotsRow: { flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' },
    dot: { width: 5, height: 5, borderRadius: 3 },
    dotSm: { width: 4, height: 4, borderRadius: 2 },
    monthWrap: { paddingHorizontal: 12, paddingTop: 14 },
    weekHeaderRow: { flexDirection: 'row', marginBottom: 6 },
    weekHeaderTxt: { flex: 1, textAlign: 'center', color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    monthCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 4,
      borderRadius: Radii.sm,
    },
    monthCellSelected: { backgroundColor: Colors.blue },
    monthCellNum: { color: Colors.text, fontSize: 14, fontWeight: '700' },
    monthCellMuted: { color: Colors.textFaint, opacity: 0.45 },
    moreTxt: { color: Colors.textFaint, fontSize: 8, fontWeight: '800', position: 'absolute', bottom: 2, right: 6 },
    detailHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 10,
      flexWrap: 'wrap',
    },
    detailHeadTxt: { color: Colors.text, fontSize: 15, fontWeight: '900' },
    detailCountPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.pill, backgroundColor: Colors.blueSoft },
    detailCountTxt: { color: Colors.blue, fontSize: 11, fontWeight: '800' },
    todayTag: { color: Colors.green, fontSize: 12, fontWeight: '800' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 36, gap: 12, paddingHorizontal: 24 },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: Colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center' },
    retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radii.md, backgroundColor: Colors.blue },
    retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      borderLeftWidth: 4,
      padding: 14,
      marginBottom: 10,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.sm, flexShrink: 1 },
    typeBadgeTxt: { color: Colors.text, fontSize: 10, fontWeight: '900' },
    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.pill },
    statusPillTxt: { fontSize: 10, fontWeight: '800' },
    cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', marginTop: 10, marginBottom: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
    metaTxt: { flex: 1, color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
    creatorTxt: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '600', marginTop: 8 },
  });
