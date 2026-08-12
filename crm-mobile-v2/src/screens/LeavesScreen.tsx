import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  createLeave,
  deleteLeave,
  fetchLeaves,
  leaveStatusLabel,
  leaveTypeLabel,
  type LeaveItem,
} from '../api/leaves';
import CalendarChrome, {
  addDays,
  fullDayLabel,
  isSameDay,
  startOfWeek,
  type CalendarMode,
  type DayMark,
  ymd,
} from '../components/calendar/CalendarChrome';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LEAVE_TYPES = [
  { id: 'annual', label: 'Phép năm', color: '#EA580C' },
  { id: 'sick', label: 'Ốm', color: '#EF4444' },
  { id: 'unpaid', label: 'Không lương', color: '#64748B' },
  { id: 'remote', label: 'Online', color: '#06B6D4' },
  { id: 'business', label: 'Công tác', color: '#8B5CF6' },
  { id: 'other', label: 'Khác', color: '#F59E0B' },
];

function leaveColor(type?: string | null): string {
  return LEAVE_TYPES.find((t) => t.id === type)?.color || '#EA580C';
}

function parseYmd(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(iso?: string | null): string {
  const d = parseYmd(iso);
  if (!d) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function eachDayInclusive(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function leaveCoversDay(leave: LeaveItem, day: Date): boolean {
  const s = parseYmd(leave.start_date);
  const e = parseYmd(leave.end_date);
  if (!s || !e) return false;
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return t >= s.getTime() && t <= e.getTime();
}

export default function LeavesScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('annual');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

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
    async (opts?: { refresh?: boolean }) => {
      if (opts?.refresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const from = addDays(range.from, -7);
        const to = addDays(range.to, 7);
        const list = await fetchLeaves({ from: ymd(from), to: ymd(to) });
        setItems(list);
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

  const marksByDay = useMemo(() => {
    const map = new Map<string, DayMark[]>();
    for (const leave of items) {
      const s = parseYmd(leave.start_date);
      const e = parseYmd(leave.end_date);
      if (!s || !e) continue;
      for (const d of eachDayInclusive(s, e)) {
        const key = ymd(d);
        const arr = map.get(key) || [];
        arr.push({ color: leaveColor(leave.leave_type) });
        map.set(key, arr);
      }
    }
    return map;
  }, [items]);

  const selectedLeaves = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((l) => leaveCoversDay(l, selectedDay))
      .filter((l) => {
        if (!q) return true;
        const hay = `${l.user?.full_name || ''} ${leaveTypeLabel(l.leave_type)} ${l.reason || ''}`.toLowerCase();
        return hay.includes(q);
      });
  }, [items, selectedDay, search]);

  const today = useMemo(() => new Date(), []);

  const openCreate = () => {
    const day = ymd(selectedDay);
    setStartDate(day);
    setEndDate(day);
    setLeaveType('annual');
    setReason('');
    setCreateOpen(true);
  };

  const onCreate = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      Alert.alert('Thiếu thông tin', 'Nhập ngày theo định dạng YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    try {
      await createLeave({
        start_date: startDate,
        end_date: endDate,
        leave_type: leaveType,
        reason: reason.trim() || null,
      });
      setCreateOpen(false);
      await load({ refresh: true });
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (item: LeaveItem) => {
    Alert.alert('Xóa lịch nghỉ', 'Bạn chắc chắn muốn xóa mục này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void deleteLeave(item.id)
            .then(() => load({ refresh: true }))
            .catch((e) => Alert.alert('Lỗi', formatApiError(e)));
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Lịch nghỉ</Text>
          </View>
          <Pressable style={styles.createBtn} onPress={openCreate} hitSlop={8}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textFaint} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Tìm theo tên, loại nghỉ…"
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
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
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
          <Ionicons name="calendar-clear-outline" size={16} color={Colors.blue} />
          <Text style={styles.detailHeadTxt}>{fullDayLabel(selectedDay)}</Text>
          <View style={styles.detailCountPill}>
            <Text style={styles.detailCountTxt}>{selectedLeaves.length} lịch nghỉ</Text>
          </View>
          {isSameDay(selectedDay, today) ? <Text style={styles.todayTag}>Hôm nay</Text> : null}
          <Pressable style={styles.addDayBtn} onPress={openCreate}>
            <Ionicons name="add-circle-outline" size={16} color={Colors.blue} />
            <Text style={styles.addDayTxt}>Tạo</Text>
          </Pressable>
        </View>

        {loading ? (
          <SpinningLoader color={Colors.blue} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={34} color={Colors.textFaint} />
            <Text style={styles.errTxt}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </Pressable>
          </View>
        ) : selectedLeaves.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="person-remove-outline" size={26} color={Colors.textFaint} />
            </View>
            <Text style={styles.emptyTxt}>Không có lịch nghỉ trong ngày này</Text>
            <Pressable style={styles.retryBtn} onPress={openCreate}>
              <Text style={styles.retryTxt}>Thêm lịch nghỉ</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 14, paddingTop: 4 }}>
            {selectedLeaves.map((item) => {
              const color = leaveColor(item.leave_type);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.card, { borderLeftColor: color }]}
                  onLongPress={() => onDelete(item)}
                >
                  <View style={styles.cardTopRow}>
                    <View style={[styles.typeBadge, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.typeBadgeTxt, { color }]}>
                        {leaveTypeLabel(item.leave_type).toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: Colors.blueSoft }]}>
                      <Text style={[styles.statusPillTxt, { color: Colors.blue }]}>
                        {leaveStatusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.user?.full_name || 'Bạn'}
                  </Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.metaTxt}>
                      {fmtDate(item.start_date)} → {fmtDate(item.end_date)}
                    </Text>
                  </View>
                  {item.reason ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="document-text-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.metaTxt} numberOfLines={2}>
                        {item.reason}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Thêm lịch nghỉ</Text>
            <Text style={styles.label}>Từ ngày (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-07-25"
              placeholderTextColor={Colors.textFaint}
            />
            <Text style={styles.label}>Đến ngày (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-07-25"
              placeholderTextColor={Colors.textFaint}
            />
            <Text style={styles.label}>Loại nghỉ</Text>
            <View style={styles.typeRow}>
              {LEAVE_TYPES.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.typeChip, leaveType === t.id && { borderColor: t.color, backgroundColor: t.color + '22' }]}
                  onPress={() => setLeaveType(t.id)}
                >
                  <Text style={[styles.typeChipText, leaveType === t.id && { color: t.color }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Ghi chú</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
              value={reason}
              onChangeText={setReason}
              placeholder="Lý do (tuỳ chọn)"
              placeholderTextColor={Colors.textFaint}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setCreateOpen(false)}>
                <Text style={styles.cancelText}>Huỷ</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void onCreate()} disabled={saving}>
                {saving ? <SpinningLoader color="#fff" /> : <Text style={styles.saveText}>Lưu</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(Colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.bgElevated,
    },
    createBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.blue,
    },
    h1: { color: Colors.text, fontSize: 19, fontWeight: '900' },
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
    detailCountPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: Colors.blueSoft,
    },
    detailCountTxt: { color: Colors.blue, fontSize: 11, fontWeight: '800' },
    todayTag: { color: Colors.green, fontSize: 12, fontWeight: '800' },
    addDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    addDayTxt: { color: Colors.blue, fontSize: 12, fontWeight: '800' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 36, gap: 12, paddingHorizontal: 24 },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: Colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    errTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center' },
    retryBtn: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: Radii.md,
      backgroundColor: Colors.blue,
    },
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
    typeBadgeTxt: { fontSize: 10, fontWeight: '900' },
    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    statusPillTxt: { fontSize: 10, fontWeight: '800' },
    cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', marginTop: 10, marginBottom: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
    metaTxt: { flex: 1, color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
    modalBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: Colors.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    modalTitle: { color: Colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
    label: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
    input: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: Colors.text,
      backgroundColor: Colors.bg,
    },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: Colors.bg,
    },
    typeChipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: {
      flex: 1,
      height: 44,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    cancelText: { color: Colors.text, fontWeight: '700' },
    saveBtn: {
      flex: 1,
      height: 44,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.blue,
    },
    saveText: { color: '#fff', fontWeight: '800' },
  });
}
