import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { MoreStackParamList } from '../navigation/types';
import type { SocialPost, SocialComment } from '../types/internalSocial';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { resolveAttachmentUrl } from '../lib/resolveMediaUrl';
import SocialPostMedia from '../components/SocialPostMedia';
import { fileAttachmentsFromPost } from '../lib/socialMedia';

type Props = NativeStackScreenProps<MoreStackParamList, 'SocialPost'>;

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
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return '';
  }
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

export default function SocialPostScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const isAdmin = user?.role === 'admin';

  const [post, setPost] = useState<SocialPost | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.get<{ post: SocialPost }>(`/internal-social/posts/${id}`),
        api.get<{ comments: SocialComment[] }>(`/internal-social/posts/${id}/comments`).catch(() => ({
          data: { comments: [] as SocialComment[] },
        })),
      ]);
      setPost(pRes.data?.post || null);
      setComments(Array.isArray(cRes.data?.comments) ? cRes.data.comments : []);
    } catch (e: unknown) {
      setError(formatApiError(e) || 'Không tải được bài viết');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleLike = async () => {
    if (!post) return;
    const wasLiked = !!post.liked_by_me;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    setPost({ ...post, liked_by_me: nextLiked, like_count: Math.max(0, (post.like_count || 0) + delta) });
    try {
      await api.post(`/internal-social/posts/${post.id}/like`, { reaction: 'like' });
    } catch (e: unknown) {
      setPost((p) =>
        p ? { ...p, liked_by_me: wasLiked, like_count: Math.max(0, (p.like_count || 0) - delta) } : p,
      );
      Alert.alert('Lỗi', formatApiError(e) || 'Không cập nhật được lượt thích');
    }
  };

  const submitComment = async () => {
    const body = text.trim();
    if (!body || !post) return;
    setSending(true);
    try {
      const { data } = await api.post<{ comment: SocialComment }>(
        `/internal-social/posts/${post.id}/comments`,
        { body },
      );
      const created = data?.comment;
      if (created) {
        setComments((arr) => [...arr, created]);
        setPost((p) => (p ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
      }
      setText('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: unknown) {
      Alert.alert('Lỗi', formatApiError(e) || 'Không gửi được bình luận');
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = () => {
    if (!post) return;
    Alert.alert('Xóa bài', 'Xóa bài viết này? Thao tác không thể hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/internal-social/posts/${post.id}`);
            navigation.goBack();
          } catch (e: unknown) {
            Alert.alert('Lỗi', formatApiError(e) || 'Không xóa được bài');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.errTxt}>{error || 'Không tìm thấy bài viết'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryTxt}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canDelete = isAdmin || String(post.author_id) === myId;
  const fileAtts = fileAttachmentsFromPost(post);
  const openAuthor = () => {
    if (post.author?.id) {
      navigation.navigate('SocialProfile', { userId: post.author.id });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, CrmShadow.card]}>
          <View style={styles.cardHead}>
            <TouchableOpacity onPress={openAuthor} activeOpacity={0.7}>
              <Avatar uri={post.author?.avatar} name={post.author?.full_name} size={40} />
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={openAuthor} activeOpacity={0.7}>
              <Text style={styles.authorName}>{post.author?.full_name || 'Người dùng'}</Text>
              <Text style={styles.metaTime}>{timeAgo(post.published_at || post.created_at)}</Text>
            </TouchableOpacity>
            {canDelete ? (
              <TouchableOpacity onPress={confirmDelete} hitSlop={8}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

          <SocialPostMedia post={post} />

          {post.link_url ? (
            <TouchableOpacity
              style={styles.linkBox}
              onPress={() => post.link_url && void Linking.openURL(post.link_url)}
              activeOpacity={0.85}
            >
              <Text style={styles.linkTitle}>🔗 {post.link_title || post.link_url}</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>
                {post.link_url}
              </Text>
            </TouchableOpacity>
          ) : null}

          {fileAtts.length > 0 ? (
            <View style={styles.attList}>
              {fileAtts.map((a) => {
                const url = resolveAttachmentUrl(a.file_url);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.attRow}
                    onPress={() => url && void Linking.openURL(url)}
                  >
                    <Text style={styles.attIcon}>📎</Text>
                    <Text style={styles.attName} numberOfLines={2}>
                      {a.file_name || 'Tệp đính kèm'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <Text style={styles.statTxt}>{post.like_count ? `❤️ ${post.like_count}` : ''}</Text>
            <Text style={styles.statTxt}>
              {post.comment_count ? `💬 ${post.comment_count}` : '💬 0'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.likeBtn, post.liked_by_me && styles.likeBtnOn]}
            onPress={() => void toggleLike()}
            activeOpacity={0.85}
          >
            <Text style={[styles.likeTxt, post.liked_by_me && styles.likeTxtOn]}>
              {post.liked_by_me ? '❤️ Đã thích' : '🤍 Thích'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.commentsHead}>Bình luận ({comments.length})</Text>
        {comments.length === 0 ? (
          <Text style={styles.empty}>Chưa có bình luận. Bắt đầu trò chuyện nào!</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Avatar uri={c.author?.avatar} name={c.author?.full_name} size={32} />
              <View style={styles.commentBubble}>
                <Text style={styles.commentName}>{c.author?.full_name || 'Người dùng'}</Text>
                <Text style={styles.commentBody}>{c.body}</Text>
                <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <Avatar uri={user?.avatar} name={user?.full_name || user?.fullName} size={32} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Viết bình luận…"
          placeholderTextColor={CrmColors.gray400}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          onPress={() => void submitComment()}
          disabled={!text.trim() || sending}
        >
          <Text style={styles.sendTxt}>{sending ? '…' : 'Gửi'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollPad: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  authorName: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  metaTime: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  deleteIcon: { fontSize: 18 },
  body: { fontSize: 15, color: CrmColors.gray900, lineHeight: 22, marginBottom: 10 },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    marginBottom: 10,
  },
  linkBox: {
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginBottom: 10,
  },
  linkTitle: { fontSize: 13, fontWeight: '600', color: CrmColors.gray900 },
  linkUrl: { fontSize: 11, color: CrmColors.blue700, marginTop: 4 },
  attList: { gap: 6, marginBottom: 10 },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  attIcon: { fontSize: 14 },
  attName: { flex: 1, fontSize: 13, color: CrmColors.gray800 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  statTxt: { fontSize: 12, color: CrmColors.gray500 },
  likeBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
  },
  likeBtnOn: { backgroundColor: '#fee2e2' },
  likeTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray700 },
  likeTxtOn: { color: '#b91c1c' },
  commentsHead: { fontSize: 14, fontWeight: '700', color: CrmColors.gray700, marginBottom: 8, marginTop: 4 },
  empty: { fontSize: 13, color: CrmColors.gray400, textAlign: 'center', paddingVertical: 24 },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  commentBubble: {
    flex: 1,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 10,
  },
  commentName: { fontSize: 13, fontWeight: '700', color: CrmColors.gray900 },
  commentBody: { fontSize: 14, color: CrmColors.gray800, marginTop: 4, lineHeight: 20 },
  commentTime: { fontSize: 11, color: CrmColors.gray400, marginTop: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CrmColors.gray50,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CrmColors.blue600,
    borderRadius: CrmRadii.md,
  },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  errTxt: { color: '#b91c1c', fontSize: 14, marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: CrmColors.blue600,
    borderRadius: CrmRadii.md,
  },
  retryTxt: { color: '#fff', fontWeight: '700' },
});
