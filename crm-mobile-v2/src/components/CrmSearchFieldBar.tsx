import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { SearchField } from '../lib/crmFilters';
import { Radii, useColors, type ThemeColors } from '../theme';

const FIELDS: { id: SearchField; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'Tất cả', icon: 'search' },
  { id: 'title', label: 'Tên', icon: 'person-outline' },
  { id: 'phone', label: 'SĐT', icon: 'call-outline' },
  { id: 'code', label: 'Mã', icon: 'barcode-outline' },
  { id: 'assignee', label: 'NV', icon: 'briefcase-outline' },
];

type Props = {
  value: SearchField;
  onChange: (field: SearchField) => void;
  accent?: string;
};

export default function CrmSearchFieldBar({ value, onChange, accent }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const tint = accent ?? Colors.blue;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      nestedScrollEnabled
    >
      {FIELDS.map((f, idx) => {
        const active = value === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            style={[
              styles.chip,
              idx > 0 && styles.chipGap,
              active && { backgroundColor: tint + '22', borderColor: tint },
            ]}
          >
            <Ionicons name={f.icon} size={12} color={active ? tint : Colors.textMuted} />
            <Text style={[styles.chipTxt, active && { color: tint }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  scroll: { maxHeight: 34, marginTop: 8 },
  content: { paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 30,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipGap: { marginLeft: 8 },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
});
