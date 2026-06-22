import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LeadTypeReportRow } from '../../api/employeeReport';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  rows: LeadTypeReportRow[];
};

function appliesLabel(v?: string | null): string {
  if (v === 'lead') return 'Lead';
  if (v === 'deal') return 'Deal';
  if (v === 'both') return 'Lead & Deal';
  return '—';
}

export default function ReportLeadTypeList({ rows }: Props) {
  const Colors = useColors();
  const styles = makeStyles(Colors);
  const filtered = (rows || []).filter((r) => (r.lead_count || 0) + (r.deal_count || 0) > 0);
  if (!filtered.length) return null;

  return (
    <View style={styles.wrap}>
      {filtered.map((r) => (
        <View key={String(r.lead_type_id || r.lead_type_name)} style={styles.row}>
          <View style={styles.left}>
            {r.lead_type_color ? (
              <View style={[styles.dot, { backgroundColor: r.lead_type_color }]} />
            ) : null}
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={1}>{r.lead_type_name || '—'}</Text>
              <Text style={styles.sub}>{appliesLabel(r.applies_to)}</Text>
            </View>
          </View>
          <Text style={styles.counts}>
            L {r.lead_count ?? 0} · D {r.deal_count ?? 0}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1, minWidth: 0 },
  name: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  sub: { color: Colors.textFaint, fontSize: 10, marginTop: 1 },
  counts: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
});
