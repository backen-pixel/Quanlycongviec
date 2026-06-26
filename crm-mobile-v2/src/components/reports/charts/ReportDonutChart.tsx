import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import type { PieSegment } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Props = {
  segments: PieSegment[];
  size?: number;
  layout?: 'stack' | 'side';
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegment(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const oStart = polar(cx, cy, rOuter, startAngle);
  const oEnd = polar(cx, cy, rOuter, endAngle);
  const iEnd = polar(cx, cy, rInner, endAngle);
  const iStart = polar(cx, cy, rInner, startAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

export default function ReportDonutChart({ segments, size = 180, layout = 'stack' }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const chartSize = layout === 'side' ? Math.min(140, screenW * 0.38) : Math.min(size, screenW - 80);
  const cx = chartSize / 2;
  const cy = chartSize / 2;
  const rOuter = chartSize * 0.38;
  const rInner = chartSize * 0.24;

  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  let angle = 0;
  const arcs = segments.map((seg) => {
    const sweep = (seg.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const mid = start + sweep / 2;
    const labelPos = polar(cx, cy, (rOuter + rInner) / 2, mid);
    return { seg, path: donutSegment(cx, cy, rOuter, rInner, start, end), labelPos, pct: Math.round((seg.value / total) * 100) };
  });

  return (
    <View style={[styles.wrap, layout === 'side' && styles.wrapSide]}>
      <Svg width={chartSize} height={chartSize}>
        {arcs.map(({ seg, path, labelPos, pct }) => (
          <G key={seg.name}>
            <Path d={path} fill={seg.color} stroke={Colors.card} strokeWidth={2} />
            {pct >= 8 ? (
              <SvgText
                x={labelPos.x}
                y={labelPos.y + 4}
                fontSize={10}
                fontWeight="700"
                fill="#fff"
                textAnchor="middle"
              >
                {pct}%
              </SvgText>
            ) : null}
          </G>
        ))}
        <SvgText x={cx} y={cy - 4} fontSize={11} fill={Colors.textMuted} textAnchor="middle">
          Tổng
        </SvgText>
        <SvgText x={cx} y={cy + 12} fontSize={16} fontWeight="700" fill={Colors.text} textAnchor="middle">
          {total}
        </SvgText>
      </Svg>

      <View style={[styles.legend, layout === 'side' && styles.legendSide]}>
        {segments.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          return (
            <View key={seg.name} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: seg.color }]} />
              <Text style={styles.legendText}>{seg.name}</Text>
              <Text style={styles.legendVal}>{seg.value}</Text>
              <Text style={styles.legendPct}>({pct}%)</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: { alignItems: 'center' },
  wrapSide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legend: { width: '100%', marginTop: 8, gap: 6 },
  legendSide: {
    flex: 1,
    marginTop: 0,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  legendVal: { color: Colors.text, fontSize: 12, fontWeight: '800' },
  legendPct: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', minWidth: 36, textAlign: 'right' },
});
