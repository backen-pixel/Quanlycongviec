import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchThreadComments,
  postThreadComment,
  resolveCommentSource,
  toggleThreadCommentReaction,
} from '../../lib/commentApi';
import {
  fileKindColor,
  humanFileSize,
  isCommentImage,
  uploadCommentFiles,
  commentAttachmentHref,
  type CommentAttachment,
} from '../../lib/commentAttachments';
import { useFileDownload } from '../../hooks/useFileDownload';
import DownloadProgressModal from '../DownloadProgressModal';
import {
  applyCommentMentionPick,
  buildCommentMentionPickerItems,
  COMMENT_MENTION_ALL_LABEL,
  mapLeadMembersToMentionMembers,
  resolveCommentMentionIds,
  type CommentMentionMember,
} from '../../lib/commentMentions';
import {
  avatarColor,
  COMMENT_REACTION_EMOJI,
  extractSystemFileLink,
  flattenCommentTree,
  formatCommentTime,
  groupCommentsByParent,
  isImageFileName,
  isSystemComment,
  parseSystemCommentBody,
  reactionTotal,
  userInitials,
} from '../../lib/commentUtils';
import { fetchLeadMembers } from '../../lib/projectDetailApi';
import type { ProjectComment } from '../../lib/productionApi';
import { resolveMediaUrl } from '../../lib/mediaUtils';
import { HIT_TARGET, Radii, Spacing } from '../../theme';
import CommentAttachmentsBlock from '../CommentAttachmentsBlock';
import ImageGalleryLightbox, { type GalleryImage } from '../ImageGalleryLightbox';
import TapHighlight from '../TapHighlight';

import SpinningLoader from '../SpinningLoader';
type SortMode = 'newest' | 'oldest';
const REPLY_DEPTH_STEP = 18;

type Props = {
  projectId: string;
  dealId?: string | null;
  authorTagUserId?: string | null;
  onCountChange?: (count: number) => void;
};

export default function ProjectCommentsTab({
  projectId,
  dealId,
  authorTagUserId,
  onCountChange,
}: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { subscribeSync } = useNotifications();
  const { state: dl, download, close: closeDownload } = useFileDownload();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const onCountRef = useRef(onCountChange);
  onCountRef.current = onCountChange;
  const pickedMentionIdsRef = useRef<Set<string>>(new Set());

  const source = useMemo(
    () => resolveCommentSource(projectId, dealId),
    [projectId, dealId],
  );
  const myId = String(user?.id || user?.userId || '');

  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [members, setMembers] = useState<CommentMentionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortMode>('newest');
  const [body, setBody] = useState('');
  const [cursor, setCursor] = useState(0);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<CommentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [err, setErr] = useState('');

  const mentionState = useMemo(
    () => buildCommentMentionPickerItems(body, cursor, members, myId),
    [body, cursor, members, myId],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, minHeight: 320 },
        sortRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sortLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
        sortBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        sortBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
        list: { flex: 1 },
        listContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, paddingBottom: 8 },
        emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
        emptyText: { color: colors.textMuted, fontSize: 14 },
        emptyHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
        commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14 },
        systemRow: { alignItems: 'center', gap: 6, marginBottom: 14 },
        systemPill: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          maxWidth: '92%',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: Radii.full,
          backgroundColor: colors.cardAlt,
        },
        systemText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
        systemLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
        systemStrong: { color: colors.text, fontSize: 12, fontWeight: '700' },
        systemTime: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
        systemImageWrap: { borderRadius: Radii.md, overflow: 'hidden' },
        systemImage: {
          width: 240,
          maxWidth: '100%',
          height: 160,
          borderRadius: Radii.md,
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
        },
        systemFileBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          maxWidth: '90%',
        },
        systemFileLabel: { color: colors.primary, fontSize: 12, fontWeight: '700', maxWidth: 200 },
        threadGutter: {
          width: 12,
          alignSelf: 'stretch',
          alignItems: 'center',
          marginRight: 2,
          paddingVertical: 6,
        },
        threadLine: {
          width: 2,
          flex: 1,
          borderRadius: 1,
          backgroundColor: colors.borderStrong,
          minHeight: 20,
        },
        threadLineActive: { width: 3, backgroundColor: colors.primary },
        avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
        avatarText: { color: colors.white, fontSize: 12, fontWeight: '800' },
        avatarImg: { width: 34, height: 34, borderRadius: 17 },
        commentBody: { flex: 1, minWidth: 0 },
        bubble: {
          alignSelf: 'flex-start',
          maxWidth: '100%',
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.card,
        },
        bubbleAuthor: { backgroundColor: colors.primarySoft, borderColor: colors.primary + '44' },
        bubbleReplyOther: {
          backgroundColor: colors.cardAlt,
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          borderColor: colors.primary + '55',
        },
        nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 4 },
        name: { color: colors.text, fontSize: 13, fontWeight: '800' },
        mention: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
        mentionHighlight: {
          color: colors.primary,
          fontSize: 12,
          fontWeight: '800',
          backgroundColor: colors.primarySoft,
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: Radii.full,
          overflow: 'hidden',
        },
        authorTag: {
          color: colors.primary,
          fontSize: 11,
          fontWeight: '700',
          backgroundColor: colors.primarySoft,
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: Radii.full,
          overflow: 'hidden',
        },
        content: { color: colors.text, fontSize: 14, lineHeight: 20 },
        mentionToken: { color: colors.primary, fontWeight: '800' },
        metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
        timeText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        actionPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: Radii.full,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.cardAlt,
        },
        actionPillActive: { borderColor: colors.primary + '88', backgroundColor: colors.primarySoft },
        actionText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
        actionTextActive: { color: colors.primary },
        actionReactionEmoji: { fontSize: 15, lineHeight: 17 },
        reactionPicker: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: Radii.full,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          elevation: 4,
        },
        emojiBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.cardAlt,
        },
        emojiBtnActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
        replyBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.cardAlt,
        },
        replyText: { flex: 1, color: colors.textMuted, fontSize: 13 },
        replyName: { color: colors.text, fontWeight: '700' },
        mentionPicker: {
          maxHeight: 200,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        mentionPickerTitle: {
          paddingHorizontal: Spacing.md,
          paddingTop: 8,
          paddingBottom: 4,
          color: colors.textFaint,
          fontSize: 11,
          fontWeight: '700',
          textTransform: 'uppercase',
        },
        mentionItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: Spacing.md,
          paddingVertical: 10,
        },
        mentionAvatar: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        mentionAvatarTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
        mentionName: { color: colors.text, fontSize: 14, fontWeight: '700' },
        mentionSub: { color: colors.textFaint, fontSize: 12 },
        pendingRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: Spacing.md,
          paddingTop: 8,
        },
        pendingChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          maxWidth: '100%',
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        pendingThumb: { width: 28, height: 28, borderRadius: 6 },
        pendingName: { color: colors.text, fontSize: 12, fontWeight: '600', maxWidth: 140 },
        composer: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.sm,
        },
        composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
        iconBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.cardAlt,
        },
        composerInput: {
          flex: 1,
          minHeight: 40,
          maxHeight: 100,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.xl,
          paddingHorizontal: 14,
          paddingVertical: 10,
          fontSize: 14,
          color: colors.text,
        },
        sendBtn: {
          width: HIT_TARGET,
          height: HIT_TARGET,
          borderRadius: HIT_TARGET / 2,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        sendBtnDisabled: { opacity: 0.45 },
        errBox: {
          marginHorizontal: Spacing.md,
          marginBottom: 6,
          padding: 8,
          backgroundColor: colors.dangerSoft,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.danger,
        },
        errText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
      }),
    [colors],
  );

  const loadComments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await fetchThreadComments(source);
      setComments(rows);
      onCountRef.current?.(rows.length);
      setErr('');
    } catch (e) {
      if (!silent) setErr(formatApiError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [source]);

  const loadMembers = useCallback(async () => {
    if (source.kind !== 'lead') {
      setMembers([]);
      return;
    }
    try {
      const rows = await fetchLeadMembers(source.leadId);
      setMembers(mapLeadMembersToMentionMembers(rows));
    } catch {
      setMembers([]);
    }
  }, [source]);

  useEffect(() => {
    void loadComments(false);
    void loadMembers();
  }, [loadComments, loadMembers]);

  useEffect(() => {
    return subscribeSync((evt) => {
      if (source.kind === 'lead') {
        if (evt.type !== 'lead:comment_changed') return;
        if (String(evt.payload.lead_id || '') !== String(source.leadId)) return;
        void loadComments(true);
        return;
      }
      if (evt.type !== 'project:comment_changed') return;
      if (String(evt.payload.project_id || '') !== String(source.projectId)) return;
      void loadComments(true);
    });
  }, [source, loadComments, subscribeSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadComments(true), loadMembers()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadComments, loadMembers]);

  const commentById = useMemo(() => {
    const m = new Map<string, ProjectComment>();
    comments.forEach((c) => m.set(c.id, c));
    return m;
  }, [comments]);

  const flatList = useMemo(() => {
    const grouped = groupCommentsByParent(comments);
    return flattenCommentTree(grouped, sort);
  }, [comments, sort]);

  /** Tất cả ảnh trong thread → lightbox chuyển nhanh giữa các hình. */
  const threadImages: GalleryImage[] = useMemo(() => {
    const out: GalleryImage[] = [];
    const seen = new Set<string>();
    for (const c of comments) {
      if (isSystemComment(c.content)) {
        const link = extractSystemFileLink(c.content);
        if (link && isImageFileName(link.label)) {
          const uri = commentAttachmentHref({
            url: link.url, name: link.label, type: 'image/*', size: 0,
          });
          if (uri && !seen.has(uri)) {
            seen.add(uri);
            out.push({ uri, title: link.label });
          }
        }
      }
      for (const att of c.attachments || []) {
        if (!isCommentImage(att)) continue;
        const uri = commentAttachmentHref(att);
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        out.push({ uri, title: att.name || 'Ảnh' });
      }
    }
    return out;
  }, [comments]);

  const openThreadImage = useCallback((uri: string) => {
    const idx = threadImages.findIndex((x) => x.uri === uri);
    setGalleryIndex(idx >= 0 ? idx : 0);
    setGalleryOpen(true);
  }, [threadImages]);

  const canSubmit = Boolean(body.trim() || pendingFiles.length) && !posting && !uploading;

  const pickMention = (item: ReturnType<typeof buildCommentMentionPickerItems>['items'][number]) => {
    const applied = applyCommentMentionPick(body, cursor, mentionState.start, item);
    if (applied.pickedId) pickedMentionIdsRef.current.add(applied.pickedId);
    if (item.type === 'all') {
      members.forEach((m) => {
        if (String(m.id) !== myId) pickedMentionIdsRef.current.add(m.id);
      });
    }
    setBody(applied.text);
    setCursor(applied.cursor);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps?.({ selection: { start: applied.cursor, end: applied.cursor } });
    });
  };

  const appendUploaded = async (picked: { uri: string; name: string; mime: string }[]) => {
    if (!picked.length) return;
    setUploading(true);
    setErr('');
    try {
      const uploaded = await uploadCommentFiles(picked);
      if (!uploaded.length) throw new Error('Không upload được file');
      setPendingFiles((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const pickDocuments = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });
    if (res.canceled || !res.assets?.length) return;
    await appendUploaded(
      res.assets.map((a) => ({
        uri: a.uri,
        name: a.name || 'file',
        mime: a.mimeType || 'application/octet-stream',
      })),
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    const text = body.trim();
    setPosting(true);
    setErr('');
    try {
      const mentionUserIds =
        source.kind === 'lead'
          ? resolveCommentMentionIds(text, members, {
              excludeUserId: myId,
              pickedIds: [...pickedMentionIdsRef.current],
            })
          : undefined;
      await postThreadComment(source, text, {
        parentId: replyTo?.id ?? null,
        attachments: pendingFiles,
        mentionUserIds,
      });
      setBody('');
      setCursor(0);
      setReplyTo(null);
      setPendingFiles([]);
      pickedMentionIdsRef.current = new Set();
      await loadComments(true);
      setTimeout(() => {
        if (sort === 'oldest') scrollRef.current?.scrollToEnd({ animated: true });
        else scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 120);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setPosting(false);
    }
  };

  const pickReaction = async (comment: ProjectComment, emoji: string) => {
    if (reactionBusy) return;
    setReactionBusy(comment.id);
    try {
      const reactions = await toggleThreadCommentReaction(source, comment.id, emoji);
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, reactions: reactions || c.reactions } : c)),
      );
      setReactionPickerId(null);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setReactionBusy(null);
    }
  };

  const renderContentWithMentions = (text: string) => {
    if (!text) return null;
    if (!members.length) return <Text style={styles.content}>{text}</Text>;
    const parts: React.ReactNode[] = [];
    let i = 0;
    let key = 0;
    const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
    while (i < text.length) {
      if (text[i] === '@') {
        const after = text.slice(i + 1);
        const allMatch = after.match(/^(tất\s*cả|tat\s*ca|all)\b/i);
        if (allMatch) {
          parts.push(
            <Text key={`m-${key++}`} style={styles.mentionToken}>
              @{COMMENT_MENTION_ALL_LABEL}
            </Text>,
          );
          i += 1 + allMatch[0].length;
          continue;
        }
        let matched: CommentMentionMember | null = null;
        for (const mem of sorted) {
          if (
            after.toLowerCase().startsWith(mem.name.toLowerCase())
            && (after.length === mem.name.length || /[\s,.!?;:\n]/.test(after[mem.name.length] || ''))
          ) {
            matched = mem;
            break;
          }
        }
        if (matched) {
          parts.push(
            <Text key={`m-${key++}`} style={styles.mentionToken}>
              @{matched.name}
            </Text>,
          );
          i += 1 + matched.name.length;
          continue;
        }
      }
      let j = i + 1;
      while (j < text.length && text[j] !== '@') j += 1;
      parts.push(<Text key={`t-${key++}`}>{text.slice(i, j)}</Text>);
      i = j;
    }
    return <Text style={styles.content}>{parts}</Text>;
  };

  const openSystemFile = (label: string, url: string) => {
    if (isImageFileName(label)) {
      const uri = commentAttachmentHref({ url, name: label, type: 'image/*', size: 0 });
      if (uri) openThreadImage(uri);
      return;
    }
    // Word/Excel/PPT/PDF… → tải về máy (có thanh tiến độ %)
    if (dl.visible && dl.phase !== 'done' && dl.phase !== 'error') return;
    const href = commentAttachmentHref({ url, name: label, type: '', size: 0 });
    if (!href) return;
    void download({ url: href, name: label, mime: '' });
  };

  const renderSystemBodyText = (text: string) => {
    const segments = parseSystemCommentBody(text);
    if (!segments.length) return <Text style={styles.systemText}>{text}</Text>;
    return (
      <Text style={styles.systemText}>
        {segments.map((seg, idx) => {
          if (seg.kind === 'link') {
            return (
              <Text
                key={idx}
                style={styles.systemLink}
                onPress={() => openSystemFile(seg.label, seg.url)}
              >
                «{seg.label}»
              </Text>
            );
          }
          if (seg.kind === 'strong') {
            return (
              <Text key={idx} style={styles.systemStrong}>
                «{seg.text}»
              </Text>
            );
          }
          return <Text key={idx}>{seg.text}</Text>;
        })}
      </Text>
    );
  };

  const renderSystemComment = (item: ProjectComment) => {
    const bodyText = item.content || '';
    const fileLink = extractSystemFileLink(bodyText);
    const hasImagePreview = Boolean(fileLink && isImageFileName(fileLink.label));
    const previewUri = hasImagePreview && fileLink ? commentAttachmentHref({
      url: fileLink.url, name: fileLink.label, type: 'image/*', size: 0,
    }) : null;
    return (
      <View key={item.id} style={styles.systemRow}>
        <View style={styles.systemPill}>
          {renderSystemBodyText(bodyText)}
          <Text style={styles.systemTime}>{formatCommentTime(item.created_at)}</Text>
        </View>
        {previewUri ? (
          <Pressable
            style={styles.systemImageWrap}
            onPress={() => fileLink && openSystemFile(fileLink.label, fileLink.url)}
          >
            <Image source={{ uri: previewUri }} style={styles.systemImage} resizeMode="cover" />
          </Pressable>
        ) : fileLink && !hasImagePreview ? (
          <Pressable
            style={styles.systemFileBtn}
            onPress={() => openSystemFile(fileLink.label, fileLink.url)}
          >
            <Ionicons name="attach-outline" size={15} color={colors.primary} />
            <Text style={styles.systemFileLabel} numberOfLines={1}>{fileLink.label}</Text>
          </Pressable>
        ) : null}
        {!fileLink ? (
          <CommentAttachmentsBlock attachments={item.attachments} onOpenImage={openThreadImage} />
        ) : null}
      </View>
    );
  };

  const renderComment = (item: ProjectComment, depth: number) => {
    if (depth === 0 && isSystemComment(item.content)) {
      return renderSystemComment(item);
    }
    const userName = item.user?.full_name || 'Thành viên';
    const isAuthor = Boolean(authorTagUserId && String(item.user_id) === String(authorTagUserId));
    const parent = item.parent_id ? commentById.get(String(item.parent_id)) : null;
    const parentName = parent?.user?.full_name;
    const isOtherReply = depth > 0 && (!myId || String(item.user_id) !== myId);
    const totalRx = reactionTotal(item);
    const mineEmoji = item.reactions?.mine;
    const pickerOpen = reactionPickerId === item.id;
    const nestOffset = depth > 0 ? Math.min(depth - 1, 3) * REPLY_DEPTH_STEP : 0;
    const avatarUri = resolveMediaUrl(item.user?.avatar);

    return (
      <View key={item.id} style={[styles.commentRow, nestOffset > 0 && { marginLeft: nestOffset }]}>
        {depth > 0 ? (
          <View style={styles.threadGutter}>
            <View style={[styles.threadLine, isOtherReply && styles.threadLineActive]} />
          </View>
        ) : null}
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: avatarColor(userName) }]}>
            <Text style={styles.avatarText}>{userInitials(userName)}</Text>
          </View>
        )}
        <View style={styles.commentBody}>
          <View style={[styles.bubble, isAuthor && styles.bubbleAuthor, isOtherReply && styles.bubbleReplyOther]}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{userName}</Text>
              {parentName ? (
                <Text style={[styles.mention, isOtherReply && styles.mentionHighlight]}>
                  {isOtherReply ? '↳ Trả lời ' : ''}@{parentName}
                </Text>
              ) : null}
              {isAuthor ? <Text style={styles.authorTag}>Tác giả</Text> : null}
            </View>
            {item.content ? renderContentWithMentions(item.content) : null}
            <CommentAttachmentsBlock attachments={item.attachments} onOpenImage={openThreadImage} />
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.timeText}>{formatCommentTime(item.created_at)}</Text>
            <TapHighlight
              style={[styles.actionPill, (mineEmoji || pickerOpen) && styles.actionPillActive]}
              onPress={() => setReactionPickerId((cur) => (cur === item.id ? null : item.id))}
              disabled={reactionBusy === item.id}
            >
              {mineEmoji ? (
                <Text style={styles.actionReactionEmoji}>{mineEmoji}</Text>
              ) : (
                <Ionicons name="heart-outline" size={13} color={colors.textMuted} />
              )}
              {totalRx > 0 ? (
                <Text style={[styles.actionText, mineEmoji && styles.actionTextActive]}>{totalRx}</Text>
              ) : null}
            </TapHighlight>
            <TapHighlight
              style={styles.actionPill}
              onPress={() => {
                setReactionPickerId(null);
                setReplyTo({ id: item.id, name: userName });
              }}
            >
              <Text style={styles.actionText}>Trả lời</Text>
            </TapHighlight>
          </View>

          {pickerOpen ? (
            <View style={styles.reactionPicker}>
              {COMMENT_REACTION_EMOJI.map((em) => {
                const active = item.reactions?.mine === em;
                return (
                  <TouchableOpacity
                    key={em}
                    style={[styles.emojiBtn, active && styles.emojiBtnActive]}
                    onPress={() => void pickReaction(item, em)}
                    disabled={reactionBusy === item.id}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 18 }}>{em}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const authorLabel = user?.full_name || user?.fullName || user?.email || 'bạn';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>
          {source.kind === 'lead' ? 'Bình luận deal' : 'Bình luận dự án'}
          {comments.length ? ` · ${comments.length}` : ''}
        </Text>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
          activeOpacity={0.8}
        >
          <Text style={styles.sortBtnText}>{sort === 'newest' ? 'Mới nhất' : 'Cũ nhất'}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {err ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{err}</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        onScrollBeginDrag={() => setReactionPickerId(null)}
      >
        {loading ? (
          <View style={styles.emptyWrap}>
            <SpinningLoader color={colors.primary} />
            <Text style={styles.emptyText}>Đang tải bình luận…</Text>
          </View>
        ) : flatList.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={36} color={colors.textFaint} />
            <Text style={styles.emptyText}>Chưa có bình luận</Text>
            <Text style={styles.emptyHint}>
              Viết bình luận, @ nhắc thành viên hoặc đính kèm file — đồng bộ realtime với web.
            </Text>
          </View>
        ) : (
          flatList.map(({ comment, depth }) => renderComment(comment, depth))
        )}
      </ScrollView>

      {mentionState.open ? (
        <ScrollView style={styles.mentionPicker} keyboardShouldPersistTaps="handled">
          <Text style={styles.mentionPickerTitle}>Nhắc thành viên</Text>
          {mentionState.items.map((item) => (
            <Pressable
              key={item.key}
              style={styles.mentionItem}
              onPress={() => pickMention(item)}
            >
              {item.type === 'all' ? (
                <>
                  <View style={[styles.mentionAvatar, { backgroundColor: '#D97706' }]}>
                    <Text style={styles.mentionAvatarTxt}>@</Text>
                  </View>
                  <View>
                    <Text style={styles.mentionName}>@{COMMENT_MENTION_ALL_LABEL}</Text>
                    <Text style={styles.mentionSub}>Mọi thành viên deal</Text>
                  </View>
                </>
              ) : (
                <>
                  {item.mem.avatar ? (
                    <Image
                      source={{ uri: resolveMediaUrl(item.mem.avatar) || undefined }}
                      style={styles.mentionAvatar}
                    />
                  ) : (
                    <View style={[styles.mentionAvatar, { backgroundColor: avatarColor(item.mem.name) }]}>
                      <Text style={styles.mentionAvatarTxt}>{userInitials(item.mem.name)}</Text>
                    </View>
                  )}
                  <Text style={styles.mentionName}>{item.mem.name}</Text>
                </>
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {replyTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyText} numberOfLines={1}>
            Trả lời <Text style={styles.replyName}>{replyTo.name}</Text>
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Hủy</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {pendingFiles.length ? (
        <View style={styles.pendingRow}>
          {pendingFiles.map((f, i) => {
            const visual = fileKindColor(f.name, f.type);
            const uri = isCommentImage(f) ? commentAttachmentHref(f) : null;
            return (
              <View key={`${f.url}-${i}`} style={styles.pendingChip}>
                {uri ? (
                  <Image source={{ uri }} style={styles.pendingThumb} />
                ) : (
                  <View
                    style={[
                      styles.pendingThumb,
                      { backgroundColor: visual.bg, alignItems: 'center', justifyContent: 'center' },
                    ]}
                  >
                    <Text style={{ color: visual.fg, fontSize: 9, fontWeight: '800' }}>
                      {visual.label}
                    </Text>
                  </View>
                )}
                <Text style={styles.pendingName} numberOfLines={1}>
                  {f.name}
                  {humanFileSize(f.size) ? ` · ${humanFileSize(f.size)}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.composerRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => void pickDocuments()}
            disabled={uploading || posting}
          >
            {uploading ? (
              <SpinningLoader size="small" color={colors.primary} />
            ) : (
              <Ionicons name="attach-outline" size={22} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.composerInput}
            value={body}
            onChangeText={(t) => {
              setBody(t);
              setCursor(t.length);
            }}
            onSelectionChange={(e) => setCursor(e.nativeEvent.selection.start)}
            placeholder={
              replyTo
                ? `Trả lời ${replyTo.name}…`
                : source.kind === 'lead'
                  ? `Bình luận (@ nhắc) · ${authorLabel}`
                  : `Bình luận với tư cách ${authorLabel}…`
            }
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!posting}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSubmit && styles.sendBtnDisabled]}
            onPress={() => void submit()}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {posting ? (
              <SpinningLoader color={colors.white} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ImageGalleryLightbox
        visible={galleryOpen && threadImages.length > 0}
        images={threadImages}
        initialIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
      />
      <DownloadProgressModal
        visible={dl.visible}
        fileName={dl.fileName}
        percent={dl.percent}
        phase={dl.phase}
        error={dl.error}
        locationHint={dl.locationHint}
        onClose={closeDownload}
      />
    </KeyboardAvoidingView>
  );
}
