import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { fetchActivityUsers, type ActivityUserItem } from '../api/users';
import Avatar from '../components/Avatar';
import ImageLightbox from '../components/messenger/ImageLightbox';
import ChatMediaGalleryPanel, { type GalleryTab } from '../components/messenger/ChatMediaGalleryPanel';
import MessengerAvatar from '../components/messenger/MessengerAvatar';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../theme';
import {
  addMessengerGroupMembers,
  fetchMessengerGroupDetail,
  leaveMessengerGroup,
  resolveMediaUrl,
  updateMessengerGroupAvatar,
  updateMessengerGroupName,
  type MessengerGroupMember,
} from '../lib/messengerApi';
import {
  extractLinksFromMessages,
  isImageMessage,
  isVideoMessage,
  resolvePrimaryAttachment,
} from '../lib/messengerMedia';
import { openMessengerAttachment } from '../lib/messengerFileOpen';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Spacing } from '../theme';
import type { MessengerMessage } from '../types/messenger';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetailInfo'>;
type Panel = 'main' | 'gallery' | 'members';

type QuickAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
};

function QuickActionBtn({
  icon,
  label,
  active,
  onPress,
  accent,
  colors,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
  accent: string;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  const bg = active ? accent : isDark ? colors.card : '#F1F5F9';
  const tint = active ? '#FFF' : colors.textMuted;
  return (
    <Pressable style={qaStyles.wrap} onPress={onPress}>
      <View style={[qaStyles.circle, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={[qaStyles.label, { color: colors.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const qaStyles = StyleSheet.create({
  wrap: { width: 76, alignItems: 'center', gap: 6 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
});

export default function ChatDetailInfoScreen({ navigation, route }: Props) {
  const { threadId, title, avatarColor, avatarUrl, messagesJson, isDirect, peerId } = route.params;
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUserId = String(user?.id || user?.userId || '');
  const { threads, patchThreadMeta, refreshThreads } = useMessenger();
  const thread = threads.find((t) => t.id === threadId);

  const [panel, setPanel] = useState<Panel>('main');
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('photos');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<MessengerGroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(!isDirect);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerUsers, setPickerUsers] = useState<ActivityUserItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [notifyOn, setNotifyOn] = useState(true);
  const [groupName, setGroupName] = useState(title);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(
    () => resolveMediaUrl(thread?.avatarUrl || avatarUrl || null),
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(title);
  const [renaming, setRenaming] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const messages = useMemo(() => {
    try {
      const parsed = JSON.parse(messagesJson) as MessengerMessage[];
      return Array.isArray(parsed) ? parsed.filter((m) => !m.is_system) : [];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const refreshMembers = useCallback(() => {
    if (isDirect) return;
    setMembersLoading(true);
    void fetchMessengerGroupDetail(threadId)
      .then((g) => {
        setMembers(g.members);
        setGroupName(g.name);
        setRenameDraft(g.name);
        setGroupAvatarUrl((prev) => {
          const next = g.avatar ? resolveMediaUrl(g.avatar) : null;
          return next || prev;
        });
      })
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [isDirect, threadId]);

  useFocusEffect(
    useCallback(() => {
      if (thread?.avatarUrl) {
        setGroupAvatarUrl(thread.avatarUrl);
      }
    }, [thread?.avatarUrl]),
  );

  useEffect(() => {
    if (thread?.avatarUrl) {
      setGroupAvatarUrl(thread.avatarUrl);
    }
  }, [thread?.avatarUrl]);

  const myMember = members.find((m) => String(m.id) === myUserId);
  const canManageGroup = !isDirect && ['leader', 'deputy', 'admin'].includes(String(myMember?.role || '').toLowerCase());

  const submitRename = async () => {
    const next = renameDraft.trim();
    if (!next) {
      Alert.alert('Tên nhóm', 'Tên nhóm không được để trống.');
      return;
    }
    if (next === groupName) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await updateMessengerGroupName(threadId, next);
      setGroupName(next);
      setRenameOpen(false);
      navigation.setParams({ title: next });
      patchThreadMeta(threadId, { name: next });
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setRenaming(false);
    }
  };

  const changeGroupAvatar = async () => {
    if (!canManageGroup) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Cần quyền', 'Cho phép truy cập thư viện ảnh.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const asset = res.assets[0];
      setAvatarUploading(true);
      const uploaded = await updateMessengerGroupAvatar(threadId, {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      const resolved = uploaded ? resolveMediaUrl(uploaded) : null;
      setGroupAvatarUrl(resolved);
      navigation.setParams({ avatarUrl: resolved });
      patchThreadMeta(threadId, { avatarUrl: uploaded || null });
      void refreshThreads(true);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

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

  const openSearch = useCallback(() => {
    navigation.navigate('ChatDetail', { threadId, title, peerId: peerId || null, openSearch: true });
  }, [navigation, threadId, title, peerId]);

  const openGallery = useCallback((tab: GalleryTab = 'photos') => {
    setGalleryTab(tab);
    setPanel('gallery');
  }, []);

  const openAddMembers = async () => {
    setAddOpen(true);
    setPickerLoading(true);
    try {
      const list = await fetchActivityUsers();
      const existing = new Set(members.map((m) => String(m.id)));
      setPickerUsers(list.filter((u) => String(u.id) !== myUserId && !existing.has(String(u.id))));
    } catch {
      setPickerUsers([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const addMember = async (userId: string) => {
    setAdding(true);
    try {
      await addMessengerGroupMembers(threadId, [userId]);
      setAddOpen(false);
      refreshMembers();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setAdding(false);
    }
  };

  const confirmLeave = () => {
    Alert.alert('Rời nhóm', 'Bạn có chắc muốn rời nhóm chat này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Rời nhóm',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          void leaveMessengerGroup(threadId)
            .then(() => navigation.pop(2))
            .catch((e) => Alert.alert('Lỗi', formatApiError(e)))
            .finally(() => setLeaving(false));
        },
      },
    ]);
  };

  const shareInvite = () => {
    void Share.share({
      message: `Mời bạn tham gia nhóm «${title}» trên CRM Mobile.`,
      title: `Nhóm: ${title}`,
    });
  };

  const quickActions: QuickAction[] = useMemo(() => {
    const base: QuickAction[] = [
      { key: 'search', icon: 'search-outline', label: 'Tìm tin nhắn', onPress: openSearch },
    ];
    if (!isDirect) {
      base.push({
        key: 'invite',
        icon: 'person-add-outline',
        label: 'Thêm thành viên',
        onPress: () => void openAddMembers(),
      });
      base.push({
        key: 'share',
        icon: 'link-outline',
        label: 'Mời qua link',
        onPress: shareInvite,
      });
    } else if (peerId) {
      base.push({
        key: 'group',
        icon: 'people-outline',
        label: 'Tạo nhóm chat',
        onPress: () =>
          navigation.navigate('CreateGroupChat', {
            preselectedUserIds: [String(peerId)],
            suggestedName: `${title} + bạn bè`,
          }),
      });
      base.push({
        key: 'media',
        icon: 'images-outline',
        label: 'Ảnh & file',
        onPress: () => openGallery('photos'),
      });
    }
    base.push({
      key: 'notify',
      icon: notifyOn ? 'notifications' : 'notifications-off-outline',
      label: notifyOn ? 'Đang bật TB' : 'Tắt thông báo',
      active: notifyOn,
      onPress: () => setNotifyOn((v) => !v),
    });
    return base.slice(0, 4);
  }, [isDirect, notifyOn, peerId, title, navigation, openSearch, openGallery]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: isDark ? colors.bg : '#F4F6FB' },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 4,
          paddingBottom: 14,
          paddingHorizontal: Spacing.md,
          backgroundColor: mc.accent,
          gap: 8,
        },
        headerBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '800' },
        scroll: { flex: 1 },
        card: {
          backgroundColor: colors.bgElevated,
          marginBottom: 8,
        },
        profile: {
          alignItems: 'center',
          paddingTop: 24,
          paddingBottom: 20,
          backgroundColor: colors.bgElevated,
        },
        profileName: {
          color: colors.text,
          fontSize: 20,
          fontWeight: '800',
          marginTop: 14,
          paddingHorizontal: 24,
          textAlign: 'center',
        },
        badge: {
          marginTop: 8,
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: mc.accentSoft,
        },
        badgeTxt: { color: mc.accent, fontSize: 12, fontWeight: '700' },
        quickRow: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingHorizontal: Spacing.sm,
          paddingVertical: 18,
          backgroundColor: colors.bgElevated,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        section: {
          backgroundColor: colors.bgElevated,
          paddingVertical: 14,
          paddingHorizontal: Spacing.lg,
          marginBottom: 8,
        },
        sectionHead: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        },
        sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
        sectionCount: { color: colors.textMuted, fontSize: 13 },
        mediaRow: { flexDirection: 'row', gap: 6 },
        mediaThumb: {
          width: 72,
          height: 72,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: isDark ? '#1A1F28' : '#E2E8F0',
        },
        mediaMore: {
          width: 72,
          height: 72,
          borderRadius: 8,
          backgroundColor: mc.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        menuRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 15,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        menuIcon: {
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: isDark ? colors.card : '#F1F5F9',
          alignItems: 'center',
          justifyContent: 'center',
        },
        menuBody: { flex: 1 },
        menuTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
        menuSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        leaveBtn: {
          margin: Spacing.lg,
          marginTop: 4,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
        },
        leaveTxt: { color: colors.red, fontWeight: '800', fontSize: 15 },
        subHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 4,
          paddingBottom: 12,
          paddingHorizontal: Spacing.md,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          gap: 8,
        },
        subTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
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
        linkUrl: { color: mc.accent, fontSize: 13 },
        empty: { textAlign: 'center', color: colors.textFaint, marginTop: 40, paddingHorizontal: 24 },
        pickerBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'flex-end',
          zIndex: 20,
        },
        pickerSheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          maxHeight: '70%',
          paddingBottom: Math.max(insets.bottom, 12),
        },
        pickerHead: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: Spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        pickerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
        editAvatarBadge: {
          position: 'absolute',
          right: -2,
          bottom: 2,
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: colors.bgElevated,
        },
        renameBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          paddingHorizontal: Spacing.lg,
          zIndex: 30,
        },
        renameCard: {
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          padding: Spacing.lg,
        },
        renameTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
        renameInput: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.text,
          fontSize: 15,
          backgroundColor: isDark ? colors.card : colors.bg,
        },
        renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
        renameBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radii.md },
        renameCancel: { backgroundColor: isDark ? colors.card : '#F1F5F9' },
        renameSave: { backgroundColor: mc.accent },
        renameCancelTxt: { color: colors.text, fontWeight: '700' },
        renameSaveTxt: { color: '#FFF', fontWeight: '800' },
      }),
    [colors, isDark, mc, insets.top, insets.bottom],
  );

  const renderMediaThumb = (m: MessengerMessage, size = 72) => {
    const att = resolvePrimaryAttachment(m);
    const url = resolveMediaUrl(att.url);
    const video = isVideoMessage(m);
    return (
      <Pressable
        key={m.id}
        style={[styles.mediaThumb, { width: size, height: size }]}
        onPress={() => {
          if (!url) return;
          if (video) void openMessengerAttachment(url, { name: att.name, mime: att.type || 'video/mp4' });
          else setLightboxUrl(url);
        }}
      >
        {url && !video ? (
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="videocam" size={24} color={colors.textMuted} />
          </View>
        )}
      </Pressable>
    );
  };

  const menuItems = useMemo(() => {
    if (isDirect) return [];
    return [{
      key: 'members',
      icon: 'people-outline' as const,
      title: 'Xem thành viên',
      sub: `${members.length} thành viên`,
      onPress: () => setPanel('members'),
    }];
  }, [isDirect, members.length]);

  if (panel === 'gallery') {
    return (
      <>
        <ChatMediaGalleryPanel
          key={galleryTab}
          messages={messages}
          members={members}
          initialTab={galleryTab}
          onBack={() => setPanel('main')}
          onOpenLightbox={setLightboxUrl}
        />
        <ImageLightbox uri={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      </>
    );
  }

  if (panel === 'members') {
    return (
      <View style={styles.root}>
        <View style={styles.subHeader}>
          <TapHighlight style={styles.headerBack} onPress={() => setPanel('main')}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TapHighlight>
          <Text style={styles.subTitle}>Thành viên</Text>
        </View>

        <Pressable
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
              onPress={() => void openAddMembers()}
            >
              <View style={[styles.menuIcon, { backgroundColor: mc.accentSoft }]}>
                <Ionicons name="person-add" size={20} color={mc.accent} />
              </View>
              <Text style={[styles.menuTitle, { color: mc.accent }]}>Thêm thành viên</Text>
            </Pressable>
            {membersLoading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={mc.accent} />
            ) : (
              <FlatList
                data={members}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Avatar name={item.name} size={44} color={avatarColorFromName(item.name)} avatarUrl={item.avatar} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      {item.role ? <Text style={styles.rowSub}>{item.role}</Text> : null}
                    </View>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.empty}>Chưa có thành viên.</Text>}
              />
            )}
            <Pressable style={styles.leaveBtn} onPress={confirmLeave} disabled={leaving}>
              {leaving ? <ActivityIndicator color={colors.red} /> : <Text style={styles.leaveTxt}>Rời nhóm</Text>}
            </Pressable>

        {addOpen ? (
          <Pressable style={styles.pickerBackdrop} onPress={() => setAddOpen(false)}>
            <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerHead}>
                <Text style={styles.pickerTitle}>Thêm thành viên</Text>
                <Pressable onPress={() => setAddOpen(false)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>
              {pickerLoading || adding ? (
                <ActivityIndicator style={{ margin: 24 }} color={mc.accent} />
              ) : (
                <FlatList
                  data={pickerUsers}
                  keyExtractor={(u) => String(u.id)}
                  renderItem={({ item }) => (
                    <Pressable style={styles.row} onPress={() => void addMember(String(item.id))}>
                      <Avatar name={item.name || 'Thành viên'} size={40} color={avatarColorFromName(item.name)} />
                      <Text style={styles.rowTitle}>{item.name || 'Thành viên'}</Text>
                    </Pressable>
                  )}
                />
              )}
            </Pressable>
          </Pressable>
        ) : null}

        <ImageLightbox uri={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      </View>
    );
  }

  const previewMedia = mediaItems.slice(-4).reverse();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TapHighlight>
        <Text style={styles.headerTitle}>Tùy chọn</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <Pressable
            onPress={() => { if (canManageGroup) void changeGroupAvatar(); }}
            disabled={!canManageGroup || avatarUploading}
            style={{ alignItems: 'center' }}
          >
            <MessengerAvatar
              name={groupName}
              size={88}
              color={avatarColor || avatarColorFromName(groupName)}
              avatarUrl={groupAvatarUrl || thread?.avatarUrl || resolveMediaUrl(avatarUrl)}
            />
            {canManageGroup ? (
              avatarUploading ? (
                <ActivityIndicator style={{ marginTop: 8 }} color={mc.accent} />
              ) : (
                <View style={[styles.editAvatarBadge, { backgroundColor: mc.accent }]}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                </View>
              )
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => {
              if (!canManageGroup) return;
              setRenameDraft(groupName);
              setRenameOpen(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 24 }}
          >
            <Text style={styles.profileName}>{groupName}</Text>
            {canManageGroup ? <Ionicons name="pencil" size={16} color={mc.accent} /> : null}
          </Pressable>
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{isDirect ? 'Trò chuyện' : 'Nhóm chat'}</Text>
          </View>
        </View>

        <View style={styles.quickRow}>
          {quickActions.map((act) => (
            <QuickActionBtn
              key={act.key}
              icon={act.icon}
              label={act.label}
              active={act.active}
              onPress={act.onPress}
              accent={mc.accent}
              colors={colors}
              isDark={isDark}
            />
          ))}
        </View>

        {(mediaItems.length > 0 || fileItems.length > 0 || linkItems.length > 0) ? (
          <View style={styles.section}>
            <Pressable style={styles.sectionHead} onPress={() => openGallery('photos')}>
              <Text style={styles.sectionTitle}>Ảnh, file, link</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
              {previewMedia.map((m) => renderMediaThumb(m))}
              {(mediaItems.length > 4 || fileItems.length > 0 || linkItems.length > 0) ? (
                <Pressable style={styles.mediaMore} onPress={() => openGallery('photos')}>
                  <Ionicons name="chevron-forward" size={22} color={mc.accent} />
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        {menuItems.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            {menuItems.map((item) => (
              <Pressable key={item.key} style={styles.menuRow} onPress={item.onPress}>
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon} size={20} color={colors.textMuted} />
                </View>
                <View style={styles.menuBody}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  {item.sub ? <Text style={styles.menuSub}>{item.sub}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {!isDirect ? (
          <Pressable style={styles.leaveBtn} onPress={confirmLeave} disabled={leaving}>
            {leaving ? <ActivityIndicator color={colors.red} /> : <Text style={styles.leaveTxt}>Rời nhóm</Text>}
          </Pressable>
        ) : null}

        <View style={{ height: Math.max(insets.bottom, 16) }} />
      </ScrollView>

      {addOpen ? (
        <Pressable style={styles.pickerBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>Thêm thành viên</Text>
              <Pressable onPress={() => setAddOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            {pickerLoading || adding ? (
              <ActivityIndicator style={{ margin: 24 }} color={mc.accent} />
            ) : (
              <FlatList
                data={pickerUsers}
                keyExtractor={(u) => String(u.id)}
                renderItem={({ item }) => (
                  <Pressable style={styles.row} onPress={() => void addMember(String(item.id))}>
                    <Avatar name={item.name || 'Thành viên'} size={40} color={avatarColorFromName(item.name)} />
                    <Text style={styles.rowTitle}>{item.name || 'Thành viên'}</Text>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      ) : null}

      <ImageLightbox uri={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {renameOpen ? (
        <Pressable style={styles.renameBackdrop} onPress={() => setRenameOpen(false)}>
          <Pressable style={styles.renameCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.renameTitle}>Đổi tên nhóm</Text>
            <TextInput
              style={styles.renameInput}
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Tên nhóm chat"
              placeholderTextColor={colors.textFaint}
              autoFocus
              maxLength={80}
            />
            <View style={styles.renameActions}>
              <Pressable style={[styles.renameBtn, styles.renameCancel]} onPress={() => setRenameOpen(false)}>
                <Text style={styles.renameCancelTxt}>Huỷ</Text>
              </Pressable>
              <Pressable
                style={[styles.renameBtn, styles.renameSave]}
                onPress={() => void submitRename()}
                disabled={renaming}
              >
                {renaming ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.renameSaveTxt}>Lưu</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}
