import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../theme';

export type ActionGridItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
};

type Props = {
  items: ActionGridItem[];
  columns?: number;
  pagePadding?: number;
  gap?: number;
};

export default function ActionGrid2x2({
  items,
  columns = 2,
  pagePadding = 0,
  gap = 8,
}: Props) {
  const Colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const contentW = screenW - pagePadding * 2;
  const cellW = (contentW - gap * (columns - 1)) / columns;
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={[styles.grid, { width: contentW, gap }]}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          style={[
            styles.cell,
            { width: cellW },
            item.active && styles.cellActive,
            item.danger && styles.cellDanger,
            item.disabled && { opacity: 0.5 },
          ]}
          onPress={item.onPress}
          disabled={item.disabled}
        >
          {item.icon ? (
            <Ionicons
              name={item.icon}
              size={18}
              color={item.danger ? Colors.red : item.active ? Colors.blue : Colors.textMuted}
            />
          ) : null}
          <Text
            style={[
              styles.label,
              item.active && { color: Colors.blue },
              item.danger && { color: Colors.red },
            ]}
            numberOfLines={2}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    cell: {
      minHeight: 52,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 10,
    },
    cellActive: {
      borderColor: Colors.blue,
      backgroundColor: Colors.blueSoft,
    },
    cellDanger: {
      borderColor: 'rgba(239,68,68,0.35)',
      backgroundColor: Colors.redSoft,
    },
    label: {
      color: Colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
