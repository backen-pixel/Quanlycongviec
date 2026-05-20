import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCrmCompanyFilter } from '../context/CrmCompanyFilterContext';
import CrmCompanyPickerBar from '../components/CrmCompanyPickerBar';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'CrmEvents'>;

type CrmEventRow = {
  id: string;
  title?: string | null;
  start_time?: string | null;
  status?: string | null;
  location?: string | null;
  event_type?: string | null;
  created_by?: string | null;
  cancel_reason?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function monthGrid(year: number, month1: number) {
  const first = new Date(year, month1 - 1, 1);
  const startWeekday = first.getDay();
  const mondayOffset = startWeekday === 0 ? 6 : startWeekday - 1;
  const gridStart = new Date(year, month1 - 1, 1 - mondayOffset);
  const weeks: { key: string; d: number; inMonth: boolean }[][] = [];
  let cur = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const row: { key: string; d: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      row.push({
        key: `${y}-${pad2(m)}-${pad2(d)}`,
        d,
        inMonth: cur.getMonth() === month1 - 1,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function dayKeyFromStart(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function CrmEventsScreen({ route }: Props) {
  const { user } = useAuth();
  const {
    showCompanyPicker,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    companyQueryParams,
    needsCompanySelection,
  } = useCrmCompanyFilter();
  const now = new Date();
  const [tab, setTab] = useState<'list' | 'cal'>('list');
  const [events, setEvents] = useState<CrmEventRow[]>([]);
  const [calEvents, setCalEvents] = useState<CrmEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDay, setCreateDay] = useState('');
  const [createHour, setCreateHour] = useState('09');
  const [createMin, setCreateMin] = useState('00');
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CrmEventRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const handledInitialDate = useRef<string | null>(null);

  const myUserId = String(user?.id || user?.userId || '');
  const isAdmin = user?.role === 'admin';
  const canManageEvent = useCallback(
    (e: CrmEventRow) => isAdmin || (!!e.created_by && String(e.created_by) === myUserId),
    [isAdmin, myUserId],
  );

  const loadList = useCallback(async () => {
    try {
      const { data } = await api.get<{ events?: CrmEventRow[] }>('/events', {
        params: { limit: 80, offset: 0, ...companyQueryParams },
      });
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch {
      setEvents([]);
    }
  }, [companyQueryParams]);

  const loadCalendar = useCallback(async () => {
    try {
      const { data } = await api.get<CrmEventRow[]>('/events/calendar', {
        params: { month, year, ...companyQueryParams },
      });
      setCalEvents(Array.isArray(data) ? data : []);
    } catch {
      setCalEvents([]);
    }
  }, [month, year, companyQueryParams]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadList(), loadCalendar()]);
    } finally {
      setLoading(false);
    }
  }, [loadList, loadCalendar]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openCreateForDay = useCallback((dayKey: string) => {
    setCreateDay(dayKey);
    setCreateTitle('');
    setCreateHour('09');
    setCreateMin('00');
    setCreateOpen(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const d = route.params?.initialDate;
      if (d && handledInitialDate.current !== d) {
        handledInitialDate.current = d;
        openCreateForDay(d);
      }
      return () => {
        handledInitialDate.current = null;
      };
    }, [route.params?.initialDate, openCreateForDay]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const byDay = useMemo(() => {
    const m: Record<string, number> = {};
    calEvents.forEach((e) => {
      const k = dayKeyFromStart(e.start_time);
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [calEvents]);

  const openCancelModal = (e: CrmEventRow) => {
    setCancelTarget(e);
    setCancelReason('');
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) {
      Alert.alert('Thiếu lý do', 'Vui lòng nhập lý do hủy sự kiện.');
      return;
    }
    setCancelBusy(true);
    try {
      await api.put(`/events/${cancelTarget.id}`, {
        status: 'cancelled',
        cancel_reason: reason,
      });
      setCancelTarget(null);
      setCancelReason('');
      await loadAll();
    } catch (e: unknown) {
      Alert.alert(
        'Hủy sự kiện',
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không hủy được sự kiện',
      );
    } finally {
      setCancelBusy(false);
    }
  };

  const confirmDelete = (e: CrmEventRow) => {
    Alert.alert(
      'Xóa sự kiện',
      `Xóa "${e.title || 'sự kiện'}"? Thao tác này không thể hoàn tác.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/events/${e.id}`);
              await loadAll();
            } catch (err: unknown) {
              Alert.alert(
                'Lỗi',
                (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không xóa được sự kiện',
              );
            }
          },
        },
      ],
    );
  };

  const saveEvent = async () => {
    const title = createTitle.trim();
    if (!title || !createDay || saving) return;
    // Giống web datetimeLocal → ISO UTC: dùng giờ thiết bị (VN). Không gửi chuỗi naive không offset —
    // backend/Postgres có thể hiểu là UTC và hiển thị sai ~7h.
    const [yy, mo, dd] = createDay.split('-').map((x) => Number(x));
    const start_time = new Date(
      yy,
      mo - 1,
      dd,
      Number(createHour) || 9,
      Number(createMin) || 0,
      0,
      0,
    ).toISOString();
    setSaving(true);
    try {
      if (needsCompanySelection) {
        Alert.alert('Chọn công ty', 'Vui lòng chọn công ty CRM trước khi tạo sự kiện.');
        return;
      }
      await api.post('/events', {
        title,
        start_time,
        event_type: 'other',
        assignee_id: user?.id || user?.userId,
        ...(companyQueryParams.company_id ? { company_id: companyQueryParams.company_id } : {}),
      });
      setCreateOpen(false);
      await loadAll();
      setTab('list');
    } catch {
      /* toast optional */
    } finally {
      setSaving(false);
    }
  };

  const matrix = useMemo(() => monthGrid(year, month), [year, month]);

  return (
    <View style={styles.screen}>
      <CrmCompanyPickerBar
        visible={showCompanyPicker}
        companies={companies}
        value={selectedCompanyId}
        onChange={setSelectedCompanyId}
        warn={needsCompanySelection}
      />
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'list' && styles.tabOn]} onPress={() => setTab('list')}>
          <Text style={[styles.tabTxt, tab === 'list' && styles.tabTxtOn]}>Danh sách</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'cal' && styles.tabOn]} onPress={() => setTab('cal')}>
          <Text style={[styles.tabTxt, tab === 'cal' && styles.tabTxtOn]}>Lịch</Text>
        </TouchableOpacity>
      </View>

      {tab === 'list' ? (
        loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={CrmColors.blue600} />
        ) : (
          <FlatList
            data={events}
            keyExtractor={(e) => e.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
            }
            contentContainerStyle={styles.listPad}
            ListHeaderComponent={
              <TouchableOpacity style={styles.addBtn} onPress={() => openCreateForDay(dayKeyFromStart(new Date().toISOString()))}>
                <Text style={styles.addBtnTxt}>+ Sự kiện hôm nay</Text>
              </TouchableOpacity>
            }
            ListEmptyComponent={<Text style={styles.empty}>Chưa có sự kiện.</Text>}
            renderItem={({ item: e }) => {
              const cancelled = e.status === 'cancelled';
              const canMgr = canManageEvent(e);
              return (
                <View style={[styles.card, CrmShadow.card, cancelled && styles.cardCancelled]}>
                  <Text style={[styles.cardTitle, cancelled && styles.cardTitleCancelled]}>
                    {e.title || '—'}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {e.start_time ? new Date(e.start_time).toLocaleString('vi-VN') : '—'} · {e.status || 'planned'}
                  </Text>
                  {e.location ? <Text style={styles.cardLoc}>{e.location}</Text> : null}
                  {cancelled && e.cancel_reason ? (
                    <Text style={styles.cardCancelReason}>Lý do hủy: {e.cancel_reason}</Text>
                  ) : null}
                  {canMgr ? (
                    <View style={styles.cardActions}>
                      {!cancelled ? (
                        <TouchableOpacity style={styles.btnCancel} onPress={() => openCancelModal(e)}>
                          <Text style={styles.btnCancelTxt}>🚫 Hủy</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={styles.btnDelete} onPress={() => confirmDelete(e)}>
                        <Text style={styles.btnDeleteTxt}>🗑 Xóa</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
          }
          contentContainerStyle={styles.calPad}
        >
          <View style={styles.calNav}>
            <TouchableOpacity
              style={styles.calNavBtn}
              onPress={() => {
                if (month <= 1) {
                  setMonth(12);
                  setYear((y) => y - 1);
                } else setMonth((m) => m - 1);
              }}
            >
              <Text style={styles.calNavBtnTxt}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calNavTitle}>
              Tháng {month} {year}
            </Text>
            <TouchableOpacity
              style={styles.calNavBtn}
              onPress={() => {
                if (month >= 12) {
                  setMonth(1);
                  setYear((y) => y + 1);
                } else setMonth((m) => m + 1);
              }}
            >
              <Text style={styles.calNavBtnTxt}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.weekRow}>
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
              <Text key={d} style={styles.weekLbl}>
                {d}
              </Text>
            ))}
          </View>
          {matrix.map((week, wi) => (
            <View key={wi} style={styles.calWeek}>
              {week.map((cell) => {
                const n = byDay[cell.key] || 0;
                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[styles.cell, !cell.inMonth && styles.cellOff]}
                    onPress={() => openCreateForDay(cell.key)}
                  >
                    <Text style={[styles.cellDay, !cell.inMonth && styles.cellDayOff]}>{cell.d}</Text>
                    {n > 0 ? (
                      <View style={styles.dot}>
                        <Text style={styles.dotTxt}>{n > 9 ? '9+' : n}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <Text style={styles.calFoot}>Chạm một ô ngày để tạo sự kiện vào ngày đó.</Text>
        </ScrollView>
      )}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Tạo sự kiện</Text>
            <Text style={styles.modalSub}>Ngày: {createDay || '—'}</Text>
            <Text style={styles.lbl}>Tiêu đề</Text>
            <TextInput
              style={styles.inp}
              placeholder="Vd: Gọi lại khách hàng…"
              placeholderTextColor={CrmColors.gray400}
              value={createTitle}
              onChangeText={setCreateTitle}
            />
            <Text style={styles.lbl}>Giờ (24h)</Text>
            <View style={styles.row2}>
              <TextInput
                style={styles.inpHalf}
                keyboardType="number-pad"
                maxLength={2}
                value={createHour}
                onChangeText={setCreateHour}
              />
              <Text style={styles.colon}>:</Text>
              <TextInput
                style={styles.inpHalf}
                keyboardType="number-pad"
                maxLength={2}
                value={createMin}
                onChangeText={setCreateMin}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setCreateOpen(false)}>
                <Text style={styles.btnGhostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => void saveEvent()} disabled={saving}>
                <Text style={styles.btnPrimaryTxt}>{saving ? 'Đang lưu…' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!cancelTarget}
        animationType="slide"
        transparent
        onRequestClose={() => !cancelBusy && setCancelTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => !cancelBusy && setCancelTarget(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Hủy sự kiện</Text>
            <Text style={styles.modalSub} numberOfLines={2}>
              {cancelTarget?.title || '—'}
            </Text>
            <Text style={styles.lbl}>Lý do hủy *</Text>
            <TextInput
              style={[styles.inp, { minHeight: 80, textAlignVertical: 'top' }]}
              multiline
              numberOfLines={4}
              placeholder="Nhập lý do hủy sự kiện…"
              placeholderTextColor={CrmColors.gray400}
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => !cancelBusy && setCancelTarget(null)}
                disabled={cancelBusy}
              >
                <Text style={styles.btnGhostTxt}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: '#dc2626' }]}
                onPress={() => void submitCancel()}
                disabled={cancelBusy}
              >
                <Text style={styles.btnPrimaryTxt}>
                  {cancelBusy ? 'Đang hủy…' : 'Xác nhận hủy'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  tabTxt: { fontSize: 14, fontWeight: '700', color: CrmColors.gray600 },
  tabTxtOn: { color: CrmColors.blue700 },
  listPad: { padding: 16, paddingBottom: 32 },
  addBtn: {
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    marginBottom: 14,
  },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  cardCancelled: { opacity: 0.85, backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: CrmColors.gray900 },
  cardTitleCancelled: { textDecorationLine: 'line-through', color: CrmColors.gray500 },
  cardMeta: { fontSize: 12, color: CrmColors.gray500, marginTop: 6 },
  cardLoc: { fontSize: 12, color: CrmColors.gray600, marginTop: 4 },
  cardCancelReason: { fontSize: 12, color: '#dc2626', marginTop: 6, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CrmRadii.md,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  btnCancelTxt: { fontSize: 12, fontWeight: '700', color: '#b45309' },
  btnDelete: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CrmRadii.md,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  btnDeleteTxt: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 32 },
  calPad: { padding: 16, paddingBottom: 40 },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calNavBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  calNavBtnTxt: { fontSize: 22, color: CrmColors.blue600, fontWeight: '700' },
  calNavTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLbl: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: CrmColors.gray500 },
  calWeek: { flexDirection: 'row', marginBottom: 4 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 46,
    margin: 2,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOff: { opacity: 0.35 },
  cellDay: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  cellDayOff: { color: CrmColors.gray400 },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  dotTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  calFoot: { fontSize: 12, color: CrmColors.gray500, marginTop: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  modalSub: { fontSize: 13, color: CrmColors.gray500, marginTop: 4, marginBottom: 12 },
  lbl: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginTop: 10, marginBottom: 6 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  inpHalf: {
    width: 56,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: CrmColors.gray900,
  },
  colon: { fontSize: 18, fontWeight: '800' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  btnGhost: { paddingVertical: 12, paddingHorizontal: 16 },
  btnGhostTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.gray600 },
  btnPrimary: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: CrmRadii.md,
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
