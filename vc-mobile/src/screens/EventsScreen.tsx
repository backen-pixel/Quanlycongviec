import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { formatApiError } from '../api/client';
import {
  EVENT_STATUS_META,
  fetchEventsRange,
  type AppEvent,
  type EventStatus,
} from '../api/events';
import CalendarChrome, {
  addDays,
  fullDayLabel,
  isSameDay,
  startOfWeek,
  type CalendarMode,
  type DayMark,
  ymd,
} from '../components/calendar/CalendarChrome';
import EventFormModal from '../components/events/EventFormModal';
import TapHighlight from '../components/TapHighlight';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { REALTIME_EVENT } from '../lib/realtimeModes';
import { useTheme } from '../context/ThemeContext';
import { Radii, type AppColors } from '../theme';

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function statusColor(status: EventStatus, colors: AppColors): string {
  const tone = EVENT_STATUS_META[status]?.tone;
  if (tone === 'green') return colors.success;
  if (tone === 'amber') return colors.warning;
  if (tone === 'red') return colors.danger;
  return colors.primary;
}

function dayKeyOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ymd(d);
}

export default function EventsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const openCreate = () => setFormOpen(true);

  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(cursor);
      return { from, to: addDays(from, 6) };
    }
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from, to };
  }, [mode, cursor]);

  const load = useCallback(
    async (opts?: { refresh?: boolean; silent?: boolean }) => {
      if (!opts?.silent) {
        if (opts?.refresh) setRefreshing(true);
        else setLoading(true);
      }
      setError('');
      try {
        const list = await fetchEventsRange({
          dateFrom: ymd(range.from),
          dateTo: ymd(range.to),
        });
        setEvents(list);
      } catch (e) {
        setError(formatApiError(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range.from, range.to],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useProductionRealtime({
    onRefresh: () => void load({ silent: true }),
    modes: REALTIME_EVENT,
    debounceMs: 800,
  });

  const marksByDay = useMemo(() => {
    const map = new Map<string, DayMark[]>();
    for (const ev of events) {
      const key = dayKeyOf(ev.startTime);
      if (!key) continue;
      const arr = map.get(key) || [];
      arr.push({ color: ev.typeColor || colors.primary });
      map.set(key, arr);
    }
    return map;
  }, [events, colors.primary]);

  const selectedEvents = useMemo(() => {
    const key = ymd(selectedDay);
    const q = search.toLowerCase();
    return events
      .filter((ev) => dayKeyOf(ev.startTime) === key)
      .filter((ev) => !q || ev.title.toLowerCase().includes(q) || (ev.typeName || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
        const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
        return ta - tb;
      });
  }, [events, selectedDay, search]);

  const today = useMemo(() => new Date(), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TapHighlight>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Sự kiện</Text>
          </View>
          <TapHighlight style={styles.createBtn} onPress={openCreate}>
            <Ionicons name="add" size={20} color="#fff" />
          </TapHighlight>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Tìm sự kiện…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchDraft ? (
            <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={colors.primary} />
        }
      >
        <CalendarChrome
          mode={mode}
          cursor={cursor}
          selectedDay={selectedDay}
          marksByDay={marksByDay}
          onModeChange={(m) => {
            setMode(m);
            setCursor(m === 'month' ? new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1) : selectedDay);
          }}
          onCursorChange={setCursor}
          onSelectDay={setSelectedDay}
        />

        <View style={styles.detailHead}>
          <Ionicons name="calendar-clear-outline" size={16} color={colors.primary} />
          <Text style={styles.detailHeadTxt}>{fullDayLabel(selectedDay)}</Text>
          <View style={styles.detailCountPill}>
            <Text style={styles.detailCountTxt}>{selectedEvents.length} sự kiện</Text>
          </View>
          {isSameDay(selectedDay, today) ? <Text style={styles.todayTag}>Hôm nay</Text> : null}
          <Pressable style={styles.addDayBtn} onPress={openCreate}>
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.addDayTxt}>Tạo</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={34} color={colors.textFaint} />
            <Text style={styles.errTxt}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </Pressable>
          </View>
        ) : selectedEvents.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={26} color={colors.textFaint} />
            </View>
            <Text style={styles.emptyTxt}>Không có sự kiện trong ngày này</Text>
            <Pressable style={styles.retryBtn} onPress={openCreate}>
              <Text style={styles.retryTxt}>Thêm sự kiện</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 14, paddingTop: 4 }}>
            {selectedEvents.map((e) => {
              const sColor = statusColor(e.status, colors);
              const timeStr = e.allDay
                ? 'Cả ngày'
                : e.endTime
                  ? `${timeOf(e.startTime)} — ${timeOf(e.endTime)}`
                  : timeOf(e.startTime);
              return (
                <View key={e.id} style={[styles.card, { borderLeftColor: e.typeColor || colors.primary }]}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.typeBadge, { backgroundColor: (e.typeColor || colors.primary) + '22' }]}>
                      <Text style={styles.typeBadgeTxt}>
                        {e.typeIcon} {(e.typeName || 'Sự kiện').toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: sColor + '22' }]}>
                      <Text style={[styles.statusPillTxt, { color: sColor }]}>
                        {EVENT_STATUS_META[e.status]?.label || e.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {e.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.metaTxt}>{timeStr || '—'}</Text>
                  </View>
                  {e.assigneeName ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="person-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.metaTxt} numberOfLines={1}>
                        Người phụ trách: {e.assigneeName}
                      </Text>
                    </View>
                  ) : null}
                  {e.location ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.metaTxt} numberOfLines={1}>
                        {e.location}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <EventFormModal
        visible={formOpen}
        presetDay={selectedDay}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load({ refresh: true })}
      />
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    createBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    h1: { color: colors.text, fontSize: 19, fontWeight: '900' },
    addDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    addDayTxt: { color: colors.primary, fontSize: 13, fontWeight: '800' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      paddingHorizontal: 12,
      marginTop: 12,
      backgroundColor: colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
    detailHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 10,
      flexWrap: 'wrap',
    },
    detailHeadTxt: { color: colors.text, fontSize: 15, fontWeight: '900' },
    detailCountPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.primarySoft,
    },
    detailCountTxt: { color: colors.primary, fontSize: 11, fontWeight: '800' },
    todayTag: { color: colors.success, fontSize: 12, fontWeight: '800' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 36, gap: 12, paddingHorizontal: 24 },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTxt: { color: colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    errTxt: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
    retryBtn: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
    },
    retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    card: {
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      padding: 14,
      marginBottom: 10,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.sm, flexShrink: 1 },
    typeBadgeTxt: { color: colors.text, fontSize: 10, fontWeight: '900' },
    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    statusPillTxt: { fontSize: 10, fontWeight: '800' },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 10, marginBottom: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
    metaTxt: { flex: 1, color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  });
}
