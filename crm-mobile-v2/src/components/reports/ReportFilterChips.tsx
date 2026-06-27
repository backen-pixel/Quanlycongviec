import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  dateLabel: string;
  companyLabel: string;
  regionLabel: string;
  showCompany?: boolean;
  showRegion?: boolean;
  onDatePress: () => void;
  onCompanyPress?: () => void;
  onRegionPress?: () => void;
  onFilterPress: () => void;
};

export default function ReportFilterChips({
  dateLabel,
  companyLabel,
  regionLabel,
  showCompany = true,
  showRegion = false,
  onDatePress,
  onCompanyPress,
  onRegionPress,
  onFilterPress,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        <Pressable style={styles.chip} onPress={onDatePress}>
          <Ionicons name="calendar-outline" size={13} color={Colors.purple} />
          <Text style={styles.chipText} numberOfLines={1}>{dateLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={Colors.textFaint} />
        </Pressable>

        {showCompany && onCompanyPress ? (
          <Pressable style={styles.chip} onPress={onCompanyPress}>
            <Ionicons name="business-outline" size={13} color={Colors.purple} />
            <Text style={styles.chipText} numberOfLines={1}>{companyLabel}</Text>
            <Ionicons name="chevron-down" size={12} color={Colors.textFaint} />
          </Pressable>
        ) : null}

        {showRegion && onRegionPress ? (
          <Pressable style={[styles.chip, styles.chipRegion]} onPress={onRegionPress}>
            <Ionicons name="location-outline" size={13} color={Colors.purple} />
            <Text style={styles.chipText} numberOfLines={1}>{regionLabel}</Text>
            <Ionicons name="chevron-down" size={12} color={Colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.filterBtn} onPress={onFilterPress} accessibilityLabel="Bộ lọc">
        <Ionicons name="options-outline" size={20} color={Colors.purple} />
      </Pressable>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: '46%',
    height: 38,
    paddingHorizontal: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipRegion: {
    minWidth: '100%',
  },
  chipText: {
    flex: 1,
    color: Colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  filterBtn: {
    width: 38,
    height: 38,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
