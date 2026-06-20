import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../theme';

export type FilterChipOption<T extends string> = {
  id: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
};

type Props<T extends string> = {
  value: T;
  options: FilterChipOption<T>[];
  onChange: (id: T) => void;
  accent?: string;
};

export default function FilterChipBar<T extends string>({
  value,
  options,
  onChange,
  accent,
}: Props<T>) {
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
      {options.map((opt, idx) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[
              styles.chip,
              idx > 0 && styles.chipGap,
              active && { backgroundColor: tint + '22', borderColor: tint },
            ]}
          >
            {opt.icon ? (
              <Ionicons name={opt.icon} size={12} color={active ? tint : Colors.textMuted} />
            ) : null}
            <Text style={[styles.chipTxt, active && { color: tint }]}>{opt.label}</Text>
            {typeof opt.count === 'number' ? (
              <Text style={[styles.chipCount, active && { color: tint }]}>{opt.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  scroll: { maxHeight: 34 },
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
  chipCount: { color: Colors.textFaint, fontSize: 11, fontWeight: '800' },
});
