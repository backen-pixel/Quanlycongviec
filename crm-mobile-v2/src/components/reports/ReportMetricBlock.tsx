import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Tone = 'blue' | 'cyan' | 'emerald' | 'amber' | 'violet' | 'sky' | 'rose' | 'indigo' | 'slate';

const TONE_STYLES: Record<Tone, { bg: string; border: string; text: string }> = {
  blue: { bg: '#eff6ff', border: '#dbeafe', text: '#1e3a8a' },
  cyan: { bg: '#ecfeff', border: '#cffafe', text: '#155e75' },
  emerald: { bg: '#ecfdf5', border: '#d1fae5', text: '#065f46' },
  amber: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  violet: { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
  sky: { bg: '#f0f9ff', border: '#bae6fd', text: '#0c4a6e' },
  rose: { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239' },
  indigo: { bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3' },
  slate: { bg: '#f8fafc', border: '#e2e8f0', text: '#1e293b' },
};

type Props = {
  label: string;
  value: string | number;
  tone?: Tone;
  full?: boolean;
};

export default function ReportMetricBlock({ label, value, tone = 'slate', full = false }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const palette = TONE_STYLES[tone] || TONE_STYLES.slate;
  return (
    <View style={[styles.box, full && styles.full, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, { color: palette.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  box: {
    flex: 1,
    minWidth: '46%',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  full: { minWidth: '100%' },
  label: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.85,
  },
  value: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
  },
});
