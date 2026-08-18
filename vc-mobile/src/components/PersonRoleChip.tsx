import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type PersonRoleKey = 'CRM' | 'SX' | 'VC' | 'LĐ';

type Tone = {
  accent: string;
  bgDark: string;
  bgLight: string;
  borderDark: string;
  borderLight: string;
};

const TONES: Record<PersonRoleKey, Tone> = {
  CRM: {
    accent: '#7C3AED',
    bgDark: 'rgba(124, 58, 237, 0.28)',
    bgLight: '#EDE9FE',
    borderDark: 'rgba(167, 139, 250, 0.65)',
    borderLight: '#C4B5FD',
  },
  SX: {
    accent: '#0F766E',
    bgDark: 'rgba(20, 184, 166, 0.26)',
    bgLight: '#CCFBF1',
    borderDark: 'rgba(45, 212, 191, 0.6)',
    borderLight: '#5EEAD4',
  },
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

type Props = {
  label: PersonRoleKey;
  name?: string | null;
  isDark: boolean;
};

export default function PersonRoleChip({ label, name, isDark }: Props) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const tone = TONES[label];
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
        {trimmed}
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
    gap: 6,
    maxWidth: '100%',
    paddingLeft: 3,
    paddingRight: 3,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: 8, fontWeight: '800' },
  name: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 110,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
