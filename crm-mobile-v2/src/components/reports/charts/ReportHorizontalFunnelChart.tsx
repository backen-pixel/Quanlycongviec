import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '../../../theme';

type Item = { name: string; count?: number; color?: string };

type Props = {
  data: Item[];
  maxVisible?: number;
};

export default function ReportHorizontalFunnelChart({ data, maxVisible = 12 }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const maxCount = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.count ?? 0);
    return m || 1;
  }, [data]);

  if (!data.length) return null;

  const rows = data.slice(0, maxVisible);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      {rows.map((d, i) => {
        const count = d.count ?? 0;
        const pct = Math.max(4, Math.round((count / maxCount) * 100));
        const color = d.color || Colors.purple;
        return (
          <View key={`${d.name}-${i}`} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.label} numberOfLines={2}>{d.name}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.count}>{count}</Text>
          </View>
        );
      })}
      <View style={styles.scaleRow}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <Text key={t} style={styles.scaleText}>{Math.round(maxCount * t)}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  scroll: { maxHeight: 280 },
  scrollContent: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  label: {
    width: 118,
    flexShrink: 0,
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSoft,
    overflow: 'hidden',
    minWidth: 48,
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
    minWidth: 4,
  },
  count: {
    width: 36,
    textAlign: 'right',
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 0,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingLeft: 136,
    paddingRight: 44,
  },
  scaleText: {
    color: Colors.textFaint,
    fontSize: 9,
    fontWeight: '600',
  },
});
