import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../theme';

export type FilterGridCell<T extends string> =
  | {
      type: 'filter';
      id: T;
      label: string;
      icon?: keyof typeof Ionicons.glyphMap;
      count?: number;
    }
  | {
      type: 'action';
      label: string;
      icon?: keyof typeof Ionicons.glyphMap;
      onPress?: () => void;
      disabled?: boolean;
    };

type Props<T extends string> = {
  value: T;
  cells: FilterGridCell<T>[];
  onChange: (id: T) => void;
  accent?: string;
  columns?: number;
  /** Padding ngang của container cha — dùng để tính full width chính xác. */
  pagePadding?: number;
  gap?: number;
};

export default function FilterGridPanel<T extends string>({
  value,
  cells,
  onChange,
  accent,
  columns = 2,
  pagePadding = 0,
  gap = 8,
}: Props<T>) {
  const Colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const contentW = screenW - pagePadding * 2;
  const cellW = (contentW - gap * (columns - 1)) / columns;
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const tint = accent ?? Colors.blue;

  return (
    <View style={[styles.grid, { width: contentW, gap }]}>
      {cells.map((cell, idx) => {
        if (cell.type === 'action') {
          return (
            <Pressable
              key={`action-${idx}`}
              style={[styles.cell, styles.actionCell, { width: cellW }, cell.disabled && { opacity: 0.5 }]}
              onPress={cell.onPress}
              disabled={cell.disabled}
            >
              {cell.icon ? (
                <Ionicons name={cell.icon} size={16} color={Colors.textMuted} />
              ) : null}
              <Text style={styles.actionTxt} numberOfLines={2}>{cell.label}</Text>
            </Pressable>
          );
        }

        const active = value === cell.id;
        return (
          <Pressable
            key={cell.id}
            style={[
              styles.cell,
              { width: cellW },
              active && { backgroundColor: tint + '22', borderColor: tint },
            ]}
            onPress={() => onChange(cell.id)}
          >
            <View style={styles.cellTop}>
              {cell.icon ? (
                <Ionicons name={cell.icon} size={14} color={active ? tint : Colors.textMuted} />
              ) : null}
              <Text style={[styles.cellLabel, active && { color: tint }]} numberOfLines={1}>
                {cell.label}
              </Text>
            </View>
            {typeof cell.count === 'number' ? (
              <Text style={[styles.cellValue, active && { color: tint }]}>{cell.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
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
      minHeight: 56,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    cellTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cellLabel: {
      flex: 1,
      color: Colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    cellValue: {
      color: Colors.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 4,
    },
    actionCell: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: Colors.surfaceSoft,
    },
    actionTxt: {
      color: Colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
