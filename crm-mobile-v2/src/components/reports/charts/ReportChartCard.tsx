import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radii, Shadow, useColors, type ThemeColors } from '../../../theme';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ReportChartCard({
  title,
  subtitle,
  children,
  empty = false,
  emptyText = 'Chưa có dữ liệu',
  actionLabel,
  onAction,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {empty ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    ...Shadow.card,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  headText: { flex: 1 },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  action: {
    color: Colors.purple,
    fontSize: 12,
    fontWeight: '800',
    paddingTop: 2,
  },
  empty: {
    color: Colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 28,
  },
});
