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
} from 'react-native';
import { api } from '../api/client';
import type { CrmTask } from '../types/crm';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { formatDate } from '../lib/formatUtils';

const DEFAULT_SLUG = { lead: 'consulting', deal: 'deal_new' } as const;

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
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSavingEdit(false);
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
            <TouchableOpacity style={styles.rowMain} onPress={() => openEdit(t)} activeOpacity={0.7}>
              <Text style={styles.rowTitle}>{t.title || '—'}</Text>
              <Text style={styles.rowSub}>
                {t.stage_slug ? `${t.stage_slug} · ` : ''}
                {t.deadline ? `Hạn ${formatDate(t.deadline)}` : 'Không hạn'}
                {t.assignee?.full_name ? ` · ${t.assignee.full_name}` : ''}
              </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  statusHit: { paddingRight: 10 },
  statusIcon: { fontSize: 18 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  rowSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  del: { fontSize: 16, paddingLeft: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  tplSheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    padding: 16,
    maxHeight: '70%',
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
  },
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
