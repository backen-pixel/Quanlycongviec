import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MessengerAvatar from '../components/messenger/MessengerAvatar';
import TapHighlight from '../components/TapHighlight';
import { useTheme } from '../context/ThemeContext';
import {
  extractLinksFromMessages,
  formatChatDateLabel,
  isImageMessage,
  isVideoMessage,
  resolvePrimaryAttachment,
} from '../lib/messengerMedia';
import { resolveMediaUrl } from '../lib/messengerApi';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Radii, Spacing } from '../theme';
import type { MessengerMessage } from '../types/messenger';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetailInfo'>;
type Tab = 'media' | 'files' | 'links';

export default function ChatDetailInfoScreen({ navigation, route }: Props) {
  const { title, avatarColor, avatarUrl, messagesJson, isDirect } = route.params;
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('media');

  const messages = useMemo(() => {
    try {
      const parsed = JSON.parse(messagesJson) as MessengerMessage[];
      return Array.isArray(parsed) ? parsed.filter((m) => !m.is_system) : [];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const mediaItems = useMemo(
    () => messages.filter((m) => isImageMessage(m) || isVideoMessage(m)),
    [messages],
  );
  const fileItems = useMemo(
    () =>
      messages.filter((m) => {
        if (m.is_recalled || m.recalled_at) return false;
        if (isImageMessage(m) || isVideoMessage(m)) return false;
        const att = resolvePrimaryAttachment(m);
        return !!att.url;
      }),
    [messages],
  );
  const linkItems = useMemo(() => extractLinksFromMessages(messages), [messages]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 6,
          paddingBottom: 12,
          paddingHorizontal: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
          gap: 10,
        },
        backBtn: {
          width: 38,
          height: 38,
          borderRadius: Radii.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
        profile: {
          alignItems: 'center',
          paddingVertical: 20,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        profileName: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
        profileSub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
        tabs: {
          flexDirection: 'row',
          margin: Spacing.md,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          padding: 4,
          borderWidth: 1,
          borderColor: colors.border,
        },
        tab: { flex: 1, paddingVertical: 8, borderRadius: Radii.md, alignItems: 'center' },
        tabOn: { backgroundColor: mc.accentSoft },
        tabTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
        tabTxtOn: { color: mc.accent },
        mediaGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: Spacing.sm,
          gap: 4,
        },
        mediaCell: {
          width: '32%',
          aspectRatio: 1,
          borderRadius: Radii.md,
          overflow: 'hidden',
          backgroundColor: isDark ? '#1A1F28' : '#E2E8F0',
        },
        mediaImg: { width: '100%', height: '100%' },
        videoBadge: {
          position: 'absolute',
          right: 6,
          bottom: 6,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: 12,
          padding: 4,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        rowBody: { flex: 1, minWidth: 0 },
        rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
        rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        empty: { textAlign: 'center', color: colors.textFaint, marginTop: 40, paddingHorizontal: 24 },
        linkUrl: { color: mc.accent, fontSize: 13 },
      }),
    [colors, isDark, mc, insets.top],
  );

  const renderMedia = () => {
    if (!mediaItems.length) {
      return <Text style={styles.empty}>Chưa có ảnh hoặc video.</Text>;
    }
    return (
      <ScrollView contentContainerStyle={styles.mediaGrid}>
        {mediaItems.map((m) => {
          const att = resolvePrimaryAttachment(m);
          const url = resolveMediaUrl(att.url);
          const video = isVideoMessage(m);
          return (
            <TapHighlight
              key={m.id}
              style={styles.mediaCell}
              onPress={() => url && void Linking.openURL(url)}
            >
              {url && !video ? (
                <Image source={{ uri: url }} style={styles.mediaImg} resizeMode="cover" />
              ) : (
                <View style={[styles.mediaImg, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="videocam" size={28} color={colors.textMuted} />
                </View>
              )}
              {video ? (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={12} color="#FFF" />
                </View>
              ) : null}
            </TapHighlight>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Chi tiết hội thoại</Text>
      </View>

      <View style={styles.profile}>
        <MessengerAvatar
          name={title}
          size={72}
          color={avatarColor || avatarColorFromName(title)}
          avatarUrl={avatarUrl}
        />
        <Text style={styles.profileName}>{title}</Text>
        <Text style={styles.profileSub}>{isDirect ? 'Chat trực tiếp' : 'Nhóm chat'}</Text>
      </View>

      <View style={styles.tabs}>
        {(['media', 'files', 'links'] as Tab[]).map((t) => (
          <TapHighlight
            key={t}
            style={[styles.tab, tab === t && styles.tabOn]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>
              {t === 'media' ? `Ảnh/Video (${mediaItems.length})` : t === 'files' ? `Tệp (${fileItems.length})` : `Link (${linkItems.length})`}
            </Text>
          </TapHighlight>
        ))}
      </View>

      {tab === 'media' ? renderMedia() : null}

      {tab === 'files' ? (
        <FlatList
          data={fileItems}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const att = resolvePrimaryAttachment(item);
            const url = resolveMediaUrl(att.url);
            return (
              <TapHighlight style={styles.row} onPress={() => url && void Linking.openURL(url)}>
                <Ionicons name="document-outline" size={24} color={mc.accent} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{att.name || 'Tệp đính kèm'}</Text>
                  <Text style={styles.rowSub}>
                    {formatChatDateLabel(item.created_at)}
                    {att.type ? ` · ${att.type}` : ''}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.textFaint} />
              </TapHighlight>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Chưa có tệp đính kèm.</Text>}
        />
      ) : null}

      {tab === 'links' ? (
        <FlatList
          data={linkItems}
          keyExtractor={(it, i) => `${it.url}-${i}`}
          renderItem={({ item }) => (
            <TapHighlight style={styles.row} onPress={() => void Linking.openURL(item.url)}>
              <Ionicons name="link" size={22} color={mc.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.linkUrl} numberOfLines={2}>{item.url}</Text>
                <Text style={styles.rowSub}>{formatChatDateLabel(item.message.created_at)}</Text>
              </View>
            </TapHighlight>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Chưa có link trong hội thoại.</Text>}
        />
      ) : null}
    </View>
  );
}
