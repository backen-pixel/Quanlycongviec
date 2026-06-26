import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS, formatAxisShort, niceMax } from '../../../lib/reportChartData';
import { useColors, type ThemeColors } from '../../../theme';

type Point = {
  label: string;
  lead_count?: number;
  deal_count?: number;
  won_value?: number;
};

type Props = {
  data: Point[];
  height?: number;
  mode?: 'full' | 'won-only';
};

export default function ReportTimelineChart({ data, height = 220, mode = 'full' }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  const pad = { top: 14, right: 34, bottom: 30, left: 34 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  const maxCount = useMemo(() => {
    if (mode === 'won-only') return 1;
    let m = 0;
    for (const d of data) {
      m = Math.max(m, d.lead_count || 0, d.deal_count || 0);
    }
    return niceMax(m);
  }, [data, mode]);

  const maxValue = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.won_value || 0);
    return niceMax(m);
  }, [data]);

  if (!data.length) return null;

  const xAt = (i: number) => pad.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yCount = (v: number) => pad.top + plotH - (v / maxCount) * plotH;
  const yValue = (v: number) => pad.top + plotH - (v / maxValue) * plotH;

  const leadPoints = mode === 'won-only' ? '' : data.map((d, i) => `${xAt(i)},${yCount(d.lead_count || 0)}`).join(' ');
  const dealPoints = mode === 'won-only' ? '' : data.map((d, i) => `${xAt(i)},${yCount(d.deal_count || 0)}`).join(' ');
  const wonPoints = data.map((d, i) => `${xAt(i)},${yValue(d.won_value || 0)}`).join(' ');

  const labelStep = data.length <= 6 ? 1 : Math.ceil(data.length / 5);

  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + plotH * (1 - t);
          return (
            <G key={`g-${t}`}>
              <Line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={Colors.border} strokeWidth={1} />
              {mode !== 'won-only' ? (
                <SvgText x={pad.left - 6} y={y + 4} fontSize={9} fill={Colors.textFaint} textAnchor="end">
                  {formatAxisShort(maxCount * t)}
                </SvgText>
              ) : null}
              <SvgText x={width - pad.right + 6} y={y + 4} fontSize={9} fill={Colors.textFaint} textAnchor="start">
                {formatAxisShort(maxValue * t)}
              </SvgText>
            </G>
          );
        })}

        {mode !== 'won-only' && leadPoints ? (
          <Polyline points={leadPoints} fill="none" stroke={CHART_COLORS.lead} strokeWidth={2} />
        ) : null}
        {mode !== 'won-only' && dealPoints ? (
          <Polyline points={dealPoints} fill="none" stroke={CHART_COLORS.deal} strokeWidth={2} />
        ) : null}
        <Polyline points={wonPoints} fill="none" stroke={CHART_COLORS.wonValue} strokeWidth={2} strokeDasharray={mode === 'won-only' ? undefined : '5 4'} />

        {data.map((d, i) => (i % labelStep === 0 || i === data.length - 1 ? (
          <SvgText
            key={d.label + i}
            x={xAt(i)}
            y={height - 8}
            fontSize={9}
            fill={Colors.textMuted}
            textAnchor="middle"
          >
            {d.label.slice(0, 5)}
          </SvgText>
        ) : null))}
      </Svg>

      <View style={styles.legend}>
        {mode !== 'won-only' ? (
          <>
            <LegendDot color={CHART_COLORS.lead} label="Lead" Colors={Colors} styles={styles} />
            <LegendDot color={CHART_COLORS.deal} label="Deal" Colors={Colors} styles={styles} />
          </>
        ) : null}
        <LegendDot color={CHART_COLORS.wonValue} label="GT chốt" dashed={mode !== 'won-only'} Colors={Colors} styles={styles} />
      </View>
    </View>
  );
}

function LegendDot({
  color,
  label,
  dashed,
  Colors,
  styles,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={[styles.legendDash, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legendDot, { backgroundColor: color }]} />
      )}
      <Text style={[styles.legendText, { color: Colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDash: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600' },
});
