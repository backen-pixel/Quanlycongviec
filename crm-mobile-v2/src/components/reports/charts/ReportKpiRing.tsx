import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useColors, type ThemeColors } from '../../../theme';

type Props = {
  pct: number;
  label?: string;
  subtitle?: string;
  ringColor?: string;
};

export default function ReportKpiRing({ pct, label = 'Chốt deal', subtitle, ringColor }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const size = 112;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (p / 100) * circ;
  const color = ringColor ?? (p >= 80 ? '#059669' : p >= 50 ? Colors.purple : p >= 25 ? '#d97706' : '#e11d48');

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${cx}, ${cy}`}>
            <Circle cx={cx} cy={cy} r={r} stroke={Colors.border} strokeWidth={stroke} fill="none" />
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={offset}
              fill="none"
            />
          </G>
        </Svg>
        <View style={styles.center}>
          <Text style={styles.pct}>{Math.round(p)}%</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pct: { color: Colors.text, fontSize: 22, fontWeight: '900' },
  label: { color: Colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 },
  sub: { color: Colors.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center' },
});
