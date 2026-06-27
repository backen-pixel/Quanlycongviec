import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ActivityFeedItem } from '../../lib/reportActivityFeed';
import { formatRelativeTimeVi } from '../../lib/reportFormat';
import { Radii, useColors, type ThemeColors } from '../../theme';

const ICONS: Record<ActivityFeedItem['kind'], keyof typeof Ionicons.glyphMap> = {
  won: 'checkmark-circle',
  urgent: 'time',
  lead: 'person-add',
  lost: 'close-circle',
  calls: 'call',
  stage: 'swap-horizontal',
  comment: 'chatbubble-ellipses',
  created: 'briefcase',
  activity: 'flash',
};

const TONES: Record<ActivityFeedItem['badgeTone'], { bg: string; text: string; icon: string }> = {
  green: { bg: 'rgba(34,197,94,0.16)', text: '#34D399', icon: '#34D399' },
  yellow: { bg: 'rgba(234,179,8,0.16)', text: '#EAB308', icon: '#EAB308' },
  purple: { bg: 'rgba(168,85,247,0.16)', text: '#A78BFA', icon: '#A78BFA' },
  red: { bg: 'rgba(239,68,68,0.16)', text: '#F87171', icon: '#F87171' },
  teal: { bg: 'rgba(20,184,166,0.16)', text: '#2DD4BF', icon: '#2DD4BF' },
  muted: { bg: 'rgba(148,163,184,0.12)', text: '#94A3B8', icon: '#94A3B8' },
};

type Props = {
  items: ActivityFeedItem[];
  loading?: boolean;
};

export default function ReportRecentActivityFeed({ items, loading }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  if (loading && !items.length) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.purple} />
        <Text style={styles.loadingText}>Đang tải hoạt động…</Text>
      </View>
    );
  }

  if (!items.length) {
    return <Text style={styles.empty}>Chưa có hoạt động trong kỳ</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const tone = TONES[item.badgeTone];
        const rel = item.occurredAt ? formatRelativeTimeVi(item.occurredAt) : '';
        return (
          <View key={item.id} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
              <Ionicons name={ICONS[item.kind]} size={18} color={tone.icon} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {rel ? `${rel} · ${item.subtitle}` : item.subtitle}
              </Text>
            </View>
            <View style={styles.right}>
              {item.value ? <Text style={styles.value}>{item.value}</Text> : null}
              <Text style={[styles.badge, { color: tone.text }]}>{item.badge}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  list: { gap: 2 },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    color: Colors.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  sub: {
    color: Colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  right: { alignItems: 'flex-end', minWidth: 56 },
  value: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  empty: {
    color: Colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
