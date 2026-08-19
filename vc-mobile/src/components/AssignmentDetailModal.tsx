import SpinningLoader from './SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  PRIORITY_LABEL,
  STATUS_STAGE_LABEL,
  assignmentDealLabel,
  companyShortLabel,
  deleteAssignmentFile,
  fetchAssignmentComments,
  fetchAssignmentFiles,
  fetchCrmAssignmentById,
  postAssignmentComment,
  updateCrmAssignment,
  uploadAssignmentFile,
  type AssignmentComment,
  type AssignmentFile,
  type CrmAssignment,
} from '../lib/sharedWorkspaceApi';
import { isTaskDone } from '../lib/workTasksApi';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';

type Props = {
  visible: boolean;
  assignment: CrmAssignment | null;
  assignmentId?: string | null;
  onClose: () => void;
  onUpdated: (row: CrmAssignment) => void;
};

const STATUS_ORDER = ['pending', 'in_progress', 'completed'] as const;

function fmtDt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function fmtSize(b?: number | null): string {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function isOverdue(deadline?: string | null, status?: string | null): boolean {
  if (!deadline || isTaskDone(String(status || ''))) return false;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export default function AssignmentDetailModal({
  visible,
  assignment,
  assignmentId,
  onClose,
  onUpdated,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = String(user?.id || user?.userId || '');

  const [local, setLocal] = useState<CrmAssignment | null>(assignment);
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [comments, setComments] = useState<AssignmentComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [reqFiles, setReqFiles] = useState<AssignmentFile[]>([]);
  const [subFiles, setSubFiles] = useState<AssignmentFile[]>([]);
  const [uploadingKind, setUploadingKind] = useState<'req' | 'sub' | null>(null);

  const reloadFiles = async (id: string) => {
    const [req, sub] = await Promise.all([
      fetchAssignmentFiles(id, 'req').catch(() => [] as AssignmentFile[]),
      fetchAssignmentFiles(id, 'sub').catch(() => [] as AssignmentFile[]),
    ]);
    setReqFiles(req);
    setSubFiles(sub);
  };

  useEffect(() => {
    if (!visible) return;
    setLocal(assignment);
    setCommentText('');
    const id = String(assignmentId || assignment?.id || '').trim();
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchCrmAssignmentById(id).catch(() => null),
      fetchAssignmentComments(id).catch(() => [] as AssignmentComment[]),
      reloadFiles(id).catch(() => {}),
    ])
      .then(([row, cms]) => {
        if (cancelled) return;
        if (row) setLocal(row);
        setComments(cms);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, assignment, assignmentId]);

  if (!visible) return null;

  const item = local || assignment;
  if (!item) return null;

  const st = String(item.status || 'pending');
  const overdue = isOverdue(item.deadline, st);
  const assignees =
    item.assignees?.length
      ? item.assignees
      : (item.assignee ? [item.assignee] : []);
  const isCreator = String(item.created_by_id || item.created_by?.id || '') === uid;
  const isAssignee = assignees.some((a) => String(a.id) === uid);
  const canMove = isCreator || isAssignee;
  const dealLabel = assignmentDealLabel(item.lead);
  const pri = String(item.priority || 'medium');

  const setStatus = async (next: string) => {
    if (!canMove || savingStatus || next === st) return;
    setSavingStatus(true);
    try {
      const updated = await updateCrmAssignment(String(item.id), { status: next });
      const merged = { ...item, ...updated, status: updated.status || next };
      setLocal(merged);
      onUpdated(merged);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSavingStatus(false);
    }
  };

  const sendComment = async () => {
    const text = commentText.trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      const row = await postAssignmentComment(String(item.id), text);
      if (row) {
        setComments((prev) => [...prev, row]);
        setCommentText('');
      }
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setPostingComment(false);
    }
  };

  const pickAndUpload = async (kind: 'req' | 'sub') => {
    if (uploadingKind) return;
    const pick = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const asset = pick.assets[0];
    setUploadingKind(kind);
    try {
      await uploadAssignmentFile(String(item.id), kind, {
        uri: asset.uri,
        name: asset.name || 'file',
        mime: asset.mimeType || 'application/octet-stream',
      });
      await reloadFiles(String(item.id));
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setUploadingKind(null);
    }
  };

  const removeFile = (kind: 'req' | 'sub', fileId: string) => {
    Alert.alert('Xoá file', 'Xoá file này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteAssignmentFile(String(item.id), fileId);
              if (kind === 'req') setReqFiles((p) => p.filter((f) => String(f.id) !== fileId));
              else setSubFiles((p) => p.filter((f) => String(f.id) !== fileId));
            } catch (e) {
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  const renderFiles = (
    kind: 'req' | 'sub',
    files: AssignmentFile[],
    title: string,
    canUpload: boolean,
  ) => (
    <View style={styles.block}>
      <View style={styles.fileHead}>
        <Text style={styles.blockLabel}>{title} ({files.length})</Text>
        {canUpload ? (
          <Pressable
            style={styles.uploadBtn}
            onPress={() => void pickAndUpload(kind)}
            disabled={uploadingKind != null}
          >
            {uploadingKind === kind ? (
              <SpinningLoader color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                <Text style={styles.uploadBtnTxt}>Tải lên</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
      {files.length === 0 ? (
        <Text style={styles.muted}>Chưa có file</Text>
      ) : (
        files.map((f) => (
          <View key={String(f.id)} style={styles.fileRow}>
            <Pressable
              style={{ flex: 1, minWidth: 0 }}
              onPress={() => {
                if (f.file_url) void Linking.openURL(String(f.file_url));
              }}
            >
              <Text style={styles.fileName} numberOfLines={2}>{f.file_name || 'File'}</Text>
              <Text style={styles.fileMeta}>
                {[fmtSize(f.file_size), f.mime_type].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
            {canUpload ? (
              <Pressable onPress={() => removeFile(kind, String(f.id))} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: colorWithAlpha(colors.primary, 0.15) }]}>
                  <Text style={[styles.badgeTxt, { color: colors.primary }]}>
                    {STATUS_STAGE_LABEL[st] || st}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                  <Text style={styles.badgeTxt}>{PRIORITY_LABEL[pri] || pri}</Text>
                </View>
                {overdue ? (
                  <View style={[styles.badge, { backgroundColor: colorWithAlpha(colors.danger, 0.18) }]}>
                    <Text style={[styles.badgeTxt, { color: colors.danger }]}>Quá hạn</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.title, isTaskDone(st) && styles.doneTitle]} numberOfLines={3}>
                {item.title || 'Giao việc'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading && !local ? (
            <SpinningLoader color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {canMove ? (
                <View style={styles.statusRow}>
                  {STATUS_ORDER.map((s) => {
                    const active = st === s;
                    return (
                      <Pressable
                        key={s}
                        style={[styles.statusBtn, active && styles.statusBtnActive]}
                        onPress={() => void setStatus(s)}
                        disabled={savingStatus}
                      >
                        <Text style={[styles.statusBtnTxt, active && { color: '#fff' }]}>
                          {STATUS_STAGE_LABEL[s]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.infoGrid}>
                <InfoCell styles={styles} label="Người giao" value={item.created_by?.full_name || '—'} />
                <InfoCell styles={styles} label="Công ty" value={companyShortLabel(item.company) || '—'} />
                {companyShortLabel(item.executor_company) ? (
                  <InfoCell
                    styles={styles}
                    label="Công ty thực hiện"
                    value={companyShortLabel(item.executor_company)}
                  />
                ) : null}
                <InfoCell styles={styles} label="Deadline" value={fmtDt(item.deadline)} danger={overdue} />
                <InfoCell styles={styles} label="Tạo lúc" value={fmtDt(item.created_at)} />
              </View>

              {dealLabel ? (
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>Deal / dự án</Text>
                  <Text style={styles.dealTxt}>{dealLabel}</Text>
                </View>
              ) : null}

              {item.description ? (
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>Mô tả công việc</Text>
                  <Text style={styles.desc}>{item.description}</Text>
                </View>
              ) : null}

              <View style={styles.block}>
                <Text style={styles.blockLabel}>Giao cho ({assignees.length})</Text>
                {assignees.length === 0 ? (
                  <Text style={styles.muted}>Chưa giao</Text>
                ) : (
                  <View style={styles.chipWrap}>
                    {assignees.map((u) => {
                      const mine = String(u.id) === uid;
                      return (
                        <View key={String(u.id)} style={[styles.userChip, mine && styles.userChipMine]}>
                          <Text style={[styles.userChipTxt, mine && { color: colors.primary }]} numberOfLines={1}>
                            {u.full_name || u.email || u.id}
                            {mine ? ' (Bạn)' : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {renderFiles('req', reqFiles, 'File yêu cầu', isCreator)}
              {renderFiles('sub', subFiles, 'File nộp bài', isAssignee || isCreator)}

              <View style={styles.block}>
                <Text style={styles.blockLabel}>Bình luận ({comments.length})</Text>
                {comments.length === 0 ? (
                  <Text style={styles.muted}>Chưa có bình luận</Text>
                ) : (
                  comments.map((c) => (
                    <View key={String(c.id)} style={styles.commentRow}>
                      <Text style={styles.commentAuthor}>
                        {c.user?.full_name || 'NV'} · {fmtDt(c.created_at)}
                      </Text>
                      <Text style={styles.commentBody}>{c.content}</Text>
                    </View>
                  ))
                )}
                <View style={styles.commentInputRow}>
                  <TextInput
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Viết bình luận…"
                    placeholderTextColor={colors.textFaint}
                    style={styles.commentInput}
                  />
                  <Pressable
                    style={styles.commentSend}
                    onPress={() => void sendComment()}
                    disabled={postingComment || !commentText.trim()}
                  >
                    {postingComment ? (
                      <SpinningLoader color="#fff" size="small" />
                    ) : (
                      <Ionicons name="send" size={16} color="#fff" />
                    )}
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          )}

          <Pressable style={styles.closeFooter} onPress={onClose}>
            <Text style={styles.closeFooterTxt}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function InfoCell({
  styles,
  label,
  value,
  danger,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.infoCell}>
      <Text style={[styles.infoLabel, danger && styles.dangerTxt]}>{label}</Text>
      <Text style={[styles.infoValue, danger && styles.dangerTxt]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: Spacing.lg,
      paddingTop: 10,
      height: '92%',
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginBottom: 10,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
    closeBtn: { padding: 4 },
    scroll: { flex: 1, minHeight: 0 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    badgeTxt: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    title: { color: colors.text, fontSize: 18, fontWeight: '900' },
    doneTitle: { color: colors.textMuted, textDecorationLine: 'line-through' },
    statusRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statusBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    statusBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    statusBtnTxt: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    infoCell: {
      width: '47%',
      backgroundColor: colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
    },
    infoLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700', marginBottom: 4 },
    infoValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
    dangerTxt: { color: colors.danger },
    block: {
      marginBottom: 12,
      padding: 12,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    blockLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 6 },
    dealTxt: { color: colors.primary, fontSize: 14, fontWeight: '800' },
    desc: { color: colors.text, fontSize: 14, fontWeight: '500', lineHeight: 20 },
    muted: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    userChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      maxWidth: '100%',
    },
    userChipMine: {
      borderColor: colors.primary,
      backgroundColor: colorWithAlpha(colors.primary, 0.12),
    },
    userChipTxt: { color: colors.text, fontSize: 12, fontWeight: '700' },
    fileHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      gap: 8,
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: Radii.md,
      backgroundColor: colors.primary,
      minWidth: 72,
      justifyContent: 'center',
    },
    uploadBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    fileName: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    fileMeta: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 2 },
    commentRow: {
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    commentAuthor: { color: colors.textFaint, fontSize: 11, fontWeight: '700', marginBottom: 2 },
    commentBody: { color: colors.text, fontSize: 13, fontWeight: '500', lineHeight: 18 },
    commentInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
    commentInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      backgroundColor: colors.bgElevated,
    },
    commentSend: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    closeFooter: {
      marginTop: 8,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    closeFooterTxt: { color: colors.textMuted, fontWeight: '800' },
  });
}
