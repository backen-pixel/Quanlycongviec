import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type FlatList as FlatListType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  avatarColor,
  COMMENT_REACTION_EMOJI,
  flattenCommentTree,
  formatCommentTime,
  groupCommentsByParent,
  reactionTotal,
  userInitials,
} from '../lib/commentUtils';
import {
  fetchThreadComments,
  postThreadComment,
  resolveCommentSource,
  toggleThreadCommentReaction,
} from '../lib/commentApi';
import { fetchDealIdForProject } from '../lib/projectDetailApi';
import type { ProjectComment } from '../lib/productionApi';
import CommentAttachmentsBlock from './CommentAttachmentsBlock';
import TapHighlight from './TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { HIT_TARGET, Radii, Spacing } from '../theme';
import type { ProductionProject } from '../types';

import SpinningLoader from './SpinningLoader';
type SortMode = 'newest' | 'oldest';

const REPLY_DEPTH_STEP = 18;

type Props = {
  visible: boolean;
  project: ProductionProject | null;
  onClose: () => void;
  onPosted: (count: number) => void;
};

export default function ProjectCommentModal({ visible, project, onClose, onPosted }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { subscribeSync, joinLeadRoom, leaveLeadRoom } = useNotifications();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatListType<{ comment: ProjectComment; depth: number }>>(null);
  const onPostedRef = useRef(onPosted);
  onPostedRef.current = onPosted;

  const [dealId, setDealId] = useState<string | null>(null);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortMode>('oldest');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [nearNewest, setNearNewest] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const nearNewestRef = useRef(true);
  const prevCommentLenRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const stickBottomAllowedRef = useRef(false);

  const source = useMemo(
    () => (project?.id ? resolveCommentSource(project.id, dealId) : null),
    [project?.id, dealId],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, justifyContent: 'flex-end' },
        backdropTouch: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
        sheet: {
          height: '88%',
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
          overflow: 'hidden',
        },
        handle: {
          width: 36, height: 4, borderRadius: 2,
          backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 4,
        },
        header: {
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: Spacing.lg, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        },
        title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
        closeBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        projectMeta: {
          paddingHorizontal: Spacing.lg, paddingVertical: 8,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.cardAlt,
        },
        projectName: { color: colors.text, fontSize: 14, fontWeight: '700' },
        projectCode: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        sortRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg, paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        sortLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
        sortBtn: {
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 10, paddingVertical: 6,
          borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card,
        },
        sortBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
        list: { flex: 1 },
        listWrap: { flex: 1, position: 'relative' },
        jumpNewBtn: {
          position: 'absolute',
          alignSelf: 'center',
          bottom: 12,
          zIndex: 5,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: Radii.full,
          backgroundColor: colors.primary,
          elevation: 4,
        },
        jumpNewTxt: { color: colors.white, fontSize: 13, fontWeight: '800' },
        listContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, paddingBottom: 8 },
        emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
        emptyText: { color: colors.textMuted, fontSize: 14 },
        emptyHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center' },
        commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14 },
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
          alignSelf: 'flex-start', maxWidth: '100%',
          borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border,
          paddingHorizontal: 12, paddingVertical: 8,
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
          color: colors.primary, fontSize: 12, fontWeight: '800',
          backgroundColor: colors.primarySoft,
          paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: Radii.full, overflow: 'hidden',
        },
        authorTag: {
          color: colors.primary, fontSize: 11, fontWeight: '700',
          backgroundColor: colors.primarySoft, paddingHorizontal: 6, paddingVertical: 1,
          borderRadius: Radii.full, overflow: 'hidden',
        },
        content: { color: colors.text, fontSize: 14, lineHeight: 20 },
        metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
        timeText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        actionPill: {
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 10, paddingVertical: 4,
          borderRadius: Radii.full, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.cardAlt,
        },
        actionPillActive: { borderColor: colors.primary + '88', backgroundColor: colors.primarySoft },
        actionText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
        actionTextActive: { color: colors.primary },
        actionReactionEmoji: { fontSize: 15, lineHeight: 17 },
        reactionPicker: {
          flexDirection: 'row', alignItems: 'center', gap: 6,
          marginTop: 6, alignSelf: 'flex-start',
          paddingHorizontal: 8, paddingVertical: 6,
          borderRadius: Radii.full, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card,
          shadowColor: colors.shadow,
          shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        },
        emojiBtn: {
          width: 32, height: 32, borderRadius: 16,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.cardAlt,
        },
        emojiBtnActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
        replyBar: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg, paddingVertical: 8,
          borderTopWidth: 1, borderTopColor: colors.border,
          backgroundColor: colors.cardAlt,
        },
        replyText: { flex: 1, color: colors.textMuted, fontSize: 13 },
        replyName: { color: colors.text, fontWeight: '700' },
        composer: {
          borderTopWidth: 1, borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
        },
        composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
        composerInput: {
          flex: 1, minHeight: 40, maxHeight: 100,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
          borderRadius: Radii.xl, paddingHorizontal: 14, paddingVertical: 10,
          fontSize: 14, color: colors.text,
        },
        sendBtn: {
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
        },
        sendBtnDisabled: { opacity: 0.45 },
        errBox: {
          marginHorizontal: Spacing.md, marginBottom: 6, padding: 8,
          backgroundColor: colors.dangerSoft, borderRadius: Radii.md,
          borderWidth: 1, borderColor: colors.danger,
        },
        errText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
      }),
    [colors],
  );

  const loadComments = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!source) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const rows = await fetchThreadComments(source, { force: Boolean(opts?.force) });
      setComments(rows);
      onPostedRef.current(rows.length);
    } catch (e) {
      if (!silent) setErr(formatApiError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    if (!visible || !project?.id) {
      setDealId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const fromDeals = Array.isArray((project as { crmDeals?: { id?: string; type?: string }[] }).crmDeals)
        ? (project as { crmDeals?: { id?: string; type?: string }[] }).crmDeals
        : null;
      const direct =
        fromDeals?.find((d) => String(d?.type || '') === 'deal')?.id
        || fromDeals?.[0]?.id
        || null;
      const resolved = direct || (await fetchDealIdForProject(project.id));
      if (!cancelled) setDealId(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, project]);

  useEffect(() => {
    if (!visible || !dealId) return undefined;
    joinLeadRoom(dealId);
    return () => leaveLeadRoom(dealId);
  }, [visible, dealId, joinLeadRoom, leaveLeadRoom]);

  useEffect(() => {
    if (!visible || !source) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeSync((evt) => {
      if (source.kind === 'lead') {
        if (evt.type !== 'lead:comment_changed') return;
        if (String(evt.payload.lead_id || '') !== String(source.leadId)) return;
      } else {
        if (evt.type !== 'project:comment_changed') return;
        if (String(evt.payload.project_id || '') !== String(source.projectId)) return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void loadComments({ silent: true, force: true });
      }, 800);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [visible, source, loadComments, subscribeSync]);

  useEffect(() => {
    if (!visible || !source) {
      setComments([]);
      setBody('');
      setReplyTo(null);
      setReactionPickerId(null);
      setErr('');
      didInitialScrollRef.current = false;
      nearNewestRef.current = true;
      setNearNewest(true);
      setPendingNewCount(0);
      prevCommentLenRef.current = 0;
      return;
    }
    void loadComments({ silent: false, force: false });
  }, [visible, source, loadComments]);

  const commentById = useMemo(() => {
    const m = new Map<string, ProjectComment>();
    comments.forEach((c) => m.set(c.id, c));
    return m;
  }, [comments]);

  const flatList = useMemo(() => {
    const grouped = groupCommentsByParent(comments);
    return flattenCommentTree(grouped, sort);
  }, [comments, sort]);

  const scrollToNewest = useCallback((animated = true) => {
    const run = () => {
      if (sort === 'oldest') listRef.current?.scrollToEnd({ animated });
      else listRef.current?.scrollToOffset({ offset: 0, animated });
      nearNewestRef.current = true;
      setNearNewest(true);
      setPendingNewCount(0);
      stickBottomAllowedRef.current = false;
    };
    stickBottomAllowedRef.current = true;
    requestAnimationFrame(() => {
      run();
      setTimeout(run, animated ? 80 : 0);
    });
  }, [sort]);

  const onListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const enter = 80;
    const exit = 160;
    let dist = contentOffset.y;
    if (sort === 'oldest') {
      dist = contentSize.height - layoutMeasurement.height - contentOffset.y;
    }
    const near = nearNewestRef.current ? dist <= exit : dist <= enter;
    if (nearNewestRef.current !== near) {
      nearNewestRef.current = near;
      setNearNewest(near);
    }
    if (near) setPendingNewCount(0);
  }, [sort]);

  useEffect(() => {
    if (!visible || loading || !flatList.length) return undefined;
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToNewest(false);
    }
    return undefined;
  }, [visible, loading, flatList.length, scrollToNewest]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    if (visible && !loading && flatList.length) {
      const t = setTimeout(() => {
        didInitialScrollRef.current = true;
        scrollToNewest(false);
      }, 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [sort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const len = comments.length;
    const prev = prevCommentLenRef.current;
    prevCommentLenRef.current = len;
    if (!visible || prev <= 0 || len <= prev) return;
    const added = len - prev;
    if (nearNewestRef.current) {
      scrollToNewest(true);
    } else {
      setPendingNewCount((n) => n + added);
    }
  }, [comments.length, scrollToNewest, visible]);

  const showJumpToNew = visible && !nearNewest && flatList.length > 0 && !loading;

  const close = () => {
    if (posting) return;
    setBody('');
    setReplyTo(null);
    setErr('');
    onClose();
  };

  const submit = async () => {
    const text = body.trim();
    if (!text || !source) return;
    setPosting(true);
    setErr('');
    try {
      await postThreadComment(source, text, replyTo?.id ?? null);
      setBody('');
      setReplyTo(null);
      await loadComments({ silent: true, force: true });
      setTimeout(() => scrollToNewest(true), 120);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setPosting(false);
    }
  };

  const pickReaction = async (comment: ProjectComment, emoji: string) => {
    if (!source || reactionBusy) return;
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

  const renderComment = (item: ProjectComment, depth: number) => {
    const userName = item.user?.full_name || 'Thành viên';
    const currentUserId = user?.id || user?.userId;
    const isAuthor = Boolean(
      project?.production_person_id && String(item.user_id) === String(project.production_person_id),
    );
    const parent = item.parent_id ? commentById.get(String(item.parent_id)) : null;
    const parentName = parent?.user?.full_name;
    const isOtherReply = depth > 0 && (!currentUserId || String(item.user_id) !== String(currentUserId));
    const totalRx = reactionTotal(item);
    const mineEmoji = item.reactions?.mine;
    const pickerOpen = reactionPickerId === item.id;
    const nestOffset = depth > 0 ? Math.min(depth - 1, 3) * REPLY_DEPTH_STEP : 0;

    return (
      <View style={[styles.commentRow, nestOffset > 0 && { marginLeft: nestOffset }]}>
        {depth > 0 ? (
          <View style={styles.threadGutter}>
            <View style={[styles.threadLine, isOtherReply && styles.threadLineActive]} />
          </View>
        ) : null}
        {item.user?.avatar ? (
          <Image source={{ uri: item.user.avatar }} style={styles.avatarImg} />
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
            <Text style={styles.content}>{item.content}</Text>
            <CommentAttachmentsBlock attachments={item.attachments} />
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

  if (!project) return null;

  const authorLabel = user?.full_name || user?.fullName || user?.email || 'bạn';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <Pressable style={styles.backdropTouch} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Bình luận</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={8} disabled={posting}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.projectMeta}>
            <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
            <Text style={styles.projectCode} numberOfLines={1}>
              {project.code}
              {project.customer_name ? ` · ${project.customer_name}` : ''}
            </Text>
          </View>

          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Hiển thị bình luận</Text>
            <TouchableOpacity
              style={styles.sortBtn}
              onPress={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
              activeOpacity={0.8}
            >
              <Text style={styles.sortBtnText}>
                {sort === 'oldest' ? 'Mới dưới' : 'Mới trên'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {err ? (
            <View style={styles.errBox}>
              <Text style={styles.errText}>{err}</Text>
            </View>
          ) : null}

          <View style={styles.listWrap}>
            <FlatList
              ref={listRef}
              style={styles.list}
              data={loading ? [] : flatList}
              keyExtractor={(item) => item.comment.id}
              renderItem={({ item }) => renderComment(item.comment, item.depth)}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              onScrollBeginDrag={() => setReactionPickerId(null)}
              onScroll={onListScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (!didInitialScrollRef.current && !loading && flatList.length) {
                  didInitialScrollRef.current = true;
                  scrollToNewest(false);
                  return;
                }
                if (
                  stickBottomAllowedRef.current
                  && nearNewestRef.current
                  && sort === 'oldest'
                  && !loading
                ) {
                  stickBottomAllowedRef.current = false;
                  listRef.current?.scrollToEnd({ animated: false });
                }
              }}
              ListEmptyComponent={
                loading ? (
                  <View style={styles.emptyWrap}>
                    <SpinningLoader color={colors.primary} />
                    <Text style={styles.emptyText}>Đang tải bình luận…</Text>
                  </View>
                ) : (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="chatbubbles-outline" size={36} color={colors.textFaint} />
                    <Text style={styles.emptyText}>Chưa có bình luận</Text>
                    <Text style={styles.emptyHint}>Viết bình luận đầu tiên cho dự án này.</Text>
                  </View>
                )
              }
            />
            {showJumpToNew ? (
              <Pressable
                style={styles.jumpNewBtn}
                onPress={() => scrollToNewest(true)}
                accessibilityRole="button"
                accessibilityLabel="Xem tin mới nhất"
              >
                <Ionicons
                  name={sort === 'oldest' ? 'arrow-down' : 'arrow-up'}
                  size={16}
                  color={colors.white}
                />
                <Text style={styles.jumpNewTxt}>
                  {pendingNewCount > 0
                    ? `Tin mới (${pendingNewCount > 99 ? '99+' : pendingNewCount})`
                    : 'Tin mới'}
                </Text>
              </Pressable>
            ) : null}
          </View>

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

          <View style={styles.composer}>
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                value={body}
                onChangeText={setBody}
                placeholder={
                  replyTo
                    ? `Trả lời ${replyTo.name}…`
                    : `Bình luận với tư cách ${authorLabel}…`
                }
                placeholderTextColor={colors.textFaint}
                multiline
                editable={!posting}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!body.trim() || posting) && styles.sendBtnDisabled]}
                onPress={submit}
                disabled={!body.trim() || posting}
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
