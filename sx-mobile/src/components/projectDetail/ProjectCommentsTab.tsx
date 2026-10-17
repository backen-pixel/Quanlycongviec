import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type FlatList as FlatListType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../context/ThemeContext';
import CommentActionsSheet from '../CommentActionsSheet';
import { isSystemAdmin } from '../../lib/roles';
import {
  deleteThreadComment,
  editThreadComment,
  fetchThreadCommentCount,
  fetchThreadCommentsPage,
  mergeLatestComments,
  newestCommentTime,
  oldestCommentTime,
  postThreadComment,
  prependOlderComments,
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
import { markCommentsSeen } from '../../lib/commentSeen';
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
  splitTaskLabel,
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
  /**
   * Tab đang hiện trước mắt người dùng. Tab giữ mounted khi chuyển tab (ẩn bằng display:none) nên cần biết để chỉ ghi nhận
   * «đã xem bình luận» khi người dùng thật sự đang nhìn (mặc định true).
   */
  active?: boolean;
};

export default function ProjectCommentsTab({
  projectId,
  dealId,
  authorTagUserId,
  onCountChange,
  active = true,
}: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { subscribeSync } = useNotifications();
  const { state: dl, download, close: closeDownload } = useFileDownload();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatListType<{ comment: ProjectComment; depth: number }>>(null);
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
  /** Tải theo trang: mới nhất trước, bình luận cũ hơn tải thêm khi người dùng cuộn lên. */
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Tổng số bình luận của luồng khi chưa tải hết (null = đã tải hết → dùng độ dài danh sách). */
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const commentsRef = useRef<ProjectComment[]>([]);
  commentsRef.current = comments;
  const hasMoreRef = useRef(false);
  hasMoreRef.current = hasMore;
  const loadingOlderRef = useRef(false);
  /** Vừa thêm trang CŨ vào đầu danh sách → không coi là «có tin mới». */
  const olderJustLoadedRef = useRef(false);
  /** Chỉ tải thêm sau khi người dùng THẬT SỰ vuốt (lúc mới mở vị trí cuộn còn ở đầu trước khi nhảy xuống đáy). */
  const userScrolledRef = useRef(false);
  /** Khoá luồng của lần tải mới nhất — bỏ qua kết quả của lần tải đã cũ (đổi luồng giữa chừng). */
  const loadKeyRef = useRef('');
  /** Bình luận đang mở bảng «Sửa / Xóa» (null = đóng) và cờ đang xoá. */
  const [actionFor, setActionFor] = useState<ProjectComment | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  /** Đang sửa bình luận nào (ô nhập chuyển sang chế độ sửa); null = soạn bình luận mới. */
  const [editing, setEditing] = useState<{ id: string; label: string | null } | null>(null);
  const [members, setMembers] = useState<CommentMentionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** Mặc định kiểu chat: cũ → mới (tin mới ở dưới). */
  const [sort, setSort] = useState<SortMode>('oldest');
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
  /** Đang xem gần tin mới nhất (đáy khi oldest / đỉnh khi newest). */
  const [nearNewest, setNearNewest] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const nearNewestRef = useRef(true);
  const prevCommentLenRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  /** Chỉ cho phép stick-bottom khi vừa có tin mới / user gửi — tránh kéo lại vì ảnh load. */
  const stickBottomAllowedRef = useRef(false);

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
        listWrap: { flex: 1, position: 'relative' },
        taskTag: {
          alignSelf: 'flex-start',
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
          marginBottom: 6,
          borderRadius: Radii.full,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.primary + '55',
        },
        taskTagTxt: { flexShrink: 1, color: colors.primary, fontSize: 12.5, fontWeight: '800' },
        taskChip: {
          alignSelf: 'flex-start',
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
          marginBottom: 8,
          borderRadius: Radii.full,
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
        },
        taskChipTxt: { flexShrink: 1, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
        olderBtn: {
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 8,
          marginBottom: 10,
          borderRadius: Radii.full,
          backgroundColor: colors.primarySoft,
        },
        olderTxt: { color: colors.primary, fontSize: 12.5, fontWeight: '700' },
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
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        jumpNewTxt: { color: colors.white, fontSize: 13, fontWeight: '800' },
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

  const loadComments = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const force = Boolean(opts?.force);
    if (!silent) setLoading(true);
    // `dealId` đến muộn → `source` đổi từ luồng «dự án» sang luồng deal giữa chừng, hai lần tải chạy song song; kết quả của lần
    // cũ (luồng dự án thường RỖNG) về sau không được ghi đè kết quả đúng.
    const reqKey = JSON.stringify(source);
    loadKeyRef.current = reqKey;
    let stale = false;
    try {
      // Chỉ trang MỚI NHẤT (20 bình luận); làm mới ngầm thì giữ phần cũ hơn người dùng đã cuộn tải.
      const page = await fetchThreadCommentsPage(source, { force });
      if (loadKeyRef.current !== reqKey) { stale = true; return; }
      const prev = commentsRef.current;
      const merged = silent && prev.length ? mergeLatestComments(prev, page.rows) : { rows: page.rows, keptOlder: false };
      setComments(merged.rows);
      const more = merged.keptOlder ? hasMoreRef.current : page.hasMore;
      setHasMore(more);
      if (more) {
        // Còn trang cũ: tổng số lấy từ chỉ mục nhẹ, không phải độ dài danh sách đang hiện.
        void fetchThreadCommentCount(source, { force: true })
          .then((n) => {
            setTotalCount(n);
            onCountRef.current?.(n);
          })
          .catch(() => {});
      } else {
        setTotalCount(null);
        onCountRef.current?.(merged.rows.length);
      }
      setErr('');
    } catch (e) {
      if (loadKeyRef.current === reqKey && !silent) setErr(formatApiError(e));
    } finally {
      // Lần tải cũ bị bỏ thì để lần tải mới tự tắt «đang tải».
      if (!silent && !stale && loadKeyRef.current === reqKey) setLoading(false);
    }
  }, [source]);

  /** Cuộn lên gần đầu → tải trang bình luận cũ hơn (một lần một trang). */
  const loadOlder = useCallback(async () => {
    if (!hasMoreRef.current || loadingOlderRef.current) return;
    const before = oldestCommentTime(commentsRef.current);
    if (!before) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchThreadCommentsPage(source, { before });
      olderJustLoadedRef.current = true;
      setComments((prev) => prependOlderComments(prev, page.rows));
      setHasMore(page.hasMore);
      if (!page.hasMore) setTotalCount(null);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
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
    void loadComments({ silent: false, force: false });
    void loadMembers();
  }, [loadComments, loadMembers]);

  useEffect(() => {
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
  }, [source, loadComments, subscribeSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadComments({ silent: true, force: true }), loadMembers()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadComments, loadMembers]);

  // Tab đang hiện = người dùng đang xem các bình luận mới nhất → ghi nhận «đã xem» (huy hiệu «mới» ở danh sách nhiệm vụ tắt).
  useEffect(() => {
    if (!active || source.kind !== 'lead' || !comments.length) return;
    void markCommentsSeen(source.leadId, newestCommentTime(comments));
  }, [active, source, comments]);

  const commentById = useMemo(() => {
    const m = new Map<string, ProjectComment>();
    comments.forEach((c) => m.set(c.id, c));
    return m;
  }, [comments]);

  const flatList = useMemo(() => {
    const grouped = groupCommentsByParent(comments);
    return flattenCommentTree(grouped, sort);
  }, [comments, sort]);

  /**
   * Sau lần nhảy về tin mới nhất (không hoạt ảnh) danh sách còn đang dựng dần (ảnh, tệp đính kèm, dòng chưa đo) nên đáy
   * dịch xuống — trong khoảng này mỗi lần nội dung đổi kích thước lại cuộn xuống đáy, ngừng ngay khi người dùng vuốt.
   */
  const settleBottomUntilRef = useRef(0);

  const scrollToNewest = useCallback((animated = true) => {
    if (!animated) {
      settleBottomUntilRef.current = Date.now() + 2500;
      userScrolledRef.current = false;
      // Không chỉ chờ sự kiện đổi kích thước: ảnh / tệp đính kèm dựng muộn nên cuộn lại đáy vài lần trong ~2 giây đầu.
      if (sort === 'oldest') {
        [250, 600, 1100, 1800].forEach((ms) => setTimeout(() => {
          if (!userScrolledRef.current && Date.now() < settleBottomUntilRef.current) {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }, ms));
      }
    }
    const run = () => {
      if (sort === 'oldest') {
        listRef.current?.scrollToEnd({ animated });
      } else {
        listRef.current?.scrollToOffset({ offset: 0, animated });
      }
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
    // Hysteresis: vào gần dễ hơn, ra xa khó hơn — tránh nhấp nháy nút Tin mới.
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
    // Gần ĐẦU danh sách cũ (đỉnh khi «Mới dưới», đáy khi «Mới trên») → tải thêm bình luận cũ hơn.
    const distOld = sort === 'oldest'
      ? contentOffset.y
      : contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (userScrolledRef.current && distOld < 240) void loadOlder();
  }, [sort, loadOlder]);

  // Mở tab / đổi sort / xong tải → nhảy tới tin mới nhất.
  useEffect(() => {
    if (loading || !flatList.length) return undefined;
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToNewest(false);
    }
    return undefined;
  }, [loading, flatList.length, scrollToNewest]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    nearNewestRef.current = true;
    setNearNewest(true);
    setPendingNewCount(0);
    prevCommentLenRef.current = 0;
    setHasMore(false);
    setTotalCount(null);
    olderJustLoadedRef.current = false;
    userScrolledRef.current = false;
  }, [projectId, dealId]);

  useEffect(() => {
    // Đổi chế độ sắp xếp → cuộn lại về tin mới.
    didInitialScrollRef.current = false;
    if (!loading && flatList.length) {
      const t = setTimeout(() => {
        didInitialScrollRef.current = true;
        scrollToNewest(false);
      }, 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [sort]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ khi đổi sort

  // Tin mới realtime khi đang xem tin cũ → hiện nút; đang ở tin mới → theo dõi xuống dưới.
  useEffect(() => {
    const len = comments.length;
    const prev = prevCommentLenRef.current;
    prevCommentLenRef.current = len;
    // Trang cũ vừa được thêm vào ĐẦU danh sách: không phải tin mới.
    if (olderJustLoadedRef.current) {
      olderJustLoadedRef.current = false;
      return;
    }
    if (prev <= 0 || len <= prev) return;
    const added = len - prev;
    if (nearNewestRef.current) {
      scrollToNewest(true);
      setPendingNewCount(0);
    } else {
      setPendingNewCount((n) => n + added);
    }
  }, [comments.length, scrollToNewest]);

  const showJumpToNew = !nearNewest && flatList.length > 0 && !loading;

  /** Nút / vòng quay ở ĐẦU danh sách cũ: tải bình luận cũ hơn khi chạm (ngoài việc tự tải khi cuộn lên). */
  const olderControl = hasMore ? (
    <TouchableOpacity
      style={styles.olderBtn}
      onPress={() => {
        userScrolledRef.current = true;
        void loadOlder();
      }}
      disabled={loadingOlder}
      activeOpacity={0.8}
    >
      {loadingOlder ? (
        <SpinningLoader size="small" color={colors.primary} />
      ) : (
        <Ionicons name="time-outline" size={15} color={colors.primary} />
      )}
      <Text style={styles.olderTxt}>{loadingOlder ? 'Đang tải bình luận cũ…' : 'Xem bình luận cũ hơn'}</Text>
    </TouchableOpacity>
  ) : null;

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

  /** Bắt đầu sửa: đưa nội dung vào ô nhập (file đính kèm giữ nguyên, chỉ sửa phần chữ). */
  const startEdit = (comment: ProjectComment) => {
    setActionFor(null);
    setReplyTo(null);
    setPendingFiles([]);
    setErr('');
    // Nhãn nhiệm vụ «[…]» ở đầu giữ nguyên là NHÃN cố định (không nằm trong ô nhập); ô nhập chỉ chứa phần nội dung.
    const { label, rest } = splitTaskLabel(comment.content);
    setEditing({ id: comment.id, label });
    setBody(rest);
    setCursor(rest.length);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const cancelEdit = () => {
    setEditing(null);
    setBody('');
    setCursor(0);
  };

  /** Xoá bình luận đang mở bảng thao tác (đã qua bước xác nhận trong bảng). */
  const confirmDelete = async () => {
    const target = actionFor;
    if (!target) return;
    setActionBusy(true);
    try {
      await deleteThreadComment(source, target.id);
      setComments((prev) => prev.filter((c) => c.id !== target.id));
      if (editing?.id === target.id) cancelEdit();
      setActionFor(null);
      // Tổng số / huy hiệu cập nhật lại từ máy chủ.
      void loadComments({ silent: true, force: true });
    } catch (e) {
      setActionFor(null);
      setErr(formatApiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const text = body.trim();
    setPosting(true);
    setErr('');
    // Đang SỬA một bình luận → lưu nội dung mới (chỉ phần chữ; người được nhắc từ lần đầu không bị thông báo lại).
    if (editing) {
      try {
        // Gắn lại nhãn nhiệm vụ cố định vào đầu nội dung đã sửa.
        const finalText = editing.label ? `[${editing.label}] ${text}` : text;
        const updated = await editThreadComment(source, editing.id, finalText);
        setComments((prev) => prev.map((c) => (
          c.id === editing.id
            ? { ...c, content: updated.content || finalText, updated_at: updated.updated_at || new Date().toISOString() }
            : c
        )));
        setEditing(null);
        setBody('');
        setCursor(0);
      } catch (e) {
        setErr(formatApiError(e));
      } finally {
        setPosting(false);
      }
      return;
    }
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
      await loadComments({ silent: true, force: true });
      setTimeout(() => scrollToNewest(true), 120);
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
      <View style={styles.systemRow}>
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
    // Quyền hiển thị nút ⋯ (máy chủ vẫn là nơi quyết định): sửa = CHỈ tác giả; xóa = tác giả, hoặc ADMIN HỆ THỐNG (xóa của người khác).
    // Mọi người còn lại (kể cả admin công ty) không sửa / xóa được bình luận của nhau.
    const isMineComment = Boolean(myId) && String(item.user_id) === myId;
    const canEditComment = isMineComment && Boolean(item.content?.trim());
    const canDeleteComment = isMineComment || isSystemAdmin(user);
    // «[Tên nhiệm vụ] nội dung» → nhãn nổi bật + nội dung.
    const taskTag = splitTaskLabel(item.content);
    const isEdited = Boolean(item.updated_at)
      && new Date(String(item.updated_at)).getTime() - new Date(String(item.created_at)).getTime() > 5000;

    return (
      <View style={[styles.commentRow, nestOffset > 0 && { marginLeft: nestOffset }]}>
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
            {taskTag.label ? (
              <View style={styles.taskTag}>
                <Ionicons name="pricetag" size={12} color={colors.primary} />
                <Text style={styles.taskTagTxt} numberOfLines={2}>{taskTag.label}</Text>
              </View>
            ) : null}
            {taskTag.rest ? renderContentWithMentions(taskTag.rest) : null}
            <CommentAttachmentsBlock attachments={item.attachments} onOpenImage={openThreadImage} />
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.timeText}>
              {formatCommentTime(item.created_at)}
              {isEdited ? ' · đã sửa' : ''}
            </Text>
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
            {/* Sửa (chỉ tác giả) / Xóa (tác giả hoặc admin); nhật ký tự động của hệ thống (vẽ ở nhánh riêng) không có thao tác. */}
            {canEditComment || canDeleteComment ? (
              <TapHighlight
                style={styles.actionPill}
                onPress={() => { setReactionPickerId(null); setActionFor(item); }}
                accessibilityLabel="Sửa hoặc xóa bình luận"
              >
                <Ionicons name="ellipsis-horizontal" size={14} color={colors.textMuted} />
              </TapHighlight>
            ) : null}
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
          {(totalCount ?? comments.length) ? ` · ${totalCount ?? comments.length}` : ''}
        </Text>
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
          // Dựng đủ cả trang đầu (20) ngay: chiều cao thật đã biết nên «cuộn xuống đáy» không rơi vào ước lượng.
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          onScrollBeginDrag={() => {
            userScrolledRef.current = true;
            setReactionPickerId(null);
          }}
          // Tải thêm bình luận cũ ở ĐẦU danh sách mà không làm nhảy vị trí đang xem.
          maintainVisibleContentPosition={sort === 'oldest' ? { minIndexForVisible: 0 } : undefined}
          ListHeaderComponent={sort === 'oldest' ? olderControl : null}
          ListFooterComponent={sort === 'newest' ? olderControl : null}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (!didInitialScrollRef.current && !loading && flatList.length) {
              didInitialScrollRef.current = true;
              scrollToNewest(false);
              return;
            }
            // Đang «ổn định» sau lần nhảy về tin mới nhất: nội dung dài ra thì bám theo đáy (chưa vuốt thì chưa thôi).
            if (
              sort === 'oldest'
              && !loading
              && !userScrolledRef.current
              && Date.now() < settleBottomUntilRef.current
            ) {
              listRef.current?.scrollToEnd({ animated: false });
              return;
            }
            // Chỉ stick khi vừa đánh dấu (tin mới / gửi) — không stick vì ảnh/layout muộn.
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
                <Text style={styles.emptyHint}>
                  Viết bình luận, @ nhắc thành viên hoặc đính kèm file — đồng bộ realtime với web.
                </Text>
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

      {editing ? (
        <View style={styles.replyBar}>
          <Ionicons name="create-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={styles.replyText} numberOfLines={1}>
            <Text style={styles.replyName}>Đang sửa bình luận</Text>
          </Text>
          <TouchableOpacity onPress={cancelEdit} hitSlop={8} disabled={posting}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Hủy</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {replyTo && !editing ? (
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
        {/* Đang sửa bình luận có nhãn nhiệm vụ: nhãn là NHÃN cố định (xám, không xoá được), ô nhập chỉ chứa nội dung. */}
        {editing?.label ? (
          <View style={styles.taskChip} accessibilityLabel={`Bình luận về nhiệm vụ ${editing.label}`}>
            <Ionicons name="pricetag" size={12} color={colors.textMuted} />
            <Text style={styles.taskChipTxt} numberOfLines={1}>{editing.label}</Text>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => void pickDocuments()}
            disabled={uploading || posting || Boolean(editing)}
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
              editing
                ? 'Nội dung bình luận…'
                : replyTo
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

      <CommentActionsSheet
        visible={!!actionFor}
        preview={actionFor?.content || ''}
        canEdit={Boolean(actionFor) && String(actionFor?.user_id) === myId && Boolean(actionFor?.content?.trim())}
        canDelete
        busy={actionBusy}
        onEdit={() => { if (actionFor) startEdit(actionFor); }}
        onDelete={() => void confirmDelete()}
        onClose={() => setActionFor(null)}
      />

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
