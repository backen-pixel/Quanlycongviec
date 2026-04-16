import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api/client';
import type { CrmTask } from '../types/crm';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { formatDate } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';

const DEFAULT_SLUG = { lead: 'consulting', deal: 'deal_new' } as const;

type TaskAttachment = {
  id: string;
  name?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  notes?: string | null;
  created_at?: string | null;
  creator?: { full_name?: string | null } | null;
};

type Props = {
  leadId: string;
  leadType: 'lead' | 'deal';
  onCountChange?: (n: number) => void;
};

export default function CrmTasksPanel({ leadId, leadType, onCountChange }: Props) {
  const slug = DEFAULT_SLUG[leadType];
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<CrmTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editDeadline, setEditDeadline] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<CrmTask | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        api.get<CrmTask[]>(`/crm/leads/${leadId}/tasks`),
        api.get<{ id: string; name?: string }[]>('/crm/task-templates').catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(tRes.data) ? tRes.data : [];
      setTasks(list);
      onCountChange?.(list.length);
      const raw = pRes.data;
      setTemplates(Array.isArray(raw) ? raw : []);
    } catch {
      setTasks([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [leadId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAttachments = async (taskId: string) => {
    setAttLoading(true);
    try {
      const { data } = await api.get<TaskAttachment[]>(`/crm/leads/${leadId}/tasks/${taskId}/attachments`);
      const list = Array.isArray(data) ? data : [];
      setAttachments(list.filter((a) => a.doc_type !== 'task_inline_note'));
    } catch {
      setAttachments([]);
    } finally {
      setAttLoading(false);
    }
  };

  const openDetail = (t: CrmTask) => {
    setDetailTask(t);
    setNoteDraft(t.notes?.trim() ? String(t.notes) : '');
    setDetailOpen(true);
    void loadAttachments(t.id);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailTask(null);
    setAttachments([]);
    setNoteDraft('');
  };

  const refreshDetailTaskInList = (updated: Partial<CrmTask> & { id: string }) => {
    setTasks((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    setDetailTask((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await api.post(`/crm/leads/${leadId}/tasks`, {
        title: newTitle.trim(),
        priority: 'medium',
        stage_slug: slug,
        order_index: tasks.filter((t) => t.stage_slug === slug).length,
      });
      setNewTitle('');
      await load();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không thêm được');
    } finally {
      setAdding(false);
    }
  };

  const cycleStatus = async (t: CrmTask) => {
    const cur = t.status || 'pending';
    const next = cur === 'completed' ? 'pending' : cur === 'pending' ? 'in_progress' : 'completed';
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${t.id}`, { status: next });
      refreshDetailTaskInList({ id: t.id, status: next });
      await load();
    } catch {
      Alert.alert('Lỗi', 'Không cập nhật trạng thái.');
    }
  };

  const removeTask = (t: CrmTask) => {
    Alert.alert('Xóa công việc', `Xóa "${t.title || ''}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/crm/leads/${leadId}/tasks/${t.id}`);
            if (detailTask?.id === t.id) closeDetail();
            await load();
          } catch {
            Alert.alert('Lỗi', 'Không xóa được.');
          }
        },
      },
    ]);
  };

  const openEdit = (t: CrmTask) => {
    setEditTask(t);
    setEditTitle(t.title || '');
    setEditDesc(t.description || '');
    setEditPriority(t.priority || 'medium');
    if (t.deadline) {
      const d = String(t.deadline);
      setEditDeadline(d.includes('T') ? d.slice(0, 10) : d.slice(0, 10));
    } else setEditDeadline('');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editTask || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${editTask.id}`, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        priority: editPriority,
        deadline: editDeadline ? `${editDeadline}T08:00:00.000Z` : null,
        stage_slug: editTask.stage_slug || slug,
      });
      setEditOpen(false);
      setEditTask(null);
      await load();
      if (detailTask?.id === editTask.id) {
        setDetailTask((d) =>
          d
            ? {
                ...d,
                title: editTitle.trim(),
                description: editDesc.trim() || null,
                priority: editPriority,
                deadline: editDeadline ? `${editDeadline}T08:00:00.000Z` : null,
              }
            : null,
        );
      }
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSavingEdit(false);
    }
  };

  const saveTaskNotes = async () => {
    if (!detailTask) return;
    setSavingNote(true);
    try {
      const { data } = await api.put<CrmTask>(`/crm/leads/${leadId}/tasks/${detailTask.id}/notes`, {
        notes: noteDraft.trim() || null,
      });
      refreshDetailTaskInList({ id: detailTask.id, notes: data?.notes ?? noteDraft });
      await load();
      Alert.alert('Đã lưu', 'Ghi chú nhiệm vụ đã cập nhật (đồng bộ với web).');
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu ghi chú');
    } finally {
      setSavingNote(false);
    }
  };

  const clearTaskNotes = () => {
    if (!detailTask) return;
    Alert.alert('Xóa ghi chú', 'Xóa toàn bộ ghi chú trên nhiệm vụ này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setSavingNote(true);
          try {
            await api.put(`/crm/leads/${leadId}/tasks/${detailTask.id}/notes`, { notes: null });
            setNoteDraft('');
            refreshDetailTaskInList({ id: detailTask.id, notes: null });
            await load();
          } catch {
            Alert.alert('Lỗi', 'Không xóa được.');
          } finally {
            setSavingNote(false);
          }
        },
      },
    ]);
  };

  const uploadFilesToTask = async (files: { uri: string; name: string; mime: string }[]) => {
    if (!detailTask || !files.length) return;
    setUploadBusy(true);
    try {
      const form = new FormData();
      for (const f of files) {
        form.append('files', {
          uri: f.uri,
          name: f.name,
          type: f.mime,
        } as unknown as Blob);
      }
      const { data: up } = await api.post<{
        files: { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }[];
      }>('/upload', form);
      const uploaded = up?.files || [];
      const items = uploaded
        .filter((u) => u.file_url)
        .map((upf) => ({
          name: (upf.file_name || 'Tệp').replace(/\.[^.]+$/, ''),
          doc_type: (upf.mime_type || '').startsWith('image/') ? 'image' : 'other',
          file_url: upf.file_url,
          file_name: upf.file_name,
          file_size: upf.file_size,
          mime_type: upf.mime_type,
        }));
      if (!items.length) throw new Error('Upload không trả về file_url');
      await api.post(`/crm/leads/${leadId}/tasks/${detailTask.id}/attachments/bulk`, { items });
      await loadAttachments(detailTask.id);
      await load();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message || 'Upload lỗi');
    } finally {
      setUploadBusy(false);
    }
  };

  const pickDocForTask = async () => {
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    await uploadFilesToTask([
      {
        uri: a.uri,
        name: a.name || 'file',
        mime: a.mimeType || 'application/octet-stream',
      },
    ]);
  };

  const takePhotoForTask = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền camera', 'Vào cài đặt hệ thống và bật quyền Camera cho ứng dụng.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    const name = `camera_${Date.now()}.jpg`;
    await uploadFilesToTask([{ uri: a.uri, name, mime: 'image/jpeg' }]);
  };

  const deleteAttachment = (att: TaskAttachment) => {
    if (!detailTask) return;
    Alert.alert('Xóa file', att.name || att.file_name || 'Đính kèm', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/crm/leads/${leadId}/tasks/${detailTask.id}/attachments/${att.id}`);
            await loadAttachments(detailTask.id);
            await load();
          } catch {
            Alert.alert('Lỗi', 'Không xóa được file.');
          }
        },
      },
    ]);
  };

  const toggleShareTask = async () => {
    if (!detailTask) return;
    try {
      const { data } = await api.put<{ shared_to_project?: boolean }>(
        `/crm/leads/${leadId}/tasks/${detailTask.id}/toggle-share`,
      );
      refreshDetailTaskInList({
        id: detailTask.id,
        shared_to_project: !!data?.shared_to_project,
      });
      await load();
    } catch {
      Alert.alert('Lỗi', 'Không đổi được chế độ chia sẻ.');
    }
  };

  const importQuotationExcelForTask = async () => {
    if (!detailTask) return;
    const pick = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    const lower = (a.name || '').toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      Alert.alert('File không hợp lệ', 'Chọn file .xlsx hoặc .xls');
      return;
    }
    setExcelBusy(true);
    try {
      const form = new FormData();
      form.append('file', {
        uri: a.uri,
        name: a.name || 'bao-gia.xlsx',
        type: a.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as unknown as Blob);
      const { data } = await api.post<{
        quotation_code?: string;
        total?: number;
        item_count?: number;
      }>(`/crm/leads/${leadId}/tasks/${detailTask.id}/import-quotation-excel`, form, {
        timeout: 120000,
      });
      await load();
      if (detailTask) {
        await loadAttachments(detailTask.id);
        const { data: refreshed } = await api.get<CrmTask[]>(`/crm/leads/${leadId}/tasks`);
        const t = (refreshed || []).find((x) => x.id === detailTask.id);
        if (t) {
          setDetailTask(t);
          setNoteDraft(t.notes?.trim() ? String(t.notes) : '');
        }
      }
      Alert.alert(
        'Import Excel thành công',
        `Báo giá ${data?.quotation_code || ''}\nTổng: ${data?.total != null ? `${data.total}` : '—'}\nSố dòng: ${data?.item_count ?? '—'}\nNhiệm vụ đã được đánh dấu hoàn thành nếu cần.`,
      );
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Import Excel thất bại');
    } finally {
      setExcelBusy(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    setTplBusy(true);
    try {
      const { data } = await api.post<{ count?: number }>(`/crm/leads/${leadId}/tasks/from-template`, { template_id: templateId });
      setTplOpen(false);
      Alert.alert('Đã áp mẫu', `Đã tạo ${data?.count ?? 0} công việc.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không áp mẫu được');
    } finally {
      setTplBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.tplBtn} onPress={() => setTplOpen(true)}>
          <Text style={styles.tplBtnTxt}>📋 Áp mẫu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Nhiệm vụ mới…"
          placeholderTextColor={CrmColors.gray400}
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => void addTask()} disabled={adding}>
          {adding ? <ActivityIndicator color={CrmColors.white} /> : <Text style={styles.addBtnTxt}>+</Text>}
        </TouchableOpacity>
      </View>

      {tasks.length === 0 ? (
        <Text style={styles.muted}>Chưa có công việc CRM.</Text>
      ) : (
        tasks.map((t) => (
          <View key={t.id} style={styles.row}>
            <TouchableOpacity style={styles.statusHit} onPress={() => void cycleStatus(t)}>
              <Text style={styles.statusIcon}>
                {t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '⏳' : '⭕'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rowMain} onPress={() => openDetail(t)} activeOpacity={0.7}>
              <Text style={styles.rowTitle}>{t.title || '—'}</Text>
              <Text style={styles.rowSub}>
                {t.stage_slug ? `${t.stage_slug} · ` : ''}
                {t.deadline ? `Hạn ${formatDate(t.deadline)}` : 'Không hạn'}
                {t.assignee?.full_name ? ` · ${t.assignee.full_name}` : ''}
                {(t.file_count ?? 0) > 0 || (t.note_count ?? 0) > 0
                  ? ` · 📎${t.file_count ?? 0} 📝${t.note_count ?? 0}`
                  : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rowIconBtn}
              onPress={() => openEdit(t)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.rowIconTxt}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeTask(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.del}>🗑</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={tplOpen} transparent animationType="fade">
        <Pressable style={styles.modalBg} onPress={() => !tplBusy && setTplOpen(false)}>
          <Pressable style={styles.tplSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.tplH}>Chọn bộ mẫu</Text>
            {templates.length === 0 ? (
              <Text style={styles.muted}>Không có mẫu.</Text>
            ) : (
              <FlatList
                data={templates}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.tplRow} onPress={() => void applyTemplate(item.id)} disabled={tplBusy}>
                    <Text style={styles.tplName}>{item.name || item.id}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.tplClose} onPress={() => setTplOpen(false)}>
              <Text style={styles.tplCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={editOpen} transparent animationType="slide">
        <Pressable style={styles.modalBg} onPress={() => !savingEdit && setEditOpen(false)}>
          <Pressable style={styles.editSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.tplH}>Sửa công việc</Text>
            <Text style={styles.lbl}>Tiêu đề</Text>
            <TextInput style={styles.inp} value={editTitle} onChangeText={setEditTitle} />
            <Text style={styles.lbl}>Mô tả</Text>
            <TextInput style={[styles.inp, { minHeight: 64 }]} value={editDesc} onChangeText={setEditDesc} multiline textAlignVertical="top" />
            <Text style={styles.lbl}>Ưu tiên (low/medium/high/urgent)</Text>
            <TextInput style={styles.inp} value={editPriority} onChangeText={setEditPriority} autoCapitalize="none" />
            <Text style={styles.lbl}>Hạn (yyyy-mm-dd)</Text>
            <TextInput style={styles.inp} value={editDeadline} onChangeText={setEditDeadline} placeholder="2026-04-20" />
            <TouchableOpacity style={styles.saveBig} onPress={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? <ActivityIndicator color={CrmColors.white} /> : <Text style={styles.saveBigTxt}>Lưu</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={detailOpen} transparent animationType="slide">
        <View style={styles.detailModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !uploadBusy && !excelBusy && !savingNote && closeDetail()} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.detailKb}
          >
            <Pressable style={styles.detailSheet} onPress={(e) => e.stopPropagation()}>
            {detailTask ? (
              <>
                <View style={styles.detailHead}>
                  <Text style={styles.detailTitle} numberOfLines={2}>
                    {detailTask.title || 'Nhiệm vụ'}
                  </Text>
                  <TouchableOpacity onPress={() => !uploadBusy && !excelBusy && closeDetail()} hitSlop={12}>
                    <Text style={styles.detailClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.detailActions}>
                    <TouchableOpacity style={styles.chip} onPress={() => void cycleStatus(detailTask)} disabled={uploadBusy || excelBusy}>
                      <Text style={styles.chipTxt}>
                        Trạng thái:{' '}
                        {detailTask.status === 'completed' ? 'Hoàn thành' : detailTask.status === 'in_progress' ? 'Đang làm' : 'Chờ'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chip} onPress={() => void toggleShareTask()}>
                      <Text style={styles.chipTxt}>
                        Chia sẻ dự án: {detailTask.shared_to_project ? 'Bật' : 'Tắt'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chipSecondary} onPress={() => openEdit(detailTask)}>
                      <Text style={styles.chipSecondaryTxt}>Sửa tiêu đề / hạn / mô tả</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.sectionLabel}>Ghi chú nhiệm vụ</Text>
                  <TextInput
                    style={styles.noteArea}
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    multiline
                    placeholder="Nhập ghi chú… (đồng bộ với web)"
                    placeholderTextColor={CrmColors.gray400}
                    textAlignVertical="top"
                  />
                  <View style={styles.noteBtnRow}>
                    <TouchableOpacity style={styles.saveNote} onPress={() => void saveTaskNotes()} disabled={savingNote}>
                      {savingNote ? <ActivityIndicator color={CrmColors.white} /> : <Text style={styles.saveNoteTxt}>Lưu ghi chú</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.clearNote} onPress={() => clearTaskNotes()} disabled={savingNote || !noteDraft.trim()}>
                      <Text style={styles.clearNoteTxt}>Xóa</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.sectionLabel}>Đính kèm</Text>
                  {attLoading ? (
                    <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 8 }} />
                  ) : attachments.length === 0 ? (
                    <Text style={styles.mutedSmall}>Chưa có file.</Text>
                  ) : (
                    attachments.map((att) => (
                      <View key={att.id} style={styles.attRow}>
                        <Text style={styles.attName} numberOfLines={1}>
                          {att.name || att.file_name || 'File'}
                        </Text>
                        <TouchableOpacity onPress={() => deleteAttachment(att)}>
                          <Text style={styles.attDel}>Xóa</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                  <View style={styles.uploadRow}>
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => void pickDocForTask()} disabled={uploadBusy}>
                      <Text style={styles.uploadBtnTxt}>{uploadBusy ? '…' : '📎 Tệp'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => void takePhotoForTask()} disabled={uploadBusy}>
                      <Text style={styles.uploadBtnTxt}>{uploadBusy ? '…' : '📷 Chụp ảnh'}</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.sectionLabel}>Báo giá · Đơn · Hóa đơn (mở web)</Text>
                  <View style={styles.webRow}>
                    <TouchableOpacity style={styles.webBtn} onPress={() => openWebPath(`/crm/quotations/new?lead_id=${leadId}`)}>
                      <Text style={styles.webBtnTxt}>+ Báo giá</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.webBtn} onPress={() => openWebPath('/crm/quotations')}>
                      <Text style={styles.webBtnTxt}>Báo giá</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.webBtn} onPress={() => openWebPath('/crm/orders')}>
                      <Text style={styles.webBtnTxt}>Đơn hàng</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.webBtn} onPress={() => openWebPath('/crm/invoices')}>
                      <Text style={styles.webBtnTxt}>Hóa đơn</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.webLink} onPress={() => openWebPath(`/crm/leads/${leadId}`)}>
                    <Text style={styles.webLinkTxt}>Mở chi tiết lead/deal trên web (tab Nhiệm vụ)</Text>
                  </TouchableOpacity>

                  <Text style={styles.sectionLabel}>Import Excel → báo giá (nhiệm vụ hiện tại)</Text>
                  <Text style={styles.hintSmall}>
                    Giống web: đọc Excel, tạo báo giá, cập nhật nhiệm vụ và giá trị deal khi backend xử lý xong.
                  </Text>
                  <TouchableOpacity
                    style={styles.excelBtn}
                    onPress={() => void importQuotationExcelForTask()}
                    disabled={excelBusy}
                  >
                    {excelBusy ? (
                      <ActivityIndicator color={CrmColors.white} />
                    ) : (
                      <Text style={styles.excelBtnTxt}>📊 Chọn file Excel báo giá</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.dangerOutline} onPress={() => removeTask(detailTask)}>
                    <Text style={styles.dangerOutlineTxt}>Xóa nhiệm vụ</Text>
                  </TouchableOpacity>
                  <View style={{ height: 24 }} />
                </ScrollView>
              </>
            ) : null}
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center' },
  toolbar: { flexDirection: 'row', marginBottom: 10 },
  tplBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CrmColors.gray100,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  tplBtnTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray800 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  addBtn: {
    width: 48,
    backgroundColor: CrmColors.blue600,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnTxt: { color: CrmColors.white, fontSize: 22, fontWeight: '700' },
  muted: { fontSize: 13, color: CrmColors.gray400, textAlign: 'center', paddingVertical: 12 },
  mutedSmall: { fontSize: 12, color: CrmColors.gray400, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  statusHit: { paddingRight: 10 },
  statusIcon: { fontSize: 18 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  rowSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  rowIconBtn: { paddingHorizontal: 6 },
  rowIconTxt: { fontSize: 16, color: CrmColors.blue600 },
  del: { fontSize: 16, paddingLeft: 4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  detailModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  detailKb: { width: '100%', maxHeight: '92%' },
  tplSheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    padding: 16,
    maxHeight: '70%',
    margin: 20,
  },
  tplH: { fontSize: 17, fontWeight: '800', marginBottom: 12, color: CrmColors.gray900 },
  tplRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  tplName: { fontSize: 15, color: CrmColors.blue700, fontWeight: '600' },
  tplClose: { marginTop: 12, alignItems: 'center' },
  tplCloseTxt: { color: CrmColors.gray500, fontWeight: '600' },
  editSheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    padding: 16,
    maxHeight: '88%',
    margin: 20,
  },
  detailSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '92%',
  },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  detailTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: CrmColors.gray900, paddingRight: 8 },
  detailClose: { fontSize: 22, color: CrmColors.gray500, fontWeight: '300' },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: CrmColors.blue50,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  chipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.blue800 },
  chipSecondary: {
    backgroundColor: CrmColors.gray100,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipSecondaryTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray700 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginTop: 12, marginBottom: 6 },
  noteArea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 10,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  noteBtnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveNote: {
    flex: 1,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  saveNoteTxt: { color: CrmColors.white, fontWeight: '700' },
  clearNote: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray300,
  },
  clearNoteTxt: { color: CrmColors.gray600, fontWeight: '600' },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  attName: { flex: 1, fontSize: 13, color: CrmColors.gray800 },
  attDel: { fontSize: 13, color: CrmColors.red700, fontWeight: '600' },
  uploadRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  uploadBtn: {
    flex: 1,
    backgroundColor: CrmColors.gray100,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  uploadBtnTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray800 },
  webRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  webBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CrmColors.gray100,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  webBtnTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray800 },
  webLink: { marginTop: 8 },
  webLinkTxt: { fontSize: 12, color: CrmColors.blue600, fontWeight: '600' },
  hintSmall: { fontSize: 11, color: CrmColors.gray500, marginBottom: 8 },
  excelBtn: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  excelBtnTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 14 },
  dangerOutline: {
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
  },
  dangerOutlineTxt: { color: '#B91C1C', fontWeight: '700' },
  lbl: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600, marginTop: 8, marginBottom: 4 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 10,
    fontSize: 15,
    color: CrmColors.gray900,
  },
  saveBig: {
    marginTop: 16,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  saveBigTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 16 },
});
