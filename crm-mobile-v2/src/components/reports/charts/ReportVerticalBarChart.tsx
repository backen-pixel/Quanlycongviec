import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { CHART_COLORS, formatAxisShort, niceMax } from '../../../lib/reportChartData';
import { Radii, useColors, type ThemeColors } from '../../../theme';

type Item = {
  name: string;
  value: number;
  color?: string;
  /** Tên đầy đủ khi chạm cột (mặc định dùng name). */
  fullName?: string;
};

type Props = {
  data: Item[];
  height?: number;
  valueFormatter?: (v: number) => string;
  barColor?: string;
  showBarLabels?: boolean;
  /** Bật chọn cột + banner chi tiết (mặc định true). */
  selectable?: boolean;
};

export default function ReportVerticalBarChart({
  data,
  height = 220,
  valueFormatter = formatAxisShort,
  barColor = CHART_COLORS.pipeline,
  showBarLabels = true,
  selectable = true,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32 - 28;
  // Trục Y dùng format ngắn (1.5B) — tránh cắt chữ khi valueFormatter = formatVndShort.
  const pad = { top: showBarLabels ? 28 : 12, right: 8, bottom: 44, left: 42 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [data]);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.value || 0);
    return niceMax(m);
  }, [data]);

  const selectedItem = selected != null ? data[selected] : null;

  if (!data.length) return null;

  const gap = 8;
  const barW = Math.max(12, (plotW - gap * (data.length - 1)) / data.length);

  const onSelect = (i: number) => {
    if (!selectable) return;
    setSelected((prev) => (prev === i ? null : i));
  };

  return (
    <View>
      {selectable ? (
        <View style={[styles.detail, selectedItem ? styles.detailActive : null]}>
          {selectedItem ? (
            <>
              <Text style={styles.detailName} numberOfLines={2}>
                {selectedItem.fullName || selectedItem.name}
              </Text>
              <Text style={styles.detailValue}>{valueFormatter(selectedItem.value)}</Text>
            </>
          ) : (
            <Text style={styles.detailHint}>Chạm cột để xem tên khu vực và số liệu</Text>
          )}
        </View>
      ) : null}

      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + plotH * (1 - t);
          return (
            <G key={t}>
              <Line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={CHART_COLORS.grid} strokeWidth={1} />
              <SvgText
                x={pad.left - 6}
                y={y + 4}
                fontSize={9}
                fill={Colors.textFaint}
                textAnchor="end"
                pointerEvents="none"
              >
                {formatAxisShort(maxVal * t)}
              </SvgText>
            </G>
          );
        })}

        {data.map((d, i) => {
          const h = maxVal > 0 ? (d.value / maxVal) * plotH : 0;
          const x = pad.left + i * (barW + gap);
          const y = pad.top + plotH - h;
          const label = valueFormatter(d.value);
          const isSel = selected === i;
          const labelInside = showBarLabels && d.value > 0 && y < pad.top + 14;
          const labelY = labelInside
            ? Math.min(y + 14, pad.top + plotH - 4)
            : Math.max(pad.top + 10, y - 5);
          const labelFill = labelInside ? '#fff' : Colors.text;
          const axisName = d.name.length > 8 ? `${d.name.slice(0, 7)}…` : d.name;

          return (
            <G key={`${d.fullName || d.name}-${i}`}>
              <Rect
                x={x}
                y={pad.top}
                width={barW}
                height={plotH}
                fill="transparent"
                onPress={() => onSelect(i)}
              />
              <Rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                rx={4}
                fill={d.color || barColor}
                opacity={selectable && selectedItem && !isSel ? 0.45 : 1}
                pointerEvents="none"
              />
              {showBarLabels && d.value > 0 && (!selectable || isSel || !selectedItem) ? (
                <SvgText
                  x={x + barW / 2}
                  y={labelY}
                  fontSize={8}
                  fontWeight="700"
                  fill={labelFill}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {label}
                </SvgText>
              ) : null}
              {isSel ? (
                <Rect
                  x={x - 1.5}
                  y={Math.max(pad.top, y - 1.5)}
                  width={barW + 3}
                  height={Math.max(0, h) + 3}
                  rx={5}
                  fill="none"
                  stroke={Colors.white}
                  strokeWidth={1.5}
                  opacity={0.85}
                  pointerEvents="none"
                />
              ) : null}
              <SvgText
                x={x + barW / 2}
                y={height - 8}
                fontSize={9}
                fill={isSel ? Colors.text : Colors.textMuted}
                fontWeight={isSel ? '700' : '400'}
                textAnchor="middle"
                pointerEvents="none"
              >
                {axisName}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {selectable && selectedItem ? (
        <Pressable style={styles.clearBtn} onPress={() => setSelected(null)} hitSlop={8}>
          <Text style={styles.clearText}>Bỏ chọn</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  detail: {
    minHeight: 44,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
    justifyContent: 'center',
  },
  detailActive: {
    borderColor: Colors.purple,
    backgroundColor: `${Colors.purple}18`,
  },
  detailHint: {
    color: Colors.textFaint,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  detailName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  detailValue: {
    color: Colors.purple,
    fontSize: 15,
    fontWeight: '800',
  },
  clearBtn: {
    alignSelf: 'center',
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  clearText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});
