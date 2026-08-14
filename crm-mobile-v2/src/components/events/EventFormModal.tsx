import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../SpinningLoader';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../context/KeyboardInsetContext';
import {
  EVENT_MODULE_OPTIONS,
  EVENT_STATUS_META,
  addHoursLocalDatetime,
  createEvent,
  defaultEventStartLocal,
  eventsApiError,
  fetchEventTypes,
  isoToLocalDatetimeValue,
  localDatetimeValueToIso,
  updateEvent,
  type AppEvent,
  type EventStatus,
  type EventType,
} from '../../api/events';
import {
  fetchCrmEmployeesByCompany,
  loadCrmCompanies,
  type CrmCompany,
  type CrmEmployee,
} from '../../api/crmMeta';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  visible: boolean;
  event?: AppEvent | null;
  /** Ngày mặc định khi tạo mới (đã chọn trên lịch). */
  presetDay?: Date | null;
  defaultCompanyId?: string;
  defaultModule?: string;
  defaultAssigneeId?: string;
  employees?: CrmEmployee[];
  /** Danh sách công ty — hiện picker trong form cho admin hệ thống. */
  companies?: CrmCompany[];
  showCompanyPicker?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function splitLocal(v: string): { date: string; time: string } {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return { date: m?.[1] || '', time: m?.[2] || '09:00' };
}

function joinLocal(date: string, time: string): string {
  const d = (date || '').trim();
  const t = (time || '09:00').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  if (!/^\d{2}:\d{2}$/.test(t)) return `${d}T09:00`;
  return `${d}T${t}`;
}

export default function EventFormModal({
  visible,
  event,
  presetDay,
  defaultCompanyId = '',
  defaultModule = 'crm',
  defaultAssigneeId = '',
  employees = [],
  companies = [],
  showCompanyPicker = false,
  onClose,
  onSaved,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  // Modal ở cửa sổ riêng — tự chừa chỗ bàn phím (Android 15+ không co cửa sổ).
  const { overlap: kbOverlap } = useKeyboardInset();
  const isEdit = !!event?.id;
  const needCompanyInForm = showCompanyPicker && !isEdit;

  const [types, setTypes] = useState<EventType[]>([]);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('meeting');
  const [module, setModule] = useState('crm');
  const [status, setStatus] = useState<EventStatus>('planned');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [formEmployees, setFormEmployees] = useState<CrmEmployee[]>([]);
  const [formCompanies, setFormCompanies] = useState<CrmCompany[]>(companies);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void fetchEventTypes().then(setTypes);
  }, [visible]);

  /** Form tự tải DS công ty — không chờ màn Lịch (tránh mở sớm chỉ thấy 1 CT). */
  useEffect(() => {
    if (!visible || !showCompanyPicker) return undefined;
    if (companies.length) setFormCompanies(companies);
    let cancelled = false;
    if (companies.length < 2) setCompaniesLoading(true);
    void loadCrmCompanies()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length) setFormCompanies(rows);
      })
      .finally(() => {
        if (!cancelled) setCompaniesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, showCompanyPicker, companies]);

  useEffect(() => {
    if (!visible) return;
    if (event) {
      const start = splitLocal(isoToLocalDatetimeValue(event.startTime));
      const endRaw = event.endTime
        ? splitLocal(isoToLocalDatetimeValue(event.endTime))
        : splitLocal(addHoursLocalDatetime(isoToLocalDatetimeValue(event.startTime) || defaultEventStartLocal(), 1));
      setTitle(event.title || '');
      setEventType(event.eventType || 'meeting');
      setModule(event.module || 'crm');
      setStatus(event.status || 'planned');
      setStartDate(start.date);
      setStartTime(start.time);
      setEndDate(endRaw.date);
      setEndTime(endRaw.time);
      setAllDay(!!event.allDay);
      setLocation(event.location || '');
      setDescription(event.description || '');
      setAssigneeId(event.assigneeId || '');
      setCompanyId(event.companyId || defaultCompanyId || '');
      return;
    }
    const startLocal = defaultEventStartLocal(presetDay || undefined);
    const endLocal = addHoursLocalDatetime(startLocal, 1);
    const s = splitLocal(startLocal);
    const e = splitLocal(endLocal);
    setTitle('');
    setEventType('meeting');
    setModule(defaultModule || 'crm');
    setStatus('planned');
    setStartDate(s.date);
    setStartTime(s.time);
    setEndDate(e.date);
    setEndTime(e.time);
    setAllDay(false);
    setLocation('');
    setDescription('');
    setAssigneeId(defaultAssigneeId || '');
    setCompanyId(defaultCompanyId || '');
    setCompanySearch('');
  }, [visible, event?.id, presetDay, defaultModule, defaultAssigneeId, defaultCompanyId]);

  useEffect(() => {
    if (!visible || event || !types.length) return;
    setEventType((prev) => (types.some((t) => t.slug === prev) ? prev : types[0].slug));
  }, [visible, event, types]);

  /** Admin chọn công ty trong form → tải DS nhân viên theo công ty đó. */
  useEffect(() => {
    if (!visible || !needCompanyInForm) {
      setFormEmployees([]);
      return;
    }
    const cid = String(companyId || '').trim();
    if (!cid) {
      setFormEmployees([]);
      return;
    }
    const ac = new AbortController();
    void fetchCrmEmployeesByCompany(cid, ac.signal).then((org) => {
      if (ac.signal.aborted) return;
      setFormEmployees(org.users || []);
    });
    return () => ac.abort();
  }, [visible, needCompanyInForm, companyId]);

  const applyType = (slug: string) => {
    const t = types.find((x) => x.slug === slug);
    setEventType(slug);
    if (!t) return;
    const prefix = `${t.name} - `;
    const rest = title.startsWith(prefix)
      ? title.slice(prefix.length)
      : types.reduce((acc, ty) => {
          const p = `${ty.name} - `;
          return acc.startsWith(p) ? acc.slice(p.length) : acc;
        }, title);
    setTitle(rest ? `${t.name} - ${rest}` : `${t.name} - `);
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Thiếu thông tin', 'Nhập tiêu đề sự kiện');
      return;
    }
    const startLocal = joinLocal(startDate, allDay ? '00:00' : startTime);
    const startIso = localDatetimeValueToIso(startLocal);
    if (!startIso) {
      Alert.alert('Thiếu thông tin', 'Chọn ngày giờ bắt đầu (yyyy-mm-dd và HH:mm)');
      return;
    }
    let endIso: string | null = null;
    if (!allDay && endDate) {
      endIso = localDatetimeValueToIso(joinLocal(endDate, endTime || '00:00'));
      if (endIso && new Date(endIso) < new Date(startIso)) {
        Alert.alert('Giờ không hợp lệ', 'Giờ kết thúc phải lớn hơn hoặc bằng giờ bắt đầu');
        return;
      }
    }
    const resolvedCompanyId = String(
      event?.companyId || companyId || defaultCompanyId || '',
    ).trim();
    if (!isEdit && !event?.leadId && !resolvedCompanyId) {
      Alert.alert(
        'Thiếu công ty',
        needCompanyInForm
          ? 'Chọn công ty trước khi lưu sự kiện.'
          : 'Tài khoản chưa gán công ty — không tạo được sự kiện.',
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        event_type: eventType,
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: startIso,
        end_time: endIso,
        all_day: allDay,
        status,
        module: module || 'crm',
        assignee_id: assigneeId || null,
        participant_ids: assigneeId ? [assigneeId] : [],
        ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
        ...(event?.leadId ? { lead_id: event.leadId } : {}),
      };
      if (isEdit && event) {
        await updateEvent(event.id, payload);
      } else {
        await createEvent(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Lỗi', eventsApiError(e, 'Không lưu được sự kiện'));
    } finally {
      setSaving(false);
    }
  };

  const assigneeList = needCompanyInForm ? formEmployees : employees;
  const assigneeName =
    assigneeList.find((u) => u.id === assigneeId)?.full_name ||
    (assigneeId ? 'Đã chọn' : 'Chọn người phụ trách…');
  const companySource = formCompanies.length >= companies.length ? formCompanies : companies;
  const companyLabel = companySource.find((c) => c.id === companyId);
  const companyName =
    companyLabel?.name || companyLabel?.short_name || (companyId ? 'Đã chọn' : 'Chọn công ty…');
  const companyQuery = companySearch.trim().toLowerCase();
  const visibleCompanies = companyQuery
    ? companySource.filter((c) =>
        `${c.name} ${c.short_name || ''}`.toLowerCase().includes(companyQuery),
      )
    : companySource;

  const moduleChoices = EVENT_MODULE_OPTIONS.filter((m) => m.value);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top, paddingBottom: kbOverlap }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.h1}>{isEdit ? 'Sửa sự kiện' : 'Tạo sự kiện'}</Text>
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void save()} disabled={saving}>
            {saving ? <SpinningLoader color="#fff" size="small" /> : <Text style={styles.saveTxt}>Lưu</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {needCompanyInForm ? (
            <>
              <Text style={styles.label}>Công ty *</Text>
              <Pressable style={styles.pickerBtn} onPress={() => setCompanyPickerOpen(true)}>
                <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
                <Text style={[styles.pickerTxt, !companyId && { color: Colors.textFaint }]} numberOfLines={1}>
                  {companyName}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textFaint} />
              </Pressable>
            </>
          ) : null}

          <Text style={styles.label}>Loại sự kiện</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {types.map((t) => {
              const active = eventType === t.slug;
              return (
                <Pressable
                  key={t.slug}
                  style={[styles.chip, active && { backgroundColor: t.color + '33', borderColor: t.color }]}
                  onPress={() => applyType(t.slug)}
                >
                  <Text style={[styles.chipTxt, active && { color: Colors.text }]}>
                    {t.icon} {t.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Tiêu đề *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Họp khảo sát - Anh Nam"
            placeholderTextColor={Colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Khối</Text>
          <View style={styles.chipWrap}>
            {moduleChoices.map((m) => {
              const active = module === m.value;
              return (
                <Pressable
                  key={m.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setModule(m.value)}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                    {m.emoji} {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Trạng thái</Text>
          <View style={styles.chipWrap}>
            {(Object.keys(EVENT_STATUS_META) as EventStatus[])
              .filter((s) => s !== 'cancelled')
              .map((s) => {
                const active = status === s;
                return (
                  <Pressable
                    key={s}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                      {EVENT_STATUS_META[s].label}
                    </Text>
                  </Pressable>
                );
              })}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Cả ngày</Text>
            <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: Colors.blue }} />
          </View>

          <Text style={styles.label}>Bắt đầu *</Text>
          <View style={styles.row2}>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="yyyy-mm-dd"
              placeholderTextColor={Colors.textFaint}
              style={[styles.input, styles.flex1]}
              autoCapitalize="none"
            />
            {!allDay ? (
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="HH:mm"
                placeholderTextColor={Colors.textFaint}
                style={[styles.input, styles.timeInput]}
                autoCapitalize="none"
              />
            ) : null}
          </View>

          {!allDay ? (
            <>
              <Text style={styles.label}>Kết thúc</Text>
              <View style={styles.row2}>
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="yyyy-mm-dd"
                  placeholderTextColor={Colors.textFaint}
                  style={[styles.input, styles.flex1]}
                  autoCapitalize="none"
                />
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:mm"
                  placeholderTextColor={Colors.textFaint}
                  style={[styles.input, styles.timeInput]}
                  autoCapitalize="none"
                />
              </View>
            </>
          ) : null}

          <Text style={styles.label}>Địa điểm</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Địa chỉ / phòng họp…"
            placeholderTextColor={Colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Người phụ trách</Text>
          <Pressable style={styles.pickerBtn} onPress={() => setAssigneePickerOpen(true)}>
            <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
            <Text style={[styles.pickerTxt, !assigneeId && { color: Colors.textFaint }]} numberOfLines={1}>
              {assigneeName}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textFaint} />
          </Pressable>

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ghi chú…"
            placeholderTextColor={Colors.textFaint}
            style={[styles.input, styles.area]}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>

        <Modal visible={assigneePickerOpen} transparent animationType="fade" onRequestClose={() => setAssigneePickerOpen(false)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setAssigneePickerOpen(false)}>
            <Pressable style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
              <Text style={styles.pickerTitle}>Chọn người phụ trách</Text>
              <ScrollView style={{ maxHeight: 360 }}>
                <Pressable
                  style={styles.pickerRow}
                  onPress={() => {
                    setAssigneeId('');
                    setAssigneePickerOpen(false);
                  }}
                >
                  <Text style={[styles.pickerRowTxt, { color: Colors.textFaint }]}>Không chọn</Text>
                </Pressable>
                {assigneeList.map((u) => (
                  <Pressable
                    key={u.id}
                    style={styles.pickerRow}
                    onPress={() => {
                      setAssigneeId(u.id);
                      setAssigneePickerOpen(false);
                    }}
                  >
                    <Text style={[styles.pickerRowTxt, assigneeId === u.id && { color: Colors.blue, fontWeight: '800' }]}>
                      {u.full_name || u.email || u.id}
                    </Text>
                    {assigneeId === u.id ? <Ionicons name="checkmark" size={18} color={Colors.blue} /> : null}
                  </Pressable>
                ))}
                {needCompanyInForm && !companyId ? (
                  <Text style={[styles.pickerRowTxt, { color: Colors.textFaint, paddingVertical: 12 }]}>
                    Chọn công ty trước để tải danh sách nhân viên
                  </Text>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={companyPickerOpen} transparent animationType="fade" onRequestClose={() => setCompanyPickerOpen(false)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setCompanyPickerOpen(false)}>
            <Pressable style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
              <Text style={styles.pickerTitle}>
                Chọn công ty{companySource.length > 1 ? ` (${companySource.length})` : ''}
              </Text>
              {companySource.length > 8 ? (
                <TextInput
                  value={companySearch}
                  onChangeText={setCompanySearch}
                  placeholder="Tìm công ty…"
                  placeholderTextColor={Colors.textFaint}
                  style={[styles.input, { marginBottom: 8 }]}
                />
              ) : null}
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {companiesLoading && companySource.length < 2 ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
                    <SpinningLoader color={Colors.blue} />
                    <Text style={[styles.pickerRowTxt, { color: Colors.textFaint }]}>
                      Đang tải danh sách công ty…
                    </Text>
                  </View>
                ) : null}
                {visibleCompanies.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.pickerRow}
                    onPress={() => {
                      setCompanyId(c.id);
                      setAssigneeId('');
                      setCompanyPickerOpen(false);
                      setCompanySearch('');
                    }}
                  >
                    <Text style={[styles.pickerRowTxt, companyId === c.id && { color: Colors.blue, fontWeight: '800' }]}>
                      {c.name || c.short_name || c.id}
                    </Text>
                    {companyId === c.id ? <Ionicons name="checkmark" size={18} color={Colors.blue} /> : null}
                  </Pressable>
                ))}
                {!companiesLoading && !visibleCompanies.length ? (
                  <Text style={[styles.pickerRowTxt, { color: Colors.textFaint, paddingVertical: 12 }]}>
                    {companyQuery ? 'Không tìm thấy công ty' : 'Không có danh sách công ty'}
                  </Text>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
    },
    h1: { flex: 1, color: Colors.text, fontSize: 18, fontWeight: '900' },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: Radii.md,
      backgroundColor: Colors.blue,
      minWidth: 64,
      alignItems: 'center',
    },
    saveTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    label: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 14, marginBottom: 8 },
    input: {
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: Colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    area: { minHeight: 90 },
    flex1: { flex: 1 },
    timeInput: { width: 88 },
    row2: { flexDirection: 'row', gap: 8 },
    chipRow: { gap: 8, paddingRight: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    chipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
    chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipTxtActive: { color: '#fff' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      paddingVertical: 4,
    },
    switchLabel: { color: Colors.text, fontSize: 14, fontWeight: '700' },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    pickerTxt: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    pickerSheet: {
      backgroundColor: Colors.card,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 14,
      paddingHorizontal: 14,
      maxHeight: '70%',
    },
    pickerTitle: { color: Colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
      gap: 8,
    },
    pickerRowTxt: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
  });
