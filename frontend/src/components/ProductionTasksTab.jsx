import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import {
  Plus, CheckCircle2, Circle, Clock, User, Trash2, ChevronDown, ChevronRight,
  Calendar, List, Users, AlertTriangle, X, Save, ListChecks, ClipboardList,
  Edit3, Paperclip, FileUp, FileText, ImageIcon, Film, MessageSquare,
} from 'lucide-react';

const PRIORITY_COLORS = { low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
const STATUS_ICONS = { completed: CheckCircle2, in_progress: Clock, pending: Circle };
const ATT_ICONS = { image: ImageIcon, video: Film, drawing: FileText, task_note: MessageSquare, other: FileText };

function taskStatus(t) {
  if (t.status === 'done' || t.status === 'completed') return 'completed';
  if (t.status === 'in_progress') return 'in_progress';
  return 'pending';
}

export default function ProductionTasksTab({
  projectId,
  projectCompanyId = null,
  projectCurrentStageId = null,
  stages = [],
  users = [],
  onReload,
  /** 'production' | 'logistics' — lọc đính kèm & gắn mặc định khi upload */
  shareModule = 'production',
}) {
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [expandedStages, setExpandedStages] = useState({});
  const [showAdd, setShowAdd] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', due_date: '', assignee_id: '' });
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  // Inline notes + attachments (CRM-style)
  const [expandedTask, setExpandedTask] = useState(null);
  const [taskNoteText, setTaskNoteText] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [taskAttachments, setTaskAttachments] = useState({});
  const [uploadingTask, setUploadingTask] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});

  const loadTasks = async () => {
    setLoading(true);
    try {
      const area = shareModule === 'logistics' ? 'logistics' : 'production';
      const cid = projectCompanyId || null;
      let stageId = null;
      if (cid && projectCurrentStageId) {
        try {
          const path = area === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
          const { data: pStages } = await api.get(path, { params: { company_id: cid } });
          const hit = (pStages || []).find((s) => String(s.workflow_stage_id) === String(projectCurrentStageId));
          stageId = hit?.id || null;
        } catch { /* ignore */ }
      }
      const stageKey = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
      const tplParams = { workshop_area: area, active_only: 'true', ...(cid ? { company_id: cid } : {}) };
      const [tasksRes, globalRes, scopedRes] = await Promise.all([
        api.get('/tasks', { params: { project_id: projectId } }),
        api.get('/production/task-templates', { params: { ...tplParams, [stageKey]: 'global' } }),
        stageId
          ? api.get('/production/task-templates', { params: { ...tplParams, [stageKey]: stageId } })
          : Promise.resolve({ data: [] }),
      ]);
      const list = tasksRes.data?.tasks || tasksRes.data || [];
      setTasks(list);
      const merged = new Map();
      [...(globalRes.data || []), ...(scopedRes.data || [])].forEach((t) => { if (t?.id) merged.set(t.id, t); });
      setTemplates([...merged.values()]);
      const expanded = {};
      list.forEach(t => { if (t.stage_id) expanded[t.stage_id] = true; });
      setExpandedStages(expanded);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (projectId) loadTasks(); }, [projectId]);

  const loadAttachments = async (taskId) => {
    try {
      const { data } = await api.get(`/tasks/${taskId}/attachments`, {
        params: { for_module: shareModule },
      });
      setTaskAttachments(p => ({ ...p, [taskId]: data?.attachments || [] }));
    } catch (e) { console.error(e); }
  };

  const toggleExpand = (taskId, taskNotes) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
      setTaskNoteText(p => ({ ...p, [taskId]: taskNotes || '' }));
      loadAttachments(taskId);
    }
  };

  const saveTaskNotes = async (taskId) => {
    setSavingNote(taskId);
    try {
      await api.put(`/tasks/${taskId}`, { description: taskNoteText[taskId] || '' });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: taskNoteText[taskId] } : t));
      setSavingNote('saved-' + taskId);
      setTimeout(() => setSavingNote(null), 1500);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
      setSavingNote(null);
    }
  };

  const compressImage = (file, maxWidth = 1920, quality = 0.8) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 500 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const uploadTaskFile = (taskId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.mp4,.mov,.webm,.avi';
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      setUploadingTask(taskId);
      try {
        const imageFiles = rawFiles.filter(f => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter(f => !f.type.startsWith('image/'));
        const allUploaded = [];

        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map(f => compressImage(f)));
          const formData = new FormData();
          compressed.forEach(f => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }

        for (const file of otherFiles) {
          setUploadProgress(p => ({ ...p, [taskId]: { percent: 0, name: file.name, size: file.size } }));
          const isLarge = file.size > 10 * 1024 * 1024;
          const endpoint = isLarge ? '/upload/stream' : '/upload/single';
          const result = await new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${api.defaults.baseURL}${endpoint}`);
            xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setUploadProgress(p => ({ ...p, [taskId]: { percent: pct, name: file.name } }));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
              else reject(new Error(`Upload lỗi: ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('Lỗi mạng'));
            xhr.send(formData);
          });
          allUploaded.push(result);
        }

        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });
        if (!allUploaded.length) throw new Error('Upload không trả về file');

        const items = allUploaded.map(up => ({
          original_name: up.original_name || up.file_name || 'File',
          file_name: up.file_name,
          file_url: up.file_url,
          file_size: up.file_size,
          mime_type: up.mime_type,
          allowed_share_modules: [shareModule],
        }));
        await api.post(`/tasks/${taskId}/attachments/bulk`, { items });
        loadAttachments(taskId);
        loadTasks();
      } catch (err) {
        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingTask(null);
    };
    input.click();
  };

  const deleteAttachment = async (taskId, attId) => {
    if (!confirm('Xóa file đính kèm này?')) return;
    try {
      await api.delete(`/tasks/${taskId}/attachments/${attId}`);
      loadAttachments(taskId);
    } catch (e) { alert('Lỗi xóa file'); }
  };

  const addTask = async (stageId) => {
    if (!newTask.title.trim()) return;
    try {
      await api.post('/tasks', {
        project_id: projectId,
        stage_id: stageId,
        title: newTask.title.trim(),
        priority: newTask.priority,
        due_date: newTask.due_date || null,
        assignee_id: newTask.assignee_id || null,
        task_type: 'project',
        order_index: tasks.filter(t => t.stage_id === stageId).length,
      });
      setNewTask({ title: '', priority: 'medium', due_date: '', assignee_id: '' });
      setShowAdd(null);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo nhiệm vụ'); }
  };

  const applyTemplate = async (templateId) => {
    try {
      const { data } = await api.post(`/production/projects/${projectId}/tasks/from-template`, { template_id: templateId });
      alert(`Đã tạo ${data.count} công việc từ bộ mẫu`);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleStatus = async (task) => {
    const st = taskStatus(task);
    const next = st === 'completed' ? 'todo' : st === 'pending' ? 'in_progress' : 'done';
    try {
      await api.put(`/tasks/${task.id}`, { status: next });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
    } catch (e) { alert('Lỗi'); }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa công việc này?')) return;
    try { await api.delete(`/tasks/${taskId}`); loadTasks(); } catch (e) { alert('Lỗi'); }
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      due_date: task.due_date ? task.due_date.substring(0, 16) : '',
      assignee_id: task.assignee_id || '',
      stage_id: task.stage_id || '',
    });
  };

  const saveEdit = async () => {
    if (!editForm.title.trim()) return alert('Nhập tên nhiệm vụ');
    try {
      await api.put(`/tasks/${editingTask.id}`, {
        title: editForm.title,
        description: editForm.description,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
        assignee_id: editForm.assignee_id || null,
        stage_id: editForm.stage_id || null,
      });
      setEditingTask(null);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
  };

  const updateTaskDeadline = async (taskId, val) => {
    try {
      await api.put(`/tasks/${taskId}`, { due_date: val || null });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: val } : t));
    } catch (e) { alert('Lỗi'); }
  };

  const updateAssignee = async (taskId, userId) => {
    try {
      await api.put(`/tasks/${taskId}`, { assignee_id: userId || null });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assignee_id: userId, assignee: users.find(u => u.id === userId) || null } : t));
    } catch (e) { alert('Lỗi'); }
  };

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const overdue = tasks.filter(t => (t.due_date) && new Date(t.due_date) < new Date() && t.status !== 'done').length;
    return { total, completed, overdue, percent: total ? Math.round(completed / total * 100) : 0 };
  }, [tasks]);

  const stageList = useMemo(() => {
    return (stages || []).map((s) => ({
      ...s,
      task_stage_id: s.workflow_stage_id || null,
      can_have_tasks: !!s.workflow_stage_id,
    }));
  }, [stages]);

  const tasksByStage = useMemo(() => {
    const map = {};
    stageList.forEach(s => { if (s.task_stage_id) map[s.task_stage_id] = []; });
    tasks.forEach(t => {
      const key = t.stage_id;
      if (key && map[key]) map[key].push(t);
      else if (key) map[key] = [t];
    });
    return map;
  }, [tasks, stageList]);

  const deadlineGroups = useMemo(() => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    tasks.filter(t => t.status !== 'done').forEach(t => {
      if (!t.due_date) { groups.noDeadline.push(t); return; }
      const d = new Date(t.due_date);
      if (d < today) groups.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
      else if (d < weekEnd) groups.thisWeek.push(t);
      else groups.later.push(t);
    });
    return groups;
  }, [tasks]);

  const plannerGroups = useMemo(() => {
    const map = {}; const unassigned = [];
    tasks.filter(t => t.status !== 'done').forEach(t => {
      if (t.assignee_id && t.assignee) {
        if (!map[t.assignee_id]) map[t.assignee_id] = { user: t.assignee, tasks: [] };
        map[t.assignee_id].tasks.push(t);
      } else { unassigned.push(t); }
    });
    return { assignees: Object.values(map), unassigned };
  }, [tasks]);

  const calendarTasks = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (!t.due_date) return;
      const key = t.due_date.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const calDays = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay() || 7;
    const days = [];
    for (let i = 1 - startDay; i <= 42 - startDay; i++) {
      days.push(new Date(calMonth.y, calMonth.m, i + 1));
    }
    return days.slice(0, 35);
  }, [calMonth]);

  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  const renderTaskRow = (task) => {
    const st = taskStatus(task);
    const StatusIcon = STATUS_ICONS[st] || Circle;
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
    const isExpanded = expandedTask === task.id;
    const atts = taskAttachments[task.id] || [];
    const hasNotes = !!(task.description || task.notes);

    return (
      <div key={task.id} className={`rounded-lg ${isExpanded ? 'bg-gray-50 border border-gray-200' : 'hover:bg-gray-50'}`}>
        {/* Main row */}
        <div className="flex items-center gap-2 py-2 px-3 group">
          <button onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0">
            <StatusIcon className={`h-4 w-4 ${st === 'completed' ? 'text-emerald-500' : st === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
          </button>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => toggleExpand(task.id, task.description || task.notes || '')}
            onDoubleClick={(e) => { e.stopPropagation(); openEditModal(task); }}
            title="Click: ghi chú & đính kèm · Double-click: chỉnh sửa nhiệm vụ"
          >
            <p className={`text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
            {hasNotes && !isExpanded && (
              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1 italic">
                💬 {(task.description || task.notes || '').slice(0, 80)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.due_date && editingDeadline !== task.id && (
                <span onClick={e => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className={`text-[10px] flex items-center gap-0.5 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                  <Calendar className="h-2.5 w-2.5" />{formatDate(task.due_date)}{task.due_date?.includes('T') ? ` ${new Date(task.due_date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              )}
              {!task.due_date && editingDeadline !== task.id && (
                <span onClick={e => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className="text-[10px] text-gray-300 flex items-center gap-0.5 cursor-pointer hover:text-blue-500 hover:bg-blue-50 px-1 py-0.5 rounded">
                  <Calendar className="h-2.5 w-2.5" />+ Ngày hẹn
                </span>
              )}
              {editingDeadline === task.id && (
                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input type="datetime-local" autoFocus
                    defaultValue={task.due_date ? task.due_date.substring(0, 16) : ''}
                    onChange={e => { if (e.target.value) updateTaskDeadline(task.id, e.target.value); }}
                    onBlur={() => setTimeout(() => setEditingDeadline(null), 300)}
                    className="text-[10px] px-1.5 py-0.5 border border-blue-300 rounded bg-blue-50 outline-none focus:ring-1 focus:ring-blue-400 w-[175px]"
                  />
                  {task.due_date && (
                    <button onClick={() => { updateTaskDeadline(task.id, null); setEditingDeadline(null); }}
                      className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
              {task.assignee && <span className="text-[10px] text-blue-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{task.assignee.full_name}</span>}
              {atts.length > 0 && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <Paperclip className="h-2.5 w-2.5" />{atts.length} file
                </span>
              )}
              {hasNotes && !isExpanded && (
                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Có ghi chú
                </span>
              )}
            </div>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
            {PRIORITY_LABELS[task.priority] || 'TB'}
          </span>
          <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1.5 ml-0.5">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); toggleExpand(task.id, task.description || task.notes || ''); }}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer" title="Ghi chú & file đính kèm">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); openEditModal(task); }}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer" title="Sửa nhiệm vụ">
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded: Notes + Attachments (CRM-style) */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-200 mx-3 pt-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({atts.length})</label>
                <div className="flex items-center gap-1">
                  {uploadingTask === task.id ? (
                    <span className="text-[10px] text-orange-600 flex items-center gap-1 px-1.5 py-0.5">
                      <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                      {uploadProgress[task.id]
                        ? <span>{uploadProgress[task.id].name} — {uploadProgress[task.id].percent}%</span>
                        : 'Đang nén ảnh...'}
                    </span>
                  ) : (
                    <button onClick={() => uploadTaskFile(task.id)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50">
                      <FileUp className="h-3 w-3" /> Upload file
                    </button>
                  )}
                </div>
              </div>

              {/* Notes textarea */}
              <textarea
                value={taskNoteText[task.id] ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setTaskNoteText(p => ({ ...p, [task.id]: val }));
                }}
                placeholder="Nhập ghi chú cho nhiệm vụ này..."
                rows={2}
                className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-none mb-1.5"
              />
              <div className="flex justify-between items-center mb-2">
                <div>
                  <label className="text-[10px] text-gray-500">Phụ trách:</label>
                  <select value={task.assignee_id || ''} onChange={e => updateAssignee(task.id, e.target.value)}
                    className="ml-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
                    <option value="">— Chưa giao —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <button onClick={() => saveTaskNotes(task.id)} disabled={savingNote === task.id}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                    savingNote === 'saved-' + task.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}>
                  <Save className="h-2.5 w-2.5" />
                  {savingNote === task.id ? 'Đang lưu...' : savingNote === 'saved-' + task.id ? '✓ Đã lưu' : 'Lưu ghi chú'}
                </button>
              </div>

              {/* Upload progress bar */}
              {uploadProgress[task.id] && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1">
                    <span className="truncate max-w-[200px]">📤 {uploadProgress[task.id].name}</span>
                    <span className="font-bold">{uploadProgress[task.id].percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress[task.id].percent}%` }} />
                  </div>
                </div>
              )}

              {/* Attachment list */}
              {atts.length > 0 && (
                <div className="space-y-1">
                  {atts.map(att => {
                    const AttIcon = ATT_ICONS[att.doc_type] || FileText;
                    const attOpen = att.file_url ? getFileOpenAnchorProps(att.file_url, { fileName: att.file_name }) : null;
                    return (
                      <div key={att.id} className="py-1.5 px-2 rounded bg-white border group/att">
                        <div className="flex items-start gap-2">
                          <AttIcon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{att.file_name}</p>
                            {att.file_url && !att.mime_type?.startsWith('image/') && attOpen && (
                              <a {...attOpen} className="text-[10px] text-blue-600 hover:underline">{att.file_name || 'Mở file'}</a>
                            )}
                            <span className="text-[9px] text-gray-400 ml-1">{att.uploader?.full_name}</span>
                          </div>
                          <div className="opacity-0 group-hover/att:opacity-100 flex items-center gap-0.5 shrink-0">
                            <button onClick={() => deleteAttachment(task.id, att.id)}
                              className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                        {att.file_url && att.mime_type?.startsWith('image/') && attOpen && (
                          <a {...attOpen} className="block mt-1.5 ml-5">
                            <img src={publicFileUrl(att.file_url)} alt={att.file_name}
                              className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
                          </a>
                        )}
                        {att.file_url && (att.mime_type?.startsWith('video/') || att.doc_type === 'video') && (
                          <div className="mt-1.5 ml-5">
                            <video src={publicFileUrl(att.file_url)} controls preload="metadata"
                              className="max-h-52 max-w-full rounded-lg border border-gray-200 bg-black" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {atts.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">Chưa có đính kèm</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const AddTaskForm = ({ stageId }) => (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2 mt-2">
      <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
        placeholder="Tên công việc..." className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none focus:border-blue-500" autoFocus />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
          className="px-2 py-1 rounded border text-xs">
          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
        </select>
        <input type="datetime-local" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
          className="px-2 py-1 rounded border text-xs" />
        <select value={newTask.assignee_id} onChange={e => setNewTask(p => ({ ...p, assignee_id: e.target.value }))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giao cho...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => addTask(stageId)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700"><Save className="h-3 w-3 inline mr-1" />Thêm</button>
        <button onClick={() => setShowAdd(null)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-200">Hủy</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: Stats + Views + Templates */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{stats.percent}%</div>
            <div className="text-[10px] text-gray-500 leading-tight">
              <span className="font-medium text-gray-900">{stats.completed}/{stats.total}</span> xong
              {stats.overdue > 0 && <span className="text-red-600 ml-1">• {stats.overdue} quá hạn</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {templates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplatePanel(p => !p)}
              className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                showTemplatePanel ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
              }`}
              title="Gắn nhiệm vụ mẫu từ bộ nhiệm vụ xưởng"
            >
              <ClipboardList className="h-3 w-3" /> Gắn nhiệm vụ mẫu
            </button>
          )}
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {[{ id: 'list', icon: List, label: 'List' }, { id: 'deadline', icon: AlertTriangle, label: 'Deadline' }, { id: 'planner', icon: Users, label: 'Planner' }, { id: 'calendar', icon: Calendar, label: 'Lịch' }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
              className={`h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <v.icon className="h-3 w-3" />{v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template panel */}
      {showTemplatePanel && templates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">📋 Gắn bộ nhiệm vụ mẫu (Xưởng)</p>
            <button onClick={() => setShowTemplatePanel(false)} className="p-1 hover:bg-amber-100 rounded cursor-pointer">
              <X className="h-3.5 w-3.5 text-amber-600" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => { applyTemplate(tpl.id); setShowTemplatePanel(false); }}
                className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <ListChecks className="h-3.5 w-3.5" />
                {tpl.name}
                <span className="text-[10px] text-amber-500">({tpl.items?.length || 0} việc)</span>
                {tpl.is_default && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">⭐</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick apply when no tasks */}
      {templates.length > 0 && tasks.length === 0 && !showTemplatePanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">📋 Chưa có nhiệm vụ xưởng — gắn nhanh bộ mẫu:</p>
          <div className="flex flex-wrap gap-2">
            {templates.slice(0, 6).map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl.id)}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer"
              >
                📋 {tpl.name} ({tpl.items?.length || 0} việc){tpl.is_default ? ' ⭐' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {stageList.map(stage => {
            const key = stage.task_stage_id || '__intake__';
            const stageTasks = stage.task_stage_id ? (tasksByStage[stage.task_stage_id] || []) : [];
            const completed = stageTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
            const expanded = expandedStages[key] !== false;
            return (
              <div key={stage.id || stage.slug || key} className="border rounded-lg overflow-hidden">
                <button onClick={() => setExpandedStages(p => ({ ...p, [key]: !expanded }))}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#6B7280' }} />
                  <span className="text-sm font-semibold text-gray-800">{stage.name || stage.label}</span>
                  <span className="text-[10px] text-gray-400">{completed}/{stageTasks.length}</span>
                  <span className="ml-auto" />
                  {stageTasks.length > 0 && (
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stageTasks.length ? completed / stageTasks.length * 100 : 0}%` }} />
                    </div>
                  )}
                </button>
                {expanded && (
                  <div className="px-2 py-1">
                    {stageTasks.map(t => renderTaskRow(t))}
                    {stage.can_have_tasks ? (
                      showAdd === key ? (
                        <AddTaskForm stageId={stage.task_stage_id} />
                      ) : (
                        <button onClick={() => setShowAdd(key)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer py-1 px-3">
                          <Plus className="h-3 w-3" /> Thêm việc
                        </button>
                      )
                    ) : (
                      <p className="text-[10px] text-gray-400 px-3 py-1">Cột này là "deal thắng chờ vào xưởng" nên không tạo nhiệm vụ xưởng tại đây.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {stages.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Chưa có giai đoạn sản xuất. Cấu hình pipeline để sử dụng.</p>
          )}
        </div>
      )}

      {/* DEADLINE VIEW */}
      {viewMode === 'deadline' && (
        <div className="space-y-3">
          {[
            { key: 'overdue', label: '🔴 Quá hạn', tasks: deadlineGroups.overdue, color: 'border-red-300 bg-red-50' },
            { key: 'today', label: '🟡 Hôm nay', tasks: deadlineGroups.today, color: 'border-amber-300 bg-amber-50' },
            { key: 'thisWeek', label: '🔵 Tuần này', tasks: deadlineGroups.thisWeek, color: 'border-blue-300 bg-blue-50' },
            { key: 'later', label: '⚪ Sau đó', tasks: deadlineGroups.later, color: 'border-gray-200 bg-gray-50' },
            { key: 'noDeadline', label: '⏳ Chưa có hạn', tasks: deadlineGroups.noDeadline, color: 'border-gray-200 bg-gray-50' },
          ].filter(g => g.tasks.length > 0).map(group => (
            <div key={group.key} className={`border rounded-lg ${group.color}`}>
              <div className="px-3 py-2 font-semibold text-xs flex items-center gap-2">
                {group.label} <span className="text-gray-400 font-normal">({group.tasks.length})</span>
              </div>
              <div className="bg-white rounded-b-lg">{group.tasks.map(t => renderTaskRow(t))}</div>
            </div>
          ))}
          {tasks.filter(t => t.status !== 'done').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* PLANNER VIEW */}
      {viewMode === 'planner' && (
        <div className="space-y-3">
          {plannerGroups.assignees.map(group => (
            <div key={group.user.id} className="border rounded-lg">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold">
                  {group.user.full_name?.charAt(0) || '?'}
                </div>
                <span className="text-sm font-semibold">{group.user.full_name}</span>
                <span className="text-[10px] text-gray-400">({group.tasks.length} việc)</span>
              </div>
              <div>{group.tasks.map(t => renderTaskRow(t))}</div>
            </div>
          ))}
          {plannerGroups.unassigned.length > 0 && (
            <div className="border rounded-lg border-dashed">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-500">Chưa giao ({plannerGroups.unassigned.length})</div>
              <div>{plannerGroups.unassigned.map(t => renderTaskRow(t))}</div>
            </div>
          )}
          {tasks.filter(t => t.status !== 'done').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">◀</button>
            <span className="font-semibold text-sm">Tháng {calMonth.m + 1}/{calMonth.y}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden text-[10px]">
            {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
              <div key={d} className="bg-gray-50 text-center py-1 font-semibold text-gray-500">{d}</div>
            ))}
            {calDays.map((day, i) => {
              const key = day.toISOString().substring(0, 10);
              const dayTasks = calendarTasks[key] || [];
              const isToday = key === new Date().toISOString().substring(0, 10);
              const isCurrentMonth = day.getMonth() === calMonth.m;
              return (
                <div key={i} className={`bg-white min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                  <div className="text-[10px] text-gray-500 mb-0.5">{day.getDate()}</div>
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${t.status === 'done' ? 'bg-emerald-100 text-emerald-700 line-through' : 'bg-blue-100 text-blue-700'}`}
                      onClick={() => toggleStatus(t)} title={t.title}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && <div className="text-[8px] text-gray-400">+{dayTasks.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed tasks */}
      {tasks.filter(t => t.status === 'done' || t.status === 'completed').length > 0 && viewMode !== 'list' && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            ✅ Đã hoàn thành ({tasks.filter(t => t.status === 'done' || t.status === 'completed').length})
          </summary>
          <div className="mt-2">{tasks.filter(t => t.status === 'done' || t.status === 'completed').map(t => renderTaskRow(t))}</div>
        </details>
      )}

      {/* Edit modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Sửa nhiệm vụ</h3>
              </div>
              <button onClick={() => setEditingTask(null)} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Tên nhiệm vụ *</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Mô tả</label>
                <textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-y min-h-[70px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Giai đoạn</label>
                  <select value={editForm.stage_id || ''} onChange={e => setEditForm(f => ({ ...f, stage_id: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                    <option value="">— Chọn giai đoạn —</option>
                    {stageList.filter(s => s.task_stage_id).map(s => (
                      <option key={s.task_stage_id} value={s.task_stage_id}>{s.name || s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Hạn hoàn thành</label>
                  <input type="datetime-local" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Người phụ trách</label>
                <select value={editForm.assignee_id} onChange={e => setEditForm(f => ({ ...f, assignee_id: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                  <option value="">— Chưa giao —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Độ ưu tiên</label>
                <div className="mt-1 flex gap-2">
                  {['low','medium','high','urgent'].map(p => (
                    <button key={p} onClick={() => setEditForm(f => ({ ...f, priority: p }))}
                      className={"px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors " + (editForm.priority === p ? PRIORITY_COLORS[p] + ' border-current ring-1 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100')}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2">
              <button onClick={() => setEditingTask(null)} className="h-9 px-4 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
              <button onClick={saveEdit} className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                <Save className="h-3.5 w-3.5" /> Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
