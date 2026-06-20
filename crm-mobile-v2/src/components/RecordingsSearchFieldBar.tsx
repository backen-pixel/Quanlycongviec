import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { RecordingSearchField } from '../lib/recordingsFilters';
import { Radii, useColors, type ThemeColors } from '../theme';

const FIELDS: { id: RecordingSearchField; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'Tất cả', icon: 'search' },
  { id: 'title', label: 'Tên file', icon: 'document-text-outline' },
  { id: 'phone', label: 'SĐT', icon: 'call-outline' },
  { id: 'owner', label: 'Người ghi', icon: 'person-outline' },
  { id: 'customer', label: 'KH/Lead', icon: 'people-outline' },
];

type Props = {
  value: RecordingSearchField;
  onChange: (field: RecordingSearchField) => void;
};

export default function RecordingsSearchFieldBar({ value, onChange }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

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
              active && { backgroundColor: Colors.blue + '22', borderColor: Colors.blue },
            ]}
          >
            <Ionicons name={f.icon} size={12} color={active ? Colors.blue : Colors.textMuted} />
            <Text style={[styles.chipTxt, active && { color: Colors.blue }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  scroll: { maxHeight: 34 },
  content: { paddingRight: 4 },
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
