import SpinningLoader from '../components/SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, formatApiError } from '../api/client';
import {
  EVENT_STATUS_META,
  fetchEventTypes,
  fetchEventsRange,
  type AppEvent,
  type EventStatus,
  type EventType,
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
import EventFilterModal, {
  EMPTY_EVENT_FILTERS,
  type EventFilterEmployee,
  type EventFilters,
} from '../components/events/EventFilterModal';
import EventFormModal from '../components/events/EventFormModal';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProductionRealtime } from '../hooks/useProductionRealtime';
import { loadKanbanFilters } from '../lib/kanbanFilterStorage';
import { fetchCompanies, type CompanyOption } from '../lib/logisticsApi';
import { isSystemAdmin } from '../lib/productionFilters';
import { REALTIME_EVENT } from '../lib/realtimeModes';
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

function countActiveFilters(f: EventFilters, showCompanyPicker: boolean): number {
  let n = 0;
  if (f.status) n += 1;
  if (f.type) n += 1;
  if (f.module && f.module !== 'logistics') n += 1;
  if (f.userId) n += 1;
  if (showCompanyPicker && f.companyId) n += 1;
  return n;
}

export default function EventsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const showCompanyPicker = isSystemAdmin(user);
  const ownCompanyId = user?.company_id ? String(user.company_id) : '';

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
  const [filterOpen, setFilterOpen] = useState(false);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [employees, setEmployees] = useState<EventFilterEmployee[]>([]);
  const [filters, setFilters] = useState<EventFilters>(() => ({
    ...EMPTY_EVENT_FILTERS,
    companyId: ownCompanyId,
    module: 'logistics',
  }));
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  // NV: luôn khóa company_id theo tài khoản. Admin: mặc định từ bộ lọc chung nếu có.
  useEffect(() => {
    if (!showCompanyPicker) {
      if (ownCompanyId && filters.companyId !== ownCompanyId) {
        setFilters((prev) => ({ ...prev, companyId: ownCompanyId }));
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const snap = await loadKanbanFilters().catch(() => null);
      const fromShared = String(snap?.filterCompany || '').trim();
      if (cancelled || !fromShared) return;
      setFilters((prev) => (prev.companyId ? prev : { ...prev, companyId: fromShared }));
    })();
    return () => {
      cancelled = true;
    };
  }, [showCompanyPicker, ownCompanyId, filters.companyId]);

  useEffect(() => {
    void fetchEventTypes().then(setEventTypes);
  }, []);

  useEffect(() => {
    if (!showCompanyPicker) return;
    let cancelled = false;
    void fetchCompanies()
      .then((rows) => {
        if (!cancelled) setCompanies(rows);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showCompanyPicker]);

  const effectiveCompanyId = useMemo(() => {
    if (filters.companyId) return filters.companyId;
    if (ownCompanyId) return ownCompanyId;
    return '';
  }, [filters.companyId, ownCompanyId]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setEmployees([]);
      return;
    }
    let cancelled = false;
    void api
      .get<{ users?: EventFilterEmployee[] } | EventFilterEmployee[]>('/users', {
        params: { company_id: effectiveCompanyId },
      })
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [];
        setEmployees(
          list
            .map((u) => ({
              id: String((u as EventFilterEmployee).id || ''),
              full_name: (u as EventFilterEmployee).full_name ?? null,
              email: (u as EventFilterEmployee).email ?? null,
            }))
            .filter((u) => u.id),
        );
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  const companyLockedLabel = useMemo(() => {
    if (!effectiveCompanyId) return 'Chưa gán công ty';
    const fromList = companies.find((c) => String(c.id) === String(effectiveCompanyId))?.name;
    return fromList || 'Công ty của bạn';
  }, [effectiveCompanyId, companies]);

  // NV cũng cần tên công ty — tải list nhẹ khi chưa có
  useEffect(() => {
    if (showCompanyPicker || !ownCompanyId || companies.length) return;
    let cancelled = false;
    void fetchCompanies()
      .then((rows) => {
        if (!cancelled) setCompanies(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showCompanyPicker, ownCompanyId, companies.length]);

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
      const seq = ++loadSeqRef.current;
      if (!opts?.silent) {
        if (opts?.refresh) setRefreshing(true);
        else setLoading(true);
      }
      setError('');
      try {
        if (!showCompanyPicker && !ownCompanyId && !filters.companyId) {
          if (seq !== loadSeqRef.current) return;
          setEvents([]);
          setError('Tài khoản chưa gán công ty — không tải được sự kiện.');
          return;
        }
        const list = await fetchEventsRange({
          dateFrom: ymd(range.from),
          dateTo: ymd(range.to),
          search: search || undefined,
          companyId: effectiveCompanyId || undefined,
          status: filters.status || undefined,
          type: filters.type || undefined,
          module: filters.module || undefined,
          userId: filters.userId || undefined,
        });
        if (seq !== loadSeqRef.current) return;
        setEvents(list);
      } catch (e) {
        if (seq !== loadSeqRef.current) return;
        setError(formatApiError(e));
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      range.from,
      range.to,
      search,
      effectiveCompanyId,
      filters.status,
      filters.type,
      filters.module,
      filters.userId,
      filters.companyId,
      showCompanyPicker,
      ownCompanyId,
    ],
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
  const activeFilterCount = countActiveFilters(filters, showCompanyPicker);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TapHighlight>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Sự kiện</Text>
            {effectiveCompanyId ? (
              <Text style={styles.subH} numberOfLines={1}>
                {companyLockedLabel}
              </Text>
            ) : null}
          </View>
          <TapHighlight style={styles.filterBtn} onPress={() => setFilterOpen(true)}>
            <Ionicons name="options-outline" size={18} color={colors.text} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeTxt}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </TapHighlight>
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
          <SpinningLoader color={colors.primary} style={{ marginTop: 30 }} />
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

      <EventFilterModal
        visible={filterOpen}
        value={filters}
        eventTypes={eventTypes}
        companies={companies}
        employees={employees}
        showCompanyPicker={showCompanyPicker}
        companyLockedLabel={companyLockedLabel}
        bottomInset={insets.bottom}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          const companyId = showCompanyPicker ? next.companyId : ownCompanyId || next.companyId;
          setFilters({ ...next, companyId });
        }}
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
    filterBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    filterBadge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    filterBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
    createBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    h1: { color: colors.text, fontSize: 19, fontWeight: '900' },
    subH: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
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
