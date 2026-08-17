import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
  addCrmTaskNote,
  addWorkshopTaskNote,
  deleteCrmTask,
  deleteCrmTaskAttachment,
  deleteWorkshopTask,
  deleteWorkshopTaskAttachment,
  deleteWorkshopTaskNote,
  fetchCrmTaskAttachments,
  fetchLeadMembers,
  fetchUsersForAssign,
  fetchWorkshopTaskAttachments,
  fetchWorkshopTaskNotes,
  taskDeadline,
  updateCrmTask,
  updateCrmTaskNotes,
  updateWorkshopTask,
  uploadCrmTaskFiles,
  uploadWorkshopTaskFiles,
  type TaskAttachment,
} from '../../lib/projectDetailApi';
import { fetchEmployeesByCompanyForMembers } from '../../lib/leadMembersApi';
import { Radii, Spacing } from '../../theme';
import type { CrmTask, PersonRef, TaskStaffNote } from '../../types';
import TapHighlight from '../TapHighlight';
import { resolveMediaUrl } from '../../lib/mediaUtils';

type Props = {
  task: CrmTask;
  dealId?: string | null;
  /** Công ty VC/LĐ — dùng khi gán người cho nhiệm vụ workshop */
  projectCompanyId?: string | null;
  highlighted?: boolean;
  onUpdated: (task: CrmTask) => void;
  onDeleted: (taskId: string) => void;
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

function formatNoteTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function guessMime(name: string, fallback = 'application/octet-stream'): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return fallback;
}

type ModalKind = 'attach' | 'assign' | 'edit' | 'deadline' | null;

export default function ProjectCrmTaskRow({
  task,
  dealId,
  projectCompanyId,
  highlighted,
  onUpdated,
  onDeleted,
}: Props) {
  const { colors } = useTheme();
  const isWorkshop = task.source === 'workshop'
    || String(task.stage_slug || '').startsWith('vc_ws_');
  const done = isTaskDone(task.status);
  const assignees = taskAssignees(task);
  const assignee = assignees[0] || null;
  const deadline = taskDeadline(task);
  const fileCount = task.file_count ?? 0;
  const descriptionText = task.description?.trim() || '';
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');
  const [staffNotes, setStaffNotes] = useState<TaskStaffNote[]>(task.staff_notes || []);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const noteCount = staffNotes.length || task.note_count || 0;
  const latestNote = staffNotes[0]?.text?.trim() || task.notes?.trim() || '';
  const hasNote = noteCount > 0 || Boolean(latestNote);

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
    setNoteDraft('');
    setModal('attach');
    void loadNotesAndAttachments();
  };

  const syncNotePreview = (notes: TaskStaffNote[]) => {
    setStaffNotes(notes);
    onUpdated({
      ...task,
      staff_notes: notes,
      notes: notes[0]?.text || null,
      note_count: notes.length,
      attachment_count: (task.file_count ?? 0) + notes.length,
      source: task.source,
    });
  };

  const loadNotesAndAttachments = async () => {
    setAttLoading(true);
    try {
      if (isWorkshop) {
        const [notes, files] = await Promise.all([
          fetchWorkshopTaskNotes(task.id),
          fetchWorkshopTaskAttachments(task.id),
        ]);
        setStaffNotes(notes);
        setAttachments(files.filter((a) => a.file_url));
        onUpdated({
          ...task,
          staff_notes: notes,
          notes: notes[0]?.text || null,
          note_count: notes.length,
          file_count: files.filter((a) => a.file_url).length,
          source: 'workshop',
        });
      } else if (dealId) {
        const list = await fetchCrmTaskAttachments(dealId, task.id);
        const noteAtts = list.filter(
          (a) => a.doc_type === 'task_note' || a.doc_type === 'task_inline_note' || (!a.file_url && a.notes),
        );
        const files = list.filter((a) => a.file_url && a.doc_type !== 'task_note' && a.doc_type !== 'task_inline_note');
        const notes: TaskStaffNote[] = [];
        if (task.notes?.trim()) {
          notes.push({ id: `inline-${task.id}`, text: task.notes.trim(), created_at: null, user_name: null });
        }
        for (const a of noteAtts) {
          if (a.doc_type === 'task_inline_note') continue; // đã có trong task.notes
          const text = (a.notes || a.name || '').trim();
          if (!text) continue;
          notes.push({ id: a.id, text, created_at: null, user_name: null });
        }
        setStaffNotes(notes);
        setAttachments(files);
        onUpdated({
          ...task,
          staff_notes: notes,
          note_count: notes.length,
          file_count: files.length,
        });
      } else {
        setAttachments([]);
      }
    } catch {
      setAttachments([]);
    } finally {
      setAttLoading(false);
    }
  };

  const loadAttachments = async () => {
    try {
      const list = isWorkshop
        ? await fetchWorkshopTaskAttachments(task.id)
        : dealId
          ? await fetchCrmTaskAttachments(dealId, task.id)
          : [];
      setAttachments(
        list.filter(
          (a) =>
            a.file_url
            && a.doc_type !== 'task_inline_note'
            && a.doc_type !== 'task_note',
        ),
      );
    } catch {
      setAttachments([]);
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
      if (isWorkshop) {
        const [members, companyUsers] = await Promise.all([
          dealId ? fetchLeadMembers(dealId).catch(() => []) : Promise.resolve([]),
          projectCompanyId
            ? fetchEmployeesByCompanyForMembers(projectCompanyId).catch(() => [])
            : Promise.resolve([]),
        ]);
        const byId = new Map<string, PersonRef>();
        for (const m of members) {
          if (m.user?.id) byId.set(String(m.user.id), m.user);
        }
        for (const u of companyUsers) {
          if (!u.id) continue;
          if (!byId.has(u.id)) {
            byId.set(u.id, { id: u.id, full_name: u.full_name, email: u.email });
          }
        }
        if (!byId.size) {
          const all = await fetchUsersForAssign().catch(() => []);
          for (const u of all) if (u.id) byId.set(String(u.id), u);
        }
        setUsers([...byId.values()]);
      } else {
        const [allUsers, members] = await Promise.all([
          fetchUsersForAssign(),
          dealId ? fetchLeadMembers(dealId) : Promise.resolve([]),
        ]);
        const memberIds = new Set(members.map((m) => String(m.user_id)).filter(Boolean));
        const memberUsers = members
          .map((m) => m.user)
          .filter((u): u is PersonRef => Boolean(u?.id));
        const extra = allUsers.filter((u) => u.id && !memberIds.has(String(u.id)));
        setUsers([...memberUsers, ...extra]);
      }
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
      const updated = isWorkshop
        ? await updateWorkshopTask(task.id, { status: next })
        : await updateCrmTask(String(dealId), task.id, { status: next });
      onUpdated({ ...updated, source: task.source });
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
            if (isWorkshop) await deleteWorkshopTask(task.id);
            else await deleteCrmTask(String(dealId), task.id);
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

  const addNote = async () => {
    const text = noteDraft.trim();
    if (!text) {
      Alert.alert('Thiếu nội dung', 'Nhập ghi chú trước khi thêm.');
      return;
    }
    if (!isWorkshop && !dealId) {
      Alert.alert('Lỗi', 'Không xác định được deal để lưu ghi chú.');
      return;
    }
    setBusy(true);
    try {
      if (isWorkshop) {
        const created = await addWorkshopTaskNote(task.id, text);
        const next = [created, ...staffNotes];
        setNoteDraft('');
        syncNotePreview(next);
      } else {
        const created = await addCrmTaskNote(String(dealId), task.id, text);
        const next: TaskStaffNote[] = [
          { id: created.id, text, created_at: null, user_name: null },
          ...staffNotes,
        ];
        setNoteDraft('');
        syncNotePreview(next);
      }
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteNote = (note: TaskStaffNote) => {
    Alert.alert('Xóa ghi chú', 'Xóa ghi chú này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            if (isWorkshop) {
              await deleteWorkshopTaskNote(task.id, note.id);
              syncNotePreview(staffNotes.filter((n) => n.id !== note.id));
            } else if (dealId) {
              if (note.id.startsWith('inline-')) {
                await updateCrmTaskNotes(dealId, task.id, null);
              } else {
                await deleteCrmTaskAttachment(dealId, task.id, note.id);
              }
              syncNotePreview(staffNotes.filter((n) => n.id !== note.id));
            }
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
            if (isWorkshop) await deleteWorkshopTaskAttachment(task.id, att.id);
            else await deleteCrmTaskAttachment(String(dealId), task.id, att.id);
            await loadAttachments();
            const nextFileCount = Math.max(0, (task.file_count ?? 0) - 1);
            onUpdated({
              ...task,
              file_count: nextFileCount,
              attachment_count: nextFileCount + noteCount,
              source: task.source,
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

  const uploadPickedFiles = async (
    files: { uri: string; name: string; mime: string }[],
    opts?: { silent?: boolean },
  ) => {
    if (!files.length) return;
    setBusy(true);
    try {
      if (isWorkshop) await uploadWorkshopTaskFiles(task.id, files);
      else await uploadCrmTaskFiles(String(dealId), task.id, files);
      await loadAttachments();
      onUpdated({
        ...task,
        file_count: (task.file_count ?? 0) + files.length,
        attachment_count: (task.attachment_count ?? 0) + files.length,
        source: task.source,
      });
      if (!opts?.silent) {
        Alert.alert('Đã tải lên', `Đã đính kèm ${files.length} file.`);
      }
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    const pick = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (pick.canceled || !pick.assets?.length) return;
    await uploadPickedFiles(
      pick.assets.map((a) => ({
        uri: a.uri,
        name: a.name || 'file',
        mime: a.mimeType || guessMime(a.name || 'file'),
      })),
    );
  };

  const takePhoto = async (opts?: { silent?: boolean; openSheetAfter?: boolean }) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền camera', 'Cho phép camera để chụp ảnh ghi chú.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    const name = a.fileName || `anh-${Date.now()}.jpg`;
    await uploadPickedFiles(
      [{ uri: a.uri, name, mime: a.mimeType || guessMime(name, 'image/jpeg') }],
      { silent: opts?.silent },
    );
    if (opts?.openSheetAfter) openAttach();
  };

  const takeVideo = async (opts?: { silent?: boolean; openSheetAfter?: boolean }) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền camera', 'Cho phép camera để quay video ghi chú.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 120,
      quality: 0.7,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    const name = a.fileName || `video-${Date.now()}.mp4`;
    await uploadPickedFiles(
      [{ uri: a.uri, name, mime: a.mimeType || guessMime(name, 'video/mp4') }],
      { silent: opts?.silent },
    );
    if (opts?.openSheetAfter) openAttach();
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền thư viện', 'Cho phép truy cập ảnh/video để đính kèm.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 50,
    });
    if (res.canceled || !res.assets?.length) return;
    await uploadPickedFiles(
      res.assets.map((a, i) => {
        const name = a.fileName || `media-${Date.now()}-${i}.${a.type === 'video' ? 'mp4' : 'jpg'}`;
        return {
          uri: a.uri,
          name,
          mime: a.mimeType || guessMime(name, a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        };
      }),
    );
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Thiếu tên', 'Nhập tên nhiệm vụ.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        ...(isWorkshop ? {} : { stage_slug: task.stage_slug }),
      };
      const updated = isWorkshop
        ? await updateWorkshopTask(task.id, payload)
        : await updateCrmTask(String(dealId), task.id, payload);
      onUpdated({ ...updated, source: task.source });
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
      const ids = [...selectedIds];
      const updated = isWorkshop
        ? await updateWorkshopTask(task.id, { assignee_id: ids[0] || null, assignee_ids: ids })
        : await updateCrmTask(String(dealId), task.id, { assignee_ids: ids });
      const picked = users.filter((u) => u.id && selectedIds.has(String(u.id)));
      onUpdated({
        ...updated,
        assignee: picked[0] || updated.assignee || null,
        assignees: picked.length ? picked : updated.assignees,
        source: task.source,
      });
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
      const iso = deadlineToIso(date);
      const updated = isWorkshop
        ? await updateWorkshopTask(task.id, { due_date: iso, deadline: iso })
        : await updateCrmTask(String(dealId), task.id, { deadline: iso });
      onUpdated({ ...updated, source: task.source });
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
      const updated = isWorkshop
        ? await updateWorkshopTask(task.id, { due_date: null, deadline: null })
        : await updateCrmTask(String(dealId), task.id, { deadline: null });
      onUpdated({ ...updated, source: task.source });
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
      if (isWorkshop) {
        // Nhiệm vụ xưởng chỉ 1 người phụ trách
        return prev.has(id) ? new Set() : new Set([id]);
      }
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
        descBox: {
          marginTop: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: Radii.md,
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
        },
        descLabel: {
          color: colors.primary,
          fontSize: 10,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          marginBottom: 2,
        },
        descText: {
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 17,
        },
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
        mediaRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 4,
          marginBottom: 8,
        },
        mediaBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: Radii.md,
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
        },
        mediaBtnPrimary: {
          backgroundColor: colors.primarySoft,
          borderColor: colors.primary + '66',
          flex: 1,
          minWidth: 120,
          justifyContent: 'center',
        },
        mediaBtnText: { color: colors.text, fontSize: 12, fontWeight: '700' },
        mediaBtnTextPrimary: { color: colors.primary, fontSize: 13, fontWeight: '800' },
        quickCapture: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
        },
        quickCaptureBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: 8,
          borderRadius: Radii.md,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.primary + '55',
        },
        quickCaptureBtnAlt: {
          backgroundColor: colors.cardAlt,
          borderColor: colors.border,
        },
        quickCaptureText: {
          color: colors.primary,
          fontSize: 12,
          fontWeight: '800',
        },
        quickCaptureTextAlt: {
          color: colors.text,
          fontSize: 12,
          fontWeight: '700',
        },
        noteItem: {
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        noteItemMeta: { color: colors.textFaint, fontSize: 11, marginBottom: 4 },
        noteItemText: { color: colors.text, fontSize: 13, lineHeight: 18 },
        noteItemActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
        sectionLabel: {
          color: colors.text,
          fontSize: 14,
          fontWeight: '800',
          marginTop: 12,
          marginBottom: 6,
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
        actionBtnActive: { backgroundColor: colors.primarySoft },
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
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Lưu</Text>}
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
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Lưu</Text>}
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
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
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
                    <ActivityIndicator color="#fff" />
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
              <Pressable style={[styles.sheet, { maxHeight: '90%' }]} onPress={(e) => e.stopPropagation()}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.sheetTitle}>Ghi chú & file</Text>

                  {descriptionText ? (
                    <View style={styles.descBox}>
                      <Text style={styles.descLabel}>Mô tả / hướng dẫn</Text>
                      <Text style={styles.descText}>{descriptionText}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.sectionLabel}>Thêm ghi chú nhân viên</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    placeholder="Nhập ghi chú mới (có thể thêm nhiều lần)…"
                    placeholderTextColor={colors.textFaint}
                    multiline
                  />
                  <View style={styles.mediaRow}>
                    <TapHighlight
                      style={[styles.mediaBtn, styles.mediaBtnPrimary]}
                      onPress={() => void takePhoto({ silent: true })}
                      disabled={busy}
                    >
                      <Ionicons name="camera" size={20} color={colors.primary} />
                      <Text style={styles.mediaBtnTextPrimary}>Chụp nhanh</Text>
                    </TapHighlight>
                    <TapHighlight
                      style={[styles.mediaBtn, styles.mediaBtnPrimary]}
                      onPress={() => void takeVideo({ silent: true })}
                      disabled={busy}
                    >
                      <Ionicons name="videocam" size={20} color={colors.primary} />
                      <Text style={styles.mediaBtnTextPrimary}>Quay video</Text>
                    </TapHighlight>
                  </View>
                  <TapHighlight
                    style={[styles.btn, styles.btnPrimary, { marginBottom: 4 }]}
                    onPress={() => void addNote()}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Thêm ghi chú</Text>}
                  </TapHighlight>

                  <Text style={styles.sectionLabel}>Thêm file khác</Text>
                  <View style={styles.mediaRow}>
                    <TapHighlight style={styles.mediaBtn} onPress={() => void pickFromLibrary()} disabled={busy}>
                      <Ionicons name="images-outline" size={18} color={colors.primary} />
                      <Text style={styles.mediaBtnText}>Thư viện</Text>
                    </TapHighlight>
                    <TapHighlight style={styles.mediaBtn} onPress={() => void pickFile()} disabled={busy}>
                      <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
                      <Text style={styles.mediaBtnText}>Nhiều file</Text>
                    </TapHighlight>
                  </View>

                  <Text style={styles.sectionLabel}>Ghi chú đã nhập ({staffNotes.length})</Text>
                  {attLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : staffNotes.length ? (
                    staffNotes.map((n) => (
                      <View key={n.id} style={styles.noteItem}>
                        <Text style={styles.noteItemMeta}>
                          {[n.user_name, formatNoteTime(n.created_at)].filter(Boolean).join(' · ') || 'Ghi chú'}
                        </Text>
                        <Text style={styles.noteItemText}>{n.text}</Text>
                        <View style={styles.noteItemActions}>
                          <TapHighlight
                            style={styles.noteDeleteBtn}
                            onPress={() => confirmDeleteNote(n)}
                            disabled={busy}
                          >
                            <Ionicons name="trash-outline" size={14} color={colors.danger} />
                            <Text style={styles.noteDeleteText}>Xóa</Text>
                          </TapHighlight>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyAtt}>Chưa có ghi chú — nhân viên nhập bên trên</Text>
                  )}

                  <Text style={styles.sectionLabel}>File đính kèm ({attachments.length})</Text>
                  {attLoading ? null : attachments.length ? (
                    attachments.map((a) => (
                      <TapHighlight
                        key={a.id}
                        style={styles.attRow}
                        onPress={() => {
                          const url = resolveMediaUrl(a.file_url);
                          if (url) void Linking.openURL(url);
                        }}
                      >
                        <Ionicons
                          name={
                            (a.mime_type || '').startsWith('video/')
                              ? 'videocam-outline'
                              : (a.mime_type || '').startsWith('image/')
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
                          {a.mime_type ? (
                            <Text style={styles.attType} numberOfLines={1}>{a.mime_type}</Text>
                          ) : null}
                        </View>
                        <TapHighlight
                          style={styles.attDelete}
                          onPress={() => confirmDeleteFile(a)}
                          disabled={busy}
                          hitSlop={4}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TapHighlight>
                      </TapHighlight>
                    ))
                  ) : (
                    <Text style={styles.emptyAtt}>Chưa có file — có thể gửi nhiều lần</Text>
                  )}

                  <TapHighlight style={[styles.btn, styles.btnGhost, { marginTop: 16 }]} onPress={closeModal}>
                    <Text style={styles.btnTextDark}>Đóng</Text>
                  </TapHighlight>
                </ScrollView>
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
            {descriptionText ? (
              <View style={styles.descBox}>
                <Text style={styles.descLabel}>Mô tả</Text>
                <Text style={styles.descText} numberOfLines={3}>
                  {descriptionText}
                </Text>
              </View>
            ) : null}
            {hasNote ? (
              <TapHighlight
                style={styles.noteBox}
                pressStyle={{ opacity: 0.92 }}
                onPress={openAttach}
              >
                <Ionicons name="chatbubble-ellipses" size={16} color={colors.warning} style={styles.noteIcon} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.noteLabel}>
                    Ghi chú{noteCount > 1 ? ` (${noteCount})` : ''}
                  </Text>
                  <Text style={styles.noteText} numberOfLines={4}>
                    {latestNote || `${noteCount} ghi chú`}
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
            <View style={styles.quickCapture}>
              <TapHighlight
                style={styles.quickCaptureBtn}
                pressStyle={{ opacity: 0.88 }}
                onPress={() => void takePhoto({ silent: true, openSheetAfter: true })}
                disabled={busy}
              >
                <Ionicons name="camera" size={16} color={colors.primary} />
                <Text style={styles.quickCaptureText}>Chụp nhanh</Text>
              </TapHighlight>
              <TapHighlight
                style={[styles.quickCaptureBtn, styles.quickCaptureBtnAlt]}
                pressStyle={{ opacity: 0.88 }}
                onPress={() => void takeVideo({ silent: true, openSheetAfter: true })}
                disabled={busy}
              >
                <Ionicons name="videocam" size={16} color={colors.text} />
                <Text style={styles.quickCaptureTextAlt}>Quay video</Text>
              </TapHighlight>
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

        <View style={styles.actions}>
          <TapHighlight
            style={styles.actionBtn}
            pressStyle={styles.actionBtnActive}
            onPress={() => void takePhoto({ silent: true, openSheetAfter: true })}
            hitSlop={4}
            disabled={busy}
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
          </TapHighlight>
          <TapHighlight
            style={styles.actionBtn}
            pressStyle={styles.actionBtnActive}
            onPress={() => void takeVideo({ silent: true, openSheetAfter: true })}
            hitSlop={4}
            disabled={busy}
          >
            <Ionicons name="videocam-outline" size={18} color={colors.primary} />
          </TapHighlight>
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
    </>
  );
}
