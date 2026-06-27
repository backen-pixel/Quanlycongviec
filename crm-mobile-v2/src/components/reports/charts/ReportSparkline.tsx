import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color: string;
  fillOpacity?: number;
};

export default function ReportSparkline({
  data,
  width = 72,
  height = 28,
  color,
  fillOpacity = 0.15,
}: Props) {
  const points = useMemo(() => {
    const series = data.length >= 2 ? data : data.length === 1 ? [0, data[0]] : [0, 0];
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const span = max - min || 1;
    return series.map((v, i) => {
      const x = series.length <= 1 ? width / 2 : (i / (series.length - 1)) * width;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x},${y}`;
    }).join(' ');
  }, [data, width, height]);

  if (!data.length) {
    return <View style={[styles.placeholder, { width, height, backgroundColor: `${color}22` }]} />;
  }

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      </Svg>
      <View style={[styles.glow, { backgroundColor: color, opacity: fillOpacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: 6 },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  placeholder: { borderRadius: 6 },
});
