import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../../theme';

export type ReportTabId = 'overview' | 'performance' | 'pipeline';

type Tab = { id: ReportTabId; label: string };

const TABS: Tab[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'performance', label: 'Hiệu suất' },
  { id: 'pipeline', label: 'Pipeline' },
];

type Props = {
  value: ReportTabId;
  onChange: (id: ReportTabId) => void;
};

export default function ReportTabBar({ value, onChange }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.wrap}>
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable key={tab.id} style={styles.tab} onPress={() => onChange(tab.id)}>
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            {active ? <View style={styles.indicator} /> : <View style={styles.indicatorSpacer} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 0,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 10,
  },
  labelActive: {
    color: Colors.purple,
  },
  indicator: {
    width: '72%',
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.purple,
  },
  indicatorSpacer: {
    height: 3,
  },
});
