import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, formatApiError, postMultipart } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import type { SocialPost } from '../types/internalSocial';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { resolveAttachmentUrl } from '../lib/resolveMediaUrl';
import SocialMediaViewer from '../components/SocialMediaViewer';
import type { SlideshowItem } from '../lib/crmNoteMedia';

type Props = NativeStackScreenProps<MoreStackParamList, 'SocialProfile'>;

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  position?: string | null;
  avatar?: string | null;
  cover_url?: string | null;
  bio?: string | null;
  company?: { id: string; name?: string | null; short_name?: string | null } | null;
  department?: { id: string; name?: string | null; color?: string | null } | null;
  post_count?: number;
  created_at?: string | null;
};

type MediaItem = {
  id?: string;
  url?: string | null;
  file_url?: string | null;
  kind?: 'image' | 'video' | string | null;
  mime_type?: string | null;
};

function getInitial(name?: string | null): string {
  if (!name) return '?';
  const s = String(name).trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  const last = parts[parts.length - 1] || s;
  return last.slice(0, 1).toUpperCase();
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = Math.max(0, Date.now() - d) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày`;
  try {
    return new Date(iso).toLocaleDateString('vi-VN');
  } catch {
    return '';
  }
}

export default function SocialProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const isOwner = !!myId && myId === String(userId);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<'posts' | 'photos' | 'videos'>('posts');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<SlideshowItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [bioOpen, setBioOpen] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [bioBusy, setBioBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get<{ profile: Profile }>(`/internal-social/profile/${userId}`);
      setProfile(data?.profile || null);
    } catch (e: unknown) {
      setError(formatApiError(e) || 'Không tải được trang cá nhân');
    }
  }, [userId]);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const { data } = await api.get<{ posts?: SocialPost[] }>(`/internal-social/profile/${userId}/posts`, {
        params: { limit: 30, offset: 0 },
      });
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, [userId]);

  const loadMedia = useCallback(async (kind: 'image' | 'video') => {
    setMediaLoading(true);
    try {
      const { data } = await api.get<{ items?: MediaItem[] }>(`/internal-social/profile/${userId}/media`, {
        params: { limit: 60, offset: 0, kind },
      });
      setMedia(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setMedia([]);
    } finally {
      setMediaLoading(false);
    }
  }, [userId]);

  const initial = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProfile(), loadPosts()]);
    setLoading(false);
  }, [loadProfile, loadPosts]);

  useEffect(() => {
    void initial();
  }, [initial]);

  useEffect(() => {
    if (tab === 'photos') void loadMedia('image');
    else if (tab === 'videos') void loadMedia('video');
  }, [tab, loadMedia]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    if (tab === 'posts') await loadPosts();
    else if (tab === 'photos') await loadMedia('image');
    else await loadMedia('video');
    setRefreshing(false);
  };

  const uploadFile = async (uri: string, name: string, mime: string): Promise<string | null> => {
    const form = new FormData();
    form.append('file', { uri, name, type: mime } as unknown as Blob);
    const { data } = await postMultipart<{ file_url?: string; url?: string }>(
      '/upload/internal-social',
      form,
    );
    return data?.file_url || data?.url || null;
  };

  const changeAvatar = async () => {
    if (!isOwner) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setAvatarBusy(true);
      const url = await uploadFile(a.uri, a.fileName || 'avatar.jpg', a.mimeType || 'image/jpeg');
      if (!url) throw new Error('Upload thất bại');
      const { data } = await api.patch<{ profile: Profile }>('/internal-social/profile/me', { avatar: url });
      setProfile((p) => (p ? { ...p, avatar: data?.profile?.avatar || url } : p));
    } catch (e: unknown) {
      Alert.alert('Lỗi', formatApiError(e) || 'Không đổi được ảnh đại diện');
    } finally {
      setAvatarBusy(false);
    }
  };

  const changeCover = async () => {
    if (!isOwner) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setCoverBusy(true);
      const url = await uploadFile(a.uri, a.fileName || 'cover.jpg', a.mimeType || 'image/jpeg');
      if (!url) throw new Error('Upload thất bại');
      const { data } = await api.patch<{ profile: Profile }>('/internal-social/profile/me', { cover_url: url });
      setProfile((p) => (p ? { ...p, cover_url: data?.profile?.cover_url || url } : p));
    } catch (e: unknown) {
      Alert.alert('Lỗi', formatApiError(e) || 'Không đổi được ảnh bìa');
    } finally {
      setCoverBusy(false);
    }
  };

  const removeCover = () => {
    if (!isOwner) return;
    Alert.alert('Ảnh bìa', 'Gỡ ảnh bìa khỏi trang cá nhân?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gỡ',
        style: 'destructive',
        onPress: async () => {
          setCoverBusy(true);
          try {
            await api.patch('/internal-social/profile/me', { cover_url: null });
            setProfile((p) => (p ? { ...p, cover_url: null } : p));
          } catch (e: unknown) {
            Alert.alert('Lỗi', formatApiError(e) || 'Không gỡ được ảnh bìa');
          } finally {
            setCoverBusy(false);
          }
        },
      },
    ]);
  };

  const openBioEdit = () => {
    setBioDraft(profile?.bio || '');
    setBioOpen(true);
  };

  const saveBio = async () => {
    setBioBusy(true);
    try {
      const val = bioDraft.trim();
      const { data } = await api.patch<{ profile: Profile }>('/internal-social/profile/me', {
        bio: val || null,
      });
      setProfile((p) => (p ? { ...p, bio: data?.profile?.bio ?? (val || null) } : p));
      setBioOpen(false);
    } catch (e: unknown) {
      Alert.alert('Lỗi', formatApiError(e) || 'Không lưu được tiểu sử');
    } finally {
      setBioBusy(false);
    }
  };

  const openMediaViewer = (selectedIdx: number) => {
    const items: SlideshowItem[] = [];
    for (const m of media) {
      const raw = m.url || m.file_url || null;
      if (!raw) continue;
      const url = resolveAttachmentUrl(raw) || raw;
      const isVideo = m.kind === 'video' || String(m.mime_type || '').startsWith('video/');
      items.push({ uri: url, kind: isVideo ? 'video' : 'image' });
    }
    if (!items.length) return;
    setViewerItems(items);
    setViewerIndex(Math.min(items.length - 1, Math.max(0, selectedIdx)));
    setViewerOpen(true);
  };

  const subTitle = useMemo(() => {
    if (!profile) return '';
    const parts: string[] = [];
    if (profile.position) parts.push(profile.position);
    if (profile.role) parts.push(String(profile.role));
    if (profile.department?.name) parts.push(profile.department.name);
    return parts.join(' · ');
  }, [profile]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={CrmColors.blue600} size="large" />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['bottom']}>
        <Text style={styles.errTxt}>{error || 'Không tìm thấy người dùng'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void initial()}>
          <Text style={styles.retryTxt}>Thử lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const coverUri = profile.cover_url ? resolveAttachmentUrl(profile.cover_url) : null;
  const avatarUri = profile.avatar ? resolveAttachmentUrl(profile.avatar) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={CrmColors.blue600} />
        }
      >
        <View style={styles.coverWrap}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverFallback]} />
          )}
          {isOwner ? (
            <View style={styles.coverActions}>
              <TouchableOpacity style={styles.coverBtn} onPress={changeCover} disabled={coverBusy}>
                <Text style={styles.coverBtnTxt}>{coverBusy ? '…' : '📷 Đổi ảnh bìa'}</Text>
              </TouchableOpacity>
              {profile.cover_url ? (
                <TouchableOpacity style={[styles.coverBtn, styles.coverBtnAlt]} onPress={removeCover} disabled={coverBusy}>
                  <Text style={[styles.coverBtnTxt, { color: '#fff' }]}>Gỡ</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.headerCard}>
          <View style={styles.avatarRow}>
            <View>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInit}>{getInitial(profile.full_name)}</Text>
                </View>
              )}
              {isOwner ? (
                <TouchableOpacity style={styles.avatarEdit} onPress={changeAvatar} disabled={avatarBusy}>
                  <Text style={styles.avatarEditTxt}>{avatarBusy ? '…' : '📷'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={2}>
                {profile.full_name || profile.email || 'Thành viên'}
              </Text>
              {subTitle ? <Text style={styles.subtitle} numberOfLines={2}>{subTitle}</Text> : null}
              {profile.company?.short_name || profile.company?.name ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  🏢 {profile.company?.short_name || profile.company?.name}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{profile.post_count || 0}</Text>
              <Text style={styles.statLabel}>Bài đăng</Text>
            </View>
          </View>

          <View style={styles.bioBox}>
            <Text style={styles.bioLabel}>Tiểu sử</Text>
            <Text style={styles.bioTxt}>{profile.bio || (isOwner ? 'Chưa có tiểu sử. Chạm để thêm vài dòng giới thiệu.' : 'Chưa có tiểu sử.')}</Text>
            {isOwner ? (
              <TouchableOpacity style={styles.bioEditBtn} onPress={openBioEdit}>
                <Text style={styles.bioEditTxt}>{profile.bio ? 'Sửa tiểu sử' : 'Thêm tiểu sử'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {(profile.email || profile.phone) ? (
            <View style={styles.contactBox}>
              {profile.email ? (
                <Text style={styles.contactLine}>📧 {profile.email}</Text>
              ) : null}
              {profile.phone ? (
                <Text style={styles.contactLine}>📞 {profile.phone}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {[
            { id: 'posts', label: 'Bài viết' },
            { id: 'photos', label: 'Ảnh' },
            { id: 'videos', label: 'Video' },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabBtn, tab === t.id && styles.tabBtnOn]}
              onPress={() => setTab(t.id as typeof tab)}
            >
              <Text style={[styles.tabTxt, tab === t.id && styles.tabTxtOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'posts' ? (
          postsLoading ? (
            <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 24 }} />
          ) : posts.length === 0 ? (
            <Text style={styles.empty}>Chưa có bài viết.</Text>
          ) : (
            posts.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.postLink, CrmShadow.sm]}
                onPress={() => navigation.navigate('SocialPost', { id: p.id })}
                activeOpacity={0.92}
              >
                <Text style={styles.postBody} numberOfLines={3}>
                  {p.body || '(không có nội dung)'}
                </Text>
                <Text style={styles.postMeta}>
                  {timeAgo(p.published_at || p.created_at)}
                  {p.like_count ? `  ❤️ ${p.like_count}` : ''}
                  {p.comment_count ? `  💬 ${p.comment_count}` : ''}
                </Text>
              </TouchableOpacity>
            ))
          )
        ) : null}

        {tab !== 'posts' ? (
          mediaLoading ? (
            <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 24 }} />
          ) : media.length === 0 ? (
            <Text style={styles.empty}>{tab === 'photos' ? 'Chưa có ảnh.' : 'Chưa có video.'}</Text>
          ) : (
            <View style={styles.mediaGrid}>
              {media.map((m, idx) => {
                const url = resolveAttachmentUrl(m.url || m.file_url || null);
                if (!url) return null;
                const isVideo =
                  m.kind === 'video' || String(m.mime_type || '').startsWith('video/');
                return (
                  <TouchableOpacity
                    key={`${m.id || ''}-${idx}`}
                    style={styles.mediaCell}
                    activeOpacity={0.88}
                    onPress={() => openMediaViewer(idx)}
                  >
                    <Image source={{ uri: url }} style={styles.mediaImg} resizeMode="cover" />
                    {isVideo ? (
                      <View style={styles.videoOverlay}>
                        <Text style={styles.videoOverlayTxt}>▶</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : null}
      </ScrollView>

      <SocialMediaViewer
        visible={viewerOpen}
        items={viewerItems}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />

      <Modal visible={bioOpen} animationType="slide" transparent onRequestClose={() => !bioBusy && setBioOpen(false)}>
        <Pressable style={styles.modalBack} onPress={() => !bioBusy && setBioOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Tiểu sử</Text>
            <TextInput
              style={styles.bioInput}
              multiline
              maxLength={500}
              placeholder="Vài dòng giới thiệu (tối đa 500 ký tự)"
              placeholderTextColor={CrmColors.gray400}
              value={bioDraft}
              onChangeText={setBioDraft}
              autoFocus
            />
            <Text style={styles.bioLen}>{bioDraft.length}/500</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => !bioBusy && setBioOpen(false)} disabled={bioBusy}>
                <Text style={styles.modalCancel}>Hủy</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={[styles.modalSave, bioBusy && { opacity: 0.5 }]}
                onPress={() => void saveBio()}
                disabled={bioBusy}
              >
                <Text style={styles.modalSaveTxt}>{bioBusy ? 'Đang lưu…' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 30 },
  coverWrap: { position: 'relative' },
  cover: { width: '100%', height: 160, backgroundColor: CrmColors.gray200 },
  coverFallback: { backgroundColor: CrmColors.blue100 },
  coverActions: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: 6,
  },
  coverBtn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: CrmRadii.md,
  },
  coverBtnAlt: { backgroundColor: 'rgba(15,23,42,0.7)' },
  coverBtnTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray900 },
  headerCard: {
    backgroundColor: CrmColors.white,
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 14,
    marginHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray200,
  },
  avatarRow: { flexDirection: 'row', gap: 14, marginTop: -34, alignItems: 'flex-end' },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: CrmColors.gray200,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: CrmColors.blue600 },
  avatarInit: { color: '#fff', fontWeight: '800', fontSize: 32 },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarEditTxt: { color: '#fff', fontSize: 14 },
  name: { fontSize: 20, fontWeight: '800', color: CrmColors.gray900 },
  subtitle: { fontSize: 13, color: CrmColors.gray600, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 14, marginTop: 14 },
  statBox: {
    backgroundColor: CrmColors.gray50,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  statNum: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  statLabel: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  bioBox: { marginTop: 14 },
  bioLabel: { fontSize: 12, fontWeight: '700', color: CrmColors.gray500, marginBottom: 4 },
  bioTxt: { fontSize: 14, color: CrmColors.gray800, lineHeight: 20 },
  bioEditBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  bioEditTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.blue700 },
  contactBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray100,
    gap: 4,
  },
  contactLine: { fontSize: 13, color: CrmColors.gray700 },
  tabRow: {
    flexDirection: 'row',
    gap: 0,
    paddingHorizontal: 8,
    backgroundColor: CrmColors.white,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray200,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabBtnOn: { borderBottomWidth: 2, borderBottomColor: CrmColors.blue600 },
  tabTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray500 },
  tabTxtOn: { color: CrmColors.blue700 },
  empty: { textAlign: 'center', color: CrmColors.gray400, paddingVertical: 36, fontSize: 13 },
  postLink: {
    backgroundColor: CrmColors.white,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  postBody: { fontSize: 14, color: CrmColors.gray900, lineHeight: 20 },
  postMeta: { fontSize: 11, color: CrmColors.gray500, marginTop: 6 },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  mediaCell: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 3,
    position: 'relative',
  },
  mediaImg: { width: '100%', height: '100%', backgroundColor: CrmColors.gray200, borderRadius: 6 },
  videoOverlay: {
    position: 'absolute',
    inset: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlayTxt: {
    fontSize: 26,
    color: '#fff',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  modalBack: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900, marginBottom: 12 },
  bioInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 10,
    fontSize: 14,
    color: CrmColors.gray900,
    textAlignVertical: 'top',
  },
  bioLen: { textAlign: 'right', fontSize: 11, color: CrmColors.gray500, marginTop: 4 },
  modalRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  modalCancel: { fontSize: 14, fontWeight: '700', color: CrmColors.gray600, paddingVertical: 8, paddingHorizontal: 8 },
  modalSave: {
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  modalSaveTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  errTxt: { color: '#b91c1c', fontSize: 14, marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: CrmColors.blue600,
    borderRadius: CrmRadii.md,
  },
  retryTxt: { color: '#fff', fontWeight: '700' },
});
