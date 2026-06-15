import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
};

export default function StatCard({ icon, label, value, hint, accent }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const tint = accent ?? Colors.blue;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name={icon} size={14} color={Colors.textFaint} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: tint }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    minHeight: 92,
    justifyContent: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: {
    color: Colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: { fontSize: 24, fontWeight: '900' },
  hint: { color: Colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600' },
});
