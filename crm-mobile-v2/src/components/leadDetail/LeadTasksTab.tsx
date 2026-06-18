import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchCrmEmployeesByCompany } from '../../api/crmMeta';
import { formatApiError } from '../../api/client';
import type { LeadCrmTask } from '../../api/leadDetail';
import {
  addTaskAttachmentNote,
  addTaskAttachmentsBulk,
  createLeadTask,
  deleteLeadTask,
  deleteTaskAttachment,
  fetchLeadTasks,
  fetchTaskAttachments,
  updateChecklistNotes,
  updateLeadTask,
  updateTaskNotes,
  type TaskAttachment,
} from '../../api/leadTasks';
import PickerSheet, { type PickerOption } from '../PickerSheet';
import ImageGalleryLightbox, { type GalleryImage } from '../ImageGalleryLightbox';
import TaskAttachSheet, { type TaskAttachOption } from './TaskAttachSheet';
import {
  ckStateKey,
  genChecklistId,
  normalizeChecklist,
  type CrmChecklistItem,
} from '../../lib/crmChecklist';
import { resolveMediaUrl } from '../../lib/media';
import { isImageFile, toGalleryImage } from '../../lib/isImageFile';
import { attachmentItemFromUpload, uploadSingleFile, type LocalUploadFile } from '../../lib/uploadFile';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';

type Props = {
  leadId: string;
  companyId?: string | null;
};

type AttachTarget = { taskId: string; checklistId?: string | null };
type AssignTarget = { taskId: string; checklistId?: string };

function employeeName(map: Map<string, string>, id?: string | null): string {
  if (!id) return '';
  return map.get(String(id)) || '';
}

export default function LeadTasksTab({ leadId, companyId }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [tasks, setTasks] = useState<LeadCrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedCk, setExpandedCk] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, TaskAttachment[]>>({});
  const [employees, setEmployees] = useState<PickerOption[]>([]);
  const [attachTarget, setAttachTarget] = useState<AttachTarget | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [editTask, setEditTask] = useState<LeadCrmTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCk, setNewCk] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [editCkModal, setEditCkModal] = useState<{ taskId: string; ckId: string; title: string } | null>(null);
  const [quickNoteModal, setQuickNoteModal] = useState<{ target: AttachTarget; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setTasks(await fetchLeadTasks(leadId));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  const loadAtts = useCallback(async (taskId: string) => {
    try {
      const rows = await fetchTaskAttachments(leadId, taskId);
      setAttachments((p) => ({ ...p, [taskId]: rows }));
    } catch {
      /* ignore */
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    void fetchCrmEmployeesByCompany(companyId).then((res) => {
      setEmployees(
        (res.users || []).map((u) => ({
          id: String(u.id),
          name: u.full_name || u.email || 'NV',
        })),
      );
    });
  }, [companyId]);

  const patchTask = (taskId: string, row: LeadCrmTask) => {
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...row } : t)));
  };

  const saveTaskUpdate = async (taskId: string, payload: Parameters<typeof updateLeadTask>[2]) => {
    const prev = tasks;
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...payload } : t)));
    try {
      const data = await updateLeadTask(leadId, taskId, payload);
      patchTask(taskId, data);
      return data;
    } catch (e) {
      setTasks(prev);
      Alert.alert('Lỗi', formatApiError(e));
      throw e;
    }
  };

  const toggleExpand = (task: LeadCrmTask) => {
    const next = expandedId === task.id ? null : task.id;
    setExpandedId(next);
    if (next) {
      setNoteDraft((p) => ({ ...p, [task.id]: task.notes || '' }));
      void loadAtts(task.id);
    }
  };

  const toggleTaskStatus = async (task: LeadCrmTask) => {
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await saveTaskUpdate(task.id, { status: next });
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const row = await createLeadTask(leadId, { title, priority: 'medium', order_index: tasks.length });
      setTasks((p) => [...p, row]);
      setNewTitle('');
      setAddOpen(false);
      setExpandedId(row.id);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const confirmDeleteTask = (task: LeadCrmTask) => {
    Alert.alert('Xóa nhiệm vụ', `Xóa "${task.title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteLeadTask(leadId, task.id);
              setTasks((p) => p.filter((t) => t.id !== task.id));
              if (expandedId === task.id) setExpandedId(null);
            } catch (e) {
              Alert.alert('Lỗi', formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  const saveEditTitle = async () => {
    if (!editTask) return;
    const title = editTitle.trim();
    if (!title) return;
    try {
      await saveTaskUpdate(editTask.id, { title });
      setEditTask(null);
    } catch {
      /* handled */
    }
  };

  const addChecklist = async (task: LeadCrmTask) => {
    const title = (newCk[task.id] || '').trim();
    if (!title) return;
    const list = [
      ...normalizeChecklist(task.checklist),
      { id: genChecklistId(), title, description: '', notes: '', done: false, priority: 'medium', assignee_id: null },
    ];
    setNewCk((p) => ({ ...p, [task.id]: '' }));
    await saveTaskUpdate(task.id, { checklist: list });
  };

  const toggleCk = async (task: LeadCrmTask, ckId: string) => {
    const list = normalizeChecklist(task.checklist).map((c) =>
      c.id === ckId ? { ...c, done: !c.done } : c,
    );
    await saveTaskUpdate(task.id, { checklist: list });
  };

  const deleteCk = (task: LeadCrmTask, ckId: string) => {
    Alert.alert('Xóa mục checklist', 'Xóa mục này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          const list = normalizeChecklist(task.checklist).filter((c) => c.id !== ckId);
          void saveTaskUpdate(task.id, { checklist: list });
        },
      },
    ]);
  };

  const editCkTitle = (task: LeadCrmTask, ck: CrmChecklistItem) => {
    setEditCkModal({ taskId: task.id, ckId: ck.id, title: ck.title });
  };

  const saveEditCkTitle = async () => {
    if (!editCkModal) return;
    const title = editCkModal.title.trim();
    if (!title) return;
    const task = tasks.find((t) => t.id === editCkModal.taskId);
    if (!task) return;
    const list = normalizeChecklist(task.checklist).map((c) =>
      c.id === editCkModal.ckId ? { ...c, title } : c,
    );
    try {
      await saveTaskUpdate(editCkModal.taskId, { checklist: list });
      setEditCkModal(null);
    } catch {
      /* handled */
    }
  };

  const assignUser = async (userId: string | null) => {
    if (!assignTarget) return;
    const { taskId, checklistId } = assignTarget;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      if (checklistId) {
        const list = normalizeChecklist(task.checklist).map((c) =>
          c.id === checklistId ? { ...c, assignee_id: userId } : c,
        );
        await saveTaskUpdate(taskId, { checklist: list });
      } else {
        await saveTaskUpdate(taskId, { assignee_id: userId });
      }
    } finally {
      setAssignTarget(null);
    }
  };

  const saveTaskNote = async (taskId: string) => {
    setSaving(`note-${taskId}`);
    try {
      const data = await updateTaskNotes(leadId, taskId, noteDraft[taskId] || '');
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, notes: data.notes ?? noteDraft[taskId] } : t)));
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(null);
    }
  };

  const saveCkNote = async (taskId: string, ckId: string) => {
    const key = ckStateKey(taskId, ckId);
    setSaving(`cknote-${key}`);
    try {
      const data = await updateChecklistNotes(leadId, taskId, ckId, noteDraft[key] || '');
      setTasks((p) =>
        p.map((t) => (t.id === taskId ? { ...t, checklist: data.checklist || t.checklist } : t)),
      );
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSaving(null);
    }
  };

  const saveTextNote = async (target: AttachTarget, text: string) => {
    const body = text.trim();
    if (!body) return;
    try {
      await addTaskAttachmentNote(leadId, target.taskId, {
        notes: body,
        checklist_id: target.checklistId,
      });
      await loadAtts(target.taskId);
      void load(true);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const uploadFiles = async (target: AttachTarget, files: LocalUploadFile[]) => {
    if (!files.length) return;
    const upKey = target.checklistId
      ? ckStateKey(target.taskId, target.checklistId)
      : target.taskId;
    setUploading(upKey);
    try {
      const items = [];
      for (const f of files) {
        const up = await uploadSingleFile(f);
        items.push(attachmentItemFromUpload(up));
      }
      await addTaskAttachmentsBulk(leadId, target.taskId, items, target.checklistId);
      await loadAtts(target.taskId);
      void load(true);
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setUploading(null);
    }
  };

  const onAttachPick = async (option: TaskAttachOption) => {
    const target = attachTarget;
    if (!target) return;

    try {
      if (option === 'gallery') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Quyền truy cập', 'Cần quyền thư viện ảnh.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
          allowsMultipleSelection: true,
        });
        if (res.canceled || !res.assets?.length) return;
        await uploadFiles(
          target,
          res.assets.map((a) => ({
            uri: a.uri,
            name: a.fileName || `media_${Date.now()}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
            type: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
            size: a.fileSize,
          })),
        );
      } else if (option === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Quyền camera', 'Cần quyền camera để chụp ảnh.');
          return;
        }
        const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (shot.canceled || !shot.assets?.[0]) return;
        const a = shot.assets[0];
        await uploadFiles(target, [{
          uri: a.uri,
          name: a.fileName || `photo_${Date.now()}.jpg`,
          type: a.mimeType || 'image/jpeg',
          size: a.fileSize,
        }]);
      } else if (option === 'video') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Quyền camera', 'Cần quyền camera để quay video.');
          return;
        }
        const rec = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoQuality: 1 });
        if (rec.canceled || !rec.assets?.[0]) return;
        const a = rec.assets[0];
        await uploadFiles(target, [{
          uri: a.uri,
          name: a.fileName || `video_${Date.now()}.mp4`,
          type: a.mimeType || 'video/mp4',
          size: a.fileSize,
        }]);
      } else {
        const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
        if (pick.canceled || !pick.assets?.length) return;
        await uploadFiles(
          target,
          pick.assets.map((a) => ({
            uri: a.uri,
            name: a.name || 'file',
            type: a.mimeType || 'application/octet-stream',
            size: a.size,
          })),
        );
      }
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const openAttach = (target: AttachTarget) => {
    setAttachTarget(target);
    setAttachOpen(true);
  };

  const openAtt = (att: TaskAttachment, imageRows: TaskAttachment[]) => {
    if (isImageFile(att)) {
      const items = imageRows
        .map((a) => toGalleryImage(String(a.id), a, { title: a.file_name || a.name || 'Ảnh' }))
        .filter((g): g is NonNullable<typeof g> => !!g);
      const i = items.findIndex((g) => g.id === String(att.id));
      if (i >= 0) {
        setGalleryImages(items.map((g) => ({ uri: g.uri, title: g.title, subtitle: g.subtitle })));
        setGalleryIndex(i);
        setGalleryOpen(true);
        return;
      }
    }
    const u = resolveMediaUrl(att.file_url);
    if (u) void Linking.openURL(u);
  };

  const renderAttachments = (taskId: string, ckId?: string | null) => {
    const all = attachments[taskId] || [];
    const rows = ckId
      ? all.filter((a) => String(a.checklist_id || '') === String(ckId))
      : all.filter((a) => !a.checklist_id);
    if (!rows.length) return null;
    const imageRows = rows.filter((a) => isImageFile(a));
    const fileRows = rows.filter((a) => !isImageFile(a));
    return (
      <View style={styles.attList}>
        {imageRows.length > 0 ? (
          <View style={styles.attImgGrid}>
            {imageRows.map((att) => (
              <Pressable key={att.id} style={styles.attImgWrap} onPress={() => openAtt(att, imageRows)}>
                <Image source={{ uri: resolveMediaUrl(att.file_url) || '' }} style={styles.attImgTile} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        ) : null}
        {fileRows.map((att) => (
          <View key={att.id} style={styles.attRow}>
            <Pressable style={{ flex: 1 }} onPress={() => openAtt(att, imageRows)}>
              {att.doc_type === 'task_note' ? (
                <Text style={styles.attNote}>{att.notes || att.name}</Text>
              ) : (
                <Text style={styles.attName} numberOfLines={2}>{att.file_name || att.name || 'File'}</Text>
              )}
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                Alert.alert('Xóa đính kèm', 'Xóa mục này?', [
                  { text: 'Hủy', style: 'cancel' },
                  {
                    text: 'Xóa',
                    style: 'destructive',
                    onPress: () => {
                      void (async () => {
                        try {
                          await deleteTaskAttachment(leadId, taskId, att.id);
                          await loadAtts(taskId);
                          void load(true);
                        } catch (e) {
                          Alert.alert('Lỗi', formatApiError(e));
                        }
                      })();
                    },
                  },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.red} />
            </Pressable>
          </View>
        ))}
      </View>
    );
  };

  const renderChecklist = (task: LeadCrmTask) => {
    const list = normalizeChecklist(task.checklist);
    return (
      <View style={styles.ckBlock}>
        <Text style={styles.subTitle}>Checklist ({list.filter((c) => c.done).length}/{list.length})</Text>
        {list.map((ck) => {
          const key = ckStateKey(task.id, ck.id);
          const open = expandedCk === key;
          const assignee = employeeName(empMap, ck.assignee_id) || (task.assignee as { full_name?: string } | undefined)?.full_name;
          return (
            <View key={ck.id} style={styles.ckItem}>
              <View style={styles.ckHead}>
                <Pressable onPress={() => void toggleCk(task, ck.id)} hitSlop={6}>
                  <Ionicons
                    name={ck.done ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={ck.done ? Colors.green : Colors.textMuted}
                  />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => editCkTitle(task, ck)}>
                  <Text style={[styles.ckTitle, ck.done && styles.ckDone]} numberOfLines={2}>{ck.title}</Text>
                </Pressable>
                <Pressable onPress={() => setAssignTarget({ taskId: task.id, checklistId: ck.id })} hitSlop={6}>
                  <Ionicons name="person-outline" size={18} color={Colors.purple} />
                </Pressable>
                <Pressable onPress={() => deleteCk(task, ck.id)} hitSlop={6}>
                  <Ionicons name="close-circle-outline" size={18} color={Colors.textFaint} />
                </Pressable>
              </View>
              {assignee ? <Text style={styles.ckAssignee}>👤 {assignee}</Text> : null}
              <View style={styles.ckActions}>
                <Pressable
                  style={styles.miniBtn}
                  onPress={() => {
                    const next = open ? null : key;
                    setExpandedCk(next);
                    if (next) setNoteDraft((p) => ({ ...p, [key]: ck.notes || '' }));
                  }}
                >
                  <Text style={styles.miniBtnTxt}>{open ? 'Thu gọn' : 'Ghi chú / file'}</Text>
                </Pressable>
                <Pressable style={styles.miniBtn} onPress={() => openAttach({ taskId: task.id, checklistId: ck.id })}>
                  <Ionicons name="attach-outline" size={14} color={Colors.blue} />
                  <Text style={styles.miniBtnTxt}>Đính kèm</Text>
                </Pressable>
              </View>
              {open ? (
                <View style={styles.noteBox}>
                  <TextInput
                    style={styles.noteInput}
                    multiline
                    placeholder="Ghi chú checklist…"
                    placeholderTextColor={Colors.textFaint}
                    value={noteDraft[key] ?? ck.notes ?? ''}
                    onChangeText={(t) => setNoteDraft((p) => ({ ...p, [key]: t }))}
                  />
                  <View style={styles.noteActions}>
                    <Pressable style={styles.saveNoteBtn} onPress={() => void saveCkNote(task.id, ck.id)}>
                      <Text style={styles.saveNoteTxt}>{saving === `cknote-${key}` ? '…' : 'Lưu ghi chú'}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.saveNoteBtn}
                      onPress={() => setQuickNoteModal({ target: { taskId: task.id, checklistId: ck.id }, text: '' })}
                    >
                      <Text style={styles.saveNoteTxt}>+ Ghi chú</Text>
                    </Pressable>
                  </View>
                  {renderAttachments(task.id, ck.id)}
                  {uploading === key ? <ActivityIndicator color={Colors.blue} style={{ marginTop: 6 }} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={styles.addCkRow}>
          <TextInput
            style={styles.addCkInput}
            placeholder="Thêm mục checklist…"
            placeholderTextColor={Colors.textFaint}
            value={newCk[task.id] || ''}
            onChangeText={(t) => setNewCk((p) => ({ ...p, [task.id]: t }))}
            onSubmitEditing={() => void addChecklist(task)}
          />
          <Pressable style={styles.addCkBtn} onPress={() => void addChecklist(task)}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderTask = ({ item: task }: { item: LeadCrmTask }) => {
    const expanded = expandedId === task.id;
    const stageName = task.pipeline_stage?.name || task.stage_slug || '';
    const assignee =
      employeeName(empMap, task.assignee_id || task.assignees?.[0]?.id) ||
      task.assignees?.map((a) => a.full_name).filter(Boolean).join(', ') ||
      (task.assignee as { full_name?: string } | undefined)?.full_name;

    return (
      <View style={styles.card}>
        <Pressable style={styles.taskHead} onPress={() => toggleExpand(task)}>
          <Pressable onPress={() => void toggleTaskStatus(task)} hitSlop={8}>
            <Ionicons
              name={task.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={task.status === 'completed' ? Colors.green : Colors.textMuted}
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, task.status === 'completed' && styles.taskDone]} numberOfLines={2}>
              {task.title || 'Nhiệm vụ'}
            </Text>
            {stageName ? <Text style={styles.metaTxt}>{stageName}</Text> : null}
            {assignee ? <Text style={styles.metaTxt}>👤 {assignee}</Text> : null}
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textMuted} />
        </Pressable>

        {expanded ? (
          <View style={styles.taskBody}>
            <View style={styles.toolbar}>
              <Pressable style={styles.toolBtn} onPress={() => { setEditTask(task); setEditTitle(task.title || ''); }}>
                <Ionicons name="create-outline" size={16} color={Colors.blue} />
                <Text style={styles.toolTxt}>Sửa</Text>
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={() => setAssignTarget({ taskId: task.id })}>
                <Ionicons name="person-add-outline" size={16} color={Colors.purple} />
                <Text style={styles.toolTxt}>Gán NV</Text>
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={() => openAttach({ taskId: task.id })}>
                <Ionicons name="attach-outline" size={16} color={Colors.orange} />
                <Text style={styles.toolTxt}>File</Text>
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={() => confirmDeleteTask(task)}>
                <Ionicons name="trash-outline" size={16} color={Colors.red} />
                <Text style={[styles.toolTxt, { color: Colors.red }]}>Xóa</Text>
              </Pressable>
            </View>

            {renderChecklist(task)}

            <Text style={styles.subTitle}>Ghi chú nhiệm vụ</Text>
            <TextInput
              style={styles.noteInput}
              multiline
              placeholder="Ghi chú chung…"
              placeholderTextColor={Colors.textFaint}
              value={noteDraft[task.id] ?? task.notes ?? ''}
              onChangeText={(t) => setNoteDraft((p) => ({ ...p, [task.id]: t }))}
            />
            <Pressable style={styles.saveNoteBtn} onPress={() => void saveTaskNote(task.id)}>
              <Text style={styles.saveNoteTxt}>{saving === `note-${task.id}` ? 'Đang lưu…' : 'Lưu ghi chú'}</Text>
            </Pressable>
            {renderAttachments(task.id, null)}
            {uploading === task.id ? <ActivityIndicator color={Colors.blue} style={{ marginTop: 8 }} /> : null}
          </View>
        ) : null}
      </View>
    );
  };

  if (loading && !tasks.length) {
    return <ActivityIndicator color={Colors.blue} style={{ marginTop: 32 }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={renderTask}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={Colors.blue} />
        }
        contentContainerStyle={tasks.length ? styles.listPad : styles.listPadGrow}
        ListHeaderComponent={
          <>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <Pressable style={styles.addTaskBtn} onPress={() => setAddOpen(true)}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
              <Text style={styles.addTaskTxt}>Thêm nhiệm vụ</Text>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkbox-outline" size={40} color={Colors.textFaint} />
            <Text style={styles.emptyTitle}>Chưa có nhiệm vụ</Text>
            <Text style={styles.emptyHint}>Bấm «Thêm nhiệm vụ» hoặc đồng bộ pipeline trên web.</Text>
          </View>
        }
      />

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setAddOpen(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Nhiệm vụ mới</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Tên nhiệm vụ"
            placeholderTextColor={Colors.textFaint}
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setAddOpen(false)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalOk]} onPress={() => void addTask()}>
              <Text style={styles.modalOkTxt}>Tạo</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editTask} transparent animationType="fade" onRequestClose={() => setEditTask(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditTask(null)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Sửa nhiệm vụ</Text>
          <TextInput
            style={styles.modalInput}
            value={editTitle}
            onChangeText={setEditTitle}
            autoFocus
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditTask(null)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalOk]} onPress={() => void saveEditTitle()}>
              <Text style={styles.modalOkTxt}>Lưu</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PickerSheet
        visible={!!assignTarget}
        title="Gán nhân viên"
        options={employees}
        searchable
        emptyLabel="— Bỏ gán —"
        selectedId={
          assignTarget?.checklistId
            ? normalizeChecklist(tasks.find((t) => t.id === assignTarget.taskId)?.checklist).find(
                (c) => c.id === assignTarget.checklistId,
              )?.assignee_id || null
            : tasks.find((t) => t.id === assignTarget?.taskId)?.assignee_id || null
        }
        onSelect={(opt) => void assignUser(opt?.id || null)}
        onClose={() => setAssignTarget(null)}
      />

      <TaskAttachSheet
        visible={attachOpen}
        onDismiss={() => setAttachOpen(false)}
        onPick={(opt) => void onAttachPick(opt)}
      />

      <Modal visible={!!editCkModal} transparent animationType="fade" onRequestClose={() => setEditCkModal(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditCkModal(null)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Sửa checklist</Text>
          <TextInput
            style={styles.modalInput}
            value={editCkModal?.title || ''}
            onChangeText={(t) => setEditCkModal((p) => (p ? { ...p, title: t } : p))}
            autoFocus
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditCkModal(null)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalOk]} onPress={() => void saveEditCkTitle()}>
              <Text style={styles.modalOkTxt}>Lưu</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!quickNoteModal} transparent animationType="fade" onRequestClose={() => setQuickNoteModal(null)}>
        <Pressable style={styles.modalBg} onPress={() => setQuickNoteModal(null)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Thêm ghi chú</Text>
          <TextInput
            style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
            multiline
            value={quickNoteModal?.text || ''}
            onChangeText={(t) => setQuickNoteModal((p) => (p ? { ...p, text: t } : p))}
            autoFocus
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setQuickNoteModal(null)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalOk]}
              onPress={() => {
                if (quickNoteModal) {
                  void saveTextNote(quickNoteModal.target, quickNoteModal.text).then(() => setQuickNoteModal(null));
                }
              }}
            >
              <Text style={styles.modalOkTxt}>Thêm</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ImageGalleryLightbox
        visible={galleryOpen}
        images={galleryImages}
        initialIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    listPad: { padding: Spacing.md, paddingBottom: Spacing.xl },
    listPadGrow: { flexGrow: 1, padding: Spacing.md },
    addTaskBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.blue,
      borderRadius: Radii.md,
      paddingVertical: 12,
      marginBottom: 12,
    },
    addTaskTxt: { color: C.white, fontWeight: '700', fontSize: 15 },
    card: {
      backgroundColor: C.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: C.borderSoft,
      marginBottom: 10,
      overflow: 'hidden',
    },
    taskHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
    taskBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.borderSoft },
    cardTitle: { fontSize: 15, fontWeight: '600', color: C.text },
    taskDone: { textDecorationLine: 'line-through', color: C.textMuted },
    metaTxt: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
    toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: C.surfaceSoft, borderRadius: Radii.sm },
    toolTxt: { fontSize: 12, fontWeight: '600', color: C.text },
    subTitle: { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
    ckBlock: { marginBottom: 8 },
    ckItem: {
      backgroundColor: C.surfaceSoft,
      borderRadius: Radii.sm,
      padding: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    ckHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ckTitle: { fontSize: 14, color: C.text },
    ckDone: { textDecorationLine: 'line-through', color: C.textMuted },
    ckAssignee: { fontSize: 11, color: C.purple, marginTop: 4, marginLeft: 30 },
    ckActions: { flexDirection: 'row', gap: 8, marginTop: 6, marginLeft: 30 },
    miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.card, borderRadius: Radii.sm },
    miniBtnTxt: { fontSize: 11, color: C.blue, fontWeight: '600' },
    addCkRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    addCkInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: C.borderSoft,
      borderRadius: Radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: C.text,
      fontSize: 13,
      backgroundColor: C.card,
    },
    addCkBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
    noteBox: { marginTop: 8, marginLeft: 30 },
    noteInput: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: C.borderSoft,
      borderRadius: Radii.sm,
      padding: 10,
      color: C.text,
      fontSize: 13,
      backgroundColor: C.card,
      textAlignVertical: 'top',
    },
    noteActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    saveNoteBtn: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.blueSoft, borderRadius: Radii.sm },
    saveNoteTxt: { color: C.blue, fontWeight: '600', fontSize: 12 },
    attList: { marginTop: 8, gap: 6 },
    attImgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    attImgWrap: { borderRadius: Radii.sm, overflow: 'hidden' },
    attImgTile: { width: 88, height: 88, backgroundColor: C.surfaceSoft },
    attRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, padding: 8, borderRadius: Radii.sm },
    attName: { fontSize: 13, color: C.text },
    attNote: { fontSize: 13, color: C.text, fontStyle: 'italic' },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: C.textMuted },
    emptyHint: { fontSize: 12, color: C.textFaint, textAlign: 'center', paddingHorizontal: 24 },
    errorBox: { backgroundColor: C.redSoft, padding: 10, borderRadius: Radii.sm, marginBottom: 8 },
    errorText: { color: C.red, fontSize: 13 },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalCard: {
      position: 'absolute',
      left: 20,
      right: 20,
      top: '30%',
      backgroundColor: C.card,
      borderRadius: Radii.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 12 },
    modalInput: {
      borderWidth: 1,
      borderColor: C.borderSoft,
      borderRadius: Radii.sm,
      padding: 12,
      color: C.text,
      fontSize: 15,
      marginBottom: 12,
    },
    modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radii.sm },
    modalCancel: { backgroundColor: C.surfaceSoft },
    modalOk: { backgroundColor: C.blue },
    modalCancelTxt: { color: C.textMuted, fontWeight: '600' },
    modalOkTxt: { color: C.white, fontWeight: '700' },
  });
}
