import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  expanded: boolean;
  dateLabel: string;
  companyLabel: string;
  regionLabel: string;
  showCompany?: boolean;
  showRegion?: boolean;
  onDatePress: () => void;
  onCompanyPress?: () => void;
  onRegionPress?: () => void;
};

export default function ReportFiltersPanel({
  expanded,
  dateLabel,
  companyLabel,
  regionLabel,
  showCompany = true,
  showRegion = false,
  onDatePress,
  onCompanyPress,
  onRegionPress,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  if (!expanded) return null;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.chip} onPress={onDatePress}>
        <Ionicons name="calendar-outline" size={14} color={Colors.purple} />
        <Text style={styles.chipText} numberOfLines={1}>{dateLabel}</Text>
        <Ionicons name="chevron-down" size={12} color={Colors.textFaint} />
      </Pressable>

      {showCompany && onCompanyPress ? (
        <Pressable style={styles.chip} onPress={onCompanyPress}>
          <Ionicons name="business-outline" size={14} color={Colors.purple} />
          <Text style={styles.chipText} numberOfLines={1}>{companyLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={Colors.textFaint} />
        </Pressable>
      ) : null}

      {showRegion && onRegionPress ? (
        <Pressable style={styles.chip} onPress={onRegionPress}>
          <Ionicons name="location-outline" size={14} color={Colors.purple} />
          <Text style={styles.chipText} numberOfLines={1}>{regionLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={Colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    maxWidth: '100%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: '46%',
  },
  chipText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
