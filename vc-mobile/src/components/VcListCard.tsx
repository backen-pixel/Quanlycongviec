import SpinningLoader from './SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TapHighlight from './TapHighlight';
import PersonRoleChip from './PersonRoleChip';
import { useTheme } from '../context/ThemeContext';
import { Radii, stageColor, type AppColors } from '../theme';
import type { ProductionProject } from '../types';

type Props = {
  item: ProductionProject;
  stageName?: string | null;
  stageColorHex?: string | null;
  stageIndex?: number;
  ageLabel?: string;
  title: string;
  vcName?: string | null;
  ldName?: string | null;
  moving?: boolean;
  onPress: () => void;
  onMove: () => void;
  onComment?: () => void;
  hasUnreadComments?: boolean;
  commentCount?: number;
};

function formatDeadline(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function VcListCard({
  item,
  stageName,
  stageColorHex,
  stageIndex = 0,
  ageLabel,
  title,
  vcName,
  ldName,
  moving,
  onPress,
  onMove,
  onComment,
  hasUnreadComments,
  commentCount = 0,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = stageColor(stageColorHex, stageIndex);
  const deadlineStr = formatDeadline(item.deadline);
  const overdue = !!(
    item.deadline
    && new Date(item.deadline) < new Date()
    && item.status !== 'completed'
  );
  const customerLine = [item.customer_name, item.customer_phone].filter(Boolean).join(' · ');
  const hasPeople = !!(vcName || ldName);

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <TapHighlight onPress={onPress} pressStyle={{ opacity: 0.9 }}>
        <View style={styles.topRow}>
          <Text style={styles.code}>{item.code || '—'}</Text>
          {stageName ? (
            <View style={[styles.stagePill, { backgroundColor: `${accent}22` }]}>
              <Text style={[styles.stageTxt, { color: accent }]} numberOfLines={1}>
                {stageName}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.title} numberOfLines={2}>{title || item.name || '—'}</Text>

        {customerLine ? (
          <Text style={styles.customer} numberOfLines={1}>{customerLine}</Text>
        ) : null}

        {hasPeople ? (
          <View style={styles.peopleWrap}>
            <PersonRoleChip label="VC" name={vcName} isDark={isDark} />
            <PersonRoleChip label="LĐ" name={ldName} isDark={isDark} />
          </View>
        ) : (
          <Text style={styles.peopleMuted}>Phụ trách: —</Text>
        )}

        <View style={styles.metaRow}>
          {deadlineStr ? (
            <View style={styles.metaItem}>
              <Ionicons
                name="calendar-outline"
                size={12}
                color={overdue ? colors.danger : colors.textFaint}
              />
              <Text style={[styles.metaTxt, overdue && styles.metaOverdue]}>{deadlineStr}</Text>
            </View>
          ) : null}
          {ageLabel ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={colors.textFaint} />
              <Text style={styles.metaTxt}>{ageLabel}</Text>
            </View>
          ) : null}
        </View>
      </TapHighlight>

      <View style={styles.actions}>
        {onComment ? (
          <TapHighlight style={styles.actionBtn} onPress={onComment} accessibilityLabel="Bình luận">
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
            {hasUnreadComments || commentCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>
                  {commentCount > 0 ? (commentCount > 99 ? '99+' : String(commentCount)) : '!'}
                </Text>
              </View>
            ) : null}
          </TapHighlight>
        ) : null}
        <TapHighlight
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={onMove}
          disabled={moving}
          accessibilityLabel="Chuyển cột"
        >
          {moving ? (
            <SpinningLoader size="small" color={colors.white} />
          ) : (
            <Ionicons name="swap-horizontal" size={18} color={colors.white} />
          )}
        </TapHighlight>
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 4,
      padding: 12,
      marginBottom: 10,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    code: { color: '#EA580C', fontSize: 12, fontWeight: '700', flexShrink: 0 },
    stagePill: {
      borderRadius: Radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
      maxWidth: '62%',
    },
    stageTxt: { fontSize: 11, fontWeight: '700' },
    title: { color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    customer: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 },
    peopleWrap: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    peopleMuted: { color: c.textFaint, fontSize: 11, marginBottom: 6 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaTxt: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
    metaOverdue: { color: c.danger },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    actionBtn: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionPrimary: {
      backgroundColor: c.primary,
      borderColor: c.primaryDark,
    },
    badge: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: c.danger,
      borderWidth: 1.5,
      borderColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    badgeTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', lineHeight: 12 },
  });
}
