import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import TapHighlight from '../TapHighlight';
import { useTheme } from '../../context/ThemeContext';
import { getMessengerColors } from '../../lib/messengerTheme';
import { Radii, Spacing } from '../../theme';

export const CHAT_EMOJIS = [
  '😀', '😂', '🥰', '😍', '😊', '😎', '🤔', '😢', '😡', '👍',
  '👏', '🙏', '❤️', '🔥', '✅', '⭐', '🎉', '💯', '🤝', '👋',
];

export const CHAT_STICKERS = [
  '🐶', '🐱', '🐻', '🦊', '🐼', '🐸', '🐵', '🦁', '🐯', '🐷',
  '🍕', '🍔', '🍟', '🍩', '🎂', '☕', '🍺', '⚽', '🏀', '🎮',
];

type Props = {
  open: boolean;
  paddingBottom: number;
  onPickEmoji: (emoji: string) => void;
  onPickSticker: (emoji: string) => void;
  onClose: () => void;
};

export default function EmojiStickerPanel({
  open,
  paddingBottom,
  onPickEmoji,
  onPickSticker,
  onClose,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const [tab, setTab] = React.useState<'emoji' | 'sticker'>('emoji');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          paddingBottom,
        },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingTop: 8,
          paddingBottom: 6,
        },
        tabs: { flexDirection: 'row', gap: 8 },
        tab: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: Radii.full,
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
        },
        tabOn: { backgroundColor: mc.accentSoft },
        tabTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
        tabTxtOn: { color: mc.accent },
        grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 8 },
        cell: {
          width: '12.5%',
          aspectRatio: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        emoji: { fontSize: tab === 'sticker' ? 28 : 24 },
      }),
    [colors, isDark, mc, tab, paddingBottom],
  );

  if (!open) return null;
  const items = tab === 'emoji' ? CHAT_EMOJIS : CHAT_STICKERS;

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.tabs}>
          <TapHighlight
            style={[styles.tab, tab === 'emoji' && styles.tabOn]}
            onPress={() => setTab('emoji')}
          >
            <Text style={[styles.tabTxt, tab === 'emoji' && styles.tabTxtOn]}>Emoji</Text>
          </TapHighlight>
          <TapHighlight
            style={[styles.tab, tab === 'sticker' && styles.tabOn]}
            onPress={() => setTab('sticker')}
          >
            <Text style={[styles.tabTxt, tab === 'sticker' && styles.tabTxtOn]}>Sticker</Text>
          </TapHighlight>
        </View>
        <TapHighlight onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </TapHighlight>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.grid}>
          {items.map((e) => (
            <TapHighlight
              key={e}
              style={styles.cell}
              onPress={() => (tab === 'emoji' ? onPickEmoji(e) : onPickSticker(e))}
            >
              <Text style={styles.emoji}>{e}</Text>
            </TapHighlight>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
