import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors, Radii } from '../theme';

type Props = {
  label: string;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  count?: number;
  onPress?: () => void;
};

export default function Chip({ label, active, icon, accent = Colors.blue, count, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: accent + '26', borderColor: accent },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={active ? accent : Colors.textMuted} />
      ) : null}
      <Text style={[styles.label, active && { color: accent }]}>{label}</Text>
      {typeof count === 'number' ? (
        <Text style={[styles.count, active && { color: accent }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  count: { color: Colors.textFaint, fontSize: 12, fontWeight: '800' },
});
