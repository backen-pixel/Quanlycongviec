import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Item = {
  name: string;
  count?: number;
  value?: number;
  color?: string;
};

type Props = {
  data: Item[];
  totalLabel?: string;
};

export default function ReportFunnelChart({ data, totalLabel }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  const cx = width * 0.42;
  const maxW = width * 0.52;
  const minW = maxW * 0.38;
  const rowH = 38;
  const height = Math.max(120, data.length * rowH + 16);

  const total = data.reduce((s, d) => s + (d.count ?? d.value ?? 0), 0);
  if (!data.length || total <= 0) return null;

  let y = 8;
  const shapes = data.map((d, i) => {
    const raw = d.count ?? d.value ?? 0;
    const pct = Math.round((raw / total) * 100);
    const t = data.length <= 1 ? 1 : i / (data.length - 1);
    const topW = maxW - (maxW - minW) * (i / Math.max(1, data.length));
    const botW = maxW - (maxW - minW) * ((i + 1) / Math.max(1, data.length));
    const topLeft = cx - topW / 2;
    const topRight = cx + topW / 2;
    const botLeft = cx - botW / 2;
    const botRight = cx + botW / 2;
    const path = [
      `M ${topLeft} ${y}`,
      `L ${topRight} ${y}`,
      `L ${botRight} ${y + rowH}`,
      `L ${botLeft} ${y + rowH}`,
      'Z',
    ].join(' ');
    const color = d.color || CHART_COLORS.lead;
    const labelY = y + rowH / 2 + 4;
    const block = { path, color, labelY, d, raw, pct, i };
    y += rowH;
    return block;
  });

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        {shapes.map(({ path, color, labelY, d, raw, pct, i }) => (
          <G key={d.name + i}>
            <Path d={path} fill={color} opacity={0.92} />
            <SvgText
              x={cx}
              y={labelY}
              fontSize={11}
              fontWeight="700"
              fill="#fff"
              textAnchor="middle"
            >
              {d.name}
            </SvgText>
            <SvgText
              x={width - 8}
              y={labelY}
              fontSize={11}
              fontWeight="700"
              fill={Colors.text}
              textAnchor="end"
            >
              {raw} ({pct}%)
            </SvgText>
          </G>
        ))}
      </Svg>
      {totalLabel ? <View style={styles.footer} /> : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: { marginTop: 4 },
  footer: {},
});
