import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  EVENT_MODULE_OPTIONS,
  EVENT_STATUS_META,
  type EventStatus,
  type EventType,
} from '../../api/events';
import type { CrmCompany, CrmEmployee, CrmRegion } from '../../api/crmMeta';
import { Radii, useColors, type ThemeColors } from '../../theme';

export type EventFilters = {
  status: EventStatus | '';
  type: string;
  module: string;
  companyId: string;
  userId: string;
  regionId: string;
};

export const EMPTY_EVENT_FILTERS: EventFilters = {
  status: '',
  type: '',
  module: '',
  companyId: '',
  userId: '',
  regionId: '',
};

type Props = {
  visible: boolean;
  value: EventFilters;
  eventTypes: EventType[];
  companies?: CrmCompany[];
  employees?: CrmEmployee[];
  regions?: CrmRegion[];
  showCompany?: boolean;
  bottomInset?: number;
  onClose: () => void;
  onApply: (next: EventFilters) => void;
};

export default function EventFilterModal({
  visible,
  value,
  eventTypes,
  companies = [],
  employees = [],
  regions = [],
  showCompany = false,
  bottomInset = 0,
  onClose,
  onApply,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [draft, setDraft] = useState<EventFilters>(value);

  React.useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const set = <K extends keyof EventFilters>(key: K, v: EventFilters[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: v };
      if (key === 'companyId') {
        next.userId = '';
        next.regionId = '';
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Bộ lọc sự kiện</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            {showCompany ? (
              <>
                <Text style={styles.section}>Công ty</Text>
                <View style={styles.chipWrap}>
                  <Chip
                    label="Tất cả / theo tài khoản"
                    active={!draft.companyId}
                    onPress={() => set('companyId', '')}
                    styles={styles}
                  />
                  {companies.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.short_name || c.name}
                      active={draft.companyId === c.id}
                      onPress={() => set('companyId', c.id)}
                      styles={styles}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.section}>Khối</Text>
            <View style={styles.chipWrap}>
              {EVENT_MODULE_OPTIONS.map((m) => (
                <Chip
                  key={m.value || 'all'}
                  label={`${m.emoji} ${m.label}`}
                  active={draft.module === m.value}
                  onPress={() => set('module', m.value)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Loại</Text>
            <View style={styles.chipWrap}>
              <Chip
                label="Tất cả loại"
                active={!draft.type}
                onPress={() => set('type', '')}
                styles={styles}
              />
              {eventTypes.map((t) => (
                <Chip
                  key={t.slug}
                  label={`${t.icon} ${t.name}`}
                  active={draft.type === t.slug}
                  onPress={() => set('type', t.slug)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Trạng thái</Text>
            <View style={styles.chipWrap}>
              <Chip
                label="Tất cả"
                active={!draft.status}
                onPress={() => set('status', '')}
                styles={styles}
              />
              {(Object.keys(EVENT_STATUS_META) as EventStatus[]).map((s) => (
                <Chip
                  key={s}
                  label={EVENT_STATUS_META[s].label}
                  active={draft.status === s}
                  onPress={() => set('status', s)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Người tạo</Text>
            <View style={styles.chipWrap}>
              <Chip
                label="Tất cả"
                active={!draft.userId}
                onPress={() => set('userId', '')}
                styles={styles}
              />
              {employees.map((u) => (
                <Chip
                  key={u.id}
                  label={u.full_name || u.email || u.id}
                  active={draft.userId === u.id}
                  onPress={() => set('userId', u.id)}
                  styles={styles}
                />
              ))}
            </View>

            <Text style={styles.section}>Khu vực người tạo</Text>
            <View style={styles.chipWrap}>
              <Chip
                label="Tất cả khu vực"
                active={!draft.regionId}
                onPress={() => set('regionId', '')}
                styles={styles}
              />
              {regions.map((r) => (
                <Chip
                  key={r.id}
                  label={r.code ? `${r.name} (${r.code})` : r.name}
                  active={draft.regionId === r.id}
                  onPress={() => set('regionId', r.id)}
                  styles={styles}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.resetBtn}
              onPress={() =>
                setDraft({
                  ...EMPTY_EVENT_FILTERS,
                  companyId: showCompany ? '' : value.companyId,
                })
              }
            >
              <Text style={styles.resetTxt}>Xóa lọc</Text>
            </Pressable>
            <Pressable
              style={styles.applyBtn}
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            >
              <Text style={styles.applyTxt}>Áp dụng</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: Colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      maxHeight: '88%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.border,
      marginBottom: 10,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { color: Colors.text, fontSize: 17, fontWeight: '900' },
    section: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 14, marginBottom: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceSoft,
      maxWidth: '100%',
    },
    chipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
    chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
    resetBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    resetTxt: { color: Colors.textMuted, fontWeight: '800' },
    applyBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      backgroundColor: Colors.blue,
    },
    applyTxt: { color: '#fff', fontWeight: '800' },
  });
