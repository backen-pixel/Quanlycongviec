import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import SpinningLoader from '../SpinningLoader';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../../api/client';
import {
  deleteLeadComment,
  fetchLeadComments,
  fetchLeadCommentsIndex,
  fetchLeadMembers,
  markLeadCommentsRead,
  postLeadComment,
  setLeadCommentReaction,
  type LeadComment,
  type LeadCommentAttachment,
  type LeadMember,
} from '../../api/leadDetail';
import { currentUserId, useAuth } from '../../context/AuthContext';
import {
  applyMentionPickToText,
  buildMentionPickerItems,
  getActiveMentionState,
  memberDisplayName,
  resolveMentionIdsFromContent,
  type MentionPickerItem,
} from '../../lib/crmCommentMentions';
import { colorFromName, initialsFromName } from '../../lib/media';
import { subscribeAppSocket } from '../../lib/appSocket';
import {
  getCachedLeadComments,
  getCachedLeadCommentsMeta,
  removeCachedLeadComment,
  setCachedLeadComments,
  patchCachedLeadComment,
  fetchLeadCommentsShared,
  LEAD_COMMENTS_PAGE_SIZE,
} from '../../lib/leadCommentsCache';
import {
  fetchNotificationPrefs,
  isCommentShowOnScreenEnabled,
} from '../../lib/notificationPrefs';
import {
  extractAllSystemFileLinks,
  isSystemCommentBody,
} from '../../lib/crmSystemCommentFiles';
import { uploadSingleFile, type LocalUploadFile } from '../../lib/uploadFile';
import { launchCameraPhoto } from '../../lib/launchCameraPhoto';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';
import Avatar from '../Avatar';
import AttachFileSheet, { type AttachOption } from '../messenger/AttachFileSheet';
import CommentAttachmentsBlock from './CommentAttachmentsBlock';
import type { CommentAttachment } from './CommentAttachmentsBlock';
import CrmCommentBody from './CrmCommentBody';
import VcHandoverCommentCard from './VcHandoverCommentCard';

export const CRM_COMMENT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

const MAX_PENDING_ATTACHMENTS = 12;

type PendingAttachment = LeadCommentAttachment & {
  localId: string;
  localUri?: string;
  uploading?: boolean;
};

function toCommentAttachment(up: {
  file_url: string;
  file_name?: string;
  original_name?: string;
  file_size?: number;
  mime_type?: string;
}): LeadCommentAttachment {
  const name = up.file_name || up.original_name || 'file';
  return {
    url: up.file_url,
    file_url: up.file_url,
    name,
    file_name: name,
    type: up.mime_type || '',
    mime_type: up.mime_type || '',
    size: up.file_size || 0,
    file_size: up.file_size || 0,
  };
}

function isPendingImage(a: PendingAttachment): boolean {
  const mime = String(a.mime_type || a.type || '');
  const name = String(a.file_name || a.name || '');
  return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(name);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function groupCommentsByParent(flat: LeadComment[]) {
  const m = new Map<string, LeadComment[]>();
  for (const c of flat) {
    const pk = c.parent_id != null && c.parent_id !== '' ? String(c.parent_id) : '__root__';
    if (!m.has(pk)) m.set(pk, []);
    m.get(pk)!.push(c);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return m;
}

function upsertComment(list: LeadComment[], row: LeadComment): LeadComment[] {
  const i = list.findIndex((c) => c.id === row.id);
  if (i >= 0) {
    const next = [...list];
    next[i] = { ...next[i], ...row };
    return next;
  }
  return [...list, row];
}

type FlatRow = { comment: LeadComment; depth: number };

function flattenCommentTree(byParent: Map<string, LeadComment[]>, parentKey = '__root__', depth = 0): FlatRow[] {
  const list = byParent.get(parentKey) || [];
  const out: FlatRow[] = [];
  for (const c of list) {
    out.push({ comment: c, depth });
    out.push(...flattenCommentTree(byParent, String(c.id), depth + 1));
  }
  return out;
}

function EmptyState({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={Colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry}>
          <Text style={styles.retryTxt}>Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function LeadCommentsTab({
  leadId,
  onItemsChange,
  onOpened,
}: {
  leadId: string;
  onItemsChange?: (count: number) => void;
  onOpened?: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myId = currentUserId(user);
  const myName = user?.full_name || user?.fullName || user?.email || 'bạn';

  const [showOnScreen, setShowOnScreen] = useState(() => isCommentShowOnScreenEnabled());
  const [prefsReady, setPrefsReady] = useState(true);
  const cachedMeta = getCachedLeadCommentsMeta(leadId);
  const [items, setItems] = useState<LeadComment[]>(() => cachedMeta?.items || getCachedLeadComments(leadId) || []);
  const [hasMore, setHasMore] = useState(() => cachedMeta?.hasMore ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [members, setMembers] = useState<LeadMember[]>([]);
  const [loading, setLoading] = useState(() => !(cachedMeta?.items?.length || getCachedLeadComments(leadId)?.length));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [reactionBusy, setReactionBusy] = useState<number | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const pickedMentionIds = useRef(new Set<string>());
  const inputRef = useRef<TextInput>(null);
  const onItemsChangeRef = useRef(onItemsChange);
  const onOpenedRef = useRef(onOpened);
  const loadGenRef = useRef(0);
  onItemsChangeRef.current = onItemsChange;
  onOpenedRef.current = onOpened;

  const [attachOpen, setAttachOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(Math.max(0, e.endCoordinates?.height || 0));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Khi bàn phím mở: cuộn list để thấy tin mới gần composer.
  useEffect(() => {
    if (!keyboardVisible) return undefined;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [keyboardVisible]);

  const composerPadBottom = keyboardVisible ? 8 : Math.max(insets.bottom, 10);
  /** Chiều cao vùng composer ước lượng — chừa đáy list khi bàn phím / composer đè. */
  const composerReserve = 62 + composerPadBottom + (replyTo ? 36 : 0) + (pending.length ? 52 : 0);
  /**
   * Android nested (header + tab): adjustResize thường không đẩy được thanh nhập.
   * Neo composer bằng keyboardHeight; iOS dùng KeyboardAvoidingView.
   */
  const androidKbLift = Platform.OS === 'android' ? keyboardHeight : 0;

  const load = useCallback(async (silent = false) => {
    const gen = ++loadGenRef.current;
    const cached = getCachedLeadCommentsMeta(leadId);
    if (!silent && !(cached && cached.items.length)) setLoading(true);
    setError(null);
    try {
      const prefsPromise = fetchNotificationPrefs();
      const commentsPromise = fetchLeadCommentsShared(leadId, { limit: LEAD_COMMENTS_PAGE_SIZE });
      void fetchLeadMembers(leadId)
        .then((mems) => {
          if (gen !== loadGenRef.current) return;
          setMembers(mems);
        })
        .catch(() => { /* mention optional */ });

      const [prefs, page] = await Promise.all([prefsPromise, commentsPromise]);
      if (gen !== loadGenRef.current) return;
      const allowed = isCommentShowOnScreenEnabled(prefs);
      setShowOnScreen(allowed);
      setPrefsReady(true);
      if (!allowed) {
        setItems([]);
        setHasMore(false);
        setMembers([]);
        return;
      }

      setCachedLeadComments(leadId, page.items, page.hasMore);
      // Merge theo id — không wipe socket upserts đến trong lúc fetch.
      setItems((prev) => {
        if (!prev.length) return page.items;
        const byId = new Map<number, LeadComment>();
        for (const row of page.items) byId.set(Number(row.id), row);
        for (const row of prev) {
          const id = Number(row.id);
          const existing = byId.get(id);
          byId.set(id, existing ? { ...existing, ...row } : row);
        }
        return [...byId.values()].sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
        );
      });
      setHasMore(page.hasMore);
      // Tổng chính xác từ index — không dùng độ dài trang đã tải.
      void fetchLeadCommentsIndex([leadId])
        .then((idx) => {
          if (gen !== loadGenRef.current) return;
          const total = Number(idx[String(leadId)]?.count);
          onItemsChangeRef.current?.(Number.isFinite(total) ? total : page.items.length);
        })
        .catch(() => {
          if (gen !== loadGenRef.current) return;
          onItemsChangeRef.current?.(page.items.length);
        });
      void markLeadCommentsRead(leadId)
        .then(() => {
          if (gen !== loadGenRef.current) return;
          onOpenedRef.current?.();
        })
        .catch(() => { /* optional */ });
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(formatApiError(e));
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [leadId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !items.length) return;
    const oldest = items.reduce((min, c) => {
      const t = String(c.created_at || '');
      if (!t) return min;
      return !min || t < min ? t : min;
    }, '');
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await fetchLeadComments(leadId, {
        limit: LEAD_COMMENTS_PAGE_SIZE,
        before: oldest,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((c) => String(c.id)));
        const older = page.items.filter((c) => !seen.has(String(c.id)));
        const next = [...older, ...prev];
        setCachedLeadComments(leadId, next, page.hasMore);
        return next;
      });
      setHasMore(page.hasMore);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, items, leadId, loadingOlder]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showOnScreen) return undefined;
    return subscribeAppSocket((socket) => {
      socket.emit('join:lead', leadId);
      const handler = (payload?: { lead_id?: string; action?: string; comment?: LeadComment; comment_id?: string | number }) => {
        if (String(payload?.lead_id) !== String(leadId)) return;
        const action = payload?.action || 'created';
        if (action === 'deleted') {
          if (payload?.comment_id != null) removeCachedLeadComment(leadId, payload.comment_id);
          setItems((prev) => prev.filter((c) => String(c.id) !== String(payload?.comment_id)));
          return;
        }
        const row = payload?.comment;
        if (!row?.id) return;
        if (action === 'updated') {
          patchCachedLeadComment(leadId, row);
          setItems((prev) =>
            prev.map((c) =>
              String(c.id) === String(row.id)
                ? { ...c, ...row, reactions: row.reactions ?? c.reactions }
                : c,
            ),
          );
          return;
        }
        patchCachedLeadComment(leadId, row);
        setItems((prev) => {
          const next = upsertComment(prev, row);
          setCachedLeadComments(leadId, next, hasMore);
          return next;
        });
      };
      socket.on('lead:comment', handler);
      return () => {
        socket.emit('leave:lead', leadId);
        socket.off('lead:comment', handler);
      };
    });
  }, [hasMore, leadId, showOnScreen]);

  const byParent = useMemo(() => groupCommentsByParent(items), [items]);
  const flatRows = useMemo(() => flattenCommentTree(byParent), [byParent]);

  const mentionState = useMemo(
    () => buildMentionPickerItems({ text: draft, cursorPos, members, currentUserId: myId }),
    [draft, cursorPos, members, myId],
  );

  const syncMentionUi = (text: string, pos: number) => {
    setCursorPos(pos);
    const { active, start } = getActiveMentionState(text, pos);
    setMentionOpen(active);
    if (active) setMentionStart(start);
  };

  const applyMention = (item: MentionPickerItem) => {
    const { text: next, caret, pickedId } = applyMentionPickToText({
      text: draft,
      mentionStart,
      cursorPos,
      item,
    });
    if (pickedId) pickedMentionIds.current.add(pickedId);
    setDraft(next);
    setMentionOpen(false);
    setCursorPos(caret);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const readyAttachments = useMemo(
    () => pending.filter((p) => !p.uploading && (p.url || p.file_url)),
    [pending],
  );
  const canSend = Boolean(draft.trim() || readyAttachments.length) && !sending && !uploading
    && !pending.some((p) => p.uploading);

  const enqueueUploads = async (files: LocalUploadFile[]) => {
    if (!files.length) return;
    const room = MAX_PENDING_ATTACHMENTS - pending.length;
    if (room <= 0) {
      Alert.alert('Giới hạn', `Tối đa ${MAX_PENDING_ATTACHMENTS} file mỗi bình luận.`);
      return;
    }
    const slice = files.slice(0, room);
    const placeholders: PendingAttachment[] = slice.map((f, i) => ({
      localId: `up-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      localUri: f.uri,
      name: f.name,
      file_name: f.name,
      type: f.type || '',
      mime_type: f.type || '',
      size: f.size || 0,
      file_size: f.size || 0,
      uploading: true,
    }));
    setPending((prev) => [...prev, ...placeholders]);
    setUploading(true);
    try {
      for (let i = 0; i < slice.length; i += 1) {
        const localId = placeholders[i].localId;
        try {
          const up = await uploadSingleFile(slice[i]);
          const att = toCommentAttachment(up);
          setPending((prev) =>
            prev.map((p) => (p.localId === localId ? { ...p, ...att, uploading: false } : p)),
          );
        } catch (e) {
          setPending((prev) => prev.filter((p) => p.localId !== localId));
          Alert.alert('Lỗi upload', formatApiError(e));
        }
      }
    } finally {
      setUploading(false);
    }
  };

  /** Android: đóng bàn phím trước khi mở picker. */
  const prepareExternalPicker = async () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    if (Platform.OS === 'android') {
      const { waitForKeyboardHidden } = await import('../../lib/launchCameraPhoto');
      await waitForKeyboardHidden(700);
    } else {
      await new Promise<void>((r) => setTimeout(r, 60));
    }
  };

  const pickCamera = async () => {
    try {
      inputRef.current?.blur();
      Keyboard.dismiss();
      // Khớp tin nhắn: đợi UI ổn định rồi mở camera (không waitKeyboard dài — dễ cancel Intent).
      await new Promise<void>((r) => setTimeout(r, Platform.OS === 'android' ? 450 : 80));
      const a = await launchCameraPhoto({
        quality: 0.85,
        waitKeyboard: false,
        settleMs: 200,
      });
      if (!a) {
        Alert.alert(
          'Camera',
          'Không nhận được ảnh. Thử tắt bàn phím rồi bấm lại, hoặc dùng nút đính kèm → Camera.',
        );
        return;
      }
      const name = a.fileName || `camera-${Date.now()}.jpg`;
      await enqueueUploads([{
        uri: a.uri,
        name,
        type: a.mimeType || 'image/jpeg',
        size: a.fileSize ?? null,
      }]);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const pickGallery = async () => {
    try {
      await prepareExternalPicker();
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      const perm = cur.granted ? cur : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Quyền ảnh', 'Cần quyền thư viện để chọn ảnh.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: MAX_PENDING_ATTACHMENTS,
      });
      if (res.canceled || !res.assets?.length) return;
      await enqueueUploads(
        res.assets.map((a, i) => ({
          uri: a.uri,
          name: a.fileName || `image-${Date.now()}-${i}.jpg`,
          type: a.mimeType || 'image/jpeg',
          size: a.fileSize ?? null,
        })),
      );
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const pickDocuments = async () => {
    try {
      await prepareExternalPicker();
      const pick = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: '*/*',
      });
      if (pick.canceled || !pick.assets?.length) return;
      await enqueueUploads(
        pick.assets.map((a) => ({
          uri: a.uri,
          name: a.name || `file-${Date.now()}`,
          type: a.mimeType || 'application/octet-stream',
          size: a.size ?? null,
        })),
      );
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const onAttachPick = (option: AttachOption) => {
    // Sheet tin nhắn: đóng sheet rồi mở — camera không cần đợi keyboard thêm lần nữa.
    const run = () => {
      if (option === 'camera') {
        void (async () => {
          const a = await launchCameraPhoto({ quality: 0.85, waitKeyboard: false, settleMs: 200 });
          if (!a) return;
          await enqueueUploads([{
            uri: a.uri,
            name: a.fileName || `camera-${Date.now()}.jpg`,
            type: a.mimeType || 'image/jpeg',
            size: a.fileSize ?? null,
          }]);
        })();
      } else if (option === 'gallery') void pickGallery();
      else void pickDocuments();
    };
    setTimeout(run, Platform.OS === 'android' ? 280 : 80);
  };

  const removePending = (localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  };

  const send = async () => {
    const body = draft.trim();
    const attachments = readyAttachments.map((p) => ({
      url: p.url || p.file_url || '',
      file_url: p.file_url || p.url || '',
      name: p.name || p.file_name || 'file',
      file_name: p.file_name || p.name || 'file',
      type: p.type || p.mime_type || '',
      mime_type: p.mime_type || p.type || '',
      size: p.size ?? p.file_size ?? 0,
      file_size: p.file_size ?? p.size ?? 0,
    })).filter((a) => a.url);
    if ((!body && !attachments.length) || sending || uploading) return;
    setSending(true);
    try {
      const fromText = resolveMentionIdsFromContent(body, members, { excludeUserId: myId });
      const fromPicks = [...pickedMentionIds.current].filter((id) => String(id) !== String(myId));
      const mentionIds = [...new Set([...fromText, ...fromPicks])];
      const row = await postLeadComment(leadId, body, {
        parent_id: replyTo?.id ?? null,
        mention_user_ids: mentionIds.length ? mentionIds : undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      setItems((prev) => {
        const next = upsertComment(prev, row);
        setCachedLeadComments(leadId, next, hasMore);
        return next;
      });
      // Tổng badge do parent (index / socket) giữ — không dùng độ dài trang đã tải.
      setDraft('');
      setPending([]);
      setReplyTo(null);
      pickedMentionIds.current = new Set();
      setMentionOpen(false);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  const removeComment = (c: LeadComment) => {
    Alert.alert('Xóa bình luận', 'Xóa bình luận này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteLeadComment(c.id);
              await load(true);
            } catch (e) {
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  const pickReaction = async (c: LeadComment, emoji: string) => {
    if (reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const mine = c.reactions?.mine;
      const nextEmoji = mine === emoji ? null : emoji;
      const reactions = await setLeadCommentReaction(c.id, nextEmoji);
      setItems((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, reactions } : x)),
      );
      setReactionPickerFor(null);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setReactionBusy(null);
    }
  };

  const renderComment = ({ item: row }: { item: FlatRow }) => {
    const c = row.comment;

    if (c.comment_type === 'vc_handover' && row.depth === 0) {
      return (
        <VcHandoverCommentCard
          comment={c}
          onUpdated={(next) => setItems((prev) => upsertComment(prev, next))}
          onHistoryComment={(hist) => setItems((prev) => upsertComment(prev, hist))}
        />
      );
    }

    const name = c.user?.full_name || 'Người dùng';
    const isMine = String(c.user_id || c.user?.id || '') === String(myId);
    const reactions = c.reactions?.summary || [];
    const bodyFileLinks = extractAllSystemFileLinks(c.body);
    const bodyAsAttachments: CommentAttachment[] = bodyFileLinks.map((f) => ({
      url: f.url,
      name: f.label,
      file_name: f.label,
      mime_type: undefined,
    }));
    const attachments = [
      ...(Array.isArray(c.attachments) ? c.attachments : []),
      ...bodyAsAttachments,
    ];
    const isSys = isSystemCommentBody(c.body);

    return (
      <View style={[styles.commentWrap, row.depth > 0 && styles.commentReply]}>
        <View style={styles.commentRow}>
          {isSys ? (
            <View style={styles.sysIcon}>
              <Ionicons name="attach-outline" size={18} color={Colors.textMuted} />
            </View>
          ) : (
            <Avatar name={name} initials={initialsFromName(name)} size={34} color={colorFromName(name)} />
          )}
          <View style={styles.commentBody}>
            <View style={[styles.commentBubble, isSys && styles.sysBubble]}>
              <View style={styles.commentMeta}>
                <Text style={styles.commentAuthor}>{name}</Text>
                <Text style={styles.metaFaint}>
                  {fmtDate(c.created_at)}
                  {c.updated_at && c.updated_at !== c.created_at ? ' · đã sửa' : ''}
                </Text>
              </View>
              <CrmCommentBody content={c.body} members={members} />
              <CommentAttachmentsBlock attachments={attachments} />
              {reactions.length > 0 ? (
                <View style={styles.rxRow}>
                  {reactions.map((r) => (
                    <Pressable
                      key={r.emoji}
                      style={[styles.rxChip, c.reactions?.mine === r.emoji && styles.rxChipMine]}
                      onPress={() => void pickReaction(c, r.emoji)}
                    >
                      <Text style={styles.rxChipTxt}>{r.emoji} {r.count}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            {!isSys ? (
              <View style={styles.commentActions}>
                <Pressable hitSlop={6} onPress={() => setReplyTo({ id: c.id, name })}>
                  <Text style={styles.actionTxt}>Trả lời</Text>
                </Pressable>
                <Pressable hitSlop={6} onPress={() => setReactionPickerFor(c.id)}>
                  <Text style={styles.actionTxt}>Cảm xúc</Text>
                </Pressable>
                {isMine ? (
                  <Pressable hitSlop={6} onPress={() => removeComment(c)}>
                    <Text style={[styles.actionTxt, { color: Colors.red }]}>Xóa</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  if (loading && !items.length) {
    return (
      <View style={{ paddingTop: 32, alignItems: 'center' }}>
        <SpinningLoader color={Colors.blue} />
        <Text style={{ marginTop: 12, color: Colors.textMuted, fontSize: 13 }}>Đang tải bình luận…</Text>
      </View>
    );
  }

  if (prefsReady && !showOnScreen) {
    return (
      <EmptyState
        icon="notifications-outline"
        title="Đã tắt hiện bình luận trên màn hình"
        hint="Bình luận mới vẫn vào chuông Thông báo. Bật lại trong Cài đặt thông báo trên web: «Hiện bình luận trên màn hình»."
      />
    );
  }

  return (
    <View style={{ flex: 1, marginBottom: androidKbLift }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) + 96 : 0}
    >
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={flatRows}
        keyExtractor={(r) => String(r.comment.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(true); }}
            tintColor={Colors.blue}
          />
        }
        contentContainerStyle={[
          flatRows.length ? styles.listPad : styles.listPadGrow,
          { paddingBottom: composerReserve + 8 },
        ]}
        ListHeaderComponent={
          <>
            {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
            {hasMore ? (
              <Pressable
                onPress={() => void loadOlder()}
                disabled={loadingOlder}
                style={{
                  alignSelf: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  marginBottom: 8,
                  borderRadius: 999,
                  backgroundColor: Colors.surfaceSoft,
                }}
              >
                {loadingOlder ? (
                  <SpinningLoader color={Colors.blue} size="small" />
                ) : (
                  <Text style={{ color: Colors.blue, fontSize: 13, fontWeight: '600' }}>
                    Tải bình luận cũ hơn
                  </Text>
                )}
              </Pressable>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 24, alignItems: 'center' }}>
              <SpinningLoader color={Colors.blue} />
              <Text style={{ marginTop: 12, color: Colors.textMuted, fontSize: 13 }}>Đang tải bình luận…</Text>
            </View>
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="Chưa có bình luận"
              hint="Thảo luận nội bộ — @ để nhắc thành viên tham gia."
            />
          )
        }
        renderItem={renderComment}
      />

      {replyTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyTxt} numberOfLines={1}>Trả lời {replyTo.name}</Text>
          <Pressable hitSlop={8} onPress={() => setReplyTo(null)}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {(mentionOpen || mentionState.open) && mentionState.items.length > 0 ? (
        <View style={styles.mentionPicker}>
          <FlatList
            data={mentionState.items}
            keyExtractor={(it) => it.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.mentionItem} onPress={() => applyMention(item)}>
                {item.type === 'all' ? (
                  <Text style={styles.mentionItemTxt}>@Tất cả</Text>
                ) : (
                  <Text style={styles.mentionItemTxt}>@{memberDisplayName(item.mem)}</Text>
                )}
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {pending.length > 0 ? (
        <View style={styles.pendingWrap}>
          {pending.map((p) => (
            <View key={p.localId} style={styles.pendingChip}>
              {isPendingImage(p) && p.localUri ? (
                <Image source={{ uri: p.localUri }} style={styles.pendingThumb} />
              ) : (
                <View style={styles.pendingFileIcon}>
                  <Ionicons name="document-attach-outline" size={16} color={Colors.orange} />
                </View>
              )}
              <Text style={styles.pendingName} numberOfLines={1}>
                {p.file_name || p.name || 'file'}
              </Text>
              {p.uploading ? (
                <SpinningLoader size="small" color={Colors.orange} />
              ) : (
                <Pressable hitSlop={8} onPress={() => removePending(p.localId)}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: composerPadBottom }]}>
        <View style={styles.composerTools}>
          <Pressable
            style={styles.toolBtn}
            onPress={() => {
              // Mở sheet đính kèm → Camera (cùng luồng tin nhắn — ổn định trên máy thật).
              inputRef.current?.blur();
              Keyboard.dismiss();
              setAttachOpen(true);
            }}
            disabled={uploading || sending}
            hitSlop={4}
            accessibilityLabel="Chụp ảnh / đính kèm"
          >
            <Ionicons name="camera-outline" size={20} color={Colors.orange} />
          </Pressable>
          <Pressable
            style={styles.toolBtn}
            onPress={() => {
              inputRef.current?.blur();
              Keyboard.dismiss();
              void pickGallery();
            }}
            disabled={uploading || sending}
            hitSlop={4}
            accessibilityLabel="Chọn ảnh từ thư viện"
          >
            <Ionicons name="image-outline" size={20} color={Colors.orange} />
          </Pressable>
          <Pressable
            style={styles.toolBtn}
            onPress={() => {
              Keyboard.dismiss();
              setAttachOpen(true);
            }}
            disabled={uploading || sending}
            hitSlop={4}
            accessibilityLabel="Đính kèm file"
          >
            <Ionicons name="attach-outline" size={20} color={Colors.orange} />
          </Pressable>
        </View>
        <TextInput
          ref={inputRef}
          style={styles.composerInput}
          placeholder={`Bình luận với tư cách ${myName}…`}
          placeholderTextColor={Colors.textFaint}
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            syncMentionUi(t, t.length);
          }}
          onSelectionChange={(e) => syncMentionUi(draft, e.nativeEvent.selection.start)}
          onFocus={() => {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
          }}
          multiline
          maxLength={4000}
        />
        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={() => void send()}
          disabled={!canSend}
          accessibilityLabel="Gửi bình luận"
        >
          {sending ? (
            <SpinningLoader size="small" color={Colors.white} />
          ) : (
            <Ionicons name="send" size={18} color={Colors.white} />
          )}
        </Pressable>
      </View>

      <Modal visible={reactionPickerFor != null} transparent animationType="fade" onRequestClose={() => setReactionPickerFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setReactionPickerFor(null)} />
        <View style={styles.rxPicker}>
          <Text style={styles.rxPickerTitle}>Chọn cảm xúc</Text>
          <View style={styles.rxPickerRow}>
            {CRM_COMMENT_REACTIONS.map((em) => (
              <Pressable
                key={em}
                style={styles.rxPickerBtn}
                onPress={() => {
                  const c = items.find((x) => x.id === reactionPickerFor);
                  if (c) void pickReaction(c, em);
                }}
              >
                <Text style={styles.rxPickerEmoji}>{em}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <AttachFileSheet
        visible={attachOpen}
        onDismiss={() => setAttachOpen(false)}
        onPick={onAttachPick}
      />
    </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    listPad: { padding: Spacing.md, paddingBottom: Spacing.xl },
    listPadGrow: { flexGrow: 1, padding: Spacing.md },
    commentWrap: { marginBottom: 12 },
    commentReply: {
      marginLeft: 20,
      paddingLeft: 10,
      borderLeftWidth: 2,
      borderLeftColor: C.borderSoft,
    },
    commentRow: { flexDirection: 'row', gap: 10 },
    commentBody: { flex: 1 },
    commentBubble: {
      backgroundColor: C.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.borderSoft,
      padding: 10,
    },
    sysBubble: {
      backgroundColor: C.surfaceSoft,
    },
    sysIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    commentMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, marginBottom: 4 },
    commentAuthor: { fontSize: 14, fontWeight: '700', color: C.text },
    commentActions: { flexDirection: 'row', gap: 14, marginTop: 6, paddingLeft: 4 },
    actionTxt: { fontSize: 12, fontWeight: '600', color: C.blue },
    metaFaint: { fontSize: 11, color: C.textFaint },
    rxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    rxChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      backgroundColor: C.surfaceSoft,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    rxChipMine: { borderColor: C.blue, backgroundColor: C.blueSoft },
    rxChipTxt: { fontSize: 12 },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      backgroundColor: C.blueSoft,
      borderTopWidth: 1,
      borderTopColor: C.borderSoft,
    },
    replyTxt: { flex: 1, fontSize: 13, color: C.blue, fontWeight: '600' },
    mentionPicker: {
      maxHeight: 160,
      marginHorizontal: Spacing.md,
      backgroundColor: C.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    mentionItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderSoft },
    mentionItemTxt: { fontSize: 14, color: C.text, fontWeight: '600' },
    pendingWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: Spacing.md,
      paddingTop: 8,
      paddingBottom: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderSoft,
      backgroundColor: C.card,
    },
    pendingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: C.surfaceSoft,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    pendingThumb: { width: 32, height: 32, borderRadius: 6 },
    pendingFileIcon: {
      width: 32,
      height: 32,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.orangeSoft,
    },
    pendingName: { flexShrink: 1, maxWidth: 140, fontSize: 12, color: C.text, fontWeight: '600' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: C.borderSoft,
      backgroundColor: C.card,
    },
    composerTools: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingBottom: 4,
    },
    toolBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: C.orange,
      backgroundColor: C.cardAlt,
    },
    composerInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      borderWidth: 0,
      borderRadius: 22,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: C.text,
      fontSize: 15,
      backgroundColor: C.surfaceSoft,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.orangeDeep,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 1,
    },
    sendBtnDisabled: { opacity: 0.45 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: C.textMuted },
    emptyHint: { fontSize: 12, color: C.textFaint, textAlign: 'center', paddingHorizontal: 24 },
    errorBox: { backgroundColor: C.redSoft, borderRadius: Radii.md, padding: 12, marginBottom: 10 },
    errorText: { color: C.red, fontSize: 13 },
    retryTxt: { color: C.blue, fontWeight: '600', marginTop: 6, fontSize: 13 },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    rxPicker: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: '35%',
      backgroundColor: C.card,
      borderRadius: Radii.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    rxPickerTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12, textAlign: 'center' },
    rxPickerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    rxPickerBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rxPickerEmoji: { fontSize: 26 },
  });
}
