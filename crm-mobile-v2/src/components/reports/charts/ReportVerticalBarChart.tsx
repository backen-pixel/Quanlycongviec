import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS, formatAxisShort, niceMax } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Item = { name: string; value: number; color?: string };

type Props = {
  data: Item[];
  height?: number;
  valueFormatter?: (v: number) => string;
  barColor?: string;
};

export default function ReportVerticalBarChart({
  data,
  height = 220,
  valueFormatter = formatAxisShort,
  barColor = CHART_COLORS.pipeline,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  const pad = { top: 12, right: 8, bottom: 44, left: 36 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.value || 0);
    return niceMax(m);
  }, [data]);

  if (!data.length) return null;

  const gap = 8;
  const barW = Math.max(12, (plotW - gap * (data.length - 1)) / data.length);

  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + plotH * (1 - t);
          return (
            <G key={t}>
              <Line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={CHART_COLORS.grid} strokeWidth={1} />
              <SvgText x={pad.left - 6} y={y + 4} fontSize={9} fill={Colors.textFaint} textAnchor="end">
                {valueFormatter(maxVal * t)}
              </SvgText>
            </G>
          );
        })}

        {data.map((d, i) => {
          const h = maxVal > 0 ? (d.value / maxVal) * plotH : 0;
          const x = pad.left + i * (barW + gap);
          const y = pad.top + plotH - h;
          return (
            <G key={d.name + i}>
              <Rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                rx={4}
                fill={d.color || barColor}
              />
              <SvgText
                x={x + barW / 2}
                y={height - 8}
                fontSize={9}
                fill={Colors.textMuted}
                textAnchor="middle"
              >
                {d.name.length > 8 ? `${d.name.slice(0, 7)}…` : d.name}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Text style={styles.hint}>Giá trị pipeline theo khu vực</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  hint: { color: Colors.textFaint, fontSize: 10, textAlign: 'center', marginTop: 2 },
});
