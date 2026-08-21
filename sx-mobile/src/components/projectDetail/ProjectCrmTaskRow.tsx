import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatApiError } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import {
  deleteCrmTask,
  deleteCrmTaskAttachment,
  fetchCrmTaskAttachments,
  fetchLeadMembers,
  fetchUsersForAssign,
  taskDeadline,
  updateCrmTask,
  updateCrmTaskNotes,
  uploadCrmTaskFiles,
  type TaskAttachment,
} from '../../lib/projectDetailApi';
import { Radii, Spacing } from '../../theme';
import type { CrmTask, PersonRef } from '../../types';
import TapHighlight from '../TapHighlight';
import ImageGalleryLightbox, { type GalleryImage } from '../ImageGalleryLightbox';
import { isImageFile, resolveMediaUrl } from '../../lib/mediaUtils';
import { saveMessengerAttachment } from '../../lib/messengerFileOpen';

import SpinningLoader from '../SpinningLoader';
type Props = {
  task: CrmTask;
  dealId: string;
  onUpdated: (task: CrmTask) => void;
  onDeleted: (taskId: string) => void;
  /** Highlight khi mở từ tab Công việc. */
  highlighted?: boolean;
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function initials(name?: string | null): string {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function taskAssignees(task: CrmTask): PersonRef[] {
  if (task.assignees?.length) return task.assignees;
  return task.assignee ? [task.assignee] : [];
}

function isTaskDone(status: string): boolean {
  return status === 'completed' || status === 'done';
}

function deadlineToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T08:00:00.000Z`;
}

function parseDeadline(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type ModalKind = 'attach' | 'assign' | 'edit' | 'deadline' | null;

export default function ProjectCrmTaskRow({ task, dealId, onUpdated, onDeleted, highlighted }: Props) {
  const { colors } = useTheme();
  const done = isTaskDone(task.status);
  const assignees = taskAssignees(task);
  const assignee = assignees[0] || null;
  const deadline = taskDeadline(task);
  const fileCount = task.file_count ?? 0;
  const noteText = task.notes?.trim() || '';
  const hasNote = Boolean(noteText);

  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [gallery, setGallery] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [pickDate, setPickDate] = useState(new Date());
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const [users, setUsers] = useState<PersonRef[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [usersLoading, setUsersLoading] = useState(false);

  const closeModal = () => {
    setModal(null);
    setShowAndroidPicker(false);
  };

  const openAttach = () => {
    setNoteDraft(task.notes?.trim() || '');
    setModal('attach');
    void loadAttachments();
  };

  const loadAttachments = async () => {
    setAttLoading(true);
    try {
      const list = await fetchCrmTaskAttachments(dealId, task.id);
      setAttachments(list.filter((a) => a.doc_type !== 'task_inline_note'));
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
      setAttachments([]);
    } finally {
      setAttLoading(false);
    }
  };

  const openAttachment = async (a: TaskAttachment) => {
    if (a.doc_type === 'task_note' && !a.file_url) return;
    const url = resolveMediaUrl(a.file_url);
    if (!url) {
      Alert.alert('Thiếu link', 'File này không có đường dẫn.');
      return;
    }
    if (isImageFile(a)) {
      const images = attachments
        .filter((x) => isImageFile(x) && x.file_url)
        .map((x) => {
          const uri = resolveMediaUrl(x.file_url);
          if (!uri) return null;
          return { uri, title: x.name || x.file_name || 'Ảnh' } as GalleryImage;
        })
        .filter(Boolean) as GalleryImage[];
      const idx = Math.max(0, images.findIndex((img) => img.uri === url));
      if (!images.length) return;
      setGallery({ images, index: idx >= 0 ? idx : 0 });
      return;
    }
    if (downloadingId) return;
    setDownloadingId(a.id);
    try {
      const saved = await saveMessengerAttachment(url, {
        name: a.name || a.file_name,
        mime: a.mime_type,
      });
      Alert.alert('Đã tải về', `«${saved.displayName}» đã lưu vào ${saved.locationHint}.`);
    } catch (e) {
      Alert.alert('Tải file', formatApiError(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const openAssign = () => {
    const ids = new Set(taskAssignees(task).map((u) => String(u.id)).filter(Boolean));
    setSelectedIds(ids);
    setModal('assign');
    void loadUsers();
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const [allUsers, members] = await Promise.all([
        fetchUsersForAssign(),
        fetchLeadMembers(dealId),
      ]);
      const memberIds = new Set(members.map((m) => String(m.user_id)).filter(Boolean));
      const memberUsers = members
        .map((m) => m.user)
        .filter((u): u is PersonRef => Boolean(u?.id));
      const extra = allUsers.filter((u) => u.id && !memberIds.has(String(u.id)));
      setUsers([...memberUsers, ...extra]);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  const openEdit = () => {
    setEditTitle(task.title || '');
    setEditDesc(task.description || '');
    setModal('edit');
  };

  const openDeadline = () => {
    setPickDate(parseDeadline(deadline));
    setModal('deadline');
    if (Platform.OS === 'android') setShowAndroidPicker(true);
  };

  const toggleStatus = async () => {
    const cur = task.status || 'pending';
    const next = cur === 'completed' ? 'pending' : cur === 'pending' ? 'in_progress' : 'completed';
    setBusy(true);
    try {
      const updated = await updateCrmTask(dealId, task.id, { status: next });
      onUpdated(updated);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Xóa nhiệm vụ', `Xóa "${task.title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteCrmTask(dealId, task.id);
            onDeleted(task.id);
          } catch (e) {
            Alert.alert('Lỗi', formatApiError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      const text = noteDraft.trim();
      await updateCrmTaskNotes(dealId, task.id, text || null);
      onUpdated({
        ...task,
        notes: text || null,
        note_count: text ? 1 : 0,
        attachment_count: (task.file_count ?? 0) + (text ? 1 : 0),
      });
      if (text) Alert.alert('Đã lưu', 'Ghi chú đã hiển thị trên nhiệm vụ.');
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteNote = () => {
    if (!noteDraft.trim() && !hasNote) return;
    Alert.alert('Xóa ghi chú', 'Xóa ghi chú khỏi nhiệm vụ này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await updateCrmTaskNotes(dealId, task.id, null);
            setNoteDraft('');
            onUpdated({
              ...task,
              notes: null,
              note_count: 0,
              attachment_count: task.file_count ?? 0,
            });
          } catch (e) {
            Alert.alert('Lỗi', formatApiError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const confirmDeleteFile = (att: TaskAttachment) => {
    Alert.alert('Xóa file', att.name || att.file_name || 'Đính kèm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteCrmTaskAttachment(dealId, task.id, att.id);
            await loadAttachments();
            const nextFileCount = Math.max(0, (task.file_count ?? 0) - 1);
            onUpdated({
              ...task,
              file_count: nextFileCount,
              attachment_count: nextFileCount + (hasNote ? 1 : 0),
            });
          } catch (e) {
            Alert.alert('Lỗi', formatApiError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const pickFile = async () => {
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    setBusy(true);
    try {
      await uploadCrmTaskFiles(dealId, task.id, [
        { uri: a.uri, name: a.name || 'file', mime: a.mimeType || 'application/octet-stream' },
      ]);
      await loadAttachments();
      onUpdated({
        ...task,
        file_count: (task.file_count ?? 0) + 1,
        attachment_count: (task.attachment_count ?? 0) + 1,
      });
      Alert.alert('Đã tải lên', 'File đã đính kèm.');
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadMediaAsset = async (
    asset: ImagePicker.ImagePickerAsset,
    fallbackName: string,
    fallbackMime: string,
  ) => {
    setBusy(true);
    try {
      const name = asset.fileName || fallbackName;
      const mime = asset.mimeType || fallbackMime;
      await uploadCrmTaskFiles(dealId, task.id, [{ uri: asset.uri, name, mime }]);
      await loadAttachments();
      onUpdated({
        ...task,
        file_count: (task.file_count ?? 0) + 1,
        attachment_count: (task.attachment_count ?? 0) + 1,
      });
      Alert.alert('Đã tải lên', 'Đã đính kèm vào công việc.');
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền camera', 'Cần quyền camera để chụp ảnh.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    await uploadMediaAsset(shot.assets[0], `photo_${Date.now()}.jpg`, 'image/jpeg');
  };

  const captureVideo = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền camera', 'Cần quyền camera để quay video.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 120,
      quality: 0.7,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    await uploadMediaAsset(
      a,
      a.fileName || `video_${Date.now()}.mp4`,
      a.mimeType || 'video/mp4',
    );
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Thiếu tên', 'Nhập tên nhiệm vụ.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateCrmTask(dealId, task.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        stage_slug: task.stage_slug,
      });
      onUpdated(updated);
      closeModal();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAssign = async () => {
    if (!selectedIds.size) {
      Alert.alert('Chọn nhân viên', 'Chọn ít nhất một nhân viên.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateCrmTask(dealId, task.id, {
        assignee_ids: [...selectedIds],
      });
      onUpdated(updated);
      closeModal();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveDeadline = async (date: Date) => {
    setBusy(true);
    try {
      const updated = await updateCrmTask(dealId, task.id, { deadline: deadlineToIso(date) });
      onUpdated(updated);
      closeModal();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const clearDeadline = async () => {
    setBusy(true);
    try {
      const updated = await updateCrmTask(dealId, task.id, { deadline: null });
      onUpdated(updated);
      closeModal();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowAndroidPicker(false);
    if (date) setPickDate(date);
  };

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          marginBottom: 8,
        },
        rowHighlight: {
          borderColor: colors.primary,
          borderWidth: 2,
          backgroundColor: colors.primary + '14',
        },
        focusBanner: {
          alignSelf: 'flex-start',
          marginBottom: 8,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: Radii.full,
          backgroundColor: colors.primary + '22',
        },
        focusBannerTxt: { color: colors.primary, fontSize: 10, fontWeight: '800' },
        top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
        check: {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        },
        checkDone: { borderColor: colors.success, backgroundColor: colors.success + '22' },
        body: { flex: 1, minWidth: 0 },
        title: { color: colors.text, fontSize: 14, fontWeight: '700' },
        titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
        meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
        metaBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 6,
          paddingVertical: 3,
          borderRadius: Radii.sm,
        },
        metaText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        metaTextActive: { color: colors.primary },
        metaOverdue: { color: colors.danger },
        attachBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
        noteBox: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
          marginTop: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: Radii.md,
          backgroundColor: colors.warning + '1A',
          borderWidth: 1,
          borderColor: colors.warning + '55',
          borderLeftWidth: 3,
          borderLeftColor: colors.warning,
        },
        noteIcon: { marginTop: 1 },
        noteText: {
          flex: 1,
          color: colors.text,
          fontSize: 12,
          fontWeight: '600',
          lineHeight: 17,
        },
        noteLabel: {
          color: colors.warning,
          fontSize: 10,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          marginBottom: 2,
        },
        avatar: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
        actions: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          marginTop: 10,
          paddingTop: 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        actionBtn: {
          width: 36,
          height: 36,
          borderRadius: Radii.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionBtnPrimary: {
          backgroundColor: colors.primary + '18',
        },
        actionBtnActive: { backgroundColor: colors.primarySoft },
        mediaActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
        },
        mediaBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minHeight: 40,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgElevated || colors.cardAlt,
          paddingHorizontal: 10,
        },
        mediaBtnPhoto: {
          borderColor: colors.primary + '55',
          backgroundColor: colors.primary + '14',
        },
        mediaBtnVideo: {
          borderColor: '#A855F755',
          backgroundColor: '#A855F714',
        },
        mediaBtnTxt: { fontSize: 12, fontWeight: '800' },
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          paddingHorizontal: Spacing.lg,
          paddingTop: 16,
          paddingBottom: 24,
          maxHeight: '85%',
        },
        sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.text,
          fontSize: 14,
          backgroundColor: colors.card,
          marginBottom: 10,
        },
        textArea: { minHeight: 90, textAlignVertical: 'top' },
        btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
        btn: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: Radii.md,
          alignItems: 'center',
        },
        btnPrimary: { backgroundColor: colors.primary },
        btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
        btnDanger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
        btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
        btnTextDark: { color: colors.text, fontWeight: '700', fontSize: 14 },
        btnTextDanger: { color: colors.danger, fontWeight: '700', fontSize: 14 },
        userRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        userName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
        attRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        attBody: { flex: 1, minWidth: 0 },
        attName: { color: colors.text, fontSize: 13, fontWeight: '600' },
        attType: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
        attDelete: {
          width: 34,
          height: 34,
          borderRadius: Radii.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.dangerSoft,
        },
        noteSectionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        },
        noteDeleteBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.sm,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger + '44',
        },
        noteDeleteText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
        emptyAtt: { color: colors.textMuted, fontSize: 13, paddingVertical: 8 },
      }),
    [colors],
  );

  const isOverdue = deadline && !done && new Date(deadline).getTime() < Date.now();

  const renderModal = () => {
    if (!modal) return null;

    if (modal === 'deadline') {
      return (
        <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
          <Pressable style={styles.modalOverlay} onPress={closeModal}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Ngày hẹn</Text>
              {(Platform.OS === 'ios' || showAndroidPicker) && (
                <DateTimePicker
                  value={pickDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  locale="vi-VN"
                />
              )}
              <View style={styles.btnRow}>
                {deadline ? (
                  <TapHighlight style={[styles.btn, styles.btnDanger]} onPress={() => void clearDeadline()} disabled={busy}>
                    <Text style={styles.btnTextDanger}>Xóa hạn</Text>
                  </TapHighlight>
                ) : null}
                <TapHighlight style={[styles.btn, styles.btnGhost]} onPress={closeModal}>
                  <Text style={styles.btnTextDark}>Hủy</Text>
                </TapHighlight>
                <TapHighlight
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => void saveDeadline(pickDate)}
                  disabled={busy}
                >
                  {busy ? <SpinningLoader color="#fff" /> : <Text style={styles.btnText}>Lưu</Text>}
                </TapHighlight>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      );
    }

    if (modal === 'edit') {
      return (
        <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Pressable style={styles.modalOverlay} onPress={closeModal}>
              <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                <Text style={styles.sheetTitle}>Sửa nhiệm vụ</Text>
                <TextInput
                  style={styles.input}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Tên nhiệm vụ"
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Mô tả (tuỳ chọn)"
                  placeholderTextColor={colors.textFaint}
                  multiline
                />
                <View style={styles.btnRow}>
                  <TapHighlight style={[styles.btn, styles.btnGhost]} onPress={closeModal}>
                    <Text style={styles.btnTextDark}>Hủy</Text>
                  </TapHighlight>
                  <TapHighlight style={[styles.btn, styles.btnPrimary]} onPress={() => void saveEdit()} disabled={busy}>
                    {busy ? <SpinningLoader color="#fff" /> : <Text style={styles.btnText}>Lưu</Text>}
                  </TapHighlight>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      );
    }

    if (modal === 'assign') {
      return (
        <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
          <Pressable style={styles.modalOverlay} onPress={closeModal}>
            <Pressable style={[styles.sheet, { maxHeight: '75%' }]} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Gán nhân viên</Text>
              {usersLoading ? (
                <SpinningLoader color={colors.primary} style={{ marginVertical: 20 }} />
              ) : (
                <FlatList
                  data={users}
                  keyExtractor={(u) => String(u.id)}
                  style={{ maxHeight: 320 }}
                  renderItem={({ item }) => {
                    const id = String(item.id);
                    const checked = selectedIds.has(id);
                    return (
                      <TapHighlight style={styles.userRow} onPress={() => toggleUser(id)}>
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={checked ? colors.primary : colors.textFaint}
                        />
                        <Text style={styles.userName}>{item.full_name || id}</Text>
                      </TapHighlight>
                    );
                  }}
                  ListEmptyComponent={<Text style={styles.emptyAtt}>Không có danh sách nhân viên</Text>}
                />
              )}
              <View style={styles.btnRow}>
                <TapHighlight style={[styles.btn, styles.btnGhost]} onPress={closeModal}>
                  <Text style={styles.btnTextDark}>Hủy</Text>
                </TapHighlight>
                <TapHighlight style={[styles.btn, styles.btnPrimary]} onPress={() => void saveAssign()} disabled={busy}>
                  {busy ? (
                    <SpinningLoader color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Gán ({selectedIds.size})</Text>
                  )}
                </TapHighlight>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      );
    }

    if (modal === 'attach') {
      return (
        <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Pressable style={styles.modalOverlay} onPress={closeModal}>
              <Pressable style={[styles.sheet, { maxHeight: '85%' }]} onPress={(e) => e.stopPropagation()}>
                <View style={styles.noteSectionHeader}>
                  <Text style={styles.sheetTitle}>Ghi chú</Text>
                  {(noteDraft.trim() || hasNote) ? (
                    <TapHighlight style={styles.noteDeleteBtn} onPress={confirmDeleteNote} disabled={busy}>
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.noteDeleteText}>Xóa ghi chú</Text>
                    </TapHighlight>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="Nhập ghi chú — sẽ hiển thị nổi bật trên nhiệm vụ..."
                  placeholderTextColor={colors.textFaint}
                  multiline
                />
                <View style={styles.btnRow}>
                  <TapHighlight style={[styles.btn, styles.btnPrimary]} onPress={() => void saveNotes()} disabled={busy}>
                    {busy ? <SpinningLoader color="#fff" /> : <Text style={styles.btnText}>Lưu ghi chú</Text>}
                  </TapHighlight>
                  <TapHighlight style={[styles.btn, styles.btnGhost]} onPress={() => void pickFile()} disabled={busy}>
                    <Text style={styles.btnTextDark}>Chọn file</Text>
                  </TapHighlight>
                </View>
                <View style={[styles.mediaActions, { marginTop: 8 }]}>
                  <TapHighlight
                    style={[styles.mediaBtn, styles.mediaBtnPhoto]}
                    onPress={() => void capturePhoto()}
                    disabled={busy}
                  >
                    <Ionicons name="camera" size={16} color={colors.primary} />
                    <Text style={[styles.mediaBtnTxt, { color: colors.primary }]}>Chụp</Text>
                  </TapHighlight>
                  <TapHighlight
                    style={[styles.mediaBtn, styles.mediaBtnVideo]}
                    onPress={() => void captureVideo()}
                    disabled={busy}
                  >
                    <Ionicons name="videocam" size={16} color="#A855F7" />
                    <Text style={[styles.mediaBtnTxt, { color: '#A855F7' }]}>Video</Text>
                  </TapHighlight>
                </View>
                <Text style={[styles.sheetTitle, { fontSize: 14, marginTop: 12 }]}>
                  File đính kèm ({attachments.length})
                </Text>
                {attLoading ? (
                  <SpinningLoader color={colors.primary} />
                ) : attachments.length ? (
                  <ScrollView style={{ maxHeight: 180 }}>
                    {attachments.map((a) => (
                      <TapHighlight
                        key={a.id}
                        style={styles.attRow}
                        onPress={() => void openAttachment(a)}
                        disabled={downloadingId === a.id}
                      >
                        <Ionicons
                          name={
                            a.doc_type === 'task_note'
                              ? 'document-text-outline'
                              : isImageFile(a)
                                ? 'image-outline'
                                : 'document-outline'
                          }
                          size={18}
                          color={colors.primary}
                        />
                        <View style={styles.attBody}>
                          <Text style={styles.attName} numberOfLines={1}>
                            {a.name || a.file_name || 'Tệp'}
                          </Text>
                          {a.doc_type === 'task_note' && a.notes ? (
                            <Text style={styles.attType} numberOfLines={2}>{a.notes}</Text>
                          ) : (
                            <Text style={styles.attType}>
                              {isImageFile(a) ? 'Ảnh · xem trong app' : 'Tải về máy'}
                            </Text>
                          )}
                        </View>
                        {downloadingId === a.id ? (
                          <SpinningLoader size="small" color={colors.primary} />
                        ) : (
                          <Ionicons
                            name={isImageFile(a) ? 'expand-outline' : 'download-outline'}
                            size={16}
                            color={colors.textMuted}
                          />
                        )}
                        {a.doc_type !== 'task_note' ? (
                          <TapHighlight
                            style={styles.attDelete}
                            onPress={() => confirmDeleteFile(a)}
                            disabled={busy}
                            hitSlop={4}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TapHighlight>
                        ) : null}
                      </TapHighlight>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptyAtt}>Chưa có file đính kèm</Text>
                )}
                <TapHighlight style={[styles.btn, styles.btnGhost, { marginTop: 12 }]} onPress={closeModal}>
                  <Text style={styles.btnTextDark}>Đóng</Text>
                </TapHighlight>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      );
    }

    return null;
  };

  return (
    <>
      <View style={[styles.row, highlighted && styles.rowHighlight]}>
        {highlighted ? (
          <View style={styles.focusBanner}>
            <Text style={styles.focusBannerTxt}>Công việc đang mở</Text>
          </View>
        ) : null}
        <View style={styles.top}>
          <TapHighlight style={[styles.check, done && styles.checkDone]} onPress={() => void toggleStatus()} disabled={busy}>
            {done ? <Ionicons name="checkmark" size={14} color={colors.success} /> : null}
          </TapHighlight>
          <View style={styles.body}>
            <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
              {task.title}
            </Text>
            {hasNote ? (
              <TapHighlight
                style={styles.noteBox}
                pressStyle={{ opacity: 0.92 }}
                onPress={openAttach}
              >
                <Ionicons name="chatbubble-ellipses" size={16} color={colors.warning} style={styles.noteIcon} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.noteLabel}>Ghi chú</Text>
                  <Text style={styles.noteText} numberOfLines={4}>
                    {noteText}
                  </Text>
                </View>
              </TapHighlight>
            ) : null}
            <View style={styles.meta}>
              <TapHighlight
                style={styles.metaBtn}
                pressStyle={{ backgroundColor: colors.primarySoft }}
                onPress={openDeadline}
              >
                <Ionicons name="calendar-outline" size={12} color={isOverdue ? colors.danger : colors.textFaint} />
                <Text style={[styles.metaText, deadline ? (isOverdue ? styles.metaOverdue : styles.metaTextActive) : null]}>
                  {deadline ? formatDate(deadline) : '+ Ngày hẹn'}
                </Text>
              </TapHighlight>
              {fileCount > 0 && (
                <View style={styles.attachBadge}>
                  <Ionicons name="attach" size={12} color={colors.textFaint} />
                  <Text style={styles.metaText}>{fileCount} file</Text>
                </View>
              )}
            </View>
          </View>
          {assignee ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(assignee.full_name)}</Text>
            </View>
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.cardAlt }]}>
              <Ionicons name="person-outline" size={14} color={colors.textFaint} />
            </View>
          )}
        </View>

        <View style={styles.mediaActions}>
          <TapHighlight
            style={[styles.mediaBtn, styles.mediaBtnPhoto]}
            pressStyle={{ opacity: 0.85 }}
            onPress={() => void capturePhoto()}
            disabled={busy}
          >
            {busy ? (
              <SpinningLoader size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="camera" size={18} color={colors.primary} />
                <Text style={[styles.mediaBtnTxt, { color: colors.primary }]}>Chụp ảnh</Text>
              </>
            )}
          </TapHighlight>
          <TapHighlight
            style={[styles.mediaBtn, styles.mediaBtnVideo]}
            pressStyle={{ opacity: 0.85 }}
            onPress={() => void captureVideo()}
            disabled={busy}
          >
            {busy ? (
              <SpinningLoader size="small" color="#A855F7" />
            ) : (
              <>
                <Ionicons name="videocam" size={18} color="#A855F7" />
                <Text style={[styles.mediaBtnTxt, { color: '#A855F7' }]}>Quay video</Text>
              </>
            )}
          </TapHighlight>
        </View>

        <View style={styles.actions}>
          <TapHighlight
            style={styles.actionBtn}
            pressStyle={styles.actionBtnActive}
            onPress={openAttach}
            hitSlop={4}
          >
            <Ionicons name="attach-outline" size={18} color={colors.textMuted} />
          </TapHighlight>
          <TapHighlight
            style={styles.actionBtn}
            pressStyle={styles.actionBtnActive}
            onPress={openAssign}
            hitSlop={4}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.textMuted} />
          </TapHighlight>
          <TapHighlight style={styles.actionBtn} pressStyle={styles.actionBtnActive} onPress={openEdit} hitSlop={4}>
            <Ionicons name="pencil-outline" size={18} color={colors.primary} />
          </TapHighlight>
          <TapHighlight style={styles.actionBtn} pressStyle={styles.actionBtnActive} onPress={confirmDelete} hitSlop={4}>
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </TapHighlight>
        </View>
      </View>
      {renderModal()}
      <ImageGalleryLightbox
        visible={!!gallery}
        images={gallery?.images || []}
        initialIndex={gallery?.index || 0}
        onClose={() => setGallery(null)}
      />
    </>
  );
}
