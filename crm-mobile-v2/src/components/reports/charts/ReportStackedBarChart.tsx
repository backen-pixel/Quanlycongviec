import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import type { DealStackedRow } from '../../../lib/reportChartData';
import { STACK_COLORS, niceMax } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Props = {
  data: DealStackedRow[];
  rowHeight?: number;
};

export default function ReportStackedBarChart({ data, rowHeight = 34 }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  const labelW = 92;
  const pad = { top: 4, right: 8, bottom: 4, left: labelW };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const height = Math.max(80, data.length * rowHeight + 8);

  const maxTotal = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.won + (d.completed || 0) + d.lost + d.open);
    return niceMax(m);
  }, [data]);

  if (!data.length) return null;

  return (
    <View>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const y = pad.top + i * rowHeight;
          const total = d.won + (d.completed || 0) + d.lost + d.open;
          const scale = maxTotal > 0 ? plotW / maxTotal : 0;
          const wWon = d.won * scale;
          const wCompleted = (d.completed || 0) * scale;
          const wLost = d.lost * scale;
          const wOpen = d.open * scale;
          let x = pad.left;
          const bars = [
            { w: wWon, color: STACK_COLORS.won },
            { w: wCompleted, color: STACK_COLORS.completed },
            { w: wLost, color: STACK_COLORS.lost },
            { w: wOpen, color: STACK_COLORS.open },
          ];
          return (
            <G key={d.name + i}>
              <SvgText x={8} y={y + rowHeight / 2 + 4} fontSize={10} fill={Colors.textMuted}>
                {d.name}
              </SvgText>
              {bars.map((bar, bi) => {
                if (bar.w <= 0) return null;
                const bx = x;
                x += bar.w;
                return (
                  <Rect
                    key={bi}
                    x={bx}
                    y={y + 6}
                    width={bar.w}
                    height={rowHeight - 12}
                    fill={bar.color}
                  />
                );
              })}
              <SvgText
                x={pad.left + wWon + wCompleted + wLost + wOpen + 6}
                y={y + rowHeight / 2 + 4}
                fontSize={10}
                fill={d.completion_rate_pct != null ? '#6d28d9' : Colors.text}
                fontWeight="600"
              >
                {d.completion_rate_pct != null ? `HT ${d.completion_rate_pct}%` : total}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      <View style={styles.legend}>
        <LegendItem color={STACK_COLORS.won} label="Chốt" Colors={Colors} styles={styles} />
        <LegendItem color={STACK_COLORS.completed} label="Hoàn thành" Colors={Colors} styles={styles} />
        <LegendItem color={STACK_COLORS.lost} label="Thua" Colors={Colors} styles={styles} />
        <LegendItem color={STACK_COLORS.open} label="Đang mở" Colors={Colors} styles={styles} />
      </View>
    </View>
  );
}

function LegendItem({
  color,
  label,
  Colors,
  styles,
}: {
  color: string;
  label: string;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: Colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600' },
});
