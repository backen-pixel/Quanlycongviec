import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type PersonRoleKey = 'VC' | 'LĐ';

type Tone = {
  accent: string;
  bgDark: string;
  bgLight: string;
  borderDark: string;
  borderLight: string;
};

const TONES: Record<PersonRoleKey, Tone> = {
  VC: {
    accent: '#EA580C',
    bgDark: 'rgba(234, 88, 12, 0.28)',
    bgLight: '#FFEDD5',
    borderDark: 'rgba(251, 146, 60, 0.65)',
    borderLight: '#FDBA74',
  },
  LĐ: {
    accent: '#B45309',
    bgDark: 'rgba(245, 158, 11, 0.26)',
    bgLight: '#FEF3C7',
    borderDark: 'rgba(252, 211, 77, 0.6)',
    borderLight: '#FCD34D',
  },
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Tên gọn trên thẻ hẹp: giữ 2 từ cuối (họ + tên). */
export function shortPersonName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return parts.slice(-2).join(' ');
}

type Props = {
  label: PersonRoleKey;
  name?: string | null;
  isDark: boolean;
};

export default function PersonRoleChip({ label, name, isDark }: Props) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const tone = TONES[label];
  const display = shortPersonName(trimmed);
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isDark ? tone.bgDark : tone.bgLight,
          borderColor: isDark ? tone.borderDark : tone.borderLight,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: tone.accent }]}>
        <Text style={styles.avatarTxt}>{initials(trimmed)}</Text>
      </View>
      <Text
        style={[styles.name, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
        numberOfLines={1}
      >
        {display}
      </Text>
      <View style={[styles.badge, { backgroundColor: tone.accent }]}>
        <Text style={styles.badgeTxt}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    maxWidth: '48%',
    minWidth: 0,
    paddingLeft: 2,
    paddingRight: 3,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: 1,
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarTxt: { color: '#fff', fontSize: 7, fontWeight: '800' },
  name: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '700',
  },
  badge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    flexShrink: 0,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
