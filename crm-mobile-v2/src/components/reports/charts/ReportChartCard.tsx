import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radii, Shadow, useColors, type ThemeColors } from '../../../theme';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
};

export default function ReportChartCard({
  title,
  subtitle,
  children,
  empty = false,
  emptyText = 'Chưa có dữ liệu',
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  empty: {
    color: Colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 28,
  },
});
