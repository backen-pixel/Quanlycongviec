import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS, formatAxisShort, niceMax } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Item = { name: string; count?: number; value?: number; color?: string };

type Props = {
  data: Item[];
  rowHeight?: number;
  valueMode?: boolean;
  barColor?: string;
  showPct?: boolean;
  total?: number;
};

export default function ReportHorizontalBarChart({
  data,
  rowHeight = 32,
  valueMode = false,
  barColor = CHART_COLORS.lead,
  showPct = false,
  total,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  const labelW = 92;
  const pad = { top: 4, right: 8, bottom: 4, left: labelW };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const height = Math.max(80, data.length * rowHeight + 8);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.value ?? d.count ?? 0);
    return niceMax(m);
  }, [data]);

  const sumTotal = total ?? data.reduce((s, d) => s + (d.count ?? d.value ?? 0), 0);

  if (!data.length) return null;

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const y = pad.top + i * rowHeight;
          const raw = d.value ?? d.count ?? 0;
          const barW = maxVal > 0 ? (raw / maxVal) * plotW : 0;
          const label = valueMode ? formatAxisShort(raw) : String(raw);
          const pct = showPct && sumTotal > 0 ? Math.round((raw / sumTotal) * 100) : null;
          return (
            <G key={d.name + i}>
              <SvgText x={8} y={y + rowHeight / 2 + 4} fontSize={10} fill={Colors.textMuted}>
                {d.name}
              </SvgText>
              <Rect
                x={pad.left}
                y={y + 6}
                width={Math.max(0, barW)}
                height={rowHeight - 12}
                rx={4}
                fill={d.color || barColor}
              />
              <SvgText
                x={width - pad.right}
                y={y + rowHeight / 2 + 4}
                fontSize={10}
                fill={Colors.text}
                fontWeight="600"
                textAnchor="end"
              >
                {pct != null ? `${label} (${pct}%)` : label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const makeStyles = (_Colors: ThemeColors) => StyleSheet.create({
  wrap: { marginTop: 4 },
});
