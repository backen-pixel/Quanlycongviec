import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../SpinningLoader';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatApiError } from '../../api/client';
import {
  deleteLeadComment,
  fetchLeadComments,
  fetchLeadMembers,
  markLeadCommentsRead,
  postLeadComment,
  setLeadCommentReaction,
  type LeadComment,
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
  fetchNotificationPrefs,
  isCommentShowOnScreenEnabled,
} from '../../lib/notificationPrefs';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';
import Avatar from '../Avatar';
import CommentAttachmentsBlock from './CommentAttachmentsBlock';
import CrmCommentBody from './CrmCommentBody';
import VcHandoverCommentCard from './VcHandoverCommentCard';

export const CRM_COMMENT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

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
  const { user } = useAuth();
  const myId = currentUserId(user);

  const [showOnScreen, setShowOnScreen] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [items, setItems] = useState<LeadComment[]>([]);
  const [members, setMembers] = useState<LeadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
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
  onItemsChangeRef.current = onItemsChange;
  onOpenedRef.current = onOpened;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const prefs = await fetchNotificationPrefs();
      const allowed = isCommentShowOnScreenEnabled(prefs);
      setShowOnScreen(allowed);
      setPrefsReady(true);
      if (!allowed) {
        setItems([]);
        setMembers([]);
        return;
      }
      const [comments, mems] = await Promise.all([
        fetchLeadComments(leadId),
        fetchLeadMembers(leadId),
      ]);
      setItems(comments);
      setMembers(mems);
      onItemsChangeRef.current?.(comments.length);
      try {
        await markLeadCommentsRead(leadId);
        onOpenedRef.current?.();
      } catch {
        /* read receipt optional */
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

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
          setItems((prev) => prev.filter((c) => String(c.id) !== String(payload?.comment_id)));
          return;
        }
        const row = payload?.comment;
        if (!row?.id) return;
        if (action === 'updated') {
          setItems((prev) =>
            prev.map((c) =>
              String(c.id) === String(row.id)
                ? { ...c, ...row, reactions: row.reactions ?? c.reactions }
                : c,
            ),
          );
          return;
        }
        setItems((prev) => upsertComment(prev, row));
      };
      socket.on('lead:comment', handler);
      return () => {
        socket.emit('leave:lead', leadId);
        socket.off('lead:comment', handler);
      };
    });
  }, [leadId, showOnScreen]);

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

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const fromText = resolveMentionIdsFromContent(body, members, { excludeUserId: myId });
      const fromPicks = [...pickedMentionIds.current].filter((id) => String(id) !== String(myId));
      const mentionIds = [...new Set([...fromText, ...fromPicks])];
      const row = await postLeadComment(leadId, body, {
        parent_id: replyTo?.id ?? null,
        mention_user_ids: mentionIds.length ? mentionIds : undefined,
      });
      setItems((prev) => {
        const next = upsertComment(prev, row);
        onItemsChangeRef.current?.(next.length);
        return next;
      });
      setDraft('');
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

    return (
      <View style={[styles.commentWrap, row.depth > 0 && styles.commentReply]}>
        <View style={styles.commentRow}>
          <Avatar name={name} initials={initialsFromName(name)} size={34} color={colorFromName(name)} />
          <View style={styles.commentBody}>
            <View style={styles.commentBubble}>
              <View style={styles.commentMeta}>
                <Text style={styles.commentAuthor}>{name}</Text>
                <Text style={styles.metaFaint}>
                  {fmtDate(c.created_at)}
                  {c.updated_at && c.updated_at !== c.created_at ? ' · đã sửa' : ''}
                </Text>
              </View>
              <CrmCommentBody content={c.body} members={members} />
              <CommentAttachmentsBlock attachments={c.attachments} />
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
          </View>
        </View>
      </View>
    );
  };

  if (loading && !items.length && !prefsReady) {
    return <SpinningLoader color={Colors.blue} style={{ marginTop: 32 }} />;
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={flatRows}
        keyExtractor={(r) => String(r.comment.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(true); }}
            tintColor={Colors.blue}
          />
        }
        contentContainerStyle={flatRows.length ? styles.listPad : styles.listPadGrow}
        ListHeaderComponent={
          error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="Chưa có bình luận"
            hint="Thảo luận nội bộ — @ để nhắc thành viên tham gia."
          />
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

      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          style={styles.composerInput}
          placeholder="Viết bình luận… (@ nhắc thành viên)"
          placeholderTextColor={Colors.textFaint}
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            syncMentionUi(t, t.length);
          }}
          onSelectionChange={(e) => syncMentionUi(draft, e.nativeEvent.selection.start)}
          multiline
          maxLength={4000}
        />
        <Pressable
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
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
    </KeyboardAvoidingView>
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
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: C.borderSoft,
      backgroundColor: C.card,
    },
    composerInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: C.borderSoft,
      borderRadius: Radii.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.text,
      fontSize: 15,
      backgroundColor: C.surfaceSoft,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.blue,
      alignItems: 'center',
      justifyContent: 'center',
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
