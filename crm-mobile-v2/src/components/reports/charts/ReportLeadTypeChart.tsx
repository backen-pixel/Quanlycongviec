import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS, niceMax } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Item = { name: string; lead: number; deal: number; color?: string };

type Props = {
  data: Item[];
  height?: number;
};

export default function ReportLeadTypeChart({ data, height = 220 }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  const pad = { top: 12, right: 8, bottom: 44, left: 8 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  const maxTotal = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.lead + d.deal);
    return niceMax(m);
  }, [data]);

  if (!data.length) return null;

  const gap = 6;
  const barW = Math.max(16, (plotW - gap * (data.length - 1)) / data.length);

  return (
    <View>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const total = d.lead + d.deal;
          const scale = maxTotal > 0 ? plotH / maxTotal : 0;
          const hLead = d.lead * scale;
          const hDeal = d.deal * scale;
          const x = pad.left + i * (barW + gap);
          const yDeal = pad.top + plotH - hLead - hDeal;
          const yLead = pad.top + plotH - hLead;
          return (
            <G key={d.name + i}>
              {hLead > 0 ? (
                <Rect x={x} y={yLead} width={barW} height={hLead} fill={CHART_COLORS.lead} rx={hDeal > 0 ? 0 : 4} />
              ) : null}
              {hDeal > 0 ? (
                <Rect x={x} y={yDeal} width={barW} height={hDeal} fill={CHART_COLORS.deal} rx={4} />
              ) : null}
              <SvgText
                x={x + barW / 2}
                y={height - 8}
                fontSize={9}
                fill={Colors.textMuted}
                textAnchor="middle"
              >
                {d.name.length > 7 ? `${d.name.slice(0, 6)}…` : d.name}
              </SvgText>
              {total > 0 ? (
                <SvgText x={x + barW / 2} y={yDeal - 4} fontSize={9} fill={Colors.text} textAnchor="middle" fontWeight="600">
                  {total}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: CHART_COLORS.lead }]} />
          <Text style={styles.legendText}>Lead</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: CHART_COLORS.deal }]} />
          <Text style={styles.legendText}>Deal</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  legend: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
});
