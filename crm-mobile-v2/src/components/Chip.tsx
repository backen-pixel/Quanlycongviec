import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../theme';

type Props = {
  label: string;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  count?: number;
  onPress?: () => void;
};

export default function Chip({ label, active, icon, accent, count, onPress }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const tint = accent ?? Colors.blue;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: tint + '26', borderColor: tint },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={active ? tint : Colors.textMuted} />
      ) : null}
      <Text style={[styles.label, active && { color: tint }]}>{label}</Text>
      {typeof count === 'number' ? (
        <Text style={[styles.count, active && { color: tint }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
