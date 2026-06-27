import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../../theme';

export type ReportTabId = 'overview' | 'performance' | 'pipeline';

type Tab = {
  id: ReportTabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TABS: Tab[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'grid-outline' },
  { id: 'performance', label: 'Hiệu suất', icon: 'bar-chart-outline' },
  { id: 'pipeline', label: 'Pipeline', icon: 'git-network-outline' },
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
          <Pressable
            key={tab.id}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={14}
              color={active ? Colors.purple : Colors.textMuted}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    padding: 4,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: Radii.md,
  },
  tabActive: {
    backgroundColor: 'rgba(168,85,247,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  labelActive: {
    color: Colors.purple,
    fontWeight: '800',
  },
});
