import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radii, useColors, type ThemeColors } from '../../theme';
import type { PlannerItem, PlannerKind } from '../../types';

export type PlannerKindMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soft: string;
};

export function plannerKindMeta(Colors: ThemeColors, viewAll: boolean): Record<PlannerKind, PlannerKindMeta> {
  return {
    lead: {
      label: viewAll ? 'Leads' : 'Leads của tôi',
      icon: 'people',
      color: Colors.blue,
      soft: Colors.blueSoft,
    },
    deal: {
      label: viewAll ? 'Deals' : 'Deals của tôi',
      icon: 'pricetags',
      color: Colors.orange,
      soft: Colors.orangeSoft,
    },
  };
}

type Props = {
  item: PlannerItem;
  showOwner?: boolean;
  onPress?: (item: PlannerItem) => void;
};

export default function PlannerCompactCard({ item, showOwner, onPress }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const meta = plannerKindMeta(Colors, !!showOwner)[item.kind];

  const body = (
    <>
      <View style={styles.cardTop}>
        <Text style={styles.cardCode}>{item.code}</Text>
        {item.overdue ? (
          <View style={styles.overduePill}>
            <Text style={styles.overdueTxt}>Quá hạn</Text>
          </View>
        ) : null}
        <Text style={[styles.cardDue, item.overdue && { color: Colors.red }]} numberOfLines={1}>
          {item.deadlineLabel}
        </Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      <View style={styles.cardBottom}>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.contactName}
          {item.phone ? ` · ${item.phone}` : ''}
        </Text>
        <View style={[styles.statusChip, { backgroundColor: meta.soft }]}>
          <Text style={[styles.statusTxt, { color: meta.color }]} numberOfLines={1}>
            {item.status}
          </Text>
        </View>
      </View>
      {showOwner ? (
        <View style={styles.ownerRow}>
          <Ionicons name="person-outline" size={12} color={Colors.textFaint} />
          <Text style={styles.ownerTxt} numberOfLines={1}>
            {item.ownerName || 'Chưa gán'}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={[styles.card, { borderLeftColor: meta.color }]}
        onPress={() => onPress(item)}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { borderLeftColor: meta.color }]}>
      {body}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCode: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
  overduePill: {
    backgroundColor: Colors.redSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  overdueTxt: { color: Colors.red, fontSize: 9, fontWeight: '800' },
  cardDue: { flex: 1, textAlign: 'right', color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardMeta: { flex: 1, color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  statusChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radii.pill, maxWidth: '42%' },
  statusTxt: { fontSize: 10, fontWeight: '800' },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ownerTxt: { flex: 1, color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
});
