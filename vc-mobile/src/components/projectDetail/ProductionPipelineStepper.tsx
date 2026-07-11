import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Radii, Spacing, stageColor } from '../../theme';
import type { KanbanStage } from '../../types';

type Props = {
  stages: KanbanStage[];
  currentStageId?: string | null;
};

export default function ProductionPipelineStepper({ stages, currentStageId }: Props) {
  const { colors } = useTheme();
  const sorted = useMemo(
    () => [...stages].sort((a, b) => a.order_index - b.order_index),
    [stages],
  );
  const currentIdx = sorted.findIndex((s) => String(s.id) === String(currentStageId));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { marginHorizontal: -Spacing.lg },
        row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing.lg, gap: 4 },
        step: { alignItems: 'center', width: 72 },
        dotWrap: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          marginBottom: 6,
        },
        dotDone: { backgroundColor: colors.success + '33', borderColor: colors.success },
        dotActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
        dotPending: { backgroundColor: colors.cardAlt, borderColor: colors.border },
        line: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 17, minWidth: 8 },
        lineDone: { backgroundColor: colors.success + '88' },
        label: { fontSize: 9, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
        labelDone: { color: colors.success },
        labelActive: { color: colors.primary },
        labelPending: { color: colors.textFaint },
      }),
    [colors],
  );

  if (!sorted.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={styles.row}>
        {sorted.map((stage, i) => {
          const done = currentIdx >= 0 && i < currentIdx;
          const active = currentIdx >= 0 ? i === currentIdx : i === 0;
          const accent = stageColor(stage.color, i);
          return (
            <React.Fragment key={stage.id}>
              {i > 0 ? <View style={[styles.line, done && styles.lineDone]} /> : null}
              <View style={styles.step}>
                <View
                  style={[
                    styles.dotWrap,
                    done && styles.dotDone,
                    active && !done && styles.dotActive,
                    !done && !active && styles.dotPending,
                    active && { borderColor: accent },
                  ]}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={16} color={colors.success} />
                  ) : stage.icon ? (
                    <Text style={{ fontSize: 14 }}>{stage.icon}</Text>
                  ) : (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: active ? accent : colors.textFaint,
                      }}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.label,
                    done && styles.labelDone,
                    active && styles.labelActive,
                    !done && !active && styles.labelPending,
                  ]}
                  numberOfLines={2}
                >
                  {stage.name}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </ScrollView>
  );
}
