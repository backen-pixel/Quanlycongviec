import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { CrmEmployee } from '../../api/crmMeta';
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
  onClose,
  onSaved,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const isEdit = !!event?.id;

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
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void fetchEventTypes().then(setTypes);
  }, [visible]);

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
  }, [visible, event?.id, presetDay, defaultModule, defaultAssigneeId]);

  useEffect(() => {
    if (!visible || event || !types.length) return;
    setEventType((prev) => (types.some((t) => t.slug === prev) ? prev : types[0].slug));
  }, [visible, event, types]);

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
    const companyId = String(event?.companyId || defaultCompanyId || '').trim();
    if (!isEdit && !event?.leadId && !companyId) {
      Alert.alert(
        'Thiếu công ty',
        'Chọn công ty trong bộ lọc trước khi tạo sự kiện (giống web), hoặc dùng tài khoản đã gán công ty.',
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
        ...(companyId ? { company_id: companyId } : {}),
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

  const assigneeName =
    employees.find((u) => u.id === assigneeId)?.full_name ||
    (assigneeId ? 'Đã chọn' : 'Chọn người phụ trách…');

  const moduleChoices = EVENT_MODULE_OPTIONS.filter((m) => m.value);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.h1}>{isEdit ? 'Sửa sự kiện' : 'Tạo sự kiện'}</Text>
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void save()} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Lưu</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
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
                {employees.map((u) => (
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
