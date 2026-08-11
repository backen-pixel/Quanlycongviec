import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  countsAsCompletedRevenue,
  projectIsAwaitingDelivery,
  projectIsShipped,
} from '../lib/sxBoardKpis';
import { Radii, Spacing, stageColor, type AppColors } from '../theme';
import type { KanbanStage, ProductionProject } from '../types';

type Props = {
  item: ProductionProject;
  stage?: KanbanStage | null;
  stages: KanbanStage[];
  moving?: boolean;
  onPress: () => void;
  onMove: () => void;
  onClassify?: () => void;
};

function formatShortDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '';
  }
}

function vcLabel(p: ProductionProject, stages: KanbanStage[]): string | null {
  if (projectIsAwaitingDelivery(p, stages)) return 'Chờ VC';
  const status = String(p.status || '');
  if (['shipping', 'installing', 'warranty'].includes(status)) return 'Đang VC';
  return null;
}

function SxListCard({
  item,
  stage,
  stages,
  moving,
  onPress,
  onMove,
  onClassify,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const accent = stageColor(stage?.color || null, 0);
  const stageName = stage?.name || item.stage_name || '—';
  const customerLine = [item.customer_name, item.customer_phone].filter(Boolean).join(' · ');
  const owner = item.production_person_name?.trim() || 'Chưa gán';
  const vc = vcLabel(item, stages);
  const delivered = projectIsShipped(item) || countsAsCompletedRevenue(item, stages);
  const overdue = Boolean(item.is_overdue) && !delivered;
  const needsClassify = !item.workshop_type_id && !!onClassify;
  const updatedStr = formatShortDate(item.updated_at || item.created_at);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
        accessibilityRole="button"
      >
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.code} numberOfLines={1}>{item.code}</Text>
            {item.workshop_type_name ? (
              <Text style={styles.typeTxt} numberOfLines={1}>{item.workshop_type_name}</Text>
            ) : null}
          </View>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          {customerLine ? (
            <Text style={styles.customer} numberOfLines={1}>{customerLine}</Text>
          ) : null}
          {item.company_name ? (
            <Text style={styles.company} numberOfLines={1}>{item.company_name}</Text>
          ) : null}
          <Text style={styles.owner} numberOfLines={1}>PT: {owner}</Text>
          <View style={styles.tagRow}>
            {vc ? (
              <View style={[styles.miniTag, { borderColor: colors.primary }]}>
                <Text style={[styles.miniTagTxt, { color: colors.primary }]}>{vc}</Text>
              </View>
            ) : null}
            {overdue ? (
              <View style={[styles.miniTag, { borderColor: colors.danger }]}>
                <Text style={[styles.miniTagTxt, { color: colors.danger }]}>Quá hạn</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.meta}>
          <View style={[styles.stagePill, { backgroundColor: `${accent}22` }]}>
            <Text style={[styles.stageTxt, { color: accent }]} numberOfLines={1}>
              {stageName}
            </Text>
          </View>
          {updatedStr ? (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color={colors.textFaint} />
              <Text style={styles.dateTxt}>{updatedStr}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.moveBtn, moving && styles.moveBtnBusy]}
          onPress={needsClassify ? onClassify : onMove}
          disabled={!!moving}
          accessibilityLabel={needsClassify ? 'Phân loại' : 'Chuyển cột'}
        >
          {moving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={needsClassify ? 'layers-outline' : 'swap-horizontal'}
                size={16}
                color="#fff"
              />
              <Text style={styles.moveBtnTxt}>
                {needsClassify ? 'Phân loại' : 'Chuyển cột'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default memo(SxListCard);

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: Spacing.lg,
      marginBottom: 10,
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    main: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      paddingBottom: 10,
    },
    mainPressed: { opacity: 0.92 },
    body: { flex: 1, minWidth: 0, gap: 2 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    code: { color: c.primary, fontSize: 12, fontWeight: '800' },
    typeTxt: { color: c.textMuted, fontSize: 11, fontWeight: '700', flexShrink: 1 },
    name: { color: c.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
    customer: { color: c.primary, fontSize: 13, fontWeight: '700', marginTop: 1 },
    company: { color: c.textMuted, fontSize: 12.5, fontWeight: '600' },
    owner: { color: c.textFaint, fontSize: 12, fontWeight: '600', marginTop: 2 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    miniTag: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    miniTagTxt: { fontSize: 10, fontWeight: '800' },
    meta: { alignItems: 'flex-end', gap: 6, maxWidth: 118 },
    stagePill: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      maxWidth: 110,
    },
    stageTxt: { fontSize: 11, fontWeight: '800' },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dateTxt: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
    actions: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    moveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 118,
      minHeight: 36,
      justifyContent: 'center',
    },
    moveBtnBusy: { opacity: 0.7 },
    moveBtnTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  });
