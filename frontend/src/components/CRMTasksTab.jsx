import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../lib/api';
import { formatDate, formatVND } from '../lib/utils';
import {
  Plus, CheckCircle2, Circle, Clock, User, Eye, Trash2, ChevronDown, ChevronRight,
  Calendar, List, Users, Target, AlertTriangle, X, Save, ListChecks, ClipboardList,
  Paperclip, FileUp, MessageSquare, FileText, Image as ImageIcon, Share2, Lock, Film,
  FileSpreadsheet
} from 'lucide-react';
import ExcelQuotationImport from './ExcelQuotationImport';

const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
];
const DEAL_STAGES = [
  { slug: 'deal_new', label: 'Nhiệm vụ Deal mới', icon: '📋', color: '#3B82F6' },
  { slug: 'deal_quote_contract', label: 'Báo giá & Hợp đồng', icon: '📄', color: '#8B5CF6' },
  { slug: 'deal_ordering', label: 'Tiến hành đặt hàng', icon: '🛒', color: '#F59E0B' },
  { slug: 'deal_schedule', label: 'Hẹn ngày lắp đặt', icon: '📅', color: '#10B981' },
  { slug: 'deal_shipping', label: 'Đặt Vận chuyển', icon: '🚛', color: '#EF4444' },
  { slug: 'deal_notes', label: 'Ghi chú khác', icon: '📝', color: '#6B7280' },
];
const ALL_STAGES = [...LEAD_STAGES, ...DEAL_STAGES];
const PRIORITY_COLORS = { low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
const STATUS_ICONS = { pending: Circle, in_progress: Clock, completed: CheckCircle2 };

export default function CRMTasksTab({ leadId, leadType = 'lead', users = [] }) {
  const STAGES = leadType === 'deal' ? DEAL_STAGES : LEAD_STAGES;
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // list, deadline, planner, calendar
  const [expandedStages, setExpandedStages] = useState({});
  const [showAdd, setShowAdd] = useState(null); // stage_slug
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
  const [editingId, setEditingId] = useState(null);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const [tasksRes, tplRes] = await Promise.all([
        api.get(`/crm/leads/${leadId}/tasks`),
        api.get('/crm/task-templates'),
      ]);
      setTasks(tasksRes.data || []);
      setTemplates(tplRes.data || []);
      // Auto-expand stages that have tasks
      const stages = {};
      (tasksRes.data || []).forEach(t => { if (t.stage_slug) stages[t.stage_slug] = true; });
      setExpandedStages(stages);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadTasks(); }, [leadId]);

  const addTask = async (stageSlug) => {
    if (!newTask.title.trim()) return;
    try {
      await api.post(`/crm/leads/${leadId}/tasks`, { ...newTask, stage_slug: stageSlug, order_index: tasks.filter(t => t.stage_slug === stageSlug).length });
      setNewTask({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
      setShowAdd(null);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const applyTemplate = async (templateId) => {
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/tasks/from-template`, { template_id: templateId });
      alert(`Đã tạo ${data.count} công việc từ bộ mẫu`);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const updateTask = async (taskId, updates) => {
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${taskId}`, updates);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleStatus = (task) => {
    const next = task.status === 'completed' ? 'pending' : task.status === 'pending' ? 'in_progress' : 'completed';
    updateTask(task.id, { status: next });
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa công việc này?')) return;
    try { await api.delete(`/crm/leads/${leadId}/tasks/${taskId}`); loadTasks(); } catch (e) { alert('Lỗi'); }
  };

  const toggleShare = async (taskId) => {
    try {
      const { data } = await api.put(`/crm/leads/${leadId}/tasks/${taskId}/toggle-share`);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, shared_to_project: data.shared_to_project } : t));
    } catch (e) { alert('Lỗi kích hoạt chia sẻ'); }
  };

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    return { total, completed, overdue, inProgress, percent: total ? Math.round(completed / total * 100) : 0 };
  }, [tasks]);

  // Group tasks by stage
  const tasksByStage = useMemo(() => {
    const map = {};
    STAGES.forEach(s => { map[s.slug] = []; });
    tasks.forEach(t => { const key = t.stage_slug || 'other'; if (!map[key]) map[key] = []; map[key].push(t); });
    return map;
  }, [tasks]);

  // Deadline view groups
  const deadlineGroups = useMemo(() => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    tasks.filter(t => t.status !== 'completed').forEach(t => {
      if (!t.deadline) { groups.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) groups.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
      else if (d < weekEnd) groups.thisWeek.push(t);
      else groups.later.push(t);
    });
    return groups;
  }, [tasks]);

  // Planner view - group by assignee
  const plannerGroups = useMemo(() => {
    const map = {}; const unassigned = [];
    tasks.filter(t => t.status !== 'completed').forEach(t => {
      if (t.assignee_id && t.assignee) {
        if (!map[t.assignee_id]) map[t.assignee_id] = { user: t.assignee, tasks: [] };
        map[t.assignee_id].tasks.push(t);
      } else { unassigned.push(t); }
    });
    return { assignees: Object.values(map), unassigned };
  }, [tasks]);

  // Calendar view
  const calendarTasks = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (!t.deadline) return;
      const key = t.deadline.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const calDays = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay() || 7;
    const days = [];
    for (let i = 1 - startDay; i <= 42 - startDay; i++) {
      const d = new Date(calMonth.y, calMonth.m, i + 1);
      days.push(d);
    }
    return days.slice(0, 35);
  }, [calMonth]);

  const [expandedTask, setExpandedTask] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null); // taskId currently editing deadline
  const [taskAttachments, setTaskAttachments] = useState({});
  const [taskNoteText, setTaskNoteText] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [uploadingTask, setUploadingTask] = useState(null); // taskId đang upload
  const [addingAttNote, setAddingAttNote] = useState(null);
  const [attNoteText, setAttNoteText] = useState('');
  const [attNoteName, setAttNoteName] = useState('');
  const [uploadProgress, setUploadProgress] = useState({}); // { taskId: { percent, name } }
  const [excelImportTaskId, setExcelImportTaskId] = useState(null); // taskId đang mở Excel import modal
  const [importingExcel, setImportingExcel] = useState(null); // taskId đang import
  const [importToast, setImportToast] = useState(null); // { message, type }

  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  const loadAttachments = async (taskId) => {
    try {
      const { data } = await api.get(`/crm/leads/${leadId}/tasks/${taskId}/attachments`);
      setTaskAttachments(p => ({ ...p, [taskId]: data || [] }));
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
      await api.put(`/crm/leads/${leadId}/tasks/${taskId}/notes`, { notes: taskNoteText[taskId] || '' });
      // Update local tasks state
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, notes: taskNoteText[taskId] } : t));
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
        // Chia thành ảnh và video/file
        const imageFiles = rawFiles.filter(f => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter(f => !f.type.startsWith('image/'));

        const allUploaded = [];

        // Upload ảnh: nén + batch
        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map(f => compressImage(f)));
          const formData = new FormData();
          compressed.forEach(f => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }

        // Upload video/file: từng file riêng với progress + stream endpoint
        for (const file of otherFiles) {
          setUploadProgress(p => ({ ...p, [taskId]: { percent: 0, name: file.name, size: file.size } }));
          const isLarge = file.size > 10 * 1024 * 1024; // >10MB dùng stream
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
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                reject(new Error(`Upload lỗi: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Lỗi mạng'));
            xhr.send(formData);
          });
          allUploaded.push(result);
        }

        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });

        if (!allUploaded.length) throw new Error('Upload không trả về file');

        // Tạo attachments
        const items = allUploaded.map(up => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: (up.mime_type || '').startsWith('image/') ? 'image' : (up.mime_type || '').startsWith('video/') ? 'video' : (up.file_name || '').match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments/bulk`, { items });
        loadAttachments(taskId);
        loadTasks(); // Refresh counts
      } catch (err) {
        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingTask(null);
    };
    input.click();
  };

  const addAttachmentNote = async (taskId) => {
    if (!attNoteText.trim()) return alert('Nhập nội dung ghi chú');
    try {
      await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments`, {
        name: attNoteName.trim() || 'Ghi chú',
        doc_type: 'task_note',
        notes: attNoteText,
      });
      setAddingAttNote(null);
      setAttNoteText('');
      setAttNoteName('');
      loadAttachments(taskId);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi thêm ghi chú'); }
  };

  const deleteAttachment = async (taskId, attId) => {
    if (!confirm('Xóa đính kèm này?')) return;
    try {
      await api.delete(`/crm/leads/${leadId}/tasks/${taskId}/attachments/${attId}`);
      loadAttachments(taskId);
    } catch (e) { alert('Lỗi'); }
  };

  const toggleShareAttachment = async (taskId, attId) => {
    try {
      const { data } = await api.put(`/crm/leads/${leadId}/tasks/${taskId}/attachments/${attId}/toggle-share`);
      setTaskAttachments(p => ({
        ...p,
        [taskId]: (p[taskId] || []).map(a => a.id === attId ? { ...a, shared_to_project: data.shared_to_project } : a)
      }));
    } catch (e) { alert('Lỗi chia sẻ'); }
  };

  const ATT_ICONS = { image: ImageIcon, video: Film, drawing: FileText, task_note: MessageSquare, other: FileText };

  // TaskRow renders inline — see renderTaskRow below
  const renderTaskRow = (task) => {
    const StatusIcon = STATUS_ICONS[task.status] || Circle;
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
    const isExpanded = expandedTask === task.id;
    const atts = taskAttachments[task.id] || [];
    const hasContent = task.notes || atts.length > 0;
    const fileCount = task.file_count || 0;
    const noteCount = task.note_count || 0;
    const hasNotes = !!task.notes;
    return (
      <div key={task.id} className={`rounded-lg ${isExpanded ? 'bg-gray-50 border border-gray-200' : 'hover:bg-gray-50'} ${task.status === 'completed' ? 'opacity-50' : ''}`}>
        {/* Main row */}
        <div className="flex items-center gap-2 py-2 px-3 group">
          <button onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0">
            <StatusIcon className={`h-4 w-4 ${task.status === 'completed' ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
          </button>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(task.id, task.notes)}>
            <p className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.deadline && editingDeadline !== task.id && (
                <span onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className={`text-[10px] flex items-center gap-0.5 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}
                  title="Click để đổi ngày giờ hẹn">
                  <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}{task.deadline?.includes('T') ? ` ${new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              )}
              {!task.deadline && editingDeadline !== task.id && (
                <span onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className="text-[10px] text-gray-300 flex items-center gap-0.5 cursor-pointer hover:text-blue-500 hover:bg-blue-50 px-1 py-0.5 rounded"
                  title="Chọn ngày giờ hẹn">
                  <Calendar className="h-2.5 w-2.5" />+ Ngày hẹn
                </span>
              )}
              {editingDeadline === task.id && (
                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input type="datetime-local" autoFocus
                    defaultValue={task.deadline ? (task.deadline.includes('T') ? task.deadline.substring(0, 16) : task.deadline.substring(0, 10) + 'T08:00') : ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val) updateTask(task.id, { deadline: val });
                    }}
                    onBlur={() => setTimeout(() => setEditingDeadline(null), 300)}
                    className="text-[10px] px-1.5 py-0.5 border border-blue-300 rounded bg-blue-50 outline-none focus:ring-1 focus:ring-blue-400 w-[175px]"
                  />
                  {task.deadline && (
                    <button onClick={() => { updateTask(task.id, { deadline: null }); setEditingDeadline(null); }}
                      className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer p-0.5" title="Xóa ngày hẹn">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
              {task.assignee && <span className="text-[10px] text-blue-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{task.assignee.full_name}</span>}
              {task.supervisor && <span className="text-[10px] text-purple-600 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{task.supervisor.full_name}</span>}
              {/* File & Note count badges — always visible */}
              {fileCount > 0 && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <Paperclip className="h-2.5 w-2.5" />{fileCount} file
                </span>
              )}
              {noteCount > 0 && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <MessageSquare className="h-2.5 w-2.5" />{noteCount} ghi chú
                </span>
              )}
              {hasNotes && !isExpanded && (
                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Có ghi chú
                </span>
              )}
              {task.shared_to_project && (
                <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                  <Share2 className="h-2.5 w-2.5" />Đang chia sẻ
                </span>
              )}
              {/* Nút Upload Excel Báo giá — chỉ hiện cho task báo giá trong Deal, chưa hoàn thành */}
              {leadType === 'deal' && (task.stage_slug === 'deal_quote_contract' || task.stage_slug === 'quotation') && task.status !== 'completed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExcelImportTaskId(task.id); }}
                  className="text-[10px] text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium cursor-pointer border border-emerald-200 transition-colors"
                  title="Upload file Excel để tạo báo giá tự động"
                >
                  <FileSpreadsheet className="h-2.5 w-2.5" />📊 Upload Excel BG
                </button>
              )}
            </div>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <button onClick={() => toggleShare(task.id)}
              className={`p-1 cursor-pointer ${task.shared_to_project ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-green-500'}`}
              title={task.shared_to_project ? 'Đang chia sẻ — click để tắt' : 'Chia sẻ cho Khối khác xem'}>
              {task.shared_to_project ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            </button>
            <button onClick={() => toggleExpand(task.id, task.notes)} className="p-1 text-gray-400 hover:text-blue-500 cursor-pointer" title="Ghi chú & file">
              <Paperclip className="h-3 w-3" />
            </button>
            <button onClick={() => deleteTask(task.id)} className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>

        {/* Expanded: Notes + Attachments (gộp 1 khu vực) */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-200 mx-3 pt-3">
            {/* Ghi chú + Upload gộp chung */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({atts.length})</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleShare(task.id)}
                    className={`text-[10px] flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded ${
                      task.shared_to_project
                        ? 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-300'
                        : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                    }`}
                    title={task.shared_to_project ? 'Ghi chú đang chia sẻ — click để tắt' : 'Bật chia sẻ ghi chú cho Khối khác xem'}>
                    {task.shared_to_project ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {task.shared_to_project ? ' Ghi chú đang chia sẻ' : ' Chia sẻ ghi chú'}
                  </button>
                  {uploadingTask === task.id ? (
                    <span className="text-[10px] text-orange-600 flex items-center gap-1 px-1.5 py-0.5">
                      <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                      {uploadProgress[task.id]
                        ? <span>{uploadProgress[task.id].name} — {uploadProgress[task.id].percent}% {uploadProgress[task.id].size > 1024*1024 ? `(${(uploadProgress[task.id].size/1024/1024).toFixed(0)}MB)` : ''}</span>
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

              {/* Ghi chú (textarea) */}
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
              <div className="flex justify-end mb-2">
                <button onClick={() => saveTaskNotes(task.id)} disabled={savingNote === task.id}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                    savingNote === 'saved-' + task.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}>
                  <Save className="h-2.5 w-2.5" /> {savingNote === task.id ? 'Đang lưu...' : savingNote === 'saved-' + task.id ? '✓ Đã lưu' : 'Lưu ghi chú'}
                </button>
              </div>

              {/* Upload progress bar */}
              {uploadProgress[task.id] && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1">
                    <span className="truncate max-w-[200px]">📤 {uploadProgress[task.id].name} {uploadProgress[task.id].size > 1024*1024 ? `(${(uploadProgress[task.id].size/1024/1024).toFixed(1)}MB)` : ''}</span>
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
                    return (
                      <div key={att.id} className="py-1.5 px-2 rounded bg-white border group/att">
                        <div className="flex items-start gap-2">
                          <AttIcon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-medium text-gray-800 truncate">{att.name}</p>
                              {att.shared_to_project && (
                                <span className="text-[9px] text-green-600 bg-green-50 px-1 py-0.5 rounded shrink-0">🔗 Đã chia sẻ</span>
                              )}
                            </div>
                            {att.notes && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{att.notes}</p>}
                            {att.file_url && !att.mime_type?.startsWith('image/') && (
                              <a href={att.file_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 hover:underline">{att.file_name || 'Mở file'}</a>
                            )}
                            <span className="text-[9px] text-gray-400 ml-1">{att.creator?.full_name}</span>
                          </div>
                          <div className="opacity-0 group-hover/att:opacity-100 flex items-center gap-0.5 shrink-0">
                            <button onClick={() => toggleShareAttachment(task.id, att.id)}
                              className={`p-0.5 cursor-pointer ${att.shared_to_project ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-green-500'}`}
                              title={att.shared_to_project ? 'Đang chia sẻ — click để tắt' : 'Chia sẻ file này cho Khối khác'}>
                              {att.shared_to_project ? <Share2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                            </button>
                            <button onClick={() => deleteAttachment(task.id, att.id)}
                              className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                        {/* Image preview */}
                        {att.file_url && att.mime_type?.startsWith('image/') && (
                          <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="block mt-1.5 ml-5">
                            <img src={att.file_url} alt={att.name} className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
                          </a>
                        )}
                        {/* Video preview */}
                        {att.file_url && (att.mime_type?.startsWith('video/') || att.doc_type === 'video') && (
                          <div className="mt-1.5 ml-5">
                            <video src={att.file_url} controls preload="metadata"
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

  const AddTaskForm = ({ stageSlug }) => (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2 mt-2">
      <input value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))}
        placeholder="Tên công việc..." className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none focus:border-blue-500" autoFocus />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={newTask.priority} onChange={e => setNewTask(p => ({...p, priority: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
        </select>
        <input type="datetime-local" value={newTask.deadline} onChange={e => setNewTask(p => ({...p, deadline: e.target.value}))}
          className="px-2 py-1 rounded border text-xs" />
        <select value={newTask.assignee_id} onChange={e => setNewTask(p => ({...p, assignee_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giao cho...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={newTask.supervisor_id} onChange={e => setNewTask(p => ({...p, supervisor_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giám sát...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => addTask(stageSlug)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700"><Save className="h-3 w-3 inline mr-1" />Thêm</button>
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
            <button onClick={() => setShowTemplatePanel(p => !p)}
              className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${showTemplatePanel ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'}`}>
              <ClipboardList className="h-3 w-3" /> Gắn mẫu
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

      {/* Template panel — always available via button */}
      {showTemplatePanel && templates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">📋 Gắn bộ nhiệm vụ mẫu</p>
            <button onClick={() => setShowTemplatePanel(false)} className="p-1 hover:bg-amber-100 rounded cursor-pointer"><X className="h-3.5 w-3.5 text-amber-600" /></button>
          </div>
          <p className="text-[11px] text-amber-700">Chọn bộ mẫu để tạo nhiệm vụ tự động cho {leadType === 'deal' ? 'Deal' : 'Lead'} này. Có thể gắn nhiều bộ mẫu.</p>
          {ALL_STAGES.map(stage => {
            const stageTpls = templates.filter(t => t.stage_slug === stage.slug);
            if (!stageTpls.length) return null;
            const existingCount = tasks.filter(t => t.stage_slug === stage.slug).length;
            return (
              <div key={stage.slug}>
                <p className="text-[10px] font-bold mb-1.5 flex items-center gap-1" style={{ color: stage.color }}>
                  {stage.icon} {stage.label}
                  {existingCount > 0 && <span className="text-gray-400 font-normal">({existingCount} việc hiện có)</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {stageTpls.map(tpl => (
                    <button key={tpl.id} onClick={() => { applyTemplate(tpl.id); }}
                      className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm">
                      <ListChecks className="h-3.5 w-3.5" />
                      {tpl.name}
                      <span className="text-[10px] text-amber-500">({tpl.items?.length || 0} việc)</span>
                      {tpl.is_default && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">⭐</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template quick-apply — only when no tasks exist */}
      {templates.length > 0 && tasks.length === 0 && !showTemplatePanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">📋 Chưa có công việc — Áp dụng bộ mẫu nhanh:</p>
          <div className="flex flex-wrap gap-2">
            {templates.filter(t => t.is_default).concat(templates.filter(t => !t.is_default)).slice(0, 5).map(tpl => (
              <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer">
                {ALL_STAGES.find(s => s.slug === tpl.stage_slug)?.icon || '📋'} {tpl.name} ({tpl.items?.length || 0} việc)
                {tpl.is_default && ' ⭐'}
              </button>
            ))}
            {templates.length > 5 && (
              <button onClick={() => setShowTemplatePanel(true)} className="px-3 py-1.5 text-xs text-amber-600 hover:text-amber-800 cursor-pointer">
                +{templates.length - 5} bộ mẫu khác...
              </button>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {STAGES.map(stage => {
            const stageTasks = tasksByStage[stage.slug] || [];
            const completed = stageTasks.filter(t => t.status === 'completed').length;
            const expanded = expandedStages[stage.slug] !== false;
            const tpl = templates.find(t => t.stage_slug === stage.slug);
            return (
              <div key={stage.slug} className="border rounded-lg overflow-hidden">
                <button onClick={() => setExpandedStages(p => ({...p, [stage.slug]: !expanded}))}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="text-sm">{stage.icon}</span>
                  <span className="text-sm font-semibold" style={{color: stage.color}}>{stage.label}</span>
                  <span className="text-[10px] text-gray-400">{completed}/{stageTasks.length}</span>
                  {/* Tổng file + ghi chú của nhóm */}
                  {(() => {
                    const totalFiles = stageTasks.reduce((s, t) => s + (t.file_count || 0), 0);
                    const totalNotes = stageTasks.reduce((s, t) => s + (t.note_count || 0), 0);
                    return (
                      <>
                        {totalFiles > 0 && <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">📎 {totalFiles}</span>}
                        {totalNotes > 0 && <span className="text-[9px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">📝 {totalNotes}</span>}
                      </>
                    );
                  })()}
                  <span className="ml-auto" />
                  {stageTasks.length > 0 && (
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{width: `${stageTasks.length ? completed/stageTasks.length*100 : 0}%`}} />
                    </div>
                  )}
                </button>
                {expanded && (
                  <div className="px-2 py-1">
                    {stageTasks.map(t => renderTaskRow(t))}
                    {showAdd === stage.slug ? (
                      <AddTaskForm stageSlug={stage.slug} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 px-3">
                        <button onClick={() => setShowAdd(stage.slug)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                          <Plus className="h-3 w-3" /> Thêm việc
                        </button>
                        {tpl && !stageTasks.length && (
                          <button onClick={() => applyTemplate(tpl.id)}
                            className="text-[10px] text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer">
                            <ListChecks className="h-3 w-3" /> Áp dụng mẫu ({tpl.items?.length || 0})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
              <div className="bg-white rounded-b-lg">
                {group.tasks.map(t => renderTaskRow(t))}
              </div>
            </div>
          ))}
          {tasks.filter(t => t.status !== 'completed').length === 0 && (
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
          {tasks.filter(t => t.status !== 'completed').length === 0 && (
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
                    <div key={t.id} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700 line-through' : 'bg-blue-100 text-blue-700'}`}
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

            {/* Completed tasks (collapsed) */}
      {tasks.filter(t => t.status === 'completed').length > 0 && viewMode !== 'list' && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            ✅ Đã hoàn thành ({tasks.filter(t => t.status === 'completed').length})
          </summary>
          <div className="mt-2 opacity-50">
            {tasks.filter(t => t.status === 'completed').map(t => renderTaskRow(t))}
          </div>
        </details>
      )}

      {/* Excel Quotation Import Modal */}
      {excelImportTaskId && (
        <ExcelQuotationImport
          dealId={leadId}
          leadId={leadId}
          taskId={excelImportTaskId}
          onImportDone={(data) => {
            setExcelImportTaskId(null);
            loadTasks();
            setImportToast({
              message: `✅ Đã tạo báo giá ${data.code || ''} — ${formatVND(data.total || 0)}. Task đã hoàn thành!`,
              type: 'success'
            });
            setTimeout(() => setImportToast(null), 5000);
          }}
          onClose={() => setExcelImportTaskId(null)}
        />
      )}

      {/* Toast notification */}
      {importToast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-in slide-in-from-bottom-4 ${
          importToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <span>{importToast.message}</span>
          <button onClick={() => setImportToast(null)} className="p-0.5 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
