import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from './SpinningLoader';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Avatar from './Avatar';
import { formatListCardDate } from '../lib/crmListDateSections';
import { colorFromName, initialsFromName } from '../lib/media';
import { Radii, stageColor, useColors, type ThemeColors } from '../theme';
import type { CrmKanbanItem } from '../types';

type Props = {
  item: CrmKanbanItem;
  moving?: boolean;
  highlighted?: boolean;
  onPress: () => void;
  onMore: () => void;
  onMove: () => void;
};

export default function CrmListCard({ item, moving, highlighted, onPress, onMore, onMove }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const accent = stageColor(item.stageColor, 0);
  const dateStr = formatListCardDate(item.createdAt);
  const leadTitle = item.title?.trim() || (item.kind === 'lead' ? 'Lead chưa đặt tên' : 'Deal chưa đặt tên');
  const customerName =
    item.contactName && item.contactName !== '—' ? item.contactName.trim() : '';
  const phone = item.phone?.trim() || '';
  const customerLine =
    customerName && phone
      ? `${customerName} - ${phone}`
      : customerName || phone || '';
  const hasValue = !!(item.valueLabel && item.valueLabel !== 'Chưa định giá');

  return (
    <View
      style={[
        styles.card,
        highlighted && {
          borderColor: Colors.red,
          borderWidth: 2,
          backgroundColor: `${Colors.red}12`,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
        accessibilityRole="button"
      >
        <Avatar
          name={leadTitle}
          initials={initialsFromName(leadTitle)}
          size={44}
          color={colorFromName(leadTitle)}
        />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>{leadTitle}</Text>
          {item.companyName ? (
            <Text style={styles.company} numberOfLines={1}>{item.companyName}</Text>
          ) : null}
          {customerLine ? (
            <Text style={styles.customer} numberOfLines={1}>{customerLine}</Text>
          ) : null}
          {hasValue ? (
            <Text style={styles.value} numberOfLines={1}>{item.valueLabel}</Text>
          ) : null}
          {item.vcPipelineStage?.name || item.sxPipelineStage?.name ? (
            <View
              style={[
                styles.sxChip,
                {
                  borderColor: (item.vcPipelineStage || item.sxPipelineStage)?.color || Colors.blue,
                  backgroundColor: `${(item.vcPipelineStage || item.sxPipelineStage)?.color || Colors.blue}18`,
                },
              ]}
            >
              <Text
                style={[
                  styles.sxChipTxt,
                  { color: (item.vcPipelineStage || item.sxPipelineStage)?.color || Colors.blue },
                ]}
                numberOfLines={1}
              >
                {item.vcPipelineStage ? 'VC' : 'SX'} · {(item.vcPipelineStage || item.sxPipelineStage)?.name}
              </Text>
            </View>
          ) : null}
          <Text style={styles.owner} numberOfLines={1}>{item.ownerName || 'Chưa gán'}</Text>
        </View>
        <View style={styles.meta}>
          <View style={[styles.stagePill, { backgroundColor: `${accent}22` }]}>
            <Text style={[styles.stageTxt, { color: accent }]} numberOfLines={1}>
              {item.stageName || '—'}
            </Text>
          </View>
          {dateStr ? (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color={Colors.textFaint} />
              <Text style={styles.dateTxt}>{dateStr}</Text>
            </View>
          ) : null}
          {item.isInteracted ? (
            <View style={styles.interactedRow}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.blue} />
              <Text style={styles.interactedTxt}>Đã TT</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={styles.moreBtn}
          onPress={onMore}
          hitSlop={8}
          accessibilityLabel="Tùy chọn thẻ"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
        </Pressable>
        <Pressable
          style={[styles.moveBtn, moving && styles.moveBtnBusy]}
          onPress={onMove}
          disabled={!!moving}
          accessibilityLabel="Chuyển cột"
        >
          {moving ? (
            <SpinningLoader size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
              <Text style={styles.moveBtnTxt}>Chuyển cột</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
  name: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  company: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  customer: { color: Colors.blue, fontSize: 13, fontWeight: '700', marginTop: 1 },
  value: { color: Colors.orange, fontSize: 13, fontWeight: '800', marginTop: 2 },
  sxChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  sxChipTxt: { fontSize: 11, fontWeight: '800' },
  owner: { color: Colors.textFaint, fontSize: 12, fontWeight: '600', marginTop: 2 },
  meta: { alignItems: 'flex-end', gap: 6, maxWidth: 112 },
  stagePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 110,
  },
  stageTxt: { fontSize: 11, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateTxt: { color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
  interactedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  interactedTxt: { color: Colors.blue, fontSize: 10, fontWeight: '800' },
  actions: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  moveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.blue,
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
