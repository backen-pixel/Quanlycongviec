import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FirstStageSla } from '../../../api/employeeReport';
import { buildFirstStageSlaPie } from '../../../lib/reportChartData';
import { Radii, useColors, type ThemeColors } from '../../../theme';
import ReportDonutChart from './ReportDonutChart';

type Props = {
  sla: FirstStageSla | null | undefined;
};

export default function ReportFirstStageSlaBlock({ sla }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const pie = useMemo(() => buildFirstStageSlaPie(sla), [sla]);
  const open = sla?.open_count ?? 0;
  const stageHint = sla?.stage_labels?.length
    ? sla.stage_labels.join(', ')
    : 'Cột order_index đầu tiên của pipeline';

  if (!open) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Chưa có lead/deal ở cột đầu pipeline</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.hint} numberOfLines={2}>{stageHint}</Text>
      <View style={styles.chips}>
        <View style={[styles.chip, styles.chipOk]}>
          <Text style={styles.chipOkText}>Đúng hạn {sla?.on_time_rate_pct ?? 0}%</Text>
        </View>
        <View style={[styles.chip, styles.chipBad]}>
          <Text style={styles.chipBadText}>Quá hạn {sla?.overdue_rate_pct ?? 0}%</Text>
        </View>
        <View style={[styles.chip, styles.chipNeutral]}>
          <Text style={styles.chipNeutralText}>{open} đang ở cột 1</Text>
        </View>
      </View>
      {pie.length > 0 ? <ReportDonutChart segments={pie} size={170} /> : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  hint: { color: Colors.textMuted, fontSize: 11, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { borderRadius: Radii.md, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  chipOk: { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' },
  chipBad: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  chipNeutral: { backgroundColor: Colors.surfaceSoft, borderColor: Colors.border },
  chipOkText: { color: '#065f46', fontSize: 11, fontWeight: '700' },
  chipBadText: { color: '#9f1239', fontSize: 11, fontWeight: '700' },
  chipNeutralText: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  empty: { paddingVertical: 24 },
  emptyText: { color: Colors.textFaint, fontSize: 13, textAlign: 'center' },
});
