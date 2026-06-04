import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CrmColors } from '../../theme/crmTheme';

function formatFileSize(bytes?: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fileBadge(name?: string, mime = ''): { bg: string; letter: string } {
  const ext = (name || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
  const ml = mime.toLowerCase();
  if (['doc', 'docx'].includes(ext) || ml.includes('word')) return { bg: '#2B579A', letter: 'W' };
  if (['xls', 'xlsx', 'csv'].includes(ext) || ml.includes('sheet')) return { bg: '#217346', letter: 'X' };
  if (ext === 'pdf' || ml.includes('pdf')) return { bg: '#E74C3C', letter: 'P' };
  if (['ppt', 'pptx'].includes(ext)) return { bg: '#D24726', letter: 'P' };
  if (['zip', 'rar', '7z'].includes(ext)) return { bg: '#F59E0B', letter: 'Z' };
  return { bg: '#64748B', letter: 'F' };
}

type Props = {
  name?: string;
  mime?: string;
  size?: number;
  url?: string | null;
  mine?: boolean;
  onOpen?: () => void;
  onLongPress?: () => void;
};

export function MessengerFileCard({ name, mime, size, url, mine, onOpen, onLongPress }: Props) {
  const badge = fileBadge(name, mime || '');
  const sizeLabel = formatFileSize(size);
  const displayName = (name || '').trim() || 'Tệp đính kèm';
  const open = () => {
    if (onOpen) onOpen();
    else if (url) void Linking.openURL(url);
  };

  return (
    <Pressable
      style={[s.card, mine ? s.cardMine : s.cardOther]}
      onPress={open}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={[s.badge, { backgroundColor: badge.bg }]}>
        <Text style={s.badgeLetter}>{badge.letter}</Text>
      </View>
      <View style={s.meta}>
        <Text style={s.name} numberOfLines={2}>
          {displayName}
        </Text>
        {sizeLabel ? <Text style={s.size}>{sizeLabel}</Text> : null}
      </View>
      <Ionicons name="download-outline" size={20} color={mine ? '#6C5CE7' : CrmColors.blue600} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#FFFFFF',
    minWidth: 220,
    maxWidth: 280,
    marginTop: 4,
  },
  cardMine: {
    borderColor: '#C4B5FD',
    backgroundColor: '#FFFFFF',
  },
  cardOther: {},
  badge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeLetter: { color: '#fff', fontSize: 18, fontWeight: '800' },
  meta: { flex: 1, minWidth: 80 },
  name: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  size: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
});
