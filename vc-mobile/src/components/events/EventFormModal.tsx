import SpinningLoader from '../SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EVENT_MODULE_OPTIONS,
  EVENT_STATUS_META,
  addHoursLocalDatetime,
  createEvent,
  defaultEventStartLocal,
  eventsApiError,
  fetchEventTypes,
  localDatetimeValueToIso,
  type EventStatus,
  type EventType,
} from '../../api/events';
import FilterPickerModal from '../FilterPickerModal';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { loadKanbanFilters } from '../../lib/kanbanFilterStorage';
import { fetchCompanies, type CompanyOption } from '../../lib/logisticsApi';
import { isSystemAdmin } from '../../lib/productionFilters';
import { Radii, type AppColors } from '../../theme';

type Props = {
  visible: boolean;
  /** Ngày mặc định khi tạo mới (đã chọn trên lịch). */
  presetDay?: Date | null;
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

export default function EventFormModal({ visible, presetDay, onClose, onSaved }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const sysAdmin = isSystemAdmin(user);

  const [types, setTypes] = useState<EventType[]>([]);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('meeting');
  const [module, setModule] = useState('logistics');
  const [status, setStatus] = useState<EventStatus>('planned');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void fetchEventTypes().then(setTypes);
  }, [visible]);

  useEffect(() => {
    if (!visible || !sysAdmin) return undefined;
    let cancelled = false;
    setCompaniesLoading(true);
    void fetchCompanies()
      .then((rows) => {
        if (!cancelled) setCompanies(rows);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      })
      .finally(() => {
        if (!cancelled) setCompaniesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, sysAdmin]);

  useEffect(() => {
    if (!visible) return;
    const startLocal = defaultEventStartLocal(presetDay || undefined);
    const endLocal = addHoursLocalDatetime(startLocal, 1);
    const s = splitLocal(startLocal);
    const e = splitLocal(endLocal);
    setTitle('');
    setEventType('meeting');
    setModule('logistics');
    setStatus('planned');
    setStartDate(s.date);
    setStartTime(s.time);
    setEndDate(e.date);
    setEndTime(e.time);
    setAllDay(false);
    setLocation('');
    setDescription('');
    if (!sysAdmin) {
      setCompanyId(user?.company_id ? String(user.company_id) : '');
    } else {
      // Prefill từ bộ lọc chung (Overview/Kanban) — bỏ qua «Tất cả».
      void loadKanbanFilters().then((snap) => {
        const fromFilter = String(snap?.filterCompany || '').trim();
        if (fromFilter) setCompanyId(fromFilter);
      });
    }
  }, [visible, presetDay, sysAdmin, user?.company_id]);

  useEffect(() => {
    if (!visible || !types.length) return;
    setEventType((prev) => (types.some((t) => t.slug === prev) ? prev : types[0].slug));
  }, [visible, types]);

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
    const resolvedCompanyId = sysAdmin
      ? String(companyId || '').trim()
      : user?.company_id
        ? String(user.company_id)
        : '';
    if (!resolvedCompanyId) {
      Alert.alert(
        'Thiếu công ty',
        sysAdmin
          ? 'Chọn công ty trước khi lưu sự kiện.'
          : 'Tài khoản chưa gán công ty — không tạo được sự kiện.',
      );
      return;
    }
    const assigneeId = user?.id || user?.userId || '';

    setSaving(true);
    try {
      await createEvent({
        title: title.trim(),
        event_type: eventType,
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: startIso,
        end_time: endIso,
        all_day: allDay,
        status,
        module: module || 'logistics',
        company_id: resolvedCompanyId,
        assignee_id: assigneeId || null,
        participant_ids: assigneeId ? [assigneeId] : [],
      });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Lỗi', eventsApiError(e, 'Không lưu được sự kiện'));
    } finally {
      setSaving(false);
    }
  };

  const moduleChoices = EVENT_MODULE_OPTIONS.filter((m) => m.value);
  const companyName =
    companies.find((c) => c.id === companyId)?.name ||
    (companyId ? 'Đã chọn' : companiesLoading ? 'Đang tải công ty…' : 'Chọn công ty…');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.h1}>Tạo sự kiện</Text>
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void save()} disabled={saving}>
            {saving ? <SpinningLoader color="#fff" size="small" /> : <Text style={styles.saveTxt}>Lưu</Text>}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {sysAdmin ? (
            <>
              <Text style={styles.label}>Công ty *</Text>
              <Pressable style={styles.pickerBtn} onPress={() => setCompanyPickerOpen(true)}>
                <Ionicons name="business-outline" size={16} color={colors.textMuted} />
                <Text
                  style={[styles.pickerTxt, !companyId && { color: colors.textFaint }]}
                  numberOfLines={1}
                >
                  {companyName}
                </Text>
                {companiesLoading ? (
                  <SpinningLoader size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
                )}
              </Pressable>
              {!companiesLoading && !companies.length ? (
                <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6, fontWeight: '600' }}>
                  Không tải được danh sách công ty. Kéo thử lại sau.
                </Text>
              ) : null}
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
                  <Text style={[styles.chipTxt, active && { color: colors.text }]}>
                    {t.icon} {t.name}
                  </Text>
                </Pressable>
              );
            })}
            {!types.length ? (
              <Text style={[styles.chipTxt, { paddingVertical: 8 }]}>Đang tải loại…</Text>
            ) : null}
          </ScrollView>

          <Text style={styles.label}>Tiêu đề *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Giao hàng - Anh Nam"
            placeholderTextColor={colors.textFaint}
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
            <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: colors.primary }} />
          </View>

          <Text style={styles.label}>Bắt đầu *</Text>
          <View style={styles.row2}>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="yyyy-mm-dd"
              placeholderTextColor={colors.textFaint}
              style={[styles.input, styles.flex1]}
              autoCapitalize="none"
            />
            {!allDay ? (
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="HH:mm"
                placeholderTextColor={colors.textFaint}
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
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, styles.flex1]}
                  autoCapitalize="none"
                />
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:mm"
                  placeholderTextColor={colors.textFaint}
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
            placeholder="Địa chỉ giao / lắp đặt…"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ghi chú…"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.area]}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>

        <FilterPickerModal
          visible={companyPickerOpen}
          title={companies.length > 1 ? `Chọn công ty (${companies.length})` : 'Chọn công ty'}
          options={companies.map((c) => ({ id: c.id, label: c.name }))}
          selectedId={companyId}
          onSelect={(id) => setCompanyId(id)}
          onClose={() => setCompanyPickerOpen(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    h1: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
      minWidth: 64,
      alignItems: 'center',
    },
    saveTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 14, marginBottom: 8 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: colors.text,
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
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipTxtActive: { color: '#fff' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      paddingVertical: 4,
    },
    switchLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    pickerTxt: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  });
}
