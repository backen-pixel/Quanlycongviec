import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { api, formatApiError, postMultipart } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import type { SocialPost, SocialFeedResponse } from '../types/internalSocial';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { resolveAttachmentUrl } from '../lib/resolveMediaUrl';
import SocialPostMedia from '../components/SocialPostMedia';
import { fileAttachmentsFromPost } from '../lib/socialMedia';

type Props = NativeStackScreenProps<MoreStackParamList, 'SocialFeed'>;

const PAGE_LIMIT = 12;
const ADMIN_COMPANY_STORAGE_KEY = 'internal_social_filter_company_id';

type CompanyOption = { id: string; name?: string | null; short_name?: string | null };

function isSystemAdminUser(u: { role?: string; company_id?: string | null } | null | undefined): boolean {
  if (!u) return false;
  if (String(u.role || '').toLowerCase() !== 'admin') return false;
  const cid = u.company_id == null ? '' : String(u.company_id).trim();
  return cid.length === 0;
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

function getInitial(name?: string | null): string {
  if (!name) return '?';
  const s = String(name).trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  const last = parts[parts.length - 1] || s;
  return last.slice(0, 1).toUpperCase();
}

function Avatar({ uri, name, size = 36 }: { uri?: string | null; name?: string | null; size?: number }) {
  const url = resolveAttachmentUrl(uri || null);
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: CrmColors.blue600,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{getInitial(name)}</Text>
    </View>
  );
}

function PostCard({
  post,
  onLike,
  onOpen,
  onOpenProfile,
}: {
  post: SocialPost;
  onLike: () => void;
  onOpen: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const fileAtts = fileAttachmentsFromPost(post);

  return (
    <View style={[styles.card, CrmShadow.card]}>
      <View style={styles.cardHead}>
        <TouchableOpacity
          onPress={() => post.author?.id && onOpenProfile(post.author.id)}
          activeOpacity={0.7}
        >
          <Avatar uri={post.author?.avatar} name={post.author?.full_name} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, minWidth: 0 }}
          onPress={() => post.author?.id && onOpenProfile(post.author.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author?.full_name || 'Người dùng'}
          </Text>
          <Text style={styles.metaTime}>
            {timeAgo(post.published_at || post.created_at)}
            {post.visibility && post.visibility !== 'company' ? ' · 🔒' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={onOpen}>
        {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      </TouchableOpacity>

      <SocialPostMedia post={post} />

      {post.link_url ? (
        <TouchableOpacity
          style={styles.linkBox}
          onPress={() => void Linking.openURL(post.link_url!)}
          activeOpacity={0.85}
        >
          <Text style={styles.linkTitle} numberOfLines={2}>
            🔗 {post.link_title || post.link_url}
          </Text>
          <Text style={styles.linkUrl} numberOfLines={1}>
            {post.link_url}
          </Text>
        </TouchableOpacity>
      ) : null}

      {fileAtts.length > 0 ? (
        <View style={styles.attList}>
          {fileAtts.slice(0, 4).map((a) => {
            const url = resolveAttachmentUrl(a.file_url);
            return (
              <TouchableOpacity
                key={a.id}
                style={styles.attRow}
                onPress={() => url && void Linking.openURL(url)}
              >
                <Text style={styles.attIcon}>📎</Text>
                <Text style={styles.attName} numberOfLines={1}>
                  {a.file_name || 'Tệp đính kèm'}
                </Text>
              </TouchableOpacity>
            );
          })}
          {fileAtts.length > 4 ? (
            <Text style={styles.attMore}>+{fileAtts.length - 4} tệp khác</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <Text style={styles.statTxt}>
          {post.like_count ? `❤️ ${post.like_count}` : ''}
        </Text>
        <Text style={styles.statTxt}>
          {post.comment_count ? `💬 ${post.comment_count} bình luận` : ''}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actBtn, post.liked_by_me && styles.actBtnOn]}
          onPress={onLike}
          activeOpacity={0.85}
        >
          <Text style={[styles.actTxt, post.liked_by_me && styles.actTxtOn]}>
            {post.liked_by_me ? '❤️ Đã thích' : '🤍 Thích'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actBtn} onPress={onOpen} activeOpacity={0.85}>
          <Text style={styles.actTxt}>💬 Bình luận</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SocialFeedScreen({ navigation }: Props) {
  const { user } = useAuth();
  const isSystemAdmin = useMemo(() => isSystemAdminUser(user), [user]);

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const nextOffsetRef = useRef<number | null>(0);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBody, setComposeBody] = useState('');
  const [composeImage, setComposeImage] = useState<{ uri: string; name?: string; mime?: string } | null>(null);
  const [composeBusy, setComposeBusy] = useState(false);

  // Admin hệ thống: chọn công ty xem bảng tin (lưu AsyncStorage, đồng bộ web localStorage key)
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [adminCompanyId, setAdminCompanyId] = useState<string | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);

  // Khi admin: load danh sách công ty + đọc lựa chọn đã lưu.
  useEffect(() => {
    if (!isSystemAdmin) {
      setCompanies([]);
      setAdminCompanyId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(ADMIN_COMPANY_STORAGE_KEY);
        if (!cancelled && stored && stored.trim()) setAdminCompanyId(stored.trim());
      } catch {
        /* ignore */
      }
      try {
        const { data } = await api.get<{ companies?: CompanyOption[] }>('/companies', {
          params: { for_module: 'crm' },
        });
        if (!cancelled) setCompanies(Array.isArray(data?.companies) ? data.companies : []);
      } catch {
        if (!cancelled) setCompanies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSystemAdmin]);

  const persistAdminCompany = useCallback(async (id: string | null) => {
    try {
      if (id) await AsyncStorage.setItem(ADMIN_COMPANY_STORAGE_KEY, id);
      else await AsyncStorage.removeItem(ADMIN_COMPANY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  /** Công ty đang xem (admin: do chọn; NV: gắn theo user — backend tự suy ra). */
  const effectiveCompanyId = useMemo(() => {
    if (isSystemAdmin) return adminCompanyId || null;
    return user?.company_id ? String(user.company_id) : null;
  }, [isSystemAdmin, adminCompanyId, user?.company_id]);

  const selectedCompanyName = useMemo(() => {
    if (!isSystemAdmin || !adminCompanyId) return null;
    const found = companies.find((c) => String(c.id) === String(adminCompanyId));
    return found?.short_name || found?.name || null;
  }, [isSystemAdmin, adminCompanyId, companies]);

  const loadPosts = useCallback(
    async (reset: boolean) => {
      setError('');
      // Admin chưa chọn công ty → không gọi API (server sẽ trả 400). Hiện hướng dẫn chọn.
      if (isSystemAdmin && !adminCompanyId) {
        setPosts([]);
        nextOffsetRef.current = null;
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }
      if (reset) {
        setRefreshing(true);
        nextOffsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }
      try {
        const offset = reset ? 0 : nextOffsetRef.current ?? 0;
        const params: Record<string, string | number> = { limit: PAGE_LIMIT, offset };
        if (isSystemAdmin && adminCompanyId) params.company_id = adminCompanyId;
        const { data } = await api.get<SocialFeedResponse>('/internal-social/posts', { params });
        const page = Array.isArray(data?.posts) ? data.posts : [];
        setPosts((prev) => (reset ? page : [...prev, ...page]));
        nextOffsetRef.current = typeof data?.next_offset === 'number' ? data.next_offset : null;
        setHasMore(!!data?.has_more);
      } catch (e: unknown) {
        setError(formatApiError(e) || 'Không tải được bảng tin');
      } finally {
        if (reset) {
          setLoading(false);
          setRefreshing(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [isSystemAdmin, adminCompanyId],
  );

  useFocusEffect(
    useCallback(() => {
      // Khi mở màn / quay lại từ SocialPost / SocialProfile (có thể đã thay đổi comment / like), refresh nhẹ.
      void loadPosts(true);
      return () => undefined;
    }, [loadPosts]),
  );

  // Khi admin đổi công ty: tải lại danh sách bài.
  useEffect(() => {
    if (!isSystemAdmin) return;
    void loadPosts(true);
    // loadPosts đã phụ thuộc adminCompanyId; effect chạy lại khi id đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminCompanyId, isSystemAdmin]);

  const onLoadMore = () => {
    if (loadingMore || refreshing || !hasMore) return;
    void loadPosts(false);
  };

  const toggleLike = useCallback(async (post: SocialPost) => {
    const wasLiked = !!post.liked_by_me;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: nextLiked, like_count: Math.max(0, (p.like_count || 0) + delta) }
          : p,
      ),
    );
    try {
      await api.post(`/internal-social/posts/${post.id}/like`, { reaction: 'like' });
    } catch (e: unknown) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: wasLiked, like_count: Math.max(0, (p.like_count || 0) - delta) }
            : p,
        ),
      );
      Alert.alert('Lỗi', formatApiError(e) || 'Không cập nhật được lượt thích');
    }
  }, []);

  const pickComposeImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setComposeImage({ uri: a.uri, name: a.fileName || 'image.jpg', mime: a.mimeType || 'image/jpeg' });
    } catch {
      Alert.alert('Lỗi', 'Không chọn được ảnh');
    }
  };

  const submitCompose = async () => {
    const body = composeBody.trim();
    if (!body && !composeImage) {
      Alert.alert('Bảng tin', 'Nhập nội dung hoặc chọn ảnh trước khi đăng');
      return;
    }
    if (isSystemAdmin && !adminCompanyId) {
      Alert.alert('Chọn công ty', 'Bạn là admin hệ thống — vui lòng chọn công ty trước khi đăng bài.');
      return;
    }
    setComposeBusy(true);
    try {
      let image_url: string | null = null;
      if (composeImage) {
        const form = new FormData();
        // @ts-expect-error — React Native FormData file shape.
        form.append('file', { uri: composeImage.uri, name: composeImage.name, type: composeImage.mime });
        const { data } = await postMultipart<{ file_url?: string; url?: string }>(
          '/upload/internal-social',
          form,
        );
        image_url = data?.file_url || data?.url || null;
      }
      const payload: Record<string, unknown> = {
        body: body || '',
        image_url: image_url || undefined,
        visibility: 'company',
      };
      if (isSystemAdmin && adminCompanyId) payload.company_id = adminCompanyId;
      const { data: created } = await api.post<{ post: SocialPost }>('/internal-social/posts', payload);
      if (created?.post) {
        setPosts((prev) => [created.post, ...prev]);
      }
      setComposeBody('');
      setComposeImage(null);
      setComposeOpen(false);
    } catch (e: unknown) {
      Alert.alert('Lỗi', formatApiError(e) || 'Không đăng được bài');
    } finally {
      setComposeBusy(false);
    }
  };

  const headerInline = useMemo(
    () => (
      <View>
        {isSystemAdmin ? (
          <TouchableOpacity
            style={[styles.companyPickerBtn, CrmShadow.sm]}
            onPress={() => setCompanyPickerOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.companyPickerLabel}>Công ty bảng tin</Text>
            <View style={styles.companyPickerValueRow}>
              <Text
                style={[
                  styles.companyPickerValue,
                  !selectedCompanyName && styles.companyPickerValueMuted,
                ]}
                numberOfLines={1}
              >
                {selectedCompanyName || 'Chọn công ty để xem bảng tin…'}
              </Text>
              <Text style={styles.companyPickerCaret}>▾</Text>
            </View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.composeBox, CrmShadow.sm]}
          onPress={() => setComposeOpen(true)}
          activeOpacity={0.9}
        >
          <Avatar uri={user?.avatar} name={user?.full_name || user?.fullName} size={36} />
          <Text style={styles.composePlaceholder}>Chia sẻ điều gì đó với nội bộ…</Text>
          <Text style={styles.composeIcon}>📸</Text>
        </TouchableOpacity>
      </View>
    ),
    [isSystemAdmin, selectedCompanyName, user?.avatar, user?.full_name, user?.fullName],
  );

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {error && posts.length > 0 ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerTxt} numberOfLines={2}>
            {error}
          </Text>
          <TouchableOpacity onPress={() => void loadPosts(true)}>
            <Text style={styles.errorBannerLink}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={headerInline}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onLike={() => void toggleLike(item)}
            onOpen={() => navigation.navigate('SocialPost', { id: item.id })}
            onOpenProfile={(uid) => navigation.navigate('SocialProfile', { userId: uid })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadPosts(true)} tintColor={CrmColors.blue600} />
        }
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          error ? (
            <View style={styles.errBox}>
              <Text style={styles.errTxt}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadPosts(true)}>
                <Text style={styles.retryTxt}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : isSystemAdmin && !adminCompanyId ? (
            <View style={styles.errBox}>
              <Text style={styles.empty}>
                Bạn là admin hệ thống — chọn công ty để xem bảng tin.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setCompanyPickerOpen(true)}
              >
                <Text style={styles.retryTxt}>Chọn công ty</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.empty}>Chưa có bài đăng nào.</Text>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 18 }} color={CrmColors.blue600} />
          ) : null
        }
      />

      <Modal
        visible={companyPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCompanyPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCompanyPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Chọn công ty bảng tin</Text>
            <Text style={styles.modalSub}>
              Admin hệ thống cần chọn 1 công ty để xem & đăng bài.
            </Text>
            {companies.length === 0 ? (
              <Text style={styles.empty}>Đang tải danh sách công ty…</Text>
            ) : (
              <FlatList
                data={companies}
                keyExtractor={(c) => String(c.id)}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const selected = String(item.id) === String(adminCompanyId || '');
                  return (
                    <TouchableOpacity
                      style={[styles.companyRow, selected && styles.companyRowOn]}
                      onPress={() => {
                        const next = String(item.id);
                        setAdminCompanyId(next);
                        void persistAdminCompany(next);
                        setCompanyPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[styles.companyRowName, selected && styles.companyRowNameOn]}
                        numberOfLines={2}
                      >
                        {item.short_name || item.name || `Công ty ${item.id}`}
                      </Text>
                      {selected ? <Text style={styles.companyRowCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => setCompanyPickerOpen(false)}
              >
                <Text style={styles.btnGhostTxt}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={composeOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !composeBusy && setComposeOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !composeBusy && setComposeOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Đăng bài</Text>
            <Text style={styles.modalSub}>Phạm vi: toàn công ty</Text>
            <TextInput
              style={styles.composeInput}
              multiline
              placeholder="Bạn đang nghĩ gì?"
              placeholderTextColor={CrmColors.gray400}
              value={composeBody}
              onChangeText={setComposeBody}
              autoFocus
            />
            {composeImage ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: composeImage.uri }} style={styles.previewImg} />
                <TouchableOpacity style={styles.previewRm} onPress={() => setComposeImage(null)}>
                  <Text style={styles.previewRmTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => void pickComposeImage()} disabled={composeBusy}>
                <Text style={styles.btnGhostTxt}>📸 Ảnh</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => !composeBusy && setComposeOpen(false)}
                disabled={composeBusy}
              >
                <Text style={styles.btnGhostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, composeBusy && { opacity: 0.6 }]}
                onPress={() => void submitCompose()}
                disabled={composeBusy}
              >
                <Text style={styles.btnPrimaryTxt}>{composeBusy ? 'Đang đăng…' : 'Đăng'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  listPad: { padding: 12, paddingBottom: 40 },
  composeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  composePlaceholder: { flex: 1, fontSize: 14, color: CrmColors.gray500 },
  composeIcon: { fontSize: 20 },
  companyPickerBtn: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  companyPickerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: CrmColors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  companyPickerValueRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyPickerValue: { flex: 1, fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  companyPickerValueMuted: { color: CrmColors.gray400, fontWeight: '600' },
  companyPickerCaret: { fontSize: 14, color: CrmColors.gray500 },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
    marginBottom: 6,
  },
  companyRowOn: { borderColor: CrmColors.blue600, backgroundColor: '#eff6ff' },
  companyRowName: { flex: 1, fontSize: 14, fontWeight: '600', color: CrmColors.gray800 },
  companyRowNameOn: { color: CrmColors.blue700, fontWeight: '700' },
  companyRowCheck: { fontSize: 16, color: CrmColors.blue600, fontWeight: '800' },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  authorName: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  metaTime: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  body: { fontSize: 14, color: CrmColors.gray900, lineHeight: 20, marginBottom: 8 },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    marginBottom: 8,
  },
  linkBox: {
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginBottom: 8,
  },
  linkTitle: { fontSize: 13, fontWeight: '600', color: CrmColors.gray900 },
  linkUrl: { fontSize: 11, color: CrmColors.blue700, marginTop: 4 },
  attList: { gap: 6, marginBottom: 8 },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  attIcon: { fontSize: 14 },
  attName: { flex: 1, fontSize: 12, color: CrmColors.gray700 },
  attMore: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  statTxt: { fontSize: 12, color: CrmColors.gray500 },
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  actBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
  },
  actBtnOn: { backgroundColor: '#fee2e2' },
  actTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray700 },
  actTxtOn: { color: '#b91c1c' },
  empty: { textAlign: 'center', color: CrmColors.gray400, paddingVertical: 40, fontSize: 14 },
  errBox: { alignItems: 'center', paddingVertical: 40 },
  errTxt: { color: '#b91c1c', fontSize: 14, marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: CrmColors.blue600,
    borderRadius: CrmRadii.md,
  },
  retryTxt: { color: '#fff', fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorBannerTxt: { flex: 1, color: '#991b1b', fontSize: 12 },
  errorBannerLink: { color: CrmColors.blue700, fontWeight: '700', fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  modalSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, marginBottom: 14 },
  composeInput: {
    minHeight: 120,
    fontSize: 15,
    color: CrmColors.gray900,
    textAlignVertical: 'top',
    paddingHorizontal: 4,
  },
  previewWrap: { marginTop: 10, position: 'relative' },
  previewImg: { width: '100%', height: 180, borderRadius: CrmRadii.md, backgroundColor: CrmColors.gray100 },
  previewRm: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRmTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 12 },
  btnGhostTxt: { fontSize: 14, fontWeight: '700', color: CrmColors.gray700 },
  btnPrimary: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: CrmRadii.md,
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
