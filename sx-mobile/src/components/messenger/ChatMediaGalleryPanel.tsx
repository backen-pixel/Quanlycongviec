import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../Avatar';
import TapHighlight from '../TapHighlight';
import { useTheme } from '../../context/ThemeContext';
import { formatMessageTime, resolveMediaUrl, type MessengerGroupMember } from '../../lib/messengerApi';
import {
  extractLinksFromMessages,
  formatChatDateLabel,
  isAudioMessage,
  isDocumentMessage,
  isImageMessage,
  isVideoMessage,
  resolvePrimaryAttachment,
  type MessengerLinkItem,
} from '../../lib/messengerMedia';
import {
  openExternalLink,
  openMessengerAttachment,
  promptMessengerFileActions,
} from '../../lib/messengerFileOpen';
import { senderDisplayName } from '../../lib/messengerReadReceipts';
import { avatarColorFromName, getMessengerColors } from '../../lib/messengerTheme';
import { Radii, Spacing } from '../../theme';
import type { MessengerMessage } from '../../types/messenger';

export type GalleryTab = 'photos' | 'files' | 'links' | 'voice';

type TimeFilterPreset = 'all' | 'yesterday' | 'lastWeek' | 'lastMonth' | 'custom';

type SenderOption = { id: string; name: string; avatar?: string | null };

type Props = {
  messages: MessengerMessage[];
  members?: MessengerGroupMember[];
  initialTab?: GalleryTab;
  onBack: () => void;
  onOpenLightbox: (url: string) => void;
};

const TABS: { key: GalleryTab; label: string }[] = [
  { key: 'photos', label: 'Ảnh' },
  { key: 'files', label: 'File' },
  { key: 'links', label: 'Link' },
  { key: 'voice', label: 'Thoại' },
];

const TIME_OPTIONS: { key: TimeFilterPreset; label: string }[] = [
  { key: 'yesterday', label: 'Hôm qua' },
  { key: 'lastWeek', label: 'Tuần trước' },
  { key: 'lastMonth', label: 'Tháng trước' },
  { key: 'custom', label: 'Tùy chọn' },
];

function groupByKey<T>(items: T[], keyFn: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries());
}

function messageUserId(m: MessengerMessage): string {
  return String(m.user_id || m.user?.id || '');
}

function deriveSenders(messages: MessengerMessage[], members: MessengerGroupMember[]): SenderOption[] {
  if (members.length) {
    return members.map((m) => ({ id: String(m.id), name: m.name, avatar: m.avatar }));
  }
  const map = new Map<string, SenderOption>();
  for (const m of messages) {
    const id = messageUserId(m);
    if (!id || map.has(id)) continue;
    map.set(id, { id, name: senderDisplayName(m), avatar: m.user?.avatar });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function getTimeRange(preset: TimeFilterPreset, custom?: { start: Date; end: Date } | null): { start: Date; end: Date } | null {
  if (preset === 'all') return null;
  if (preset === 'custom') return custom ?? null;

  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (preset === 'yesterday') {
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const endY = new Date(start);
    endY.setHours(23, 59, 59, 999);
    return { start, end: endY };
  }
  if (preset === 'lastWeek') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  const start = new Date(now);
  start.setMonth(now.getMonth() - 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function inTimeRange(iso: string, range: { start: Date; end: Date } | null): boolean {
  if (!range) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function parseViDate(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sectionLabel(label: string): string {
  if (label === 'Hôm nay' || label === 'Hôm qua') return label.toUpperCase();
  return label;
}

function applyFilters<T>(
  items: T[],
  opts: {
    senderId: string | null;
    range: { start: Date; end: Date } | null;
    getUserId?: (item: T) => string;
    getCreatedAt?: (item: T) => string;
  },
): T[] {
  return items.filter((item) => {
    if (opts.senderId) {
      const uid = opts.getUserId
        ? opts.getUserId(item)
        : messageUserId(item as MessengerMessage);
      if (uid !== opts.senderId) return false;
    }
    const created = opts.getCreatedAt
      ? opts.getCreatedAt(item)
      : (item as { created_at?: string }).created_at;
    if (created && !inTimeRange(created, opts.range)) return false;
    return true;
  });
}

export default function ChatMediaGalleryPanel({
  messages,
  members = [],
  initialTab = 'photos',
  onBack,
  onOpenLightbox,
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();
  const screenW = Dimensions.get('window').width;
  const contentW = screenW - Spacing.lg * 2;

  const [tab, setTab] = useState<GalleryTab>(initialTab);
  const [videoOnly, setVideoOnly] = useState(false);
  const [senderId, setSenderId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilterPreset>('all');
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [senderSheetOpen, setSenderSheetOpen] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const [senderQuery, setSenderQuery] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const senders = useMemo(() => deriveSenders(messages, members), [messages, members]);
  const timeRange = useMemo(() => getTimeRange(timeFilter, customRange), [timeFilter, customRange]);
  const selectedSender = senders.find((s) => s.id === senderId);

  const filterOpts = useMemo(
    () => ({ senderId, range: timeRange }),
    [senderId, timeRange],
  );

  const photoItems = useMemo(() => {
    let items = messages.filter((m) => isImageMessage(m) || isVideoMessage(m));
    if (videoOnly) items = items.filter((m) => isVideoMessage(m));
    items = applyFilters(items, filterOpts);
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [messages, videoOnly, filterOpts]);

  const fileItems = useMemo(
    () =>
      applyFilters(
        messages.filter((m) => isDocumentMessage(m)),
        filterOpts,
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [messages, filterOpts],
  );

  const linkItems = useMemo(() => {
    const raw = extractLinksFromMessages(messages);
    return applyFilters(raw, {
      ...filterOpts,
      getUserId: (it) => messageUserId(it.message),
      getCreatedAt: (it) => it.message.created_at,
    }).sort((a, b) => new Date(b.message.created_at).getTime() - new Date(a.message.created_at).getTime());
  }, [messages, filterOpts]);

  const voiceItems = useMemo(
    () =>
      applyFilters(
        messages.filter((m) => isAudioMessage(m)),
        filterOpts,
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [messages, filterOpts],
  );

  const filteredSenders = useMemo(() => {
    const q = senderQuery.trim().toLowerCase();
    if (!q) return senders;
    return senders.filter((s) => s.name.toLowerCase().includes(q));
  }, [senders, senderQuery]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: Spacing.md,
          backgroundColor: colors.bg,
          gap: 12,
        },
        headerBack: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? colors.card : '#E8ECF2',
        },
        headerTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
        chipRow: {
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: Spacing.lg,
          paddingBottom: 12,
          backgroundColor: colors.bg,
        },
        chip: {
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingHorizontal: 6,
          paddingVertical: 10,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: isDark ? colors.border : '#D1D5DB',
          backgroundColor: isDark ? colors.card : colors.bgElevated,
        },
        chipActive: {
          borderColor: mc.accent,
          backgroundColor: mc.accentSoft,
        },
        chipTxt: {
          fontSize: 11,
          fontWeight: '700',
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 14,
        },
        chipTxtActive: { color: mc.accent },
        tabBar: {
          flexDirection: 'row',
          backgroundColor: colors.bg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        tab: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 12,
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: { borderBottomColor: mc.accent },
        tabTxt: { fontSize: 14, fontWeight: '600', color: colors.textFaint },
        tabTxtActive: { color: colors.text, fontWeight: '800' },
        scroll: { flex: 1, backgroundColor: colors.bg },
        section: { marginBottom: 20 },
        sectionHead: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: 8,
        },
        sectionTitle: {
          color: colors.textFaint,
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.4,
        },
        sectionBody: { paddingHorizontal: Spacing.lg, gap: 4 },
        heroThumb: {
          width: contentW,
          height: Math.round(contentW * 0.52),
          borderRadius: Radii.md,
          overflow: 'hidden',
          backgroundColor: isDark ? colors.card : '#E2E8F0',
        },
        heroTime: {
          position: 'absolute',
          left: 10,
          bottom: 8,
          color: '#FFF',
          fontSize: 12,
          fontWeight: '700',
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
        gridThumb: {
          borderRadius: Radii.md,
          overflow: 'hidden',
          backgroundColor: isDark ? colors.card : '#E2E8F0',
        },
        placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowBody: { flex: 1, minWidth: 0 },
        rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
        rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        linkUrl: { color: mc.accent, fontSize: 13 },
        empty: {
          textAlign: 'center',
          color: colors.textFaint,
          marginTop: 48,
          paddingHorizontal: 24,
          fontSize: 14,
        },
        sheetBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
          zIndex: 30,
        },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          maxHeight: '75%',
          paddingBottom: Math.max(insets.bottom, 12),
        },
        sheetHead: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: Spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
        searchBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.lg,
          marginVertical: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? colors.card : '#F1F5F9',
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 14, padding: 0 },
        sheetRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sheetRowTxt: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
        customField: {
          marginHorizontal: Spacing.lg,
          marginBottom: 10,
        },
        customLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6, fontWeight: '600' },
        customInput: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.text,
          fontSize: 14,
          backgroundColor: isDark ? colors.card : colors.bg,
        },
        confirmBtn: {
          marginHorizontal: Spacing.lg,
          marginTop: 8,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          backgroundColor: mc.accent,
        },
        confirmTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 },
      }),
    [colors, isDark, mc, insets.top, insets.bottom, contentW],
  );

  const openMessage = (m: MessengerMessage) => {
    const att = resolvePrimaryAttachment(m);
    const url = resolveMediaUrl(att.url);
    if (!url) return;
    if (isVideoMessage(m)) {
      void openMessengerAttachment(url, { name: att.name, mime: att.type || 'video/mp4' });
    } else if (isImageMessage(m)) {
      onOpenLightbox(url);
    } else if (isAudioMessage(m)) {
      void openMessengerAttachment(url, { name: att.name, mime: att.type || 'audio/mpeg' });
    } else {
      promptMessengerFileActions(url, { name: att.name, mime: att.type });
    }
  };

  const renderMediaContent = (m: MessengerMessage, video: boolean, url: string | null) => {
    if (url && !video) {
      return <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />;
    }
    return (
      <View style={styles.placeholder}>
        <Ionicons name={video ? 'videocam' : 'image-outline'} size={28} color={colors.textFaint} />
      </View>
    );
  };

  const renderPhotoThumb = (m: MessengerMessage, w: number, h: number) => {
    const att = resolvePrimaryAttachment(m);
    const url = resolveMediaUrl(att.url);
    const video = isVideoMessage(m);
    return (
      <Pressable
        key={m.id}
        style={[styles.gridThumb, { width: w, height: h }]}
        onPress={() => openMessage(m)}
      >
        {renderMediaContent(m, video, url)}
      </Pressable>
    );
  };

  const renderPhotoSection = (title: string, items: MessengerMessage[]) => {
    if (!items.length) return null;
    const gap = 4;
    const colW = Math.floor((contentW - gap) / 2);
    const [hero, ...rest] = items;

    return (
      <View key={title} style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{sectionLabel(title)}</Text>
        </View>
        <View style={styles.sectionBody}>
          {hero ? (
            <Pressable style={styles.heroThumb} onPress={() => openMessage(hero)}>
              {(() => {
                const att = resolvePrimaryAttachment(hero);
                const url = resolveMediaUrl(att.url);
                const video = isVideoMessage(hero);
                return (
                  <>
                    {renderMediaContent(hero, video, url)}
                    <Text style={styles.heroTime}>{formatMessageTime(hero.created_at)}</Text>
                  </>
                );
              })()}
            </Pressable>
          ) : null}
          {rest.length ? (
            <View style={styles.grid}>
              {rest.map((m) => renderPhotoThumb(m, colW, colW))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const dateSections = <T,>(items: T[], getDate: (item: T) => string) =>
    groupByKey(items, (item) => formatChatDateLabel(getDate(item)) || 'Khác');

  const photoSections = useMemo(() => dateSections(photoItems, (m) => m.created_at), [photoItems]);
  const fileSections = useMemo(() => dateSections(fileItems, (m) => m.created_at), [fileItems]);
  const voiceSections = useMemo(() => dateSections(voiceItems, (m) => m.created_at), [voiceItems]);
  const linkSections = useMemo(
    () => dateSections(linkItems, (it) => it.message.created_at),
    [linkItems],
  );

  const renderListSection = (
    title: string,
    rows: React.ReactNode,
  ) => (
    <View key={title} style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{sectionLabel(title)}</Text>
      </View>
      {rows}
    </View>
  );

  const renderFilesList = () => {
    if (!fileItems.length) return <Text style={styles.empty}>Chưa có tệp đính kèm.</Text>;
    return fileSections.map(([title, items]) =>
      renderListSection(
        title,
        items.map((item) => {
          const att = resolvePrimaryAttachment(item);
          return (
            <TapHighlight key={item.id} style={styles.row} onPress={() => openMessage(item)}>
              <Ionicons name="document-outline" size={24} color={mc.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{att.name || 'Tệp đính kèm'}</Text>
                <Text style={styles.rowSub}>{senderDisplayName(item)}</Text>
              </View>
            </TapHighlight>
          );
        }),
      ),
    );
  };

  const renderLinksList = () => {
    if (!linkItems.length) return <Text style={styles.empty}>Chưa có link.</Text>;
    return linkSections.map(([title, items]) =>
      renderListSection(
        title,
        items.map((item: MessengerLinkItem, i) => (
          <TapHighlight
            key={`${item.url}-${i}`}
            style={styles.row}
            onPress={() => void openExternalLink(item.url)}
          >
            <Ionicons name="link" size={22} color={mc.accent} />
            <View style={styles.rowBody}>
              <Text style={styles.linkUrl} numberOfLines={2}>{item.url}</Text>
              <Text style={styles.rowSub}>{senderDisplayName(item.message)}</Text>
            </View>
          </TapHighlight>
        )),
      ),
    );
  };

  const renderVoiceList = () => {
    if (!voiceItems.length) return <Text style={styles.empty}>Chưa có tin nhắn thoại.</Text>;
    return voiceSections.map(([title, items]) =>
      renderListSection(
        title,
        items.map((item) => {
          const att = resolvePrimaryAttachment(item);
          return (
            <TapHighlight key={item.id} style={styles.row} onPress={() => openMessage(item)}>
              <Ionicons name="mic-outline" size={24} color={mc.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{att.name || 'Tin nhắn thoại'}</Text>
                <Text style={styles.rowSub}>{senderDisplayName(item)}</Text>
              </View>
            </TapHighlight>
          );
        }),
      ),
    );
  };

  const renderPhotos = () => {
    if (!photoItems.length) {
      return <Text style={styles.empty}>{videoOnly ? 'Chưa có video.' : 'Chưa có ảnh hoặc video.'}</Text>;
    }
    return photoSections.map(([title, items]) => renderPhotoSection(title, items));
  };

  const pickTimeFilter = (key: TimeFilterPreset) => {
    if (key === 'custom') {
      setTimeSheetOpen(false);
      setCustomSheetOpen(true);
      return;
    }
    setTimeFilter(key);
    setCustomRange(null);
    setTimeSheetOpen(false);
  };

  const applyCustomRange = () => {
    const start = parseViDate(customFrom);
    const end = parseViDate(customTo);
    if (!start || !end) return;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (start.getTime() > end.getTime()) return;
    setCustomRange({ start, end });
    setTimeFilter('custom');
    setCustomSheetOpen(false);
  };

  const senderChipLabel = selectedSender
    ? selectedSender.name.split(' ').slice(-1)[0] || selectedSender.name
    : 'Theo người gửi';

  const timeChipLabel =
    timeFilter === 'yesterday' ? 'Hôm qua'
      : timeFilter === 'lastWeek' ? 'Tuần trước'
        : timeFilter === 'lastMonth' ? 'Tháng trước'
          : timeFilter === 'custom' ? 'Tùy chọn'
            : 'Theo thời gian';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.headerBack} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Ảnh, file, link</Text>
      </View>

      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, senderId && styles.chipActive]}
          onPress={() => {
            setSenderQuery('');
            setSenderSheetOpen(true);
          }}
        >
          <Ionicons name="person-outline" size={18} color={senderId ? mc.accent : colors.textMuted} />
          <Text style={[styles.chipTxt, senderId && styles.chipTxtActive]} numberOfLines={2}>
            {senderChipLabel}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.chip, videoOnly && styles.chipActive, tab !== 'photos' && { opacity: 0.45 }]}
          onPress={() => {
            if (tab !== 'photos') return;
            setVideoOnly((v) => !v);
          }}
        >
          <Ionicons name="videocam-outline" size={18} color={videoOnly ? mc.accent : colors.textMuted} />
          <Text style={[styles.chipTxt, videoOnly && styles.chipTxtActive]} numberOfLines={2}>
            Video
          </Text>
        </Pressable>

        <Pressable
          style={[styles.chip, timeFilter !== 'all' && styles.chipActive]}
          onPress={() => setTimeSheetOpen(true)}
        >
          <Ionicons name="time-outline" size={18} color={timeFilter !== 'all' ? mc.accent : colors.textMuted} />
          <Text style={[styles.chipTxt, timeFilter !== 'all' && styles.chipTxtActive]} numberOfLines={2}>
            {timeChipLabel}
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'photos' ? renderPhotos() : null}
        {tab === 'files' ? renderFilesList() : null}
        {tab === 'links' ? renderLinksList() : null}
        {tab === 'voice' ? renderVoiceList() : null}
        <View style={{ height: Math.max(insets.bottom, 16) }} />
      </ScrollView>

      {senderSheetOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => setSenderSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Chọn người gửi</Text>
              <Pressable onPress={() => setSenderSheetOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm thành viên..."
                placeholderTextColor={colors.textFaint}
                value={senderQuery}
                onChangeText={setSenderQuery}
              />
            </View>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                setSenderId(null);
                setSenderSheetOpen(false);
              }}
            >
              <Ionicons name="people-outline" size={22} color={mc.accent} />
              <Text style={styles.sheetRowTxt}>Tất cả thành viên</Text>
              {!senderId ? <Ionicons name="checkmark" size={20} color={mc.accent} /> : null}
            </Pressable>
            <FlatList
              data={filteredSenders}
              keyExtractor={(s) => s.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    setSenderId(item.id);
                    setSenderSheetOpen(false);
                  }}
                >
                  <Avatar name={item.name} size={40} color={avatarColorFromName(item.name)} avatarUrl={item.avatar} />
                  <Text style={styles.sheetRowTxt}>{item.name}</Text>
                  {senderId === item.id ? <Ionicons name="checkmark" size={20} color={mc.accent} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      ) : null}

      {timeSheetOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => setTimeSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Lọc theo thời gian</Text>
              <Pressable onPress={() => setTimeSheetOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                setTimeFilter('all');
                setCustomRange(null);
                setTimeSheetOpen(false);
              }}
            >
              <Ionicons name="infinite-outline" size={22} color={mc.accent} />
              <Text style={styles.sheetRowTxt}>Tất cả</Text>
              {timeFilter === 'all' ? <Ionicons name="checkmark" size={20} color={mc.accent} /> : null}
            </Pressable>
            {TIME_OPTIONS.map((opt) => (
              <Pressable key={opt.key} style={styles.sheetRow} onPress={() => pickTimeFilter(opt.key)}>
                <Ionicons name="calendar-outline" size={22} color={mc.accent} />
                <Text style={styles.sheetRowTxt}>{opt.label}</Text>
                {timeFilter === opt.key ? <Ionicons name="checkmark" size={20} color={mc.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      ) : null}

      {customSheetOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => setCustomSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Chọn khoảng thời gian</Text>
              <Pressable onPress={() => setCustomSheetOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>Từ ngày (DD/MM/YYYY)</Text>
              <TextInput
                style={styles.customInput}
                placeholder="01/06/2026"
                placeholderTextColor={colors.textFaint}
                value={customFrom}
                onChangeText={setCustomFrom}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>Đến ngày (DD/MM/YYYY)</Text>
              <TextInput
                style={styles.customInput}
                placeholder="16/06/2026"
                placeholderTextColor={colors.textFaint}
                value={customTo}
                onChangeText={setCustomTo}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <Pressable style={styles.confirmBtn} onPress={applyCustomRange}>
              <Text style={styles.confirmTxt}>Áp dụng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}
