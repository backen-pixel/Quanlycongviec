import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  useFocusEffect } from '@react-navigation/native';
import React,
  { useCallback,
  useEffect,
  useMemo,
  useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
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
import { useTheme } from '../context/ThemeContext';
import {
  addMessengerGroupMembers,
  fetchMessengerGroupDetail,
  leaveMessengerGroup,
  resolveMediaUrl,
  setContactNickname,
  setGroupMemberNickname,
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
import {
  clearChatWallpaper,
  setChatWallpaper,
  setChatWallpaperPreset,
} from '../lib/chatWallpaperStorage';
import { SX_OPEN_CHAT_SEARCH } from '../lib/messengerEvents';
import { avatarColorFromName, getMessengerColors } from '../lib/messengerTheme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Radii, Spacing } from '../theme';
import type { MessengerMessage } from '../types/messenger';

import SpinningLoader from '../components/SpinningLoader';
type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetailInfo'>;
type Panel = 'main' | 'gallery' | 'members';

type OptionItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress?: () => void;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  last?: boolean;
};

function OptionRow({
  item,
  accent,
  colors,
  isDark,
}: {
  item: OptionItem;
  accent: string;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  return (
    <Pressable
      style={[
        optionStyles.row,
        !item.last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={item.toggle ? undefined : item.onPress}
      disabled={item.toggle}
    >
      <View style={[optionStyles.iconWrap, { backgroundColor: isDark ? 'rgba(108,92,231,0.22)' : `${accent}22` }]}>
        <Ionicons name={item.icon} size={18} color={accent} />
      </View>
      <View style={optionStyles.body}>
        <Text style={[optionStyles.title, { color: colors.text }]}>{item.title}</Text>
        <Text style={[optionStyles.sub, { color: colors.textMuted }]} numberOfLines={2}>
          {item.sub}
        </Text>
      </View>
      {item.toggle ? (
        <Switch
          value={item.toggleValue}
          onValueChange={item.onToggle}
          trackColor={{ false: isDark ? '#3F3F46' : '#CBD5E1', true: accent }}
          thumbColor="#FFF"
        />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

const optionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
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
  const [membersLoading, setMembersLoading] = useState(true);
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
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [peerFullName, setPeerFullName] = useState<string | null>(null);
  const [peerNickname, setPeerNickname] = useState<string | null>(null);
  const [nickEditUserId, setNickEditUserId] = useState<string | null>(null);
  const [nickDraft, setNickDraft] = useState('');
  const [nickSaving, setNickSaving] = useState(false);

  const messages = useMemo(() => {
    try {
      const parsed = JSON.parse(messagesJson) as MessengerMessage[];
      return Array.isArray(parsed) ? parsed.filter((m) => !m.is_system) : [];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const refreshMembers = useCallback(() => {
    setMembersLoading(true);
    void fetchMessengerGroupDetail(threadId)
      .then((g) => {
        setMembers(g.members);
        setGroupAvatarUrl((prev) => {
          const next = g.avatar ? resolveMediaUrl(g.avatar) : null;
          return next || prev;
        });
        if (isDirect) {
          const nick = g.peerNickname?.trim() || null;
          const legal = g.peerFullName?.trim() || null;
          const display = String(g.name || '').trim() || null;
          setPeerNickname(nick);
          setPeerFullName(legal);
          // Ưu tiên biệt danh / display_name từ API, không lấy tên pháp lý trước
          setGroupName(nick || display || legal || title);
        } else {
          setGroupName(g.name);
          setRenameDraft(g.name);
        }
      })
      .catch(() => {
        if (!isDirect) setMembers([]);
      })
      .finally(() => setMembersLoading(false));
  }, [isDirect, threadId, title]);

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

  const nickEditMember = useMemo(
    () => (nickEditUserId ? members.find((m) => String(m.id) === String(nickEditUserId)) : undefined),
    [members, nickEditUserId],
  );
  const nickEditHasExisting = isDirect
    ? !!peerNickname?.trim()
    : !!(nickEditMember?.groupNickname?.trim() || nickEditMember?.nickname?.trim());

  const startNicknameEdit = useCallback(
    (userId: string, currentNick?: string | null, fallbackName?: string) => {
      const seed = String(currentNick || '').trim();
      setNickEditUserId(String(userId));
      setNickDraft(seed || String(fallbackName || '').trim());
    },
    [],
  );

  const closeNicknameEdit = useCallback(() => {
    setNickEditUserId(null);
    setNickDraft('');
  }, []);

  const submitNickname = async (clear = false) => {
    const targetId = String(nickEditUserId || (isDirect ? peerId : '') || '');
    if (!targetId) return;
    const next = clear ? '' : nickDraft.trim();
    setNickSaving(true);
    try {
      if (isDirect) {
        const display = await setContactNickname(targetId, next, threadId);
        const resolved = String(display || peerFullName || title).trim() || title;
        setPeerNickname(next || null);
        setGroupName(resolved);
        navigation.setParams({ title: resolved });
        patchThreadMeta(threadId, { name: resolved });
        void refreshThreads(true);
        closeNicknameEdit();
      } else {
        await setGroupMemberNickname(threadId, targetId, next);
        closeNicknameEdit();
        refreshMembers();
        void refreshThreads(true);
      }
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setNickSaving(false);
    }
  };

  const memberRoleLabel = (role?: string | null) => {
    const r = String(role || '').toLowerCase();
    if (r === 'leader' || r === 'admin') return 'Trưởng nhóm';
    if (r === 'deputy') return 'Phó nhóm';
    if (r === 'member') return 'Thành viên';
    return role || null;
  };

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
    // Thoát Tùy chọn trước, rồi báo ChatDetail mở tìm kiếm —
    // stack: ... → ChatDetail (không còn Info phía dưới).
    navigation.goBack();
    requestAnimationFrame(() => {
      DeviceEventEmitter.emit(SX_OPEN_CHAT_SEARCH, { threadId });
    });
  }, [navigation, threadId]);

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

  const toolItems: OptionItem[] = useMemo(() => {
    const items: OptionItem[] = [
      {
        key: 'search',
        icon: 'search-outline',
        title: 'Tìm tin nhắn',
        sub: 'Tìm kiếm nhanh tin nhắn, nội dung',
        onPress: openSearch,
      },
    ];
    if (isDirect && peerId) {
      items.push({
        key: 'group',
        icon: 'people-outline',
        title: 'Tạo nhóm chat',
        sub: 'Tạo nhóm để trò chuyện cùng mọi người',
        onPress: () =>
          navigation.navigate('CreateGroupChat', {
            preselectedUserIds: [String(peerId)],
            suggestedName: `${title} + bạn bè`,
          }),
      });
    } else if (!isDirect) {
      items.push({
        key: 'members',
        icon: 'people-outline',
        title: 'Thành viên nhóm',
        sub: members.length ? `${members.length} thành viên · xem & thêm` : 'Xem và thêm thành viên',
        onPress: () => setPanel('members'),
      });
      items.push({
        key: 'invite',
        icon: 'link-outline',
        title: 'Mời qua link',
        sub: 'Chia sẻ lời mời tham gia nhóm',
        onPress: shareInvite,
      });
    }
    items.push({
      key: 'media',
      icon: 'images-outline',
      title: 'Ảnh & file',
      sub: 'Xem và quản lý ảnh, file đã chia sẻ',
      onPress: () => openGallery('photos'),
    });
    items.push({
      key: 'notify',
      icon: notifyOn ? 'notifications' : 'notifications-off-outline',
      title: notifyOn ? 'Đang bật thông báo' : 'Đã tắt thông báo',
      sub: notifyOn ? 'Bạn sẽ nhận thông báo tin nhắn' : 'Không nhận thông báo từ hội thoại này',
      toggle: true,
      toggleValue: notifyOn,
      onToggle: setNotifyOn,
      last: true,
    });
    return items;
  }, [isDirect, peerId, title, navigation, openSearch, openGallery, notifyOn, members.length]);

  const pickChatWallpaper = useCallback(() => {
    setWallpaperOpen(true);
  }, []);

  const applyWallpaperPreset = useCallback(
    (presetId: string) => {
      void setChatWallpaperPreset(threadId, presetId).then(() => {
        setWallpaperOpen(false);
        Alert.alert('Ảnh nền', presetId === 'default' ? 'Đã khôi phục nền mặc định.' : 'Đã áp dụng nền chat.');
      });
    },
    [threadId],
  );

  const pickCustomWallpaper = useCallback(() => {
    void (async () => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Cần quyền', 'Cho phép truy cập thư viện ảnh để đặt ảnh nền.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        });
        if (res.canceled || !res.assets?.[0]?.uri) return;
        const asset = res.assets[0];
        await setChatWallpaper(threadId, {
          uri: asset.uri,
          name: asset.fileName || 'wallpaper.jpg',
          type: asset.mimeType || 'image/jpeg',
        });
        setWallpaperOpen(false);
        Alert.alert('Ảnh nền', 'Đã đổi ảnh nền — đồng bộ với web.');
      } catch (e) {
        Alert.alert('Lỗi', formatApiError(e));
      }
    })();
  }, [threadId]);

  const otherItems: OptionItem[] = useMemo(
    () => [
      {
        key: 'theme',
        icon: 'color-palette-outline',
        title: 'Giao diện',
        sub: 'Đổi ảnh nền đoạn tin nhắn',
        onPress: pickChatWallpaper,
      },
      {
        key: 'privacy',
        icon: 'shield-checkmark-outline',
        title: 'Quyền riêng tư',
        sub: 'Quản lý quyền riêng tư và hỗ trợ',
        onPress: () =>
          Alert.alert(
            'Quyền riêng tư & hỗ trợ',
            'Tin nhắn được bảo vệ theo chính sách công ty. Cần hỗ trợ? Liên hệ quản trị viên hệ thống.',
          ),
        last: true,
      },
    ],
    [pickChatWallpaper],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 4,
          paddingBottom: 12,
          paddingHorizontal: Spacing.md,
          gap: 4,
        },
        headerBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
        scroll: { flex: 1 },
        scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Math.max(insets.bottom, 24) },
        profileCard: {
          backgroundColor: colors.card,
          borderRadius: Radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          paddingTop: 28,
          paddingBottom: 22,
          paddingHorizontal: 20,
          marginBottom: 20,
        },
        profileName: {
          color: colors.text,
          fontSize: 18,
          fontWeight: '800',
          marginTop: 14,
          textAlign: 'center',
        },
        profileLegal: {
          color: colors.textMuted,
          fontSize: 12,
          marginTop: 4,
          textAlign: 'center',
        },
        badge: {
          marginTop: 10,
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: mc.accentSoft,
        },
        badgeTxt: { color: mc.accent, fontSize: 12, fontWeight: '700' },
        sectionLabel: {
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: '800',
          letterSpacing: 0.6,
          marginBottom: 10,
          marginLeft: 4,
        },
        sectionCard: {
          backgroundColor: colors.card,
          borderRadius: Radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 20,
          overflow: 'hidden',
        },
        mediaPreview: {
          paddingHorizontal: 14,
          paddingBottom: 14,
          gap: 8,
        },
        mediaRow: { flexDirection: 'row', gap: 6 },
        mediaThumb: {
          width: 64,
          height: 64,
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: isDark ? '#1A1F28' : '#E2E8F0',
        },
        mediaMore: {
          width: 64,
          height: 64,
          borderRadius: 10,
          backgroundColor: mc.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        leaveBtn: {
          marginTop: 4,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          alignItems: 'center',
          backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
          borderWidth: 1,
          borderColor: isDark ? '#7F1D1D' : '#FECACA',
        },
        leaveTxt: { color: colors.danger, fontWeight: '800', fontSize: 15 },
        subHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 4,
          paddingBottom: 12,
          paddingHorizontal: Spacing.md,
          backgroundColor: colors.bg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          gap: 8,
        },
        subTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
        menuRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 15,
          backgroundColor: colors.card,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        menuIcon: {
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: mc.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        menuTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
        },
        rowBody: { flex: 1, minWidth: 0 },
        rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
        rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        nickAction: {
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
        },
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
          borderColor: colors.card,
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
        wallpaperGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
        },
        wallpaperSwatch: {
          width: '30%',
          flexGrow: 1,
          minWidth: '28%',
          maxWidth: '32%',
          aspectRatio: 0.85,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 8,
          overflow: 'hidden',
        },
        wallpaperSwatchLabel: { color: '#FFF', fontSize: 11, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
        wallpaperCustomBtn: {
          marginHorizontal: Spacing.lg,
          marginBottom: 8,
          paddingVertical: 12,
          borderRadius: Radii.md,
          backgroundColor: mc.accentSoft,
          alignItems: 'center',
        },
        wallpaperCustomTxt: { color: mc.accent, fontWeight: '800', fontSize: 14 },
      }),
    [colors, isDark, mc, insets.top, insets.bottom],
  );

  const renderMediaThumb = (m: MessengerMessage, size = 64) => {
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
            <Ionicons name="videocam" size={22} color={colors.textMuted} />
          </View>
        )}
      </Pressable>
    );
  };

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

        <Pressable style={[styles.menuRow, { borderBottomWidth: 0 }]} onPress={() => void openAddMembers()}>
          <View style={styles.menuIcon}>
            <Ionicons name="person-add" size={20} color={mc.accent} />
          </View>
          <Text style={[styles.menuTitle, { color: mc.accent }]}>Thêm thành viên</Text>
        </Pressable>
        {membersLoading ? (
          <SpinningLoader style={{ marginTop: 24 }} color={mc.accent} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              const isMe = String(item.id) === myUserId;
              const roleLabel = memberRoleLabel(item.role);
              const hasGroupNick = !!(item.groupNickname?.trim() || item.nickname?.trim());
              const showLegal =
                hasGroupNick && item.legalName && item.legalName !== item.name
                  ? item.legalName
                  : null;
              return (
                <View style={styles.row}>
                  <Avatar name={item.name} size={44} color={avatarColorFromName(item.name)} avatarUrl={item.avatar} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.name}
                      {isMe ? ' (bạn)' : ''}
                    </Text>
                    {showLegal ? (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {showLegal}
                      </Text>
                    ) : null}
                    {item.contactNickname && item.contactNickname !== item.name ? (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        Biệt danh cá nhân: {item.contactNickname}
                      </Text>
                    ) : null}
                    {roleLabel ? <Text style={styles.rowSub}>{roleLabel}</Text> : null}
                  </View>
                  {!isMe ? (
                    <Pressable
                      style={styles.nickAction}
                      hitSlop={8}
                      onPress={() =>
                        startNicknameEdit(
                          item.id,
                          item.groupNickname || item.nickname,
                          item.name,
                        )
                      }
                    >
                      <Ionicons name="pencil" size={16} color={mc.accent} />
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Chưa có thành viên.</Text>}
          />
        )}
        <Pressable style={[styles.leaveBtn, { margin: Spacing.lg }]} onPress={confirmLeave} disabled={leaving}>
          {leaving ? <SpinningLoader color={colors.danger} /> : <Text style={styles.leaveTxt}>Rời nhóm</Text>}
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
                <SpinningLoader style={{ margin: 24 }} color={mc.accent} />
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

        {nickEditUserId ? (
          <Pressable style={styles.renameBackdrop} onPress={closeNicknameEdit}>
            <Pressable style={styles.renameCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.renameTitle}>Biệt danh trong nhóm</Text>
              <TextInput
                style={styles.renameInput}
                value={nickDraft}
                onChangeText={setNickDraft}
                placeholder="Nhập biệt danh trong nhóm"
                placeholderTextColor={colors.textFaint}
                autoFocus
                maxLength={80}
              />
              <View style={styles.renameActions}>
                <Pressable style={[styles.renameBtn, styles.renameCancel]} onPress={closeNicknameEdit}>
                  <Text style={styles.renameCancelTxt}>Huỷ</Text>
                </Pressable>
                {nickEditHasExisting ? (
                  <Pressable
                    style={[styles.renameBtn, styles.renameCancel]}
                    onPress={() => void submitNickname(true)}
                    disabled={nickSaving}
                  >
                    <Text style={[styles.renameCancelTxt, { color: colors.danger }]}>Xóa</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.renameBtn, styles.renameSave]}
                  onPress={() => void submitNickname(false)}
                  disabled={nickSaving}
                >
                  {nickSaving ? (
                    <SpinningLoader color="#FFF" />
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

  const previewMedia = mediaItems.slice(-4).reverse();
  const hasMediaPreview = mediaItems.length > 0 || fileItems.length > 0 || linkItems.length > 0;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Tùy chọn</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <Pressable
            onPress={() => {
              if (canManageGroup) void changeGroupAvatar();
            }}
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
                <SpinningLoader style={{ marginTop: 8 }} color={mc.accent} />
              ) : (
                <View style={[styles.editAvatarBadge, { backgroundColor: mc.accent }]}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                </View>
              )
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => {
              if (isDirect && peerId) {
                startNicknameEdit(peerId, peerNickname, groupName);
                return;
              }
              if (!canManageGroup) return;
              setRenameDraft(groupName);
              setRenameOpen(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 8 }}
          >
            <Text style={styles.profileName}>{groupName}</Text>
            {isDirect && peerId ? (
              <Ionicons name="pencil" size={15} color={mc.accent} />
            ) : canManageGroup ? (
              <Ionicons name="pencil" size={15} color={mc.accent} />
            ) : null}
          </Pressable>
          {isDirect && peerNickname && peerFullName ? (
            <Text style={styles.profileLegal} numberOfLines={1}>
              {peerFullName}
            </Text>
          ) : null}
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{isDirect ? '• Trò chuyện' : '• Nhóm chat'}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>CÔNG CỤ</Text>
        <View style={styles.sectionCard}>
          {toolItems.map((item) => {
            if (item.key === 'media') {
              return (
                <View key={item.key}>
                  <OptionRow
                    item={{ ...item, last: false }}
                    accent={mc.accent}
                    colors={colors}
                    isDark={isDark}
                  />
                  {hasMediaPreview ? (
                    <View style={[styles.mediaPreview, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.mediaRow}
                      >
                        {previewMedia.map((m) => renderMediaThumb(m))}
                        {(mediaItems.length > 4 || fileItems.length > 0 || linkItems.length > 0) ? (
                          <Pressable style={styles.mediaMore} onPress={() => openGallery('photos')}>
                            <Ionicons name="chevron-forward" size={20} color={mc.accent} />
                          </Pressable>
                        ) : null}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              );
            }
            return (
              <OptionRow
                key={item.key}
                item={{
                  ...item,
                  last: item.key === toolItems[toolItems.length - 1]?.key,
                }}
                accent={mc.accent}
                colors={colors}
                isDark={isDark}
              />
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>KHÁC</Text>
        <View style={styles.sectionCard}>
          {otherItems.map((item) => (
            <OptionRow key={item.key} item={item} accent={mc.accent} colors={colors} isDark={isDark} />
          ))}
        </View>

        {!isDirect ? (
          <Pressable style={styles.leaveBtn} onPress={confirmLeave} disabled={leaving}>
            {leaving ? <SpinningLoader color={colors.danger} /> : <Text style={styles.leaveTxt}>Rời nhóm</Text>}
          </Pressable>
        ) : null}
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
              <SpinningLoader style={{ margin: 24 }} color={mc.accent} />
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
                  <SpinningLoader color="#FFF" />
                ) : (
                  <Text style={styles.renameSaveTxt}>Lưu</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      ) : null}

      {nickEditUserId ? (
        <Pressable style={styles.renameBackdrop} onPress={closeNicknameEdit}>
          <Pressable style={styles.renameCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.renameTitle}>
              {isDirect ? 'Biệt danh cá nhân' : 'Biệt danh trong nhóm'}
            </Text>
            <TextInput
              style={styles.renameInput}
              value={nickDraft}
              onChangeText={setNickDraft}
              placeholder={isDirect ? 'Nhập biệt danh cá nhân' : 'Nhập biệt danh trong nhóm'}
              placeholderTextColor={colors.textFaint}
              autoFocus
              maxLength={80}
            />
            <View style={styles.renameActions}>
              <Pressable style={[styles.renameBtn, styles.renameCancel]} onPress={closeNicknameEdit}>
                <Text style={styles.renameCancelTxt}>Huỷ</Text>
              </Pressable>
              {nickEditHasExisting ? (
                <Pressable
                  style={[styles.renameBtn, styles.renameCancel]}
                  onPress={() => void submitNickname(true)}
                  disabled={nickSaving}
                >
                  <Text style={[styles.renameCancelTxt, { color: colors.danger }]}>Xóa</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.renameBtn, styles.renameSave]}
                onPress={() => void submitNickname(false)}
                disabled={nickSaving}
              >
                {nickSaving ? (
                  <SpinningLoader color="#FFF" />
                ) : (
                  <Text style={styles.renameSaveTxt}>Lưu</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      ) : null}

      {wallpaperOpen ? (
        <Pressable style={styles.pickerBackdrop} onPress={() => setWallpaperOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>Ảnh nền đoạn chat</Text>
              <Pressable onPress={() => setWallpaperOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable
              style={styles.wallpaperCustomBtn}
              onPress={() => {
                applyWallpaperPreset('default');
              }}
            >
              <Text style={styles.wallpaperCustomTxt}>Nền mặc định (sạch)</Text>
            </Pressable>
            <Pressable style={styles.wallpaperCustomBtn} onPress={pickCustomWallpaper}>
              <Text style={styles.wallpaperCustomTxt}>Chọn ảnh từ thư viện</Text>
            </Pressable>
            <Pressable
              style={[styles.wallpaperCustomBtn, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', marginBottom: 16 }]}
              onPress={() => {
                void clearChatWallpaper(threadId).then(() => {
                  setWallpaperOpen(false);
                  Alert.alert('Ảnh nền', 'Đã khôi phục nền mặc định.');
                });
              }}
            >
              <Text style={{ color: colors.danger, fontWeight: '800' }}>Xóa ảnh nền</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}
